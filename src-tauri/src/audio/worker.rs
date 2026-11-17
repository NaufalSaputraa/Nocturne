use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};

use crate::audio::engine::{compute_preamp_volume_scale, AudioBackend};
use crate::db::session::SessionPersistence;
use crate::extractor::stream::{normalize_quality_key, DualTierExtractor};
use crate::metadata::search::{deduplicate_radio_tracks, CatalogProvider};
use crate::models::{PlaybackSession, PlaybackSyncPayload, TrackMetadata};

/// Commands sent from Tauri IPC / SMTC / Tray to the dedicated audio worker actor.
#[derive(Debug)]
pub enum AudioCommand {
    PlayTrack(TrackMetadata),
    TogglePlayback,
    SeekTo(u64),
    SetVolume(f32),
    SetQueue(Vec<TrackMetadata>, usize),
    Next,
    Prev,
    SetShuffle(bool),
    SetRepeat(String),
    SetAutoplay(bool),
    SetNormalization(bool),
    SetCrossfadeMs(u64),
    SetQuality(String),
    AppendRadioTracks(Vec<TrackMetadata>),
    GetSnapshot(oneshot::Sender<WorkerSnapshot>),
    Shutdown,
}

/// Thread-safe snapshot of worker state for session restore or diagnostics.
#[derive(Debug, Clone)]
pub struct WorkerSnapshot {
    pub current_track: Option<TrackMetadata>,
    pub queue: Vec<TrackMetadata>,
    pub current_index: usize,
    pub position_ms: u64,
    pub volume: f32,
    pub shuffle: bool,
    pub repeat_mode: String,
    pub autoplay_enabled: bool,
    pub is_playing: bool,
}

/// Abstracts event emission (`playback-sync`, `track-changed`, `queue-updated`) for Tauri & tests.
pub trait PlaybackEventSink: Send + Sync {
    fn emit_playback_sync(&self, payload: PlaybackSyncPayload);
    fn emit_track_changed(&self, track: Option<TrackMetadata>);
    fn emit_queue_updated(&self, queue: Vec<TrackMetadata>, current_index: usize);
}

struct WorkerState {
    backend: Box<dyn AudioBackend>,
    extractor: Arc<DualTierExtractor>,
    sink: Arc<dyn PlaybackEventSink>,
    quality: String,
    queue: Vec<TrackMetadata>,
    current_index: usize,
    current_track: Option<TrackMetadata>,
    volume: f32,
    preamp_scale: f64,
    normalize_enabled: bool,
    shuffle: bool,
    repeat_mode: String,
    autoplay_enabled: bool,
    crossfade_ms: u64,
    prefetched_for_index: Option<usize>,
    last_buffering: bool,
    session_persistence: Option<SessionPersistence>,
    catalog: Option<Arc<dyn CatalogProvider>>,
    auto_radio_in_flight: bool,
    played_ids: HashSet<String>,
    retried_fallback_for_track: Option<String>,
}

impl WorkerState {
    fn current_ts_ms() -> i64 {
        chrono::Utc::now().timestamp_millis()
    }

    fn to_session(&mut self) -> PlaybackSession {
        let st = self.backend.poll_state();
        PlaybackSession {
            current_track: self.current_track.clone(),
            position_ms: st.position_ms,
            queue: self.queue.clone(),
            shuffle: self.shuffle,
            repeat_mode: self.repeat_mode.clone(),
            autoplay_enabled: self.autoplay_enabled,
            volume: self.volume,
        }
    }

    async fn maybe_save_session_tick(&mut self) {
        let session = self.to_session();
        if let Some(persistence) = &mut self.session_persistence {
            let _ = persistence
                .maybe_save_tick(&session, Self::current_ts_ms())
                .await;
        }
    }

    async fn flush_session_now(&mut self) {
        let session = self.to_session();
        if let Some(persistence) = &mut self.session_persistence {
            let _ = persistence
                .flush_now(&session, Self::current_ts_ms())
                .await;
        }
    }

    fn emit_sync_now(&mut self) {
        let st = self.backend.poll_state();
        let fallback_dur = self
            .current_track
            .as_ref()
            .map(|t| t.duration_sec.saturating_mul(1000))
            .unwrap_or(0);
        let duration_ms = if st.duration_ms > 0 {
            st.duration_ms
        } else {
            fallback_dur
        };
        self.last_buffering = st.is_buffering;
        self.sink.emit_playback_sync(PlaybackSyncPayload {
            position_ms: st.position_ms,
            duration_ms,
            is_playing: st.is_playing,
            is_buffering: st.is_buffering,
            server_ts_ms: Self::current_ts_ms(),
        });
    }

    async fn play_track(&mut self, track: TrackMetadata) {
        self.current_track = Some(track.clone());
        self.played_ids.insert(track.video_id.clone());
        self.prefetched_for_index = None;
        self.retried_fallback_for_track = None;
        self.sink.emit_track_changed(Some(track.clone()));

        let resolved = match self
            .extractor
            .resolve_stream(&track.video_id, &self.quality)
            .await
        {
            Ok(stream) => Ok(stream),
            Err(primary_err) if normalize_quality_key(&self.quality) != "opus_128" => {
                eprintln!(
                    "[Nocturne] Stream extraction failed at {} ({primary_err}); falling back to opus_128",
                    self.quality
                );
                self.extractor.resolve_stream(&track.video_id, "opus_128").await
            }
            Err(err) => Err(err),
        };

        match resolved {
            Ok(stream) => {
                eprintln!(
                    "[Nocturne] Playing {} via {:?} ({})",
                    track.video_id, stream.source, stream.format
                );
                self.preamp_scale = compute_preamp_volume_scale(
                    stream.perceptual_loudness_db,
                    self.normalize_enabled,
                );
                if let Err(err) = self
                    .backend
                    .load_and_play(&stream.url, self.preamp_scale, self.volume)
                {
                    eprintln!("[Nocturne] load_and_play error for {}: {err}", track.video_id);
                    if normalize_quality_key(&self.quality) != "opus_128" {
                        if let Ok(fallback_stream) = self
                            .extractor
                            .resolve_stream(&track.video_id, "opus_128")
                            .await
                        {
                            let _ = self.backend.load_and_play(
                                &fallback_stream.url,
                                self.preamp_scale,
                                self.volume,
                            );
                        }
                    }
                }
                self.emit_sync_now();
                self.flush_session_now().await;
            }
            Err(err) => {
                eprintln!("[Nocturne] resolve_stream failed for {}: {err}", track.video_id);
                let _ = self.backend.stop();
                self.emit_sync_now();
                self.flush_session_now().await;
            }
        }
    }

    fn maybe_spawn_prefetch(&mut self) {
        let st = self.backend.poll_state();
        if !st.is_playing || st.duration_ms == 0 {
            return;
        }
        let remaining = st.duration_ms.saturating_sub(st.position_ms);
        if remaining > 15_000 {
            return;
        }
        let next_idx = self.current_index + 1;
        if self.prefetched_for_index == Some(next_idx) {
            return;
        }
        if let Some(next_track) = self.queue.get(next_idx).cloned() {
            self.prefetched_for_index = Some(next_idx);
            let extractor = Arc::clone(&self.extractor);
            let quality = self.quality.clone();
            tokio::spawn(async move {
                let _ = extractor.resolve_stream(&next_track.video_id, &quality).await;
            });
        }
    }

    async fn maybe_trigger_auto_radio(&mut self, worker_tx: &mpsc::Sender<AudioCommand>) {
        if !self.autoplay_enabled || self.auto_radio_in_flight {
            return;
        }
        let remaining_ahead = self.queue.len().saturating_sub(self.current_index + 1);
        if remaining_ahead > 1 {
            return;
        }
        let Some(catalog) = self.catalog.as_ref().map(Arc::clone) else {
            return;
        };
        let Some(seed) = self
            .current_track
            .as_ref()
            .or_else(|| self.queue.last())
            .map(|t| t.video_id.clone())
        else {
            return;
        };

        let mut exclude = self.played_ids.clone();
        for t in &self.queue {
            exclude.insert(t.video_id.clone());
        }
        self.auto_radio_in_flight = true;
        let tx = worker_tx.clone();
        tokio::spawn(async move {
            let tracks = catalog
                .get_auto_radio(&seed, &exclude)
                .await
                .unwrap_or_default();
            let _ = tx.send(AudioCommand::AppendRadioTracks(tracks)).await;
        });
    }

    async fn advance_next(&mut self, from_eof: bool) {
        if self.queue.is_empty() {
            return;
        }
        if from_eof && self.repeat_mode == "one" {
            if let Some(track) = self.current_track.clone() {
                self.play_track(track).await;
            }
            return;
        }

        let next_index = if self.shuffle && self.queue.len() > 1 {
            let nanos = chrono::Utc::now().timestamp_subsec_nanos() as usize;
            let offset = (nanos % (self.queue.len() - 1)) + 1;
            (self.current_index + offset) % self.queue.len()
        } else if self.current_index + 1 < self.queue.len() {
            self.current_index + 1
        } else if self.repeat_mode == "all" {
            0
        } else {
            let _ = self.backend.stop();
            self.emit_sync_now();
            return;
        };

        self.current_index = next_index;
        let track = self.queue[next_index].clone();
        self.sink
            .emit_queue_updated(self.queue.clone(), self.current_index);
        self.play_track(track).await;
    }

    async fn step_prev(&mut self) {
        let st = self.backend.poll_state();
        if st.position_ms > 3_000 {
            let _ = self.backend.seek_ms(0);
            self.emit_sync_now();
            return;
        }
        if self.queue.is_empty() {
            return;
        }
        self.current_index = self.current_index.saturating_sub(1);
        let track = self.queue[self.current_index].clone();
        self.sink
            .emit_queue_updated(self.queue.clone(), self.current_index);
        self.play_track(track).await;
    }
}

/// Spawns the dedicated 500ms audio worker actor without SQLite persistence.
pub fn spawn_audio_worker(
    backend: Box<dyn AudioBackend>,
    extractor: Arc<DualTierExtractor>,
    sink: Arc<dyn PlaybackEventSink>,
    quality: String,
    initial_volume: f32,
) -> mpsc::Sender<AudioCommand> {
    spawn_audio_worker_with_session(backend, extractor, sink, quality, initial_volume, None)
}

/// Spawns the dedicated 500ms audio worker actor with optional 5s debounced
/// `SessionPersistence` and immediate event flushes.
pub fn spawn_audio_worker_with_session(
    backend: Box<dyn AudioBackend>,
    extractor: Arc<DualTierExtractor>,
    sink: Arc<dyn PlaybackEventSink>,
    quality: String,
    initial_volume: f32,
    session_persistence: Option<SessionPersistence>,
) -> mpsc::Sender<AudioCommand> {
    spawn_audio_worker_with_deps(
        backend,
        extractor,
        sink,
        quality,
        initial_volume,
        session_persistence,
        None,
    )
}

/// Spawns the dedicated 500ms audio worker actor with SQLite persistence and Auto-Radio catalog.
pub fn spawn_audio_worker_with_deps(
    backend: Box<dyn AudioBackend>,
    extractor: Arc<DualTierExtractor>,
    sink: Arc<dyn PlaybackEventSink>,
    quality: String,
    initial_volume: f32,
    session_persistence: Option<SessionPersistence>,
    catalog: Option<Arc<dyn CatalogProvider>>,
) -> mpsc::Sender<AudioCommand> {
    let (tx, mut rx) = mpsc::channel::<AudioCommand>(64);
    let worker_tx = tx.clone();

    tokio::spawn(async move {
        let mut state = WorkerState {
            backend,
            extractor,
            sink,
            quality,
            queue: Vec::new(),
            current_index: 0,
            current_track: None,
            volume: initial_volume.clamp(0.0, 1.0),
            preamp_scale: 1.0,
            normalize_enabled: true,
            shuffle: false,
            repeat_mode: "off".to_string(),
            autoplay_enabled: true,
            crossfade_ms: 0,
            prefetched_for_index: None,
            last_buffering: false,
            session_persistence,
            catalog,
            auto_radio_in_flight: false,
            played_ids: HashSet::new(),
            retried_fallback_for_track: None,
        };

        let mut ticker = tokio::time::interval(Duration::from_millis(500));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    let st = state.backend.poll_state();
                    if st.playback_failed {
                        if let Some(track) = state.current_track.clone() {
                            if state.retried_fallback_for_track.as_deref() != Some(&track.video_id) {
                                state.retried_fallback_for_track = Some(track.video_id.clone());
                                eprintln!(
                                    "[Nocturne] Playback failed in mpv for {} (likely HTTP 403); retrying via yt-dlp fallback",
                                    track.video_id
                                );
                                if let Ok(stream) = state
                                    .extractor
                                    .resolve_with_fallback_only(&track.video_id, &state.quality)
                                    .await
                                {
                                    state.preamp_scale = compute_preamp_volume_scale(
                                        stream.perceptual_loudness_db,
                                        state.normalize_enabled,
                                    );
                                    let _ = state.backend.load_and_play(
                                        &stream.url,
                                        state.preamp_scale,
                                        state.volume,
                                    );
                                    state.emit_sync_now();
                                    continue;
                                }
                            }
                        }
                    }
                    if st.eof_reached {
                        state.advance_next(true).await;
                        continue;
                    }
                    if st.is_playing || st.is_buffering != state.last_buffering {
                        state.emit_sync_now();
                    }
                    if st.is_playing {
                        state.maybe_save_session_tick().await;
                    }
                    state.maybe_spawn_prefetch();
                }
                maybe_cmd = rx.recv() => {
                    let Some(cmd) = maybe_cmd else {
                        break;
                    };
                    match cmd {
                        AudioCommand::PlayTrack(track) => {
                            if let Some(pos) = state.queue.iter().position(|t| t.video_id == track.video_id) {
                                state.current_index = pos;
                            } else {
                                state.queue.insert(0, track.clone());
                                state.current_index = 0;
                                state.sink.emit_queue_updated(state.queue.clone(), 0);
                            }
                            state.play_track(track).await;
                        }
                        AudioCommand::TogglePlayback => {
                            let st = state.backend.poll_state();
                            let _ = state.backend.set_paused(st.is_playing);
                            state.emit_sync_now();
                            state.flush_session_now().await;
                        }
                        AudioCommand::SeekTo(pos_ms) => {
                            let _ = state.backend.seek_ms(pos_ms);
                            state.emit_sync_now();
                            state.flush_session_now().await;
                        }
                        AudioCommand::SetVolume(vol) => {
                            state.volume = vol.clamp(0.0, 1.0);
                            let _ = state.backend.set_volume(state.volume, state.preamp_scale);
                        }
                        AudioCommand::SetQueue(queue, index) => {
                            state.queue = queue;
                            state.current_index = index.min(state.queue.len().saturating_sub(1));
                            state.prefetched_for_index = None;
                            state.sink.emit_queue_updated(state.queue.clone(), state.current_index);
                            state.flush_session_now().await;
                        }
                        AudioCommand::Next => {
                            state.advance_next(false).await;
                            state.maybe_trigger_auto_radio(&worker_tx).await;
                        }
                        AudioCommand::Prev => {
                            state.step_prev().await;
                        }
                        AudioCommand::SetShuffle(enabled) => {
                            state.shuffle = enabled;
                        }
                        AudioCommand::SetRepeat(mode) => {
                            state.repeat_mode = mode;
                        }
                        AudioCommand::SetAutoplay(enabled) => {
                            state.autoplay_enabled = enabled;
                            if enabled {
                                state.maybe_trigger_auto_radio(&worker_tx).await;
                            }
                        }
                        AudioCommand::SetNormalization(enabled) => {
                            state.normalize_enabled = enabled;
                            let _ = state.backend.set_volume(state.volume, if enabled { state.preamp_scale } else { 1.0 });
                        }
                        AudioCommand::SetCrossfadeMs(ms) => {
                            state.crossfade_ms = ms;
                        }
                        AudioCommand::SetQuality(q) => {
                            state.quality = normalize_quality_key(&q).to_string();
                            state.prefetched_for_index = None;
                        }
                        AudioCommand::AppendRadioTracks(tracks) => {
                            state.auto_radio_in_flight = false;
                            let mut existing: HashSet<String> =
                                state.queue.iter().map(|t| t.video_id.clone()).collect();
                            for id in &state.played_ids {
                                existing.insert(id.clone());
                            }
                            let unique = deduplicate_radio_tracks(tracks, &existing);
                            if !unique.is_empty() {
                                state.queue.extend(unique);
                                state.sink.emit_queue_updated(state.queue.clone(), state.current_index);
                            }
                        }
                        AudioCommand::GetSnapshot(reply) => {
                            let st = state.backend.poll_state();
                            let _ = reply.send(WorkerSnapshot {
                                current_track: state.current_track.clone(),
                                queue: state.queue.clone(),
                                current_index: state.current_index,
                                position_ms: st.position_ms,
                                volume: state.volume,
                                shuffle: state.shuffle,
                                repeat_mode: state.repeat_mode.clone(),
                                autoplay_enabled: state.autoplay_enabled,
                                is_playing: st.is_playing,
                            });
                        }
                        AudioCommand::Shutdown => {
                            state.flush_session_now().await;
                            let _ = state.backend.stop();
                            break;
                        }
                    }
                }
            }
        }
    });

    tx
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::engine::BackendState;
    use async_trait::async_trait;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    use crate::extractor::cache::MemoryStreamCache;
    use crate::extractor::stream::{FallbackStreamProvider, PrimaryStreamProvider};
    use crate::models::{AppError, StreamInfo, StreamSource};

    struct MockPrimary {
        calls: Arc<Mutex<Vec<String>>>,
    }

    #[async_trait]
    impl PrimaryStreamProvider for MockPrimary {
        async fn fetch_stream(&self, video_id: &str, _quality: &str) -> Result<StreamInfo, AppError> {
            self.calls.lock().unwrap().push(video_id.to_string());
            Ok(StreamInfo {
                video_id: video_id.to_string(),
                url: format!("https://stream.local/{video_id}.webm"),
                format: "opus".to_string(),
                perceptual_loudness_db: Some(-2.0),
                source: StreamSource::Rustypipe,
                expires_at_unix: 0,
            })
        }
    }

    struct UnusedFallback;

    #[async_trait]
    impl FallbackStreamProvider for UnusedFallback {
        async fn fetch_stream(&self, _video_id: &str, _quality: &str) -> Result<StreamInfo, AppError> {
            Err(AppError::Extraction("unused".to_string()))
        }
    }

    struct MockBackend {
        state: Arc<Mutex<BackendState>>,
    }

    impl AudioBackend for MockBackend {
        fn load_and_play(&mut self, _url: &str, _preamp: f64, _vol: f32) -> Result<(), AppError> {
            let mut st = self.state.lock().unwrap();
            st.is_playing = true;
            st.duration_ms = 30_000;
            st.position_ms = 0;
            Ok(())
        }

        fn set_paused(&mut self, paused: bool) -> Result<(), AppError> {
            self.state.lock().unwrap().is_playing = !paused;
            Ok(())
        }

        fn seek_ms(&mut self, position_ms: u64) -> Result<(), AppError> {
            self.state.lock().unwrap().position_ms = position_ms;
            Ok(())
        }

        fn set_volume(&mut self, _volume: f32, _preamp_scale: f64) -> Result<(), AppError> {
            Ok(())
        }

        fn stop(&mut self) -> Result<(), AppError> {
            self.state.lock().unwrap().is_playing = false;
            Ok(())
        }

        fn poll_state(&mut self) -> BackendState {
            self.state.lock().unwrap().clone()
        }
    }

    struct MockSink {
        syncs: Arc<Mutex<Vec<PlaybackSyncPayload>>>,
        sync_count: AtomicUsize,
    }

    impl PlaybackEventSink for MockSink {
        fn emit_playback_sync(&self, payload: PlaybackSyncPayload) {
            self.sync_count.fetch_add(1, Ordering::SeqCst);
            self.syncs.lock().unwrap().push(payload);
        }

        fn emit_track_changed(&self, _track: Option<TrackMetadata>) {}
        fn emit_queue_updated(&self, _queue: Vec<TrackMetadata>, _current_index: usize) {}
    }

    fn sample_track(id: &str) -> TrackMetadata {
        TrackMetadata {
            video_id: id.to_string(),
            title: format!("Track {id}"),
            artist: "Artist".to_string(),
            album: None,
            duration_sec: 30,
            thumbnail_url: String::new(),
        }
    }

    #[tokio::test]
    async fn worker_emits_500ms_sync_immediate_transitions_and_triggers_15s_prefetch() {
        let fetched_ids = Arc::new(Mutex::new(Vec::new()));
        let extractor = Arc::new(DualTierExtractor::new(
            Arc::new(MockPrimary {
                calls: Arc::clone(&fetched_ids),
            }),
            Arc::new(UnusedFallback),
            Arc::new(MemoryStreamCache::new()),
            None,
        ));

        let backend_state = Arc::new(Mutex::new(BackendState::default()));
        let backend = Box::new(MockBackend {
            state: Arc::clone(&backend_state),
        });

        let syncs = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::new(MockSink {
            syncs: Arc::clone(&syncs),
            sync_count: AtomicUsize::new(0),
        });

        let tx = spawn_audio_worker(backend, extractor, sink.clone(), "opus_160".to_string(), 0.8);

        let t1 = sample_track("vid1");
        let t2 = sample_track("vid2");
        tx.send(AudioCommand::SetQueue(vec![t1.clone(), t2], 0))
            .await
            .unwrap();
        tx.send(AudioCommand::PlayTrack(t1)).await.unwrap();
        tokio::time::sleep(Duration::from_millis(40)).await;

        let initial_syncs = syncs.lock().unwrap().len();
        assert!(initial_syncs >= 1, "PlayTrack should emit immediate sync");

        // Seek to 16s (14s remaining <= 15s threshold) -> immediate sync + pre-fetch vid2.
        tx.send(AudioCommand::SeekTo(16_000)).await.unwrap();
        tokio::time::sleep(Duration::from_millis(40)).await;
        assert!(
            syncs.lock().unwrap().len() > initial_syncs,
            "SeekTo should emit immediate sync"
        );
        assert_eq!(syncs.lock().unwrap().last().unwrap().position_ms, 16_000);

        // Wait ~600ms for at least one 500ms tick to fire & spawn pre-fetch.
        tokio::time::sleep(Duration::from_millis(600)).await;
        let ids = fetched_ids.lock().unwrap().clone();
        assert!(ids.contains(&"vid1".to_string()));
        assert!(ids.contains(&"vid2".to_string()), "vid2 should be pre-fetched within 15s of end");

        // Ensure cadence is ~500ms (not 33ms spam).
        let total_syncs = sink.sync_count.load(Ordering::SeqCst);
        assert!(total_syncs <= 6, "Expected ~500ms cadence, got {total_syncs} syncs");

        tx.send(AudioCommand::Shutdown).await.unwrap();
    }
}
