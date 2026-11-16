# Nocturne — Design Specification

**Date:** 2026-11-16  
**Status:** Approved  
**Target Platform:** Desktop — Windows 11 v1 deliverable (`.msi` / `.exe`); Rust/Tauri code kept portable for future Linux & macOS builds  
**Reference Docs:**
- `docs/product_requirements_document_prd.md`
- `docs/system_architecture_rust_backend_blueprint.md`
- `docs/ui_ux_design_system_interactive_lyrics_spec.md`

---

## 1. Intent & Why

**Nocturne** is a lightweight, ad-free desktop YouTube Music player built with **Rust + Tauri v2 + React + TypeScript + Tailwind CSS**.

It exists to solve three pain points of listening to YouTube Music on desktop via a browser or Electron wrapper:
1. **Distraction-free playback:** Direct audio streaming (`Opus`/`M4A`) without video/audio ads or browser tab clutter.
2. **Native efficiency:** Target RAM usage under `180 MB` during idle/playback, `< 400 ms` search latency, and `< 200 ms` track transitions via pre-fetching.
3. **Immersive desktop craft:** A Warm Dark Charcoal (`60-30-10`) studio interface with a *Zen Focus Lyrics* mode featuring smooth 60–144fps character-by-character karaoke glow, paired with native Windows 11 titlebar controls and OS media integration (SMTC / Bluetooth media keys).

All three reference documents in `docs/` have been synchronized under the **Nocturne** brand.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Ad-free audio streaming (Dual-Tier Extraction):** Primary stream extraction via `rustypipe` native Rust Innertube player client (`< 250 ms`, zero process-spawn overhead) with `yt-dlp` sidecar as automatic fallback, played through `libmpv2`.
- **Hybrid Local + YTM Account (Two-Way Sync):** Works out-of-the-box without login (local SQLite library + public charts), while supporting optional YouTube Music account login with two-way sync for *Liked Songs* and full YTM playlist CRUD.
- **60–144fps Zen Interactive Lyrics:** Backend emits `playback-sync` every `500 ms` (plus immediate events on `play`, `pause`, `seek`, `buffering`, and `track-changed`); Frontend interpolates `currentTimeMs` locally via `requestAnimationFrame` + `performance.now()` for native display refresh-rate animations, backed by LRCLIB + YTM native lyrics fallback, capped character sweep speed, per-track `lyric_offset_ms`, and a subtle Zen-only ambient artwork glow.
- **Gold-Standard Listening Continuity:** Endless Queue / Auto-Radio (`Autoplay`), Instant Cold-Start Session Restore (`< 100 ms`), metadata-driven volume normalization (`perceptualLoudnessDb`), automatic LRU stream cache, and explicit *Download for Offline* management.
- **OS-native & Developer Integration:** Frameless Windows 11 custom titlebar, system tray support, hardware/OS media keys via `souvlaki`, and native Discord Rich Presence (`discord-rich-presence`).
- **Self-contained maintenance:** In-app Settings for audio quality (`Opus 160kbps`), loudness normalization, crossfade duration, LRU cache size & path, offline downloads folder, Discord RPC toggle, YTM account connection, and one-click `yt-dlp` fallback sidecar updates.

### Non-Goals
- Video playback or YouTube video browsing UI.
- Mobile (Android/iOS) or web-hosted builds.
- Social features (public profiles, collaborative live rooms, friend activity feeds).
- Audiophile DSP suite (parametric EQ, VST plugins, ASIO/WASAPI exclusive mode in v1).

### Anti-Goals
- **Electron-level resource bloat:** Must not spawn heavy headless browser instances or exceed the `180 MB` RAM target during normal playback.
- **Blocking the UI thread or flooding IPC:** Network requests, `yt-dlp` fallback execution, SQLite queries, audio decoding, and high-frequency IPC ticks must never stall or flood the Tauri WebView.
- **Dynamic DSP pumping:** Must not use single-pass real-time `loudnorm` filtering that pumps chorus dynamics; use YTM's `perceptualLoudnessDb` pre-amp metadata instead.
- **Fragile auth coupling:** An expired or unauthenticated YouTube Music session must never break local playback, search, or local playlists.
- **Generic AI-slop UI:** Must strictly adhere to the Warm Dark Charcoal palette (`#121212` clean canvas on main views), tabular numbers, single-line controls, and zero heavy drop-shadows defined in `docs/ui_ux_design_system_interactive_lyrics_spec.md` (with subtle radial ambient glow strictly confined to Zen Focus Lyrics Mode).

---

## 3. Constraints

- **Sidecar & Native Library Bundling (Windows 11):** Requires bundling `yt-dlp-x86_64-pc-windows-msvc.exe` (via `tauri-plugin-shell`, used as fallback extractor) and `libmpv-2.dll` alongside the application binary.
- **YouTube Stream URL Expiration:** Extracted YouTube audio stream URLs expire after ~6 hours. The in-memory cache TTL is capped at `5.5 hours`.
- **Lyric Granularity & Timing:** LRCLIB provides line-level synced LRC (`[mm:ss.xx]`), not per-character timestamps; YouTube Music native lyrics serve as fallback when LRCLIB misses. Character animation interpolates via `requestAnimationFrame` with sweep duration capped at `Math.min(totalDuration * 0.88, text.length * 90)` ms so interludes do not stretch vocal highlights, plus per-track `± ms` offset adjustment.
- **Tauri v2 IPC:** All Frontend $\leftrightarrow$ Backend communication flows through `#[tauri::command]` (`invoke`) and `app.emit` events (`500 ms` `playback-sync` + immediate state-change events, reducing IPC volume by ~95% vs. 30 Hz polling).

---

## 4. Approaches Considered

Three technical approaches were evaluated for the audio engine and YouTube Music integration:

1. **`libmpv2` + `rustypipe` Primary / `yt-dlp` Fallback + Innertube (`reqwest`) — SELECTED**
   - *How it works:* `libmpv2` handles HTTPS Opus/M4A streaming, instant seeking, sequential crossfade, and static pre-amp normalization from `perceptualLoudnessDb`. `rustypipe` extracts direct stream URLs in `< 250 ms` natively in Rust, falling back to `yt-dlp` only if extraction fails. `rustypipe` + authenticated Innertube HTTP requests handle catalog search, Home feeds, Auto-Radio, and two-way sync.
   - *Trade-off:* Adds `libmpv-2.dll` (~40 MB) to the Windows distribution, but delivers mature HTTP streaming, seeking, crossfade, and normalization with minimal custom DSP/demuxer code.
2. **Pure-Rust Audio (`rodio` + `symphonia`) + Sidecar `yt-dlp` + `rustypipe`**
   - *How it works:* Replaces `libmpv2` with pure-Rust decoding and a custom HTTP range-request ring buffer.
   - *Trade-off:* Smaller binary without `libmpv-2.dll`, but high implementation risk around remote HTTP seeking, WebM/Opus container quirks, crossfade, and volume normalization.
3. **WebView HTML5 `<audio>` + Rust Backend for Extraction & Sync**
   - *How it works:* Rust only extracts URLs and syncs SQLite; WebView2 `<audio>` plays the stream.
   - *Trade-off:* Simplest audio setup, but poor control over crossfade, volume normalization, and reliable background playback when minimized to the system tray.

**Decision:** Approach 1 (`libmpv2` + `rustypipe` primary / `yt-dlp` fallback + Innertube) was chosen to hit `< 250 ms` cold track start, `< 200 ms` pre-fetched transitions, zero-CPU loudness normalization, and 60–144fps `requestAnimationFrame` lyrics.

---

## 5. System Design

### 5.1 Rust Backend Architecture (Actor / Worker Pattern)
- **Audio Worker Thread (`audio/worker.rs` + `audio/engine.rs`):** Receives playback commands (`Play`, `Pause`, `Seek`, `SetVolume`, `Crossfade`, `Next`, `Prev`) over `tokio::sync::mpsc`. Uses a **single `libmpv2` instance** (staying comfortably under `< 180 MB` RAM and keeping OS/RPC state deterministic) implementing **gapless playback + sequential fade-out/fade-in**. Bundles `libmpv-2.dll` via `tauri.conf.json` `bundle.resources` and explicitly resolves `app.path().resource_dir()` (calling Windows `SetDllDirectoryW` / prepending to process `PATH` before `Mpv::new()`) so Start Menu or System Tray launches with an arbitrary working directory never fail to load the DLL. Applies static pre-amp gain derived from `perceptualLoudnessDb` (when normalization is enabled) rather than real-time `loudnorm` DSP. Emits `playback-sync` (`position_ms`, `duration_ms`, `is_playing`, `is_buffering`, `server_ts_ms`) every `500 ms` while playing and immediately on any state transition (`play`, `pause`, `seek`, `buffering`, `track-changed`), plus `queue-updated`.
- **Dual-Tier Stream Extractor, LRU Cache & Offline Downloads (`extractor/stream.rs`, `extractor/ytdlp.rs`, `extractor/cache.rs`, `extractor/downloader.rs`):**
  - *Primary Extractor (`rustypipe`) + `yt-dlp` Fallback:* Resolves audio stream URLs (`Opus`/`M4A`) and `perceptualLoudnessDb` natively in Rust via `rustypipe` (`< 250 ms` cold extraction). Automatically falls back to the `yt-dlp` sidecar only if `rustypipe` fails (e.g., YouTube cipher rotation).
  - *URL Cache & Pre-fetch:* Caches resolved URLs + loudness metadata in `RwLock<HashMap<String, CachedStream>>` with a `5.5h` TTL. When `duration_ms - position_ms <= 15_000`, the worker spawns a background task to pre-fetch the next queued track's URL.
  - *Automatic Offline Stream Cache (LRU):* Transparently caches recently played audio streams to the configured cache directory up to a user-defined size limit so replayed songs start instantly.
  - *Explicit Download for Offline:* Dedicated download manager supporting per-track and per-playlist downloads with progress events (`download-progress`), SQLite tracking of downloaded files, and an **Offline** filter/tab in the UI so downloaded tracks play without network access.
- **Metadata, Lyrics & Auto-Radio (`metadata/search.rs`, `metadata/lyrics.rs`):** Uses `rustypipe` for YouTube Music search (`Top Result`, `Songs`, `Albums`, `Artists`), public charts, and **Endless Queue / Auto-Radio** (*Up Next / Radio* expansion when `Autoplay` is active and the queue runs low). Queries LRCLIB for synced LRC, falling back to YouTube Music native lyrics (`rustypipe`) when LRCLIB has no match, and applies persisted per-track `lyric_offset_ms`.
- **OS Integration, Discord RPC & Session Restore (`os/media_controls.rs`, `os/discord_rpc.rs`):**
  - Uses `souvlaki` to publish metadata/artwork to Windows SMTC (and MPRIS/macOS equivalents) and handle hardware play/pause/next/prev events.
  - Integrates `discord-rich-presence` (native Rust crate, toggleable in Settings) to display the active track, artist, cover art, and elapsed/remaining timestamps in Discord.
  - Persists and restores the active playback session (`playback_session` table) on startup in `< 100 ms`. To avoid SQLite I/O thrashing every `500 ms`, `position_ms` writes are **debounced every 5 seconds** during active playback, with an **immediate flush** on `pause`, `seek`, `track-changed`, and Tauri `WindowEvent::CloseRequested` / tray exit.

### 5.2 Hybrid Local + YTM Two-Way Sync
- **Dual-Mode Operation:**
  - *Unauthenticated (Default):* Home displays local `play_history`, local playlists, and public `rustypipe` charts/curated playlists (which also back the Featured Editorial Banner and `Playlists` filter pill). *Liked Songs* and *Playlists* are stored locally in SQLite.
  - *Authenticated (Optional YTM Login):* User connects a YTM account from the header profile icon or Settings. Home merges personalized YTM recommendations; Sidebar displays YTM playlists alongside local-only playlists (kept distinct so logging out never destroys local playlists).
- **Two-Way Sync Rules:**
  - *Liked Songs Merge on Login:* When a user connects a YTM account, existing local `liked_songs` are merged and pushed up to YTM *Liked Songs*. Subsequent Like/Unlike actions update SQLite optimistically and sync to YTM.
  - *Full YTM Playlist CRUD:* Users can create, rename, and delete YTM playlists as well as add/remove tracks directly from Nocturne; local-only playlists remain strictly in SQLite.
  - *Conflict & Failure Handling (Builder/Reviewer Call):* Sync mutations use optimistic SQLite updates with `pending_push` / `pending_delete` states (storing Innertube `set_video_id` for playlist item removals). On sync, pending local mutations flush first, with remote YTM state winning on conflicts. If the YTM session/token expires or network fails, the app notifies the user non-blockingly and falls back to local mode without interrupting audio playback.

### 5.3 Persistence (SQLite via `sqlx`)
Extends the base schema in `docs/system_architecture_rust_backend_blueprint.md` (`liked_songs`, `playlists`, `playlist_tracks`, `play_history`) to support hybrid sync, offline downloads, lyric offsets, and cold-start session restore:
- `playlists` includes `source` (`'local' | 'ytm'`), `ytm_playlist_id`, `sync_status` (`'local' | 'synced' | 'pending_push' | 'pending_delete'`), and `last_synced_at`.
- `playlist_tracks` includes `set_video_id` (for YTM item removal) and `sync_status` (`'local' | 'synced' | 'pending_push' | 'pending_delete'`).
- `liked_songs` includes `sync_status` (`'local' | 'synced' | 'pending_push' | 'pending_delete'`).
- `offline_downloads` table indexes explicitly downloaded tracks (`video_id`, `file_path`, `file_size_bytes`, `format`, `downloaded_at`).
- `lyric_offsets` table persists per-track timing adjustments (`video_id` PK, `offset_ms`, `updated_at`).
- `playback_session` table persists the current track metadata/ID, `position_ms`, queue list (`queue_json` or `queue_items` table), `shuffle`, `repeat_mode`, `autoplay_enabled`, and `volume` for `< 100 ms` startup restore.
- Auth credentials/cookies are stored securely outside plaintext SQLite (e.g., OS credential store / keyring).

### 5.4 Frontend & UI/UX
- **5 Core Views:**
  - *Home / Dashboard:* Filter pills (`All`, `Songs`, `Albums`, `Playlists`, `Offline`), Featured Editorial Banner, and recent/curated content on a clean `#121212` canvas.
  - *Search Results (`Ctrl+K`):* Top Result + Songs + Albums + Artists; clicking an Artist opens a filtered Artist results view within `SearchView`.
  - *Playlist / Album Detail:* Download-all and per-track download buttons with progress indicators, plus YTM playlist create/rename/delete actions.
  - *Zen & Synced Lyrics (`Focus View`):* Two-column layout with a 280px circular album disc + SVG radial seek ring (`#F43F5E`), a Zen-only subtle dominant-color ambient artwork glow (`opacity: 0.12`, `blur(96px)`) behind the vinyl disc, a `± ms` Lyric Offset control, and `InteractiveLyricLine` running on `requestAnimationFrame` + `performance.now()` with sweep cap `Math.min(totalDuration * 0.88, text.length * 90)`.
  - *Settings Modal:* Audio quality (`Opus 160kbps`), metadata loudness normalization toggle, sequential crossfade duration, LRU cache size limit & path, offline downloads folder, Discord Rich Presence toggle, `yt-dlp` fallback updater, and YTM account connect/disconnect.
- **Shell & Right Panel:** Custom frameless Windows 11 Titlebar (`64px` global header), Left Sidebar, Center Canvas (`#121212`), Right Panel (Queue with `Autoplay` Auto-Radio toggle & Mini Lyrics), and Bottom Player Dock (`#18181B`), bounded by `1px solid #27272A` hairline borders.
- **State:** Zustand store (`usePlayerStore.ts`) subscribed to `playback-sync`, `track-changed`, `queue-updated`, and `download-progress` events, while high-frequency `requestAnimationFrame` interpolation (`usePlaybackClock`) stays localized to time-sensitive components (`InteractiveLyricLine`, seek bars, radial ring) to prevent unnecessary global React re-renders. `usePlaybackClock` immediately resets its interpolation anchors (`lastSyncServerMs` and `lastSyncPerfNow`) upon receiving any `playback-sync` with `is_buffering: true` or after `seek_to`, and freezes time progression whenever `is_playing: false` or `is_buffering: true`.

---

## 6. Left to the Builder

The implementation plan and builder may determine the following details without re-confirming:
- Exact crate versions in `Cargo.toml` and `package.json` dependencies (compatible with Tauri v2).
- Specific Rust crate for OS credential storage (e.g., `keyring`) and YTM auth flow mechanics (OAuth device flow vs. cookie import supported by `rustypipe`/Innertube).
- Exact `libmpv2` property/filter configuration for sequential fade-out/fade-in, gapless playback, and translating `perceptualLoudnessDb` into static pre-amp gain (`volume` / `af=volume`).
- Retry/backoff strategy for failed `pending_push` / `pending_delete` two-way sync mutations.
- Disk directory layout and LRU eviction implementation for automatic stream cache vs. explicit `offline_downloads`.
- Build/bundling scripts for packaging `libmpv-2.dll` and `yt-dlp` fallback sidecar on Windows.
