<div align="center">

# Nocturne

**Lightweight, ad-free desktop YouTube Music player built with Tauri v2, Rust, and React.**

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=flat-square&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

---

## Overview

**Nocturne** is a fast, distraction-free desktop music player for YouTube Music. It pairs a native Rust backend (`libmpv` audio engine, `rustypipe` + `yt-dlp` stream extraction, SQLite persistence) with a modern dark-mode React interface featuring synced interactive lyrics and a dedicated Zen Lyrics view.

## Key Features

- **Ad-Free YouTube Music Playback** — Stream and search tracks, albums, artists, and playlists via `rustypipe` with an optional `yt-dlp` fallback.
- **Native `libmpv` Audio Engine** — Low-overhead audio playback with configurable audio quality, volume normalization, and crossfade duration.
- **Interactive Synced Lyrics & Zen Mode** — Real-time synced lyrics from **LRCLIB** and **YouTube Music**, click-to-seek lyric lines, manual lyric timing offset controls, and a full-screen Zen Lyrics view with a radial seek ring.
- **Offline Downloads & LRU Cache** — Download tracks for offline listening and manage a disk-backed LRU stream cache with configurable storage limits.
- **OS & Desktop Integration** — Native Windows media controls (`souvlaki`), Discord Rich Presence, system tray minimization (`closeToTray`), and secure credential storage (`keyring`).
- **Custom Frameless Window** — Sleek dark-themed desktop UI with a custom titlebar, queue/lyrics side panel, and full keyboard navigation.

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `ArrowRight` | Seek forward 5 seconds |
| `ArrowLeft` | Seek backward 5 seconds |
| `M` | Mute / Unmute audio |
| `L` | Toggle Zen Lyrics view |

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Desktop & IPC** | Tauri v2, `tauri-plugin-shell`, Windows Tray Icon |
| **Backend (Rust)** | `tokio`, `sqlx` (SQLite), `reqwest`, `libloading` (`libmpv`), `rustypipe`, `souvlaki`, `discord-rich-presence`, `keyring` |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Lucide React |
| **Testing** | Vitest, Testing Library (`@testing-library/react`, `@testing-library/jest-dom`), jsdom |

## Project Structure

```text
Nocturne/
├── docs/                  # PRD, architecture blueprint, and UI/UX specs
├── src/                   # React + TypeScript frontend
│   ├── components/        # Layout (Titlebar, Sidebar, PlayerDock, RightPanel), modals, lyrics, UI
│   ├── hooks/             # Playback clock (rAF) and custom hooks
│   ├── lib/               # Tauri IPC bindings and window controls
│   ├── store/             # Zustand player store
│   └── views/             # Home, Search, Playlist Detail, and Zen Lyrics views
└── src-tauri/             # Rust backend & Tauri configuration
    ├── binaries/          # Runtime binaries (libmpv-2.dll, yt-dlp — ignored by git)
    └── src/
        ├── audio/         # Audio engine and playback worker
        ├── db/            # SQLite persistence
        ├── extractor/     # Stream extraction, LRU cache, downloader, yt-dlp fallback
        ├── metadata/      # Search, lyrics (LRCLIB / YTM), and sync
        └── os/            # OS media controls integration
```

## Getting Started

### Prerequisites

- **Node.js** (v18+ recommended) and **npm**
- **Rust** toolchain (`rustup`, `cargo`)
- **Tauri v2 prerequisites** for Windows (WebView2, MSVC Build Tools)
- Runtime binaries placed in `src-tauri/binaries/`:
  - `libmpv-2.dll`
  - `yt-dlp.exe` (for `yt-dlp` extraction fallback)

### Installation & Development

```bash
# Install frontend dependencies
npm install

# Run the full Tauri desktop app in development mode
npm run tauri dev
```

### Other Useful Scripts

```bash
# Run frontend dev server only (uses demo library outside Tauri)
npm run dev

# Run frontend unit & component tests
npm test

# Type-check and build frontend bundle
npm run build

# Build production Tauri installer
npm run tauri build
```

## Documentation

Additional design and architecture documents are available in [`docs/`](./docs):

- [Product Requirements Document (PRD)](./docs/product_requirements_document_prd.md)
- [System Architecture & Rust Backend Blueprint](./docs/system_architecture_rust_backend_blueprint.md)
- [UI/UX Design System & Interactive Lyrics Spec](./docs/ui_ux_design_system_interactive_lyrics_spec.md)
