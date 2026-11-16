pub mod audio;
pub mod commands;
pub mod db;
pub mod extractor;
pub mod metadata;
pub mod models;
pub mod os;

use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, WindowEvent};

use crate::audio::engine::{AudioBackend, BackendState, MpvAudioEngine};
use crate::audio::worker::{spawn_audio_worker_with_deps, AudioCommand, PlaybackEventSink};
use crate::commands::{flush_worker_session_blocking, AppState};
use crate::db::session::SessionPersistence;
use crate::db::sqlite::init_db;
use crate::extractor::cache::{LruDiskCache, MemoryStreamCache};
use crate::extractor::downloader::{DownloadEventSink, DownloadManager};
use crate::extractor::stream::{DualTierExtractor, RustypipeStreamProvider};
use crate::extractor::ytdlp::YtdlpSidecar;
use crate::metadata::lyrics::{ReqwestLrcProvider, RustypipeYtmLyricsProvider};
use crate::metadata::search::RustypipeCatalogProvider;
use crate::metadata::sync::{
    InnertubeYtmWriteApi, KeyringCredentialStore, SyncEngine, SyncEventSink,
};
use crate::models::{
    AppError, DownloadProgressPayload, PlaybackSyncPayload, SyncStatusPayload, TrackMetadata,
};
use crate::os::discord_rpc::{DiscordIpcClient, DiscordRpcBridge};
use crate::os::media_controls::MediaControlsBridge;

struct NoopAudioBackend {
    state: BackendState,
}

impl Default for NoopAudioBackend {
    fn default() -> Self {
        Self {
            state: BackendState::default(),
        }
    }
}

impl AudioBackend for NoopAudioBackend {
    fn load_and_play(&mut self, _url: &str, _preamp: f64, _vol: f32) -> Result<(), AppError> {
        self.state.is_playing = true;
        Ok(())
    }
    fn set_paused(&mut self, paused: bool) -> Result<(), AppError> {
        self.state.is_playing = !paused;
        Ok(())
    }
    fn seek_ms(&mut self, position_ms: u64) -> Result<(), AppError> {
        self.state.position_ms = position_ms;
        Ok(())
    }
    fn set_volume(&mut self, _volume: f32, _preamp_scale: f64) -> Result<(), AppError> {
        Ok(())
    }
    fn stop(&mut self) -> Result<(), AppError> {
        self.state.is_playing = false;
        Ok(())
    }
    fn poll_state(&mut self) -> BackendState {
        self.state.clone()
    }
}

struct TauriEventSink {
    app: tauri::AppHandle,
    smtc: Arc<Mutex<MediaControlsBridge>>,
}

impl PlaybackEventSink for TauriEventSink {
    fn emit_playback_sync(&self, payload: PlaybackSyncPayload) {
        if let Ok(mut bridge) = self.smtc.lock() {
            bridge.update_playback_state(payload.is_playing, payload.position_ms);
        }
        let _ = self.app.emit("playback-sync", payload);
    }

    fn emit_track_changed(&self, track: Option<TrackMetadata>) {
        if let (Some(t), Ok(mut bridge)) = (track.as_ref(), self.smtc.lock()) {
            bridge.update_metadata(t);
        }
        let _ = self.app.emit("track-changed", track);
    }

    fn emit_queue_updated(&self, queue: Vec<TrackMetadata>, current_index: usize) {
        let _ = self
            .app
            .emit("queue-updated", serde_json::json!({ "queue": queue, "current_index": current_index }));
    }
}

impl DownloadEventSink for TauriEventSink {
    fn emit_download_progress(&self, payload: DownloadProgressPayload) {
        let _ = self.app.emit("download-progress", payload);
    }
}

impl SyncEventSink for TauriEventSink {
    fn emit_sync_status(&self, payload: SyncStatusPayload) {
        let _ = self.app.emit("sync-status", payload);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("nocturne"));
            let resource_dir = app.path().resource_dir().ok();

            let db_path = data_dir.join("nocturne.db");
            let pool = tauri::async_runtime::block_on(init_db(&db_path))
                .expect("failed to initialize Nocturne SQLite database");

            let disk_cache = Arc::new(
                LruDiskCache::new(data_dir.join("cache"), 2 * 1024 * 1024 * 1024)
                    .expect("failed to initialize LRU disk cache"),
            );
            let memory_cache = Arc::new(MemoryStreamCache::new());
            let ytdlp = Arc::new(YtdlpSidecar::resolve_default(resource_dir.as_deref()));
            let extractor = Arc::new(DualTierExtractor::new(
                Arc::new(RustypipeStreamProvider::new()),
                ytdlp.clone(),
                Arc::clone(&memory_cache),
                Some(Arc::clone(&disk_cache)),
            ));

            let catalog = Arc::new(RustypipeCatalogProvider::new());
            let backend: Box<dyn AudioBackend> = match MpvAudioEngine::new(resource_dir.as_deref()) {
                Ok(mpv) => Box::new(mpv),
                Err(err) => {
                    eprintln!("[Nocturne] libmpv-2.dll unavailable ({err}); using fallback audio backend");
                    Box::new(NoopAudioBackend::default())
                }
            };

            let smtc_holder: Arc<Mutex<MediaControlsBridge>> = Arc::new(Mutex::new({
                let (dummy_tx, _) = tokio::sync::mpsc::channel(1);
                MediaControlsBridge::new_optional(None, dummy_tx)
            }));

            let sink = Arc::new(TauriEventSink {
                app: app_handle.clone(),
                smtc: Arc::clone(&smtc_holder),
            });

            let audio_tx = spawn_audio_worker_with_deps(
                backend,
                Arc::clone(&extractor),
                sink.clone(),
                "opus_160".to_string(),
                0.8,
                Some(SessionPersistence::new(pool.clone())),
                Some(catalog.clone()),
            );

            // Re-bind SMTC bridge with live `audio_tx`.
            if let Ok(mut guard) = smtc_holder.lock() {
                *guard = MediaControlsBridge::new_optional(None, audio_tx.clone());
            }

            let sync_engine = Arc::new(SyncEngine::new(
                pool.clone(),
                Arc::new(KeyringCredentialStore::default()),
                Arc::new(InnertubeYtmWriteApi::new()),
                sink.clone(),
            ));

            let download_manager = Arc::new(
                DownloadManager::new(
                    pool.clone(),
                    Arc::clone(&extractor),
                    sink,
                    data_dir.join("downloads"),
                )
                .expect("failed to initialize DownloadManager"),
            );

            let discord_rpc = Arc::new(Mutex::new(DiscordRpcBridge::new(
                Box::new(DiscordIpcClient::new("1234567890123456789")),
                true,
            )));

            app.manage(AppState {
                pool: pool.clone(),
                audio_tx: audio_tx.clone(),
                catalog,
                lrc_provider: Arc::new(ReqwestLrcProvider::new()),
                ytm_lyrics_provider: Arc::new(RustypipeYtmLyricsProvider::new()),
                sync_engine,
                download_manager,
                disk_cache,
                memory_cache,
                ytdlp,
                discord_rpc,
            });

            // System Tray setup: Show/Hide, Play/Pause, Next, Quit
            let show_item = MenuItem::with_id(app, "tray_show", "Show / Hide Nocturne", true, None::<&str>)?;
            let toggle_item = MenuItem::with_id(app, "tray_toggle", "Play / Pause", true, None::<&str>)?;
            let next_item = MenuItem::with_id(app, "tray_next", "Next Track", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &toggle_item, &next_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .on_menu_event(move |app_handle, event| match event.id().as_ref() {
                    "tray_show" => {
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let visible = win.is_visible().unwrap_or(true);
                            if visible {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                    "tray_toggle" => {
                        let st = app_handle.state::<AppState>();
                        let _ = st.audio_tx.try_send(AudioCommand::TogglePlayback);
                    }
                    "tray_next" => {
                        let st = app_handle.state::<AppState>();
                        let _ = st.audio_tx.try_send(AudioCommand::Next);
                    }
                    "tray_quit" => {
                        let st = app_handle.state::<AppState>();
                        tauri::async_runtime::block_on(flush_worker_session_blocking(
                            &st.pool,
                            &st.audio_tx,
                        ));
                        app_handle.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let st = window.state::<AppState>();
                tauri::async_runtime::block_on(flush_worker_session_blocking(
                    &st.pool,
                    &st.audio_tx,
                ));
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::search_catalog,
            commands::get_home_feed,
            commands::get_artist_tracks,
            commands::play_track,
            commands::toggle_playback,
            commands::seek_to,
            commands::set_volume,
            commands::set_queue,
            commands::next_track,
            commands::prev_track,
            commands::set_shuffle,
            commands::set_repeat_mode,
            commands::set_autoplay,
            commands::set_normalization,
            commands::set_crossfade_ms,
            commands::restore_session,
            commands::get_synced_lyrics,
            commands::set_lyric_offset,
            commands::download_track,
            commands::download_playlist,
            commands::list_offline_tracks,
            commands::remove_offline_track,
            commands::clear_lru_cache,
            commands::update_ytdlp_binary,
            commands::set_discord_rpc_enabled,
            commands::connect_ytm_account,
            commands::disconnect_ytm_account,
            commands::toggle_like_song,
            commands::list_liked_songs,
            commands::list_playlists,
            commands::create_playlist,
            commands::rename_playlist,
            commands::delete_playlist,
            commands::add_track_to_playlist,
            commands::remove_track_from_playlist,
            commands::reconcile_ytm_sync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nocturne");
}
