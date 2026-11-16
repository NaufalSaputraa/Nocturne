# System Architecture & Rust Backend Blueprint

Dokumen ini menjelaskan rancangan teknis *backend* Rust, struktur folder proyek, komunikasi *inter-process* (IPC) antara Frontend dan Backend, serta skema database lokal untuk **Nocturne**.

---

## 1. Arsitektur Tingkat Tinggi (Actor / Worker Pattern)

Untuk mencegah antarmuka pengguna (*WebView*) membeku saat melakukan *network request*, *parsing* JSON, atau *audio buffering*, *backend* Rust dipisahkan menjadi jalur kerja asinkron menggunakan `tokio::sync::mpsc`:

```text
+-------------------------------------------------------------------+
|                     FRONTEND (React + Tailwind)                   |
|  - 5 Views (Home, Zen Lyrics, Search, Playlist Detail, Settings)  |
|  - InteractiveLyricLine (60-144fps rAF + performance.now())       |
+---------------------------------+---------------------------------+
                                  |
         Tauri Commands (invoke)  |  Tauri Events (app.emit)
        (Play, Seek, Sync, DL)    |  (playback-sync 500ms / immediate,
                                  |   track-changed, download-progress)
                                  v
+-------------------------------------------------------------------+
|                    RUST BACKEND CORE (Tauri v2)                   |
|                                                                   |
|  +-----------------------+      +------------------------------+  |
|  |   Metadata, Search,   |      |   Audio Engine Worker Thread |  |
|  |   Lyrics & Auto-Radio |      |   (Single libmpv2 + tokio)   |  |
|  | (rustypipe / reqwest) |      |  - perceptualLoudnessDb Gain |  |
|  +-----------+-----------+      +--------------+---------------+  |
|              |                                 |                  |
|  +-----------v-----------+      +--------------v---------------+  |
|  |   SQLite & Keyring    |      |  Dual-Tier Stream Extractor  |  |
|  |  (sqlx + Two-Way YTM  |      |  (rustypipe primary <250ms,  |  |
|  |   Sync + Session)     |      |   yt-dlp fallback, LRU, DL)  |  |
|  +-----------------------+      +--------------+---------------+  |
|                                                |                  |
|                                 +--------------v---------------+  |
|                                 |  OS Media & Rich Presence    |  |
|                                 |  (souvlaki SMTC + Discord)   |  |
|                                 +------------------------------+  |
+-------------------------------------------------------------------+
```

---

## 2. Struktur Direktori Proyek

```text
nocturne/
├── docs/
│   ├── product_requirements_document_prd.md
│   ├── system_architecture_rust_backend_blueprint.md
│   ├── ui_ux_design_system_interactive_lyrics_spec.md
│   └── superpowers/specs/
│       └── 2026-11-16-nocturne-design.md
├── src/                          # Frontend (React + TypeScript + Tailwind)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Titlebar.tsx      # Custom Windows 11 caption controls
│   │   │   ├── Sidebar.tsx       # Navigasi Menu, Local & YTM Playlists
│   │   │   ├── RightPanel.tsx    # Tab Queue (Autoplay toggle) & Mini Lyrics
│   │   │   └── PlayerDock.tsx    # Bottom Transport Bar (rAF progress)
│   │   ├── lyrics/
│   │   │   └── InteractiveLyricLine.tsx  # Animasi rAF per huruf + sweep cap
│   │   └── modals/
│   │       └── SettingsModal.tsx # Quality, loudness, LRU/Offline, Discord RPC, YTM Auth
│   ├── views/
│   │   ├── HomeView.tsx          # All / Songs / Albums / Playlists / Offline
│   │   ├── SearchView.tsx        # Search + filtered Artist view
│   │   ├── PlaylistDetailView.tsx# CRUD YTM/Local + Download controls
│   │   └── ZenLyricsView.tsx     # Radial ring, ambient glow, ±ms lyric offset
│   ├── store/
│   │   └── usePlayerStore.ts     # State global Zustand
│   └── App.tsx
└── src-tauri/                    # Backend Rust
    ├── binaries/
    │   └── yt-dlp-x86_64-pc-windows-msvc.exe  # Fallback sidecar binary
    ├── src/
    │   ├── audio/
    │   │   ├── engine.rs         # Single libmpv2 wrapper (perceptualLoudnessDb pre-amp)
    │   │   └── worker.rs         # Loop command mpsc & emitter playback-sync (500ms)
    │   ├── extractor/
    │   │   ├── stream.rs         # Primary rustypipe stream & loudness extractor (<250ms)
    │   │   ├── ytdlp.rs          # Fallback sidecar execution & auto-update
    │   │   ├── cache.rs          # In-memory URL cache (TTL 5.5h) + LRU disk cache
    │   │   └── downloader.rs     # Explicit offline download manager & progress events
    │   ├── metadata/
    │   │   ├── search.rs         # Pencarian YTM, Home charts & Auto-Radio (rustypipe)
    │   │   ├── lyrics.rs         # LRCLIB + YTM native lyrics fallback & parser
    │   │   └── sync.rs           # Hybrid Local + YTM two-way sync engine
    │   ├── os/
    │   │   ├── media_controls.rs # Integrasi souvlaki (SMTC/MPRIS)
    │   │   └── discord_rpc.rs    # Native Discord Rich Presence integration
    │   ├── db/
    │   │   ├── sqlite.rs         # Skema playlist, sync, offline, offsets & session
    │   │   └── session.rs        # Debounced 5s session writer + flush on pause/seek/exit
    │   ├── commands.rs           # Tauri #[tauri::command] endpoints
    │   └── main.rs               # Setup libmpv-2.dll resource_dir() & CloseRequested flush
    ├── Cargo.toml
    └── tauri.conf.json           # bundle.resources untuk libmpv-2.dll + externalBin yt-dlp
```

---

## 3. Spesifikasi Dependensi (`Cargo.toml`)

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json", "stream"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite"] }
rustypipe = "0.11"
souvlaki = "0.8"
libmpv2 = "2.0"
discord-rich-presence = "0.2"
keyring = "3"
chrono = "0.4"
thiserror = "1"
```

---

## 4. Kontrak IPC (Tauri Commands & Events)

### Frontend $\rightarrow$ Backend (`invoke`)
* `search_catalog(query: String, filter: String) -> Result<SearchResult, String>`
* `play_track(track: TrackMetadata) -> Result<(), String>`
* `toggle_playback() -> Result<bool, String>`
* `seek_to(position_ms: u64) -> Result<(), String>`
* `set_volume(volume: f32) -> Result<(), String>`
* `set_autoplay(enabled: bool) -> Result<(), String>`
* `restore_session() -> Result<Option<PlaybackSession>, String>`
* `get_synced_lyrics(video_id: String, title: String, artist: String, duration_sec: u64) -> Result<LyricsPayload, String>`
* `set_lyric_offset(video_id: String, offset_ms: i64) -> Result<(), String>`
* `download_track(track: TrackMetadata) -> Result<(), String>` / `download_playlist(playlist_id: i64) -> Result<(), String>`
* `connect_ytm_account(...)` / `disconnect_ytm_account()` / `trigger_ytm_sync()`
* `create_playlist(...)`, `rename_playlist(...)`, `delete_playlist(...)`, `toggle_like_song(...)`
* `update_ytdlp_binary() -> Result<String, String>`

### Backend $\rightarrow$ Frontend (`app.emit`)
* `playback-sync`: Dikirim setiap `500 ms` saat status *Playing*, serta **seketika** saat perubahan status (`play`, `pause`, `seek`, `buffering`, `track-changed`):
  ```json
  {
    "position_ms": 84120,
    "duration_ms": 222000,
    "is_playing": true,
    "is_buffering": false,
    "server_ts_ms": 1794857120450
  }
  ```
* `track-changed`: Dikirim saat lagu baru mulai diputar (termasuk dari *auto-next*, *Auto-Radio*, atau tombol *headset* `souvlaki`).
* `queue-updated`: Dikirim saat antrean lagu berubah, *Auto-Radio* menambah lagu, atau *pre-fetch* lagu berikutnya siap.
* `download-progress`: Dikirim selama pengunduhan lagu/playlist untuk mode *Offline*.
* `sync-status`: Dikirim saat status sinkronisasi *two-way* YTM berubah (misalnya `syncing`, `synced`, atau peringatan non-blokir jika sesi kedaluwarsa).

---

## 5. Skema Database Lokal (SQLite)

```sql
CREATE TABLE IF NOT EXISTS liked_songs (
    video_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_sec INTEGER NOT NULL,
    thumbnail_url TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'local', -- 'local' | 'synced' | 'pending_push' | 'pending_delete'
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    source TEXT NOT NULL DEFAULT 'local',      -- 'local' | 'ytm'
    ytm_playlist_id TEXT UNIQUE,
    sync_status TEXT NOT NULL DEFAULT 'local', -- 'local' | 'synced' | 'pending_push' | 'pending_delete'
    last_synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_sec INTEGER NOT NULL,
    thumbnail_url TEXT NOT NULL,
    position INTEGER NOT NULL,
    set_video_id TEXT,                         -- Diperlukan Innertube untuk hapus item playlist YTM
    sync_status TEXT NOT NULL DEFAULT 'local', -- 'local' | 'synced' | 'pending_push' | 'pending_delete'
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, video_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offline_downloads (
    video_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_sec INTEGER NOT NULL,
    thumbnail_url TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    format TEXT NOT NULL,
    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lyric_offsets (
    video_id TEXT PRIMARY KEY,
    offset_ms INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playback_session (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_track_json TEXT,
    position_ms INTEGER NOT NULL DEFAULT 0,
    queue_json TEXT NOT NULL DEFAULT '[]',
    shuffle INTEGER NOT NULL DEFAULT 0,
    repeat_mode TEXT NOT NULL DEFAULT 'off',
    autoplay_enabled INTEGER NOT NULL DEFAULT 1,
    volume REAL NOT NULL DEFAULT 1.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

> **Catatan Implementasi Kritis:**
> - **Isolasi `libmpv-2.dll` (Windows):** `libmpv-2.dll` dibundel melalui `bundle.resources` di `tauri.conf.json`, lalu `main.rs` menyelesaikan `app.path().resource_dir()` (memanggil `SetDllDirectoryW` / menyisipkan ke `PATH` proses sebelum `Mpv::new()`) agar peluncuran dari *Start Menu* atau *System Tray* tetap menemukan DLL secara deterministik.
> - **Debouncing `playback_session`:** `position_ms` ditulis ke SQLite maksimal setiap **5 detik** saat pemutaran berlangsung, ditambah penulisan segera (*immediate flush*) pada event `pause`, `seek`, `track-changed`, dan `WindowEvent::CloseRequested` / keluar dari tray.

---

## 6. Strategi Ekstraksi, Pre-Fetch & Caching Stream

1. **Dual-Tier Extraction (`rustypipe` primary + `yt-dlp` fallback):** Pemutaran lagu baru langsung memanggil `rustypipe` di memori Rust (`< 250 ms`) untuk memperoleh stream URL beserta metadata `perceptualLoudnessDb`. Sidecar `yt-dlp` hanya dipanggil apabila `rustypipe` gagal melakukan dekripsi/ekstraksi URL.
2. **Cache Memory (`RwLock<HashMap<String, CachedStream>>`):** Menyimpan `stream_url`, `perceptualLoudnessDb`, dan `expires_at` (`now + 5.5 jam`, lebih aman dari batas 6 jam server YouTube).
3. **Proactive Pre-Fetch & Auto-Radio:** Di dalam `worker.rs`, saat `duration_ms - position_ms <= 15_000`, *worker* memicu `tokio::spawn` untuk mengekstrak URL lagu berikutnya—dan jika antrean hampir habis saat `Autoplay` aktif, sekaligus menarik daftar *Auto-Radio* dari `rustypipe`.
4. **LRU Stream Cache vs. Explicit Offline Downloads:** Audio yang pernah diputar disimpan otomatis di direktori LRU cache hingga batas kapasitas di Settings, terpisah dari direktori permanen `offline_downloads` yang dikelola eksplisit oleh pengguna.
