# Bundled Native Binaries (Not Committed to Git)

Place the Windows runtime binaries in this directory before creating a production bundle (`cargo tauri build`):

1. **`libmpv-2.dll`**
   - Download the Windows x86_64 `libmpv` release (`libmpv-2.dll`) from `https://sourceforge.net/projects/mpv-player-windows/files/libmpv/` (or an official `shinchiro` build).
   - Place `libmpv-2.dll` directly inside `src-tauri/binaries/libmpv-2.dll`.
   - At runtime, Nocturne loads `libmpv-2.dll` dynamically from `app.path().resource_dir()` via `SetDllDirectoryW` and `libloading` so Start Menu and System Tray launches find the DLL deterministically.

2. **`yt-dlp-x86_64-pc-windows-msvc.exe`**
   - Download `yt-dlp.exe` from `https://github.com/yt-dlp/yt-dlp/releases/latest`.
   - Rename it to match Tauri's target-triple sidecar naming convention:
     `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe`

Unit tests (`cargo test`) mock external providers and do not require these binaries to be present on disk.
