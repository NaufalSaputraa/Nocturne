pub mod audio;
pub mod commands;
pub mod db;
pub mod extractor;
pub mod metadata;
pub mod models;
pub mod os;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, WindowEvent};

use crate::audio::engine::{AudioBackend, BackendState, MpvAudioEngine};
use crate::audio::worker::{spawn_audio_worker_with_deps, AudioCommand, PlaybackEventSink};
use crate::commands::{flush_worker_session_blocking, load_persisted_settings, AppState};
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

            let default_cache_dir = data_dir.join("cache");
            let default_downloads_dir = data_dir.join("downloads");
            let persisted_settings = tauri::async_runtime::block_on(load_persisted_settings(
                &pool,
                &default_cache_dir.to_string_lossy(),
                &default_downloads_dir.to_string_lossy(),
            ));

            let cache_limit_bytes =
                (persisted_settings.lru_limit_gb.max(0.5) * 1024.0 * 1024.0 * 1024.0) as u64;
            let disk_cache = Arc::new(
                LruDiskCache::new(
                    std::path::PathBuf::from(&persisted_settings.lru_cache_path),
                    cache_limit_bytes,
                )
                .or_else(|_| LruDiskCache::new(default_cache_dir, cache_limit_bytes))
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
            extractor.set_prefer_fallback(persisted_settings.prefer_ytdlp);

            let catalog = Arc::new(RustypipeCatalogProvider::new());
            let (backend, mpv_active): (Box<dyn AudioBackend>, bool) =
                match MpvAudioEngine::new(resource_dir.as_deref()) {
                    Ok(mpv) => {
                        eprintln!("[Nocturne] MpvAudioEngine initialized");
                        (Box::new(mpv), true)
                    }
                    Err(err) => {
                        eprintln!("[Nocturne] libmpv-2.dll unavailable ({err}); using fallback audio backend");
                        (Box::new(NoopAudioBackend::default()), false)
                    }
                };

            let smtc_holder: Arc<Mutex<MediaControlsBridge>> =
                Arc::new(Mutex::new(MediaControlsBridge::disabled()));

            let sink = Arc::new(TauriEventSink {
                app: app_handle.clone(),
                smtc: Arc::clone(&smtc_holder),
            });

            let audio_tx = tauri::async_runtime::block_on(async {
                spawn_audio_worker_with_deps(
                    backend,
                    Arc::clone(&extractor),
                    sink.clone(),
                    persisted_settings.audio_quality.clone(),
                    0.8,
                    Some(SessionPersistence::new(pool.clone())),
                    Some(catalog.clone()),
                )
            });
            let _ = audio_tx.try_send(AudioCommand::SetNormalization(
                persisted_settings.normalize_volume,
            ));
            let _ = audio_tx.try_send(AudioCommand::SetCrossfadeMs(
                persisted_settings.crossfade_sec * 1000,
            ));

            // Re-bind SMTC bridge with live `audio_tx` and main window HWND on Windows.
            #[cfg(target_os = "windows")]
            let hwnd = app
                .get_webview_window("main")
                .and_then(|win| win.hwnd().ok())
                .map(|h| h.0 as *mut std::ffi::c_void);
            #[cfg(not(target_os = "windows"))]
            let hwnd: Option<*mut std::ffi::c_void> = None;

            if let Ok(mut guard) = smtc_holder.lock() {
                *guard = MediaControlsBridge::new_optional(hwnd, audio_tx.clone());
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
                    std::path::PathBuf::from(&persisted_settings.offline_downloads_path),
                )
                .or_else(|_| {
                    DownloadManager::new(
                        pool.clone(),
                        Arc::clone(&extractor),
                        Arc::new(TauriEventSink {
                            app: app_handle.clone(),
                            smtc: Arc::clone(&smtc_holder),
                        }),
                        data_dir.join("downloads"),
                    )
                })
                .expect("failed to initialize DownloadManager"),
            );

            let discord_rpc = Arc::new(Mutex::new(DiscordRpcBridge::new(
                Box::new(DiscordIpcClient::new("1234567890123456789")),
                persisted_settings.discord_rpc_enabled,
            )));

            let close_to_tray = Arc::new(AtomicBool::new(persisted_settings.close_to_tray));

            app.manage(AppState {
                pool: pool.clone(),
                audio_tx: audio_tx.clone(),
                catalog,
                lrc_provider: Arc::new(ReqwestLrcProvider::new()),
                ytm_lyrics_provider: Arc::new(RustypipeYtmLyricsProvider::new()),
                sync_engine,
                download_manager,
                extractor,
                disk_cache,
                memory_cache,
                ytdlp,
                discord_rpc,
                mpv_active,
                close_to_tray,
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
            if let WindowEvent::CloseRequested { api, .. } = event {
                let st = window.state::<AppState>();
                if st.close_to_tray.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    tauri::async_runtime::block_on(flush_worker_session_blocking(
                        &st.pool,
                        &st.audio_tx,
                    ));
                }
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
            commands::set_audio_quality,
            commands::get_settings,
            commands::save_settings,
            commands::get_storage_stats,
            commands::get_engine_diagnostics,
            commands::get_ytm_account_status,
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
