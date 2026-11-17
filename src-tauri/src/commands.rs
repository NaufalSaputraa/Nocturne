use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use sqlx::{Row, SqlitePool};
use tauri::State;
use tokio::sync::mpsc;

use crate::audio::worker::{AudioCommand, WorkerSnapshot};
use crate::db::session::SessionPersistence;
use crate::extractor::cache::{LruDiskCache, MemoryStreamCache};
use crate::extractor::downloader::{DownloadManager, OfflineTrackEntry};
use crate::extractor::stream::DualTierExtractor;
use crate::extractor::ytdlp::YtdlpSidecar;
use crate::metadata::lyrics::{
    get_synced_lyrics as fetch_synced_lyrics, set_lyric_offset as persist_lyric_offset,
    ReqwestLrcProvider, RustypipeYtmLyricsProvider,
};
use crate::metadata::search::{CatalogProvider, RustypipeCatalogProvider};
use crate::metadata::sync::{PlaylistSummary, SyncEngine};
use crate::models::{
    AppError, EngineDiagnostics, LyricsPayload, PersistedSettings, PlaybackSession, SearchResult,
    StorageStats, TrackMetadata, YtmAccountStatus,
};
use crate::os::discord_rpc::DiscordRpcBridge;

/// Shared Tauri managed application state.
pub struct AppState {
    pub pool: SqlitePool,
    pub audio_tx: mpsc::Sender<AudioCommand>,
    pub catalog: Arc<RustypipeCatalogProvider>,
    pub lrc_provider: Arc<ReqwestLrcProvider>,
    pub ytm_lyrics_provider: Arc<RustypipeYtmLyricsProvider>,
    pub sync_engine: Arc<SyncEngine>,
    pub download_manager: Arc<DownloadManager>,
    pub extractor: Arc<DualTierExtractor>,
    pub disk_cache: Arc<LruDiskCache>,
    pub memory_cache: Arc<MemoryStreamCache>,
    pub ytdlp: Arc<YtdlpSidecar>,
    pub discord_rpc: Arc<Mutex<DiscordRpcBridge>>,
    pub mpv_active: bool,
    pub close_to_tray: Arc<AtomicBool>,
}

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
pub async fn search_catalog(
    state: State<'_, AppState>,
    query: String,
) -> Result<SearchResult, AppError> {
    state.catalog.search_catalog(&query).await
}

#[tauri::command]
pub async fn get_home_feed(state: State<'_, AppState>) -> Result<Vec<TrackMetadata>, AppError> {
    state.catalog.get_home_feed().await
}

#[tauri::command]
pub async fn get_artist_tracks(
    state: State<'_, AppState>,
    artist_id: String,
) -> Result<Vec<TrackMetadata>, AppError> {
    state.catalog.get_artist_tracks(&artist_id).await
}

#[tauri::command]
pub async fn play_track(
    state: State<'_, AppState>,
    track: TrackMetadata,
) -> Result<(), AppError> {
    let _ = sqlx::query(
        "INSERT INTO play_history (video_id, title, artist, thumbnail_url) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(&track.video_id)
    .bind(&track.title)
    .bind(&track.artist)
    .bind(&track.thumbnail_url)
    .execute(&state.pool)
    .await;

    if let Ok(mut rpc) = state.discord_rpc.lock() {
        rpc.update_activity(&track);
    }

    state
        .audio_tx
        .send(AudioCommand::PlayTrack(track))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn toggle_playback(state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::TogglePlayback)
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn seek_to(state: State<'_, AppState>, position_ms: u64) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::SeekTo(position_ms))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn set_volume(state: State<'_, AppState>, volume: f32) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::SetVolume(volume))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn set_queue(
    state: State<'_, AppState>,
    queue: Vec<TrackMetadata>,
    current_index: usize,
) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::SetQueue(queue, current_index))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn next_track(state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::Next)
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn prev_track(state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::Prev)
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn set_shuffle(state: State<'_, AppState>, enabled: bool) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::SetShuffle(enabled))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn set_repeat_mode(state: State<'_, AppState>, mode: String) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::SetRepeat(mode))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn set_autoplay(state: State<'_, AppState>, enabled: bool) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::SetAutoplay(enabled))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn set_normalization(state: State<'_, AppState>, enabled: bool) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::SetNormalization(enabled))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn set_crossfade_ms(
    state: State<'_, AppState>,
    crossfade_ms: u64,
) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::SetCrossfadeMs(crossfade_ms))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

#[tauri::command]
pub async fn set_audio_quality(
    state: State<'_, AppState>,
    quality: String,
) -> Result<(), AppError> {
    state
        .audio_tx
        .send(AudioCommand::SetQuality(quality))
        .await
        .map_err(|e| AppError::Audio(e.to_string()))
}

pub async fn load_persisted_settings(
    pool: &SqlitePool,
    default_cache_path: &str,
    default_downloads_path: &str,
) -> PersistedSettings {
    let row = sqlx::query("SELECT settings_json FROM app_settings WHERE id = 1")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
    let mut settings = row
        .and_then(|r| r.try_get::<String, _>("settings_json").ok())
        .and_then(|json| serde_json::from_str::<PersistedSettings>(&json).ok())
        .unwrap_or_default();
    if settings.lru_cache_path.is_empty() {
        settings.lru_cache_path = default_cache_path.to_string();
    }
    if settings.offline_downloads_path.is_empty() {
        settings.offline_downloads_path = default_downloads_path.to_string();
    }
    settings
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<PersistedSettings, AppError> {
    let cache_dir = state.disk_cache.dir().to_string_lossy().to_string();
    let downloads_dir = state
        .download_manager
        .download_dir()
        .to_string_lossy()
        .to_string();
    Ok(load_persisted_settings(&state.pool, &cache_dir, &downloads_dir).await)
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: PersistedSettings,
) -> Result<(), AppError> {
    let json = serde_json::to_string(&settings)?;
    sqlx::query(
        r#"
        INSERT INTO app_settings (id, settings_json, updated_at)
        VALUES (1, ?1, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            settings_json = excluded.settings_json,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&json)
    .execute(&state.pool)
    .await?;

    let _ = state
        .audio_tx
        .send(AudioCommand::SetQuality(settings.audio_quality.clone()))
        .await;
    let _ = state
        .audio_tx
        .send(AudioCommand::SetNormalization(settings.normalize_volume))
        .await;
    let _ = state
        .audio_tx
        .send(AudioCommand::SetCrossfadeMs(settings.crossfade_sec * 1000))
        .await;

    let limit_bytes = (settings.lru_limit_gb.max(0.5) * 1024.0 * 1024.0 * 1024.0) as u64;
    let _ = state.disk_cache.set_max_bytes(limit_bytes);
    state.extractor.set_prefer_fallback(settings.prefer_ytdlp);
    state
        .close_to_tray
        .store(settings.close_to_tray, Ordering::SeqCst);

    if let Ok(mut rpc) = state.discord_rpc.lock() {
        rpc.set_enabled(settings.discord_rpc_enabled);
    }

    Ok(())
}

#[tauri::command]
pub async fn get_storage_stats(state: State<'_, AppState>) -> Result<StorageStats, AppError> {
    let offline = state.download_manager.list_offline_tracks().await?;
    let offline_total_bytes = offline.iter().map(|t| t.file_size_bytes).sum();
    Ok(StorageStats {
        cache_used_bytes: state.disk_cache.total_bytes(),
        cache_limit_bytes: state.disk_cache.max_bytes(),
        cache_file_count: state.disk_cache.file_count(),
        cache_path: state.disk_cache.dir().to_string_lossy().to_string(),
        downloads_path: state
            .download_manager
            .download_dir()
            .to_string_lossy()
            .to_string(),
        offline_track_count: offline.len(),
        offline_total_bytes,
    })
}

#[tauri::command]
pub async fn get_engine_diagnostics(
    state: State<'_, AppState>,
) -> Result<EngineDiagnostics, AppError> {
    let (ytdlp_available, ytdlp_version) = match state.ytdlp.get_version().await {
        Ok(ver) => (true, ver),
        Err(err) => (false, err.to_string()),
    };
    Ok(EngineDiagnostics {
        mpv_active: state.mpv_active,
        ytdlp_available,
        ytdlp_version,
        prefer_ytdlp: state.extractor.prefer_fallback(),
        memory_cache_entries: state.memory_cache.len().await,
    })
}

#[tauri::command]
pub async fn get_ytm_account_status(
    state: State<'_, AppState>,
) -> Result<YtmAccountStatus, AppError> {
    state.sync_engine.account_status().await
}

#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> Result<PlaybackSession, AppError> {
    let session = SessionPersistence::load_session(&state.pool)
        .await?
        .unwrap_or_default();
    if !session.queue.is_empty() {
        let _ = state
            .audio_tx
            .send(AudioCommand::SetQueue(session.queue.clone(), 0))
            .await;
    }
    let _ = state
        .audio_tx
        .send(AudioCommand::SetShuffle(session.shuffle))
        .await;
    let _ = state
        .audio_tx
        .send(AudioCommand::SetRepeat(session.repeat_mode.clone()))
        .await;
    let _ = state
        .audio_tx
        .send(AudioCommand::SetAutoplay(session.autoplay_enabled))
        .await;
    let _ = state
        .audio_tx
        .send(AudioCommand::SetVolume(session.volume))
        .await;
    Ok(session)
}

#[tauri::command]
pub async fn get_synced_lyrics(
    state: State<'_, AppState>,
    video_id: String,
    title: String,
    artist: String,
    duration_sec: u64,
) -> Result<LyricsPayload, AppError> {
    fetch_synced_lyrics(
        &state.pool,
        state.lrc_provider.as_ref(),
        state.ytm_lyrics_provider.as_ref(),
        &video_id,
        &title,
        &artist,
        duration_sec,
    )
    .await
}

#[tauri::command]
pub async fn set_lyric_offset(
    state: State<'_, AppState>,
    video_id: String,
    offset_ms: i64,
) -> Result<(), AppError> {
    persist_lyric_offset(&state.pool, &video_id, offset_ms).await
}

#[tauri::command]
pub async fn download_track(
    state: State<'_, AppState>,
    track: TrackMetadata,
    quality: String,
) -> Result<OfflineTrackEntry, AppError> {
    state.download_manager.download_track(&track, &quality).await
}

#[tauri::command]
pub async fn download_playlist(
    state: State<'_, AppState>,
    tracks: Vec<TrackMetadata>,
    quality: String,
) -> Result<Vec<OfflineTrackEntry>, AppError> {
    state
        .download_manager
        .download_playlist(&tracks, &quality)
        .await
}

#[tauri::command]
pub async fn list_offline_tracks(
    state: State<'_, AppState>,
) -> Result<Vec<OfflineTrackEntry>, AppError> {
    state.download_manager.list_offline_tracks().await
}

#[tauri::command]
pub async fn remove_offline_track(
    state: State<'_, AppState>,
    video_id: String,
) -> Result<(), AppError> {
    state.download_manager.remove_offline_track(&video_id).await
}

#[tauri::command]
pub async fn clear_lru_cache(state: State<'_, AppState>) -> Result<u64, AppError> {
    state.memory_cache.clear().await;
    state.disk_cache.clear()
}

#[tauri::command]
pub async fn update_ytdlp_binary(state: State<'_, AppState>) -> Result<String, AppError> {
    state.ytdlp.update_ytdlp_binary().await
}

#[tauri::command]
pub async fn set_discord_rpc_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), AppError> {
    if let Ok(mut rpc) = state.discord_rpc.lock() {
        rpc.set_enabled(enabled);
    }
    Ok(())
}

#[tauri::command]
pub async fn connect_ytm_account(
    state: State<'_, AppState>,
    credential: String,
) -> Result<(), AppError> {
    state.sync_engine.connect_and_merge_likes(&credential).await
}

#[tauri::command]
pub async fn disconnect_ytm_account(state: State<'_, AppState>) -> Result<(), AppError> {
    state.sync_engine.disconnect().await
}

#[tauri::command]
pub async fn toggle_like_song(
    state: State<'_, AppState>,
    track: TrackMetadata,
    liked: bool,
) -> Result<(), AppError> {
    state.sync_engine.toggle_like_song(&track, liked).await
}

#[tauri::command]
pub async fn list_liked_songs(state: State<'_, AppState>) -> Result<Vec<TrackMetadata>, AppError> {
    let rows = sqlx::query(
        "SELECT video_id, title, artist, album, duration_sec, thumbnail_url FROM liked_songs ORDER BY liked_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        out.push(TrackMetadata {
            video_id: r.try_get("video_id")?,
            title: r.try_get("title")?,
            artist: r.try_get("artist")?,
            album: r.try_get("album")?,
            duration_sec: r.try_get::<i64, _>("duration_sec")?.max(0) as u64,
            thumbnail_url: r.try_get("thumbnail_url")?,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn list_playlists(state: State<'_, AppState>) -> Result<Vec<PlaylistSummary>, AppError> {
    state.sync_engine.list_playlists().await
}

#[tauri::command]
pub async fn create_playlist(
    state: State<'_, AppState>,
    name: String,
    source: String,
) -> Result<PlaylistSummary, AppError> {
    state.sync_engine.create_playlist(&name, &source).await
}

#[tauri::command]
pub async fn rename_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    new_name: String,
) -> Result<(), AppError> {
    state.sync_engine.rename_playlist(playlist_id, &new_name).await
}

#[tauri::command]
pub async fn delete_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
) -> Result<(), AppError> {
    state.sync_engine.delete_playlist(playlist_id).await
}

#[tauri::command]
pub async fn add_track_to_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    track: TrackMetadata,
) -> Result<(), AppError> {
    state
        .sync_engine
        .add_track_to_playlist(playlist_id, &track)
        .await
}

#[tauri::command]
pub async fn remove_track_from_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    video_id: String,
) -> Result<(), AppError> {
    state
        .sync_engine
        .remove_track_from_playlist(playlist_id, &video_id)
        .await
}

#[tauri::command]
pub async fn reconcile_ytm_sync(state: State<'_, AppState>) -> Result<(), AppError> {
    state.sync_engine.reconcile_two_way().await
}

/// Helper used on `CloseRequested` / Tray `Quit` to flush the active session immediately.
pub async fn flush_worker_session_blocking(pool: &SqlitePool, audio_tx: &mpsc::Sender<AudioCommand>) {
    let (tx, rx) = tokio::sync::oneshot::channel::<WorkerSnapshot>();
    if audio_tx.send(AudioCommand::GetSnapshot(tx)).await.is_ok() {
        if let Ok(snap) = rx.await {
            let mut persistence = SessionPersistence::new(pool.clone());
            let session = PlaybackSession {
                current_track: snap.current_track,
                position_ms: snap.position_ms,
                queue: snap.queue,
                shuffle: snap.shuffle,
                repeat_mode: snap.repeat_mode,
                autoplay_enabled: snap.autoplay_enabled,
                volume: snap.volume,
            };
            let _ = persistence
                .flush_now(&session, chrono::Utc::now().timestamp_millis())
                .await;
        }
    }
    let _ = audio_tx.send(AudioCommand::Shutdown).await;
}
