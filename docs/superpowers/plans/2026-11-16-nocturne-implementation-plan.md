# Nocturne Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build **Nocturne**, a lightweight, ad-free Windows 11 desktop YouTube Music player in Rust + Tauri v2 + React + TypeScript + Tailwind CSS with hybrid local/two-way YTM sync, offline downloads, Discord Rich Presence, and 60–144fps interactive Zen Lyrics.

**Architecture:** The Rust backend uses an async `tokio::sync::mpsc` worker wrapping a single `libmpv2` instance for gapless/sequential-crossfade playback and `perceptualLoudnessDb` static pre-amp normalization. Stream URLs are resolved natively via `rustypipe` (`< 250 ms`) with `yt-dlp` sidecar fallback, cached in memory (`5.5h` TTL) and on disk (LRU), and emitted to the React frontend via `500 ms` `playback-sync` events that drive a local `requestAnimationFrame` clock.

**Tech Stack:** Rust, Tauri v2 (`tauri`, `tauri-plugin-shell`), `tokio`, `sqlx` (SQLite), `libmpv2`, `rustypipe`, `reqwest`, `souvlaki`, `discord-rich-presence`, `keyring`, React, TypeScript, Tailwind CSS, Zustand, Vitest.

**Spec:** [2026-11-16-nocturne-design.md](file:///d:/Coding/Nocturne/docs/superpowers/specs/2026-11-16-nocturne-design.md)

## Global Constraints

- Target platform: Windows 11 v1 deliverable (`.msi` / `.exe`) with portable Rust/Tauri code for future Linux & macOS builds.
- Brand name: **Nocturne** everywhere (no *Aura Music* references).
- Performance targets: `< 180 MB` idle/playback RAM, `< 400 ms` search latency, `< 250 ms` primary `rustypipe` stream extraction, `< 200 ms` pre-fetched transition (`15_000 ms` lead time), `< 100 ms` cold-start session restore.
- Windows `libmpv-2.dll` isolation: bundle `libmpv-2.dll` via `tauri.conf.json` `bundle.resources` and explicitly configure DLL search path from `app.path().resource_dir()` before initializing `Mpv::new()`.
- IPC & clock sync: `playback-sync` emitted every `500 ms` while playing and immediately on `play`, `pause`, `seek`, `buffering`, and `track-changed`; `usePlaybackClock` resets `lastSyncServerMs`/`lastSyncPerfNow` on `is_buffering: true` or `seek_to`, and freezes progression when `is_playing: false` or `is_buffering: true`.
- `playback_session` debouncing: persist `position_ms` to SQLite every `5_000 ms` during playback, plus immediate flush on `pause`, `seek`, `track-changed`, and `WindowEvent::CloseRequested` / tray exit.
- Lyrics sweep & styling: cap sweep duration at `Math.min(totalDuration * 0.88, text.length * 90)` ms; Warm Dark Charcoal tokens (`#121212`, `#18181B`, `#222226`, `#27272A`, `#FFFFFF`, `#F43F5E`, `#FAFAFA`, `#A1A1AA`, `#71717A`), `'Inter', 'Plus Jakarta Sans'` font, `tabular-nums`, `whitespace-nowrap`, `aspect-square object-cover`, and Zen-only ambient glow (`opacity: 0.12`, `blur(96px)`).

## Review Focus

- `rustypipe` stream extraction fails with cipher/403 error -> `DualTierExtractor` automatically falls back to the `yt-dlp` sidecar and caches the resolved URL with `5.5h` TTL (tested in Task 2).
- `playback-sync` arrives with `is_buffering: true` or `is_playing: false` after `seek_to` -> `usePlaybackClock` resets `anchorPositionMs`/`anchorPerfNow` and returns a frozen timestamp across subsequent `requestAnimationFrame` ticks (tested in Task 8).
- Rapid `playback-sync` ticks every `500 ms` during continuous playback -> `SessionPersistence` writes `playback_session` to SQLite only once per `5_000 ms`, while flushing immediately on `Pause`, `Seek`, `TrackChanged`, or `CloseRequested` (tested in Task 4).
- Short lyric line (`"Wait"`, 4 chars) followed by a `16_000 ms` instrumental gap -> `computeLyricSweep` caps `activeSweepDuration` at `4 * 90 = 360 ms` instead of `14_080 ms` (tested in Task 10).
- Expired YTM auth token during `toggle_like_song` or playlist mutation -> local SQLite preserves `sync_status = 'pending_push'`, emits a non-blocking `sync-status` warning, and playback continues uninterrupted (tested in Task 6).

---

### Task 1: Workspace Scaffold, Tauri Config & SQLite Schema Foundation

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/index.css`, `src/main.tsx`, `src/App.tsx`
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `src-tauri/src/models.rs`, `src-tauri/src/db/mod.rs`, `src-tauri/src/db/sqlite.rs`
- Test: `src-tauri/src/db/sqlite.rs` (inline `#[cfg(test)]` tests)

**Interfaces:**
- Consumes: None (foundation task).
- Produces:
  - `src-tauri/src/models.rs`: `TrackMetadata`, `StreamSource`, `StreamInfo`, `PlaybackSyncPayload`, `PlaybackSession`, `LyricLine`, `LyricsPayload`, `DownloadProgressPayload`, `SyncStatusPayload`, `SearchResult`, `AppError`
  - `src-tauri/src/db/sqlite.rs`: `pub async fn init_db(db_path: &std::path::Path) -> Result<sqlx::SqlitePool, sqlx::Error>`

- [ ] **Step 1: Initialize Git (if absent) and scaffold project configuration files**

Run `git init` if `.git` does not exist. Create `package.json` (`react`, `react-dom`, `zustand`, `lucide-react`, `@tauri-apps/api`, `@tauri-apps/plugin-shell`, `tailwindcss`, `vitest`, `@testing-library/react`, `jsdom`), `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `src-tauri/Cargo.toml` (with `tauri = 2`, `tauri-plugin-shell`, `tokio`, `serde`, `serde_json`, `reqwest`, `sqlx` sqlite, `rustypipe`, `souvlaki`, `libmpv2`, `discord-rich-presence`, `keyring`, `chrono`, `thiserror`, plus `windows-sys` under `[target.'cfg(windows)'.dependencies]` for `SetDllDirectoryW`), `src-tauri/tauri.conf.json` (`productName: "Nocturne"`, `decorations: false` custom titlebar, `bundle.resources: ["binaries/libmpv-2.dll"]`, `bundle.externalBin: ["binaries/yt-dlp"]`), and `src-tauri/capabilities/default.json`. Add placeholder/build instructions in `src-tauri/binaries/README.md` for placing `libmpv-2.dll` and `yt-dlp-x86_64-pc-windows-msvc.exe` (keeping unit tests independent of external binaries).

- [ ] **Step 2: Write the failing SQLite schema & migration test in `src-tauri/src/db/sqlite.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;

    #[tokio::test]
    async fn init_db_creates_all_seven_nocturne_tables_and_columns() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("nocturne_test.db");
        let pool = init_db(&db_path).await.expect("db init should succeed");

        let rows = sqlx::query("SELECT name FROM sqlite_master WHERE type='table'")
            .fetch_all(&pool)
            .await
            .unwrap();
        let names: Vec<String> = rows.into_iter().map(|r| r.get::<String, _>("name")).collect();
        for expected in [
            "liked_songs",
            "playlists",
            "playlist_tracks",
            "play_history",
            "offline_downloads",
            "lyric_offsets",
            "playback_session",
        ] {
            assert!(names.contains(&expected.to_string()), "missing table {expected}");
        }
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml init_db_creates_all_seven_nocturne_tables_and_columns`
Expected: FAIL because `init_db` / `sqlite.rs` is not implemented yet.

- [ ] **Step 4: Implement `models.rs` and `init_db` in `src-tauri/src/db/sqlite.rs`**

Define all shared serializable structs/errors in `src-tauri/src/models.rs` and implement `init_db(db_path: &Path) -> Result<SqlitePool, sqlx::Error>` enabling WAL mode (`PRAGMA journal_mode=WAL;`) and `PRAGMA foreign_keys=ON;`, creating all 7 tables from `docs/system_architecture_rust_backend_blueprint.md` (`liked_songs`, `playlists`, `playlist_tracks`, `play_history`, `offline_downloads`, `lyric_offsets`, `playback_session`). Add `#[tauri::command] fn ping() -> &'static str` stub in `lib.rs` so `cargo test` builds cleanly.

- [ ] **Step 5: Run tests and npm install to verify foundation**

Run: `npm install && cargo test --manifest-path src-tauri/Cargo.toml db::sqlite::tests`
Expected: PASS (`1 passed; 0 failed`).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts index.html src/ src-tauri/
git commit -m "chore: scaffold Nocturne Tauri v2 workspace and SQLite schema"
```

---

### Task 2: Dual-Tier Stream Extractor (`rustypipe` Primary + `yt-dlp` Fallback) & Caches

**Files:**
- Create: `src-tauri/src/extractor/mod.rs`, `src-tauri/src/extractor/stream.rs`, `src-tauri/src/extractor/ytdlp.rs`, `src-tauri/src/extractor/cache.rs`
- Modify: `src-tauri/src/lib.rs` (expose `pub mod extractor;`)
- Test: `src-tauri/src/extractor/stream.rs`, `src-tauri/src/extractor/cache.rs`

**Interfaces:**
- Consumes: `models::{StreamInfo, StreamSource, AppError}`
- Produces:
  - `extractor/stream.rs`:
    - `#[async_trait::async_trait] pub trait PrimaryStreamProvider: Send + Sync { async fn fetch_stream(&self, video_id: &str, quality: &str) -> Result<StreamInfo, AppError>; }`
    - `#[async_trait::async_trait] pub trait FallbackStreamProvider: Send + Sync { async fn fetch_stream(&self, video_id: &str, quality: &str) -> Result<StreamInfo, AppError>; }`
    - `pub struct DualTierExtractor { ... }` with `pub async fn resolve_stream(&self, video_id: &str, quality: &str) -> Result<StreamInfo, AppError>`
  - `extractor/ytdlp.rs`: `pub struct YtdlpSidecar` + `pub async fn update_ytdlp_binary(...) -> Result<String, AppError>`
  - `extractor/cache.rs`:
    - `pub struct MemoryStreamCache` (`get(&self, key: &str, now_unix: i64)`, `insert(&self, info: StreamInfo)`, TTL = `5 * 3600 + 1800` seconds = `5.5h`)
    - `pub struct LruDiskCache` (`new(dir: PathBuf, max_bytes: u64)`, `get_path(&self, video_id: &str) -> Option<PathBuf>`, `put_bytes(&self, video_id: &str, ext: &str, data: &[u8]) -> Result<PathBuf, AppError>`)

- [ ] **Step 1: Write failing tests for Dual-Tier fallback, 5.5h TTL cache, and LRU disk eviction**

In `src-tauri/src/extractor/stream.rs`:
- `primary_failure_triggers_ytdlp_fallback_and_caches_with_5_5h_ttl` (Review Focus #1): mock `PrimaryStreamProvider` returning `Err(AppError::Extraction("cipher 403"))` and mock `FallbackStreamProvider` returning a valid `StreamInfo` (`StreamSource::YtdlpFallback`). Assert `resolve_stream` returns the fallback URL, sets `expires_at_unix` to `now + 19_800` (`5.5h`), and a second `resolve_stream` call hits the memory cache (`fallback_calls == 1`).
In `src-tauri/src/extractor/cache.rs`:
- `lru_disk_cache_evicts_oldest_file_when_exceeding_max_bytes`: insert three 4KB files into an `LruDiskCache` with `max_bytes = 8 * 1024`; touch the first file via `get_path` so the second becomes oldest; insert the third; assert the second file is evicted while the first and third remain.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml extractor::`
Expected: FAIL with unresolved module `extractor`.

- [ ] **Step 3: Implement `cache.rs`, `ytdlp.rs`, and `stream.rs`**

- `MemoryStreamCache` uses `tokio::sync::RwLock<HashMap<String, StreamInfo>>` with `STREAM_TTL_SECS: i64 = 19_800` (`5.5h`).
- `LruDiskCache` reads/updates file `atime`/`mtime` (or an index timestamp) and evicts least-recently-used entries whenever total bytes exceed `max_bytes` (capped cleanly when `max_bytes > 0`).
- `RustypipeStreamProvider` uses `rustypipe` `get_player(video_id)` to extract the best audio stream (`Opus`/`M4A` according to `quality`) and reads `loudness_db` (`perceptualLoudnessDb`).
- `YtdlpSidecar` invokes `yt-dlp` (`-f bestaudio[ext=webm]/bestaudio -g --no-playlist`) as fallback only when `RustypipeStreamProvider` returns an error, and implements `update_ytdlp_binary` (`yt-dlp -U`).
- `DualTierExtractor::resolve_stream` checks `LruDiskCache` -> `MemoryStreamCache` -> `PrimaryStreamProvider` -> `FallbackStreamProvider`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml extractor::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/extractor/ src-tauri/src/lib.rs
git commit -m "feat: add dual-tier rustypipe/yt-dlp extractor and 5.5h/LRU caches"
```

---

### Task 3: Windows `libmpv-2.dll` Isolation, `perceptualLoudnessDb` Pre-Amp & Audio Worker

**Files:**
- Create: `src-tauri/src/audio/mod.rs`, `src-tauri/src/audio/engine.rs`, `src-tauri/src/audio/worker.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/audio/engine.rs`, `src-tauri/src/audio/worker.rs`

**Interfaces:**
- Consumes: `models::{TrackMetadata, PlaybackSyncPayload, StreamInfo, AppError}`, `extractor::stream::DualTierExtractor`
- Produces:
  - `audio/engine.rs`:
    - `pub fn configure_windows_dll_search_path(resource_dir: &std::path::Path) -> Result<(), AppError>`
    - `pub fn compute_preamp_volume_scale(perceptual_loudness_db: Option<f32>, normalize_enabled: bool) -> f64`
    - `pub trait AudioBackend: Send` + `pub struct MpvAudioEngine`
  - `audio/worker.rs`:
    - `pub enum AudioCommand { PlayTrack(TrackMetadata), TogglePlayback, SeekTo(u64), SetVolume(f32), SetQueue(Vec<TrackMetadata>, usize), Next, Prev, SetShuffle(bool), SetRepeat(String), SetAutoplay(bool), SetNormalization(bool), SetCrossfadeMs(u64), Shutdown }`
    - `pub trait PlaybackEventSink: Send + Sync` (abstracts Tauri `AppHandle::emit` for `playback-sync`, `track-changed`, `queue-updated`)
    - `pub fn spawn_audio_worker(...) -> tokio::sync::mpsc::Sender<AudioCommand>`

- [ ] **Step 1: Write failing tests for pre-amp loudness math, 500ms sync + immediate transition events, and 15s pre-fetch**

In `src-tauri/src/audio/engine.rs`:
- `perceptual_loudness_db_maps_to_bounded_preamp_gain`: assert `compute_preamp_volume_scale(Some(-6.0), true)` lowers gain vs `Some(0.0)` and `Some(4.0)` boosts gently within safe `[0.25, 2.0]` bounds, while `normalize_enabled = false` always returns `1.0`.
In `src-tauri/src/audio/worker.rs`:
- `worker_emits_500ms_sync_immediate_transitions_and_triggers_15s_prefetch`: using a mock `AudioBackend` + mock `PlaybackEventSink` + mock `DualTierExtractor`, play track 1 (`duration_ms = 30_000`) with track 2 queued; verify `playback-sync` emits at ~`500 ms` cadence (not 33ms), emits **immediately** when `SeekTo` or `TogglePlayback` runs, and spawns pre-fetch for track 2 once `duration_ms - position_ms <= 15_000`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml audio::`
Expected: FAIL with unresolved module `audio`.

- [ ] **Step 3: Implement `engine.rs` and `worker.rs`**

- `configure_windows_dll_search_path(resource_dir: &Path)`: on `cfg(windows)`, convert `resource_dir` (and `resource_dir.join("binaries")`) to UTF-16 and call `SetDllDirectoryW` / prepend to `PATH` before creating `libmpv2::Mpv`.
- `MpvAudioEngine`: single `libmpv2::Mpv` instance (`vo=null`, `vid=no`, `gapless-audio=yes`, HTTP stream loading, sequential fade-out/fade-in volume ramping across `crossfade_ms`, `perceptualLoudnessDb` static gain via `af=volume` or property scaling).
- `spawn_audio_worker`: `tokio::time::interval(Duration::from_millis(500))` emitting `PlaybackSyncPayload` (`position_ms`, `duration_ms`, `is_playing`, `is_buffering`, `server_ts_ms`) while playing, immediate emission on `PlayTrack`/`TogglePlayback`/`SeekTo`/buffering change, and `15_000 ms` pre-fetch spawn.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml audio::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio/ src-tauri/src/lib.rs
git commit -m "feat: add isolated libmpv2 engine, perceptual loudness preamp, and 500ms audio worker"
```

---

### Task 4: 5-Second Debounced `playback_session` Persistence & Cold-Start Restore

**Files:**
- Create: `src-tauri/src/db/session.rs`
- Modify: `src-tauri/src/db/mod.rs`, `src-tauri/src/audio/worker.rs`, `src-tauri/src/main.rs`
- Test: `src-tauri/src/db/session.rs`

**Interfaces:**
- Consumes: `models::PlaybackSession`, `db::sqlite::init_db`
- Produces:
  - `db/session.rs`:
    - `pub struct SessionPersistence` (`new(pool: SqlitePool)`)
    - `pub async fn maybe_save_tick(&mut self, session: &PlaybackSession, now_ms: i64) -> Result<bool, sqlx::Error>`
    - `pub async fn flush_now(&mut self, session: &PlaybackSession, now_ms: i64) -> Result<(), sqlx::Error>`
    - `pub async fn load_session(pool: &sqlx::SqlitePool) -> Result<Option<PlaybackSession>, sqlx::Error>`

- [ ] **Step 1: Write failing tests for 5s debouncing, immediate flush, and `< 100 ms` restore**

In `src-tauri/src/db/session.rs` (Review Focus #3):
- `session_persistence_debounces_500ms_ticks_to_5s_and_flushes_immediately_on_events`:
  1. Call `maybe_save_tick(&s1, 0)` -> returns `Ok(true)` (initial save).
  2. Call `maybe_save_tick(&s2, 500)`, `maybe_save_tick(&s3, 4_500)` -> both return `Ok(false)` (debounced; SQLite still holds `s1.position_ms`).
  3. Call `maybe_save_tick(&s4, 5_000)` -> returns `Ok(true)` (5s threshold elapsed).
  4. Call `flush_now(&s5, 5_200)` -> updates SQLite immediately despite `< 5_000 ms` elapsed.
  5. Measure `load_session(&pool)` round-trip and assert restored `PlaybackSession` matches `s5` in `< 100 ms`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::session::tests`
Expected: FAIL with unresolved module `session`.

- [ ] **Step 3: Implement `db/session.rs` and wire into `worker.rs` and `main.rs`**

- `SessionPersistence` tracks `last_write_ms: Option<i64>` and only runs `INSERT INTO playback_session ... ON CONFLICT(id) DO UPDATE` inside `maybe_save_tick` when `now_ms - last >= 5_000`.
- Wire `SessionPersistence::maybe_save_tick` into the `500 ms` worker tick loop, call `flush_now` immediately on `Pause`, `Seek`, and `TrackChanged`, and hook `tauri::WindowEvent::CloseRequested` in `src-tauri/src/main.rs` to flush the active session synchronously/blocking before closing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::session::tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/session.rs src-tauri/src/db/mod.rs src-tauri/src/audio/worker.rs src-tauri/src/main.rs
git commit -m "feat: add 5s debounced playback_session persistence and cold-start restore"
```

---

### Task 5: Metadata Search, Endless Queue / Auto-Radio & LRCLIB + YTM Fallback Lyrics

**Files:**
- Create: `src-tauri/src/metadata/mod.rs`, `src-tauri/src/metadata/search.rs`, `src-tauri/src/metadata/lyrics.rs`
- Modify: `src-tauri/src/audio/worker.rs` (trigger Auto-Radio when queue has `<= 1` remaining track and `autoplay_enabled == true`), `src-tauri/src/lib.rs`
- Test: `src-tauri/src/metadata/lyrics.rs`, `src-tauri/src/metadata/search.rs`

**Interfaces:**
- Consumes: `models::{TrackMetadata, SearchResult, LyricLine, LyricsPayload, AppError}`
- Produces:
  - `metadata/search.rs`:
    - `#[async_trait::async_trait] pub trait CatalogProvider: Send + Sync`
    - `pub struct RustypipeCatalogProvider` (`search_catalog`, `get_home_feed`, `get_artist_tracks`, `get_auto_radio`)
  - `metadata/lyrics.rs`:
    - `pub fn parse_lrc(lrc: &str, duration_sec: u64) -> Vec<LyricLine>`
    - `pub async fn get_synced_lyrics(pool: &SqlitePool, lrc_client: &impl LrcProvider, ytm_lyrics: &impl YtmLyricsProvider, video_id: &str, title: &str, artist: &str, duration_sec: u64) -> Result<LyricsPayload, AppError>`
    - `pub async fn set_lyric_offset(pool: &SqlitePool, video_id: &str, offset_ms: i64) -> Result<(), AppError>`

- [ ] **Step 1: Write failing tests for LRC parsing, LRCLIB -> YTM fallback, `lyric_offsets`, and Auto-Radio deduplication**

In `src-tauri/src/metadata/lyrics.rs`:
- `lrclib_miss_falls_back_to_ytm_lyrics_and_applies_persisted_offset`: mock `LrcProvider` returning `None`, mock `YtmLyricsProvider` returning lines, persist `set_lyric_offset(&pool, "vid1", -250)`, assert `get_synced_lyrics` returns `source == "ytm"` and `offset_ms == -250`.
- `parse_lrc_computes_end_times_from_next_line_and_track_duration`: parse `[00:10.50]Line 1\n[00:15.00]Line 2` for `duration_sec = 30`, assert `start_time_ms`/`end_time_ms` equal `10500..15000` and `15000..30000`.
In `src-tauri/src/metadata/search.rs`:
- `auto_radio_excludes_already_queued_or_played_video_ids`: assert duplicate `video_id` tracks from radio responses are filtered out.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml metadata::`
Expected: FAIL with unresolved module `metadata`.

- [ ] **Step 3: Implement `search.rs` and `lyrics.rs` + wire Auto-Radio into `worker.rs`**

- `RustypipeCatalogProvider` queries `rustypipe` for YTM search (`Top Result`, `Songs`, `Albums`, `Artists`), public charts/playlists for unauthenticated Home, filtered artist results, and *Up Next / Radio* continuation for Auto-Radio.
- `lyrics.rs` queries `https://lrclib.net/api/get` with `reqwest`, parses synced LRC timestamps, falls back to `rustypipe` lyrics when LRCLIB returns 404/empty, and reads/writes `lyric_offsets` in SQLite.
- Wire Auto-Radio trigger into `worker.rs`: when advancing tracks leaves `<= 1` item ahead and `autoplay_enabled == true`, fetch `get_auto_radio` in a background task and append unique tracks + emit `queue-updated`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml metadata::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/metadata/ src-tauri/src/audio/worker.rs src-tauri/src/lib.rs
git commit -m "feat: add rustypipe catalog search, Auto-Radio, and LRCLIB/YTM lyrics fallback"
```

---

### Task 6: Hybrid Local + YTM Two-Way Sync, Offline Download Manager & Tauri Commands

**Files:**
- Create: `src-tauri/src/metadata/sync.rs`, `src-tauri/src/extractor/downloader.rs`, `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/metadata/mod.rs`, `src-tauri/src/extractor/mod.rs`, `src-tauri/src/lib.rs` (register all `#[tauri::command]` handlers)
- Test: `src-tauri/src/metadata/sync.rs`, `src-tauri/src/extractor/downloader.rs`

**Interfaces:**
- Consumes: `models::*`, `db::sqlite`, `db::session`, `extractor::{stream::DualTierExtractor, ytdlp::YtdlpSidecar}`, `metadata::{search::RustypipeCatalogProvider, lyrics}`, `audio::worker::AudioCommand`
- Produces:
  - `metadata/sync.rs`: `pub trait CredentialStore`, `pub trait YtmWriteApi`, `pub struct SyncEngine` (`connect_and_merge_likes`, `disconnect`, `create_playlist`, `rename_playlist`, `delete_playlist`, `toggle_like_song`, `add_track_to_playlist`, `remove_track_from_playlist`, `reconcile_two_way`)
  - `extractor/downloader.rs`: `pub struct DownloadManager` (`download_track`, `download_playlist`, `list_offline_tracks`, `remove_offline_track`)
  - `commands.rs`: all Tauri IPC commands matching `docs/system_architecture_rust_backend_blueprint.md` Section 4

- [ ] **Step 1: Write failing tests for two-way sync, expired token resilience, and offline download indexing**

In `src-tauri/src/metadata/sync.rs` (Review Focus #5):
- `login_merges_existing_local_likes_to_ytm_and_keeps_local_playlists_separate`: seed 2 local `liked_songs` (`sync_status = 'local'`) and 1 local playlist (`source = 'local'`); call `connect_and_merge_likes`; assert both likes are pushed to mock `YtmWriteApi` and marked `'synced'`, while local playlists retain `source = 'local'`.
- `expired_ytm_token_keeps_pending_push_and_emits_non_blocking_warning`: mock `YtmWriteApi` returning `Err(AppError::AuthExpired)`; call `toggle_like_song`; assert SQLite holds `sync_status = 'pending_push'`, `SyncStatusPayload { state: "warning", .. }` is emitted, and the command does not fail local state.
- `full_ytm_playlist_crud_flushes_pending_before_remote_pull`: verify create, rename, remove track (using `set_video_id`), and delete playlist push pending mutations first, then reconcile remote state.
In `src-tauri/src/extractor/downloader.rs`:
- `download_track_saves_file_emits_progress_and_indexes_sqlite`: stream mock bytes to a temp directory, assert `offline_downloads` row exists and `download-progress` reaches `"completed"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml sync::tests downloader::tests`
Expected: FAIL with unresolved modules.

- [ ] **Step 3: Implement `sync.rs`, `downloader.rs`, and `commands.rs`**

- Store YTM OAuth/cookie credentials in OS keyring via `keyring` crate behind `CredentialStore` trait.
- Implement full YTM playlist CRUD + Innertube `set_video_id` tracking and non-blocking local fallback on auth errors.
- Implement `DownloadManager` streaming audio via `reqwest` into the user's configured Offline Downloads folder with `download-progress` events and SQLite `offline_downloads` tracking.
- Expose all `#[tauri::command]` endpoints in `src-tauri/src/commands.rs` and register them in `tauri::generate_handler![]` inside `src-tauri/src/lib.rs`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS across all Rust modules.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/metadata/sync.rs src-tauri/src/extractor/downloader.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add hybrid two-way YTM sync, offline download manager, and Tauri commands"
```

---

### Task 7: OS Media Controls (`souvlaki`) & Native Discord Rich Presence

**Files:**
- Create: `src-tauri/src/os/mod.rs`, `src-tauri/src/os/media_controls.rs`, `src-tauri/src/os/discord_rpc.rs`
- Modify: `src-tauri/src/audio/worker.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs` (system tray setup)
- Test: `src-tauri/src/os/discord_rpc.rs`, `src-tauri/src/os/media_controls.rs`

**Interfaces:**
- Consumes: `models::TrackMetadata`, `audio::worker::AudioCommand`
- Produces:
  - `os/media_controls.rs`: `pub struct MediaControlsBridge` (`update_metadata`, `update_playback_state`) forwarding `souvlaki::MediaControlEvent` (`Play`, `Pause`, `Toggle`, `Next`, `Previous`, `SeekBy`) to `mpsc::Sender<AudioCommand>`
  - `os/discord_rpc.rs`: `pub trait RichPresenceClient`, `pub struct DiscordRpcBridge` (`set_enabled`, `update_activity`, `clear_activity`)

- [ ] **Step 1: Write failing tests for Discord RPC toggle & media key mapping**

In `src-tauri/src/os/discord_rpc.rs`:
- `disabled_discord_rpc_skips_updates_and_clears_presence`: call `set_enabled(false)` after `update_activity(...)` and assert mock `RichPresenceClient::clear` is called and subsequent `update_activity` calls do not connect/send.
In `src-tauri/src/os/media_controls.rs`:
- `souvlaki_event_maps_to_audio_command`: assert `MediaControlEvent::Next` sends `AudioCommand::Next` and `MediaControlEvent::Toggle` sends `AudioCommand::TogglePlayback`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml os::`
Expected: FAIL with unresolved module `os`.

- [ ] **Step 3: Implement `media_controls.rs`, `discord_rpc.rs`, and Tauri System Tray**

- Wrap `souvlaki::MediaControls` cleanly (passing HWND on Windows for SMTC integration) without failing startup if media controls cannot attach in headless/test runs.
- Wrap `discord-rich-presence` non-blockingly so missing Discord desktop client is silently ignored without errors.
- Configure Tauri tray icon menu (`Show/Hide`, `Play/Pause`, `Next`, `Quit` -> triggers `SessionPersistence::flush_now`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml os::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/os/ src-tauri/src/audio/worker.rs src-tauri/src/lib.rs src-tauri/src/main.rs
git commit -m "feat: add souvlaki SMTC controls, Discord Rich Presence, and system tray"
```

---

### Task 8: Frontend Types, Zustand Store & `usePlaybackClock` (`rAF` Anchor Reset & Freeze)

**Files:**
- Create: `src/types/nocturne.ts`, `src/lib/tauri.ts`, `src/store/usePlayerStore.ts`, `src/hooks/usePlaybackClock.ts`
- Test: `src/hooks/usePlaybackClock.test.ts`

**Interfaces:**
- Consumes: Backend Tauri commands & events (`playback-sync`, `track-changed`, `queue-updated`, `download-progress`, `sync-status`)
- Produces:
  - `src/types/nocturne.ts`: `TrackMetadata`, `PlaybackSyncPayload`, `PlaybackSession`, `LyricLine`, `LyricsPayload`, `DownloadProgressPayload`, `SyncStatusPayload`, `PlaylistSummary`, `AppSettings`
  - `src/hooks/usePlaybackClock.ts`:
    - `export interface ClockAnchor { anchorPositionMs: number; anchorPerfNow: number; durationMs: number; isPlaying: boolean; isBuffering: boolean; }`
    - `export function applySyncToAnchor(prev: ClockAnchor, sync: PlaybackSyncPayload, perfNow: number): ClockAnchor`
    - `export function computeClockTimeMs(anchor: ClockAnchor, perfNow: number): number`
    - `export function usePlaybackClock(): number`

- [ ] **Step 1: Write failing tests for `usePlaybackClock` seek/buffering anchor reset & freeze**

In `src/hooks/usePlaybackClock.test.ts` (Review Focus #2):
- `freezes_time_when_paused_or_buffering`: set `isPlaying = false` (and separately `isBuffering = true`) at `anchorPositionMs = 42_000`, `anchorPerfNow = 1_000`; call `computeClockTimeMs(anchor, 5_000)` and assert it still returns `42_000`.
- `resets_anchors_on_buffering_sync_and_post_seek_sync`: start playing at `42_000` (`perfNow = 1_000`), simulate a `seek_to(90_000)` -> receiving `playback-sync { position_ms: 90_000, is_buffering: true, is_playing: true }` at `perfNow = 1_200`; assert `anchorPositionMs === 90_000`, `anchorPerfNow === 1_200`, time stays frozen at `90_000` while `is_buffering: true`, then resumes smoothly from `90_000` once `{ position_ms: 90_050, is_buffering: false, is_playing: true }` arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/usePlaybackClock.test.ts`
Expected: FAIL because `src/hooks/usePlaybackClock.ts` does not exist.

- [ ] **Step 3: Implement `nocturne.ts`, `tauri.ts`, `usePlayerStore.ts`, and `usePlaybackClock.ts`**

- Keep `currentTimeMs` out of Zustand's render-triggering state for `requestAnimationFrame` ticks! Store `clockAnchor` in a lightweight external/ref-accessible store slice (`getClockAnchor()`) updated on `playback-sync` events and `seek_to`, so `usePlaybackClock()` runs `requestAnimationFrame` locally inside time-sensitive components (`InteractiveLyricLine` parent, `PlayerDock`, `ZenLyricsView`) without re-rendering unrelated views.
- On app mount, `usePlayerStore.hydrateSession()` invokes `restore_session` and applies `PlaybackSession` immediately.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/usePlaybackClock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/ src/lib/ src/store/ src/hooks/
git commit -m "feat: add Zustand store and rAF usePlaybackClock with buffering/seek freeze"
```

---

### Task 9: Warm Dark Charcoal UI Shell, Core Views & Settings Modal

**Files:**
- Modify: `index.html`, `src/index.css` (Warm Dark Charcoal CSS variables, Inter/Plus Jakarta Sans font setup, `#121212` / `#18181B` / `#222226` / `#27272A` / `#FFFFFF` / `#F43F5E` tokens)
- Create: `src/components/layout/Titlebar.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/RightPanel.tsx`, `src/components/layout/PlayerDock.tsx`
- Create: `src/views/HomeView.tsx`, `src/views/SearchView.tsx`, `src/views/PlaylistDetailView.tsx`, `src/components/modals/SettingsModal.tsx`
- Modify: `src/App.tsx`
- Test: `src/views/HomeView.test.tsx`, `src/components/modals/SettingsModal.test.tsx`

**Interfaces:**
- Consumes: `usePlayerStore`, `usePlaybackClock`, `lib/tauri`
- Produces: Complete 5-view shell (`Home`, `Search`, `PlaylistDetail`, `SettingsModal`, plus route slot for `ZenLyricsView` in Task 10).

- [ ] **Step 1: Write failing component tests for Offline filter, Autoplay toggle, and Settings controls**

- In `src/views/HomeView.test.tsx`: assert all 5 filter pills (`All`, `Songs`, `Albums`, `Playlists`, `Offline`) render with `whitespace-nowrap`, and clicking `Offline` displays downloaded tracks from `offline_downloads`.
- In `src/components/modals/SettingsModal.test.tsx`: assert controls exist for Audio Quality (`Opus 160kbps`), Metadata Loudness Normalization, Crossfade duration, LRU Cache limit & path, Offline Downloads folder, Discord Rich Presence toggle, YTM Account connect/disconnect, and `Check for Updates` (`yt-dlp` fallback).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/HomeView.test.tsx src/components/modals/SettingsModal.test.tsx`
Expected: FAIL because views/components do not exist.

- [ ] **Step 3: Implement CSS tokens, Layout shell, Views, and SettingsModal**

Follow `docs/ui_ux_design_system_interactive_lyrics_spec.md` strictly:
- `Titlebar.tsx`: `64px` header, `"Nocturne"` logo, `<` `>` nav buttons, `480px` `Ctrl+K` search pill, Settings gear, YTM profile/sync badge, Windows 11 Minimize/Maximize/Close buttons (`getCurrentWindow()`).
- `Sidebar.tsx`: Menu (`Home`, `Liked Songs`, `History`, `Offline`), separate sections for `Local Playlists` and `YTM Playlists` with create playlist modal.
- `RightPanel.tsx`: `Queue` tab with `Autoplay (Auto-Radio)` toggle + `Mini Lyrics` tab.
- `PlayerDock.tsx`: `tabular-nums` timestamps driven by `usePlaybackClock`, transport controls, Like heart (`#F43F5E`), Zen Focus Mode toggle, volume slider.
- `HomeView.tsx`, `SearchView.tsx` (Top Result 40% + Songs 60% + Albums/Artists carousels + filtered Artist click state), `PlaylistDetailView.tsx` (`176x176px` cover, `Download All` + per-track progress, YTM playlist rename/delete/remove, `DATE ADDED`), `SettingsModal.tsx`.

- [ ] **Step 4: Run tests and TypeScript check to verify they pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add index.html src/
git commit -m "feat: implement Warm Dark Charcoal shell, Home/Search/Playlist views, and Settings"
```

---

### Task 10: Zen Focus Lyrics View, `InteractiveLyricLine` & Subtle Ambient Artwork Glow

**Files:**
- Create: `src/components/lyrics/InteractiveLyricLine.tsx`, `src/views/ZenLyricsView.tsx`
- Modify: `src/App.tsx` (wire `ZenLyricsView` transition)
- Test: `src/components/lyrics/InteractiveLyricLine.test.tsx`, `src/views/ZenLyricsView.test.tsx`

**Interfaces:**
- Consumes: `usePlayerStore`, `usePlaybackClock`, `LyricsPayload`
- Produces:
  - `src/components/lyrics/InteractiveLyricLine.tsx`:
    - `export function computeLyricSweep(text: string, startTimeMs: number, endTimeMs: number): { activeSweepDuration: number; words: Array<Array<{ char: string; charStart: number; charEnd: number }>> }`
    - `export const InteractiveLyricLine: React.FC<InteractiveLyricLineProps>`
  - `src/views/ZenLyricsView.tsx`: `ZenLyricsView`

- [ ] **Step 1: Write failing tests for 90ms/char sweep cap, sine pop, ambient glow, and lyric offset**

In `src/components/lyrics/InteractiveLyricLine.test.tsx` (Review Focus #4):
- `caps_sweep_duration_at_90ms_per_character_before_long_interlude`: call `computeLyricSweep("Wait", 10_000, 26_000)` (`totalDuration = 16_000`, `text.length = 4`); assert `activeSweepDuration === 360` (not `14_080`), and all words stay grouped in `inline-flex` word containers without splitting words mid-wrap.
In `src/views/ZenLyricsView.test.tsx`:
- `renders_radial_seek_ring_zen_ambient_glow_and_lyric_offset_controls`: render `ZenLyricsView` with an active track + lyrics; assert the `280px` circular disc, `#F43F5E` SVG radial seek ring, ambient glow element (`opacity: 0.12`, `blur(96px)`), 3 `Up Next` mini cards, and `-100ms`/`+100ms` lyric offset buttons invoking `set_lyric_offset`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/lyrics/InteractiveLyricLine.test.tsx src/views/ZenLyricsView.test.tsx`
Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement `InteractiveLyricLine.tsx` and `ZenLyricsView.tsx`**

- Implement `computeLyricSweep` with `Math.min(totalDuration * 0.88, text.length * 90)` and `InteractiveLyricLine` following `docs/ui_ux_design_system_interactive_lyrics_spec.md` Section 4 (sine curve `scale(1.14)`, `translateY(-2.5px)`, white `textShadow`, click-to-seek line).
- Implement `ZenLyricsView`: `← Back to Library`, `± ms` Lyric Offset control (`currentTimeMs + offsetMs` passed to lyric active line matching & `InteractiveLyricLine`), `YouTube Audio • Ad-Free` badge, left 45% column with subtle dominant-color ambient glow (`opacity: 0.12`, `blur(96px)`) behind the `280px` circular album disc + SVG radial seek ring `#F43F5E` + 3 `Up Next` mini cards, right 55% column auto-scrolling centered lyrics.

- [ ] **Step 4: Run full frontend + backend verification**

Run: `npx tsc --noEmit && npx vitest run && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS across all TypeScript checks, Vitest suites, and Cargo tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/lyrics/ src/views/ZenLyricsView.tsx src/App.tsx
git commit -m "feat: add Zen Focus Lyrics view, InteractiveLyricLine sweep cap, and ambient glow"
```

---

## Self-Review Checklist (Completed)

1. **Spec Coverage:** Every requirement from `2026-11-16-nocturne-design.md` (Dual-tier extraction, 5.5h/LRU/Offline downloads, `libmpv-2.dll` resource isolation, `perceptualLoudnessDb` pre-amp, 500ms `playback-sync` + `rAF` freeze/reset, 5s session debounce + `CloseRequested` flush, Auto-Radio, Hybrid Local + YTM two-way sync, `souvlaki` SMTC, Discord RPC, 5 UI views + Zen ambient glow + 90ms/char lyric cap + `± ms` offset) maps to Tasks 1–10.
2. **Step Scan:** Each step gives exact file paths, signatures, test assertions, and verification commands without redundant function-body transcripts.
3. **Type Consistency:** `TrackMetadata`, `StreamInfo`, `PlaybackSyncPayload`, `PlaybackSession`, `LyricsPayload`, `AudioCommand`, `DualTierExtractor`, `SessionPersistence`, and `usePlaybackClock` match across all `Consumes`/`Produces` blocks.
4. **Review Focus:** All 5 failure modes are listed in `## Review Focus` and tested directly inside Tasks 2, 4, 6, 8, and 10.
5. **Proportion:** Concise task cards focused on interfaces, decisions, and tests (~12 KB vs. the full system scope).
