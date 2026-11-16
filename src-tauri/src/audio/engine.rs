use std::ffi::{c_char, c_double, c_int, c_void, CString};
use std::path::{Path, PathBuf};

use libloading::{Library, Symbol};

use crate::models::AppError;

/// Snapshot of live backend playback state polled by the audio worker.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BackendState {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub is_playing: bool,
    pub is_buffering: bool,
    pub eof_reached: bool,
}

/// Configures Windows DLL search paths so `libmpv-2.dll` bundled inside Tauri's
/// `resource_dir` (or `resource_dir/binaries`) is always found even when launched
/// from the Start Menu or System Tray.
pub fn configure_windows_dll_search_path(resource_dir: &Path) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::System::LibraryLoader::SetDllDirectoryW;

        let binaries_dir = resource_dir.join("binaries");
        let target_dir = if binaries_dir.exists() {
            binaries_dir.as_path()
        } else {
            resource_dir
        };

        let mut wide: Vec<u16> = target_dir.as_os_str().encode_wide().collect();
        wide.push(0);
        // SAFETY: `wide` is a valid null-terminated UTF-16 path string.
        let ok = unsafe { SetDllDirectoryW(wide.as_ptr()) };
        if ok == 0 {
            return Err(AppError::Audio(format!(
                "SetDllDirectoryW failed for {}",
                target_dir.display()
            )));
        }

        let current_path = std::env::var_os("PATH").unwrap_or_default();
        let mut paths = vec![target_dir.to_path_buf()];
        if target_dir != resource_dir {
            paths.push(resource_dir.to_path_buf());
        }
        paths.extend(std::env::split_paths(&current_path));
        if let Ok(joined) = std::env::join_paths(paths) {
            std::env::set_var("PATH", joined);
        }
    }

    #[cfg(not(windows))]
    {
        let _ = resource_dir;
    }

    Ok(())
}

/// Converts YouTube `perceptualLoudnessDb` into a bounded linear pre-amp scale `[0.25, 2.0]`.
/// When `normalize_enabled` is false, always returns `1.0`.
pub fn compute_preamp_volume_scale(
    perceptual_loudness_db: Option<f32>,
    normalize_enabled: bool,
) -> f64 {
    if !normalize_enabled {
        return 1.0;
    }
    match perceptual_loudness_db {
        Some(db) if db.is_finite() => 10f64.powf((db as f64) / 20.0).clamp(0.25, 2.0),
        _ => 1.0,
    }
}

/// Abstraction over the audio playback backend so worker logic can be unit-tested
/// without requiring a live `libmpv-2.dll` binary in headless environments.
pub trait AudioBackend: Send {
    fn load_and_play(
        &mut self,
        url: &str,
        preamp_scale: f64,
        initial_volume: f32,
    ) -> Result<(), AppError>;
    fn set_paused(&mut self, paused: bool) -> Result<(), AppError>;
    fn seek_ms(&mut self, position_ms: u64) -> Result<(), AppError>;
    fn set_volume(&mut self, volume: f32, preamp_scale: f64) -> Result<(), AppError>;
    fn stop(&mut self) -> Result<(), AppError>;
    fn poll_state(&mut self) -> BackendState;
}

const MPV_FORMAT_FLAG: c_int = 3;
const MPV_FORMAT_DOUBLE: c_int = 5;

type MpvCreateFn = unsafe extern "C" fn() -> *mut c_void;
type MpvInitializeFn = unsafe extern "C" fn(*mut c_void) -> c_int;
type MpvTerminateDestroyFn = unsafe extern "C" fn(*mut c_void);
type MpvSetOptionStringFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type MpvCommandFn = unsafe extern "C" fn(*mut c_void, *mut *const c_char) -> c_int;
type MpvSetPropertyFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut c_void) -> c_int;
type MpvGetPropertyFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut c_void) -> c_int;

/// Isolated `libmpv-2.dll` audio engine loaded dynamically via `libloading`.
pub struct MpvAudioEngine {
    _lib: Library,
    handle: *mut c_void,
    mpv_terminate_destroy: MpvTerminateDestroyFn,
    mpv_command: MpvCommandFn,
    mpv_set_property: MpvSetPropertyFn,
    mpv_get_property: MpvGetPropertyFn,
    has_active_track: bool,
}

// SAFETY: `MpvAudioEngine` is exclusively owned by the single-threaded audio worker actor
// and `libmpv` API calls on a single handle from that owning thread are safe.
unsafe impl Send for MpvAudioEngine {}

impl MpvAudioEngine {
    /// Loads `libmpv-2.dll` (or `libmpv.so` on Unix) from `resource_dir` or system paths
    /// and initializes an audio-only `mpv` instance.
    pub fn new(resource_dir: Option<&Path>) -> Result<Self, AppError> {
        if let Some(dir) = resource_dir {
            configure_windows_dll_search_path(dir)?;
        }

        let lib_name = if cfg!(windows) {
            "libmpv-2.dll"
        } else if cfg!(target_os = "macos") {
            "libmpv.2.dylib"
        } else {
            "libmpv.so.2"
        };

        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Some(dir) = resource_dir {
            candidates.push(dir.join("binaries").join(lib_name));
            candidates.push(dir.join(lib_name));
        }
        candidates.push(PathBuf::from(lib_name));

        let mut last_err = None;
        let mut loaded_lib = None;
        for candidate in candidates {
            // SAFETY: Loading the verified dynamic library path.
            match unsafe { Library::new(&candidate) } {
                Ok(lib) => {
                    loaded_lib = Some(lib);
                    break;
                }
                Err(e) => last_err = Some(e),
            }
        }

        let lib = loaded_lib.ok_or_else(|| {
            AppError::Audio(format!(
                "Failed to load {lib_name}: {}",
                last_err
                    .map(|e| e.to_string())
                    .unwrap_or_else(|| "not found".to_string())
            ))
        })?;

        // SAFETY: Resolving standard libmpv C API symbols.
        unsafe {
            let mpv_create: Symbol<MpvCreateFn> = lib
                .get(b"mpv_create\0")
                .map_err(|e| AppError::Audio(format!("mpv_create missing: {e}")))?;
            let mpv_initialize: Symbol<MpvInitializeFn> = lib
                .get(b"mpv_initialize\0")
                .map_err(|e| AppError::Audio(format!("mpv_initialize missing: {e}")))?;
            let mpv_terminate_destroy: MpvTerminateDestroyFn = *lib
                .get(b"mpv_terminate_destroy\0")
                .map_err(|e| AppError::Audio(format!("mpv_terminate_destroy missing: {e}")))?;
            let mpv_set_option_string: Symbol<MpvSetOptionStringFn> = lib
                .get(b"mpv_set_option_string\0")
                .map_err(|e| AppError::Audio(format!("mpv_set_option_string missing: {e}")))?;
            let mpv_command: MpvCommandFn = *lib
                .get(b"mpv_command\0")
                .map_err(|e| AppError::Audio(format!("mpv_command missing: {e}")))?;
            let mpv_set_property: MpvSetPropertyFn = *lib
                .get(b"mpv_set_property\0")
                .map_err(|e| AppError::Audio(format!("mpv_set_property missing: {e}")))?;
            let mpv_get_property: MpvGetPropertyFn = *lib
                .get(b"mpv_get_property\0")
                .map_err(|e| AppError::Audio(format!("mpv_get_property missing: {e}")))?;

            let handle = mpv_create();
            if handle.is_null() {
                return Err(AppError::Audio("mpv_create returned null".to_string()));
            }

            for (key, val) in [
                ("vo", "null"),
                ("vid", "no"),
                ("gapless-audio", "yes"),
                ("ytdl", "no"),
                ("cache", "yes"),
            ] {
                let k = CString::new(key).map_err(|e| AppError::Audio(e.to_string()))?;
                let v = CString::new(val).map_err(|e| AppError::Audio(e.to_string()))?;
                mpv_set_option_string(handle, k.as_ptr(), v.as_ptr());
            }

            let init_rc = mpv_initialize(handle);
            if init_rc < 0 {
                mpv_terminate_destroy(handle);
                return Err(AppError::Audio(format!(
                    "mpv_initialize failed with code {init_rc}"
                )));
            }

            Ok(Self {
                _lib: lib,
                handle,
                mpv_terminate_destroy,
                mpv_command,
                mpv_set_property,
                mpv_get_property,
                has_active_track: false,
            })
        }
    }

    fn run_command(&self, args: &[&str]) -> Result<(), AppError> {
        let c_args: Vec<CString> = args
            .iter()
            .map(|a| CString::new(*a).map_err(|e| AppError::Audio(e.to_string())))
            .collect::<Result<_, _>>()?;
        let mut ptrs: Vec<*const c_char> = c_args.iter().map(|s| s.as_ptr()).collect();
        ptrs.push(std::ptr::null());

        // SAFETY: `ptrs` is null-terminated and `handle` is valid.
        let rc = unsafe { (self.mpv_command)(self.handle, ptrs.as_mut_ptr()) };
        if rc < 0 {
            return Err(AppError::Audio(format!("mpv_command failed ({rc})")));
        }
        Ok(())
    }

    fn set_flag(&self, name: &str, value: bool) -> Result<(), AppError> {
        let c_name = CString::new(name).map_err(|e| AppError::Audio(e.to_string()))?;
        let mut flag: c_int = if value { 1 } else { 0 };
        // SAFETY: Passing a valid pointer to `flag` for `MPV_FORMAT_FLAG`.
        let rc = unsafe {
            (self.mpv_set_property)(
                self.handle,
                c_name.as_ptr(),
                MPV_FORMAT_FLAG,
                (&mut flag as *mut c_int).cast(),
            )
        };
        if rc < 0 {
            return Err(AppError::Audio(format!(
                "mpv_set_property({name}) failed ({rc})"
            )));
        }
        Ok(())
    }

    fn set_double(&self, name: &str, value: f64) -> Result<(), AppError> {
        let c_name = CString::new(name).map_err(|e| AppError::Audio(e.to_string()))?;
        let mut val: c_double = value;
        // SAFETY: Passing a valid pointer to `val` for `MPV_FORMAT_DOUBLE`.
        let rc = unsafe {
            (self.mpv_set_property)(
                self.handle,
                c_name.as_ptr(),
                MPV_FORMAT_DOUBLE,
                (&mut val as *mut c_double).cast(),
            )
        };
        if rc < 0 {
            return Err(AppError::Audio(format!(
                "mpv_set_property({name}) failed ({rc})"
            )));
        }
        Ok(())
    }

    fn get_double(&self, name: &str) -> Option<f64> {
        let c_name = CString::new(name).ok()?;
        let mut val: c_double = 0.0;
        // SAFETY: Passing a valid pointer to `val` for `MPV_FORMAT_DOUBLE`.
        let rc = unsafe {
            (self.mpv_get_property)(
                self.handle,
                c_name.as_ptr(),
                MPV_FORMAT_DOUBLE,
                (&mut val as *mut c_double).cast(),
            )
        };
        if rc >= 0 && val.is_finite() {
            Some(val)
        } else {
            None
        }
    }

    fn get_flag(&self, name: &str) -> Option<bool> {
        let c_name = CString::new(name).ok()?;
        let mut flag: c_int = 0;
        // SAFETY: Passing a valid pointer to `flag` for `MPV_FORMAT_FLAG`.
        let rc = unsafe {
            (self.mpv_get_property)(
                self.handle,
                c_name.as_ptr(),
                MPV_FORMAT_FLAG,
                (&mut flag as *mut c_int).cast(),
            )
        };
        if rc >= 0 {
            Some(flag != 0)
        } else {
            None
        }
    }
}

impl Drop for MpvAudioEngine {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            // SAFETY: `self.handle` was created by `mpv_create` and is destroyed once on drop.
            unsafe { (self.mpv_terminate_destroy)(self.handle) };
            self.handle = std::ptr::null_mut();
        }
    }
}

impl AudioBackend for MpvAudioEngine {
    fn load_and_play(
        &mut self,
        url: &str,
        preamp_scale: f64,
        initial_volume: f32,
    ) -> Result<(), AppError> {
        self.set_volume(initial_volume, preamp_scale)?;
        self.run_command(&["loadfile", url, "replace"])?;
        self.set_paused(false)?;
        self.has_active_track = true;
        Ok(())
    }

    fn set_paused(&mut self, paused: bool) -> Result<(), AppError> {
        self.set_flag("pause", paused)
    }

    fn seek_ms(&mut self, position_ms: u64) -> Result<(), AppError> {
        let sec_str = format!("{:.3}", (position_ms as f64) / 1000.0);
        self.run_command(&["seek", &sec_str, "absolute"])
    }

    fn set_volume(&mut self, volume: f32, preamp_scale: f64) -> Result<(), AppError> {
        let effective = ((volume.clamp(0.0, 1.0) as f64) * 100.0 * preamp_scale).clamp(0.0, 150.0);
        self.set_double("volume", effective)
    }

    fn stop(&mut self) -> Result<(), AppError> {
        self.has_active_track = false;
        self.run_command(&["stop"])
    }

    fn poll_state(&mut self) -> BackendState {
        let pos_sec = self.get_double("time-pos").unwrap_or(0.0).max(0.0);
        let dur_sec = self.get_double("duration").unwrap_or(0.0).max(0.0);
        let paused = self.get_flag("pause").unwrap_or(true);
        let buffering = self.get_flag("paused-for-cache").unwrap_or(false);
        let eof = self.has_active_track && self.get_flag("eof-reached").unwrap_or(false);

        BackendState {
            position_ms: (pos_sec * 1000.0) as u64,
            duration_ms: (dur_sec * 1000.0) as u64,
            is_playing: self.has_active_track && !paused && !eof,
            is_buffering: buffering,
            eof_reached: eof,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perceptual_loudness_db_maps_to_bounded_preamp_gain() {
        let quiet = compute_preamp_volume_scale(Some(-6.0), true);
        let neutral = compute_preamp_volume_scale(Some(0.0), true);
        let boosted = compute_preamp_volume_scale(Some(4.0), true);
        let extreme_low = compute_preamp_volume_scale(Some(-40.0), true);
        let extreme_high = compute_preamp_volume_scale(Some(40.0), true);

        assert!(quiet < neutral);
        assert!((neutral - 1.0).abs() < 1e-6);
        assert!(boosted > neutral && boosted <= 2.0);
        assert!((extreme_low - 0.25).abs() < 1e-6);
        assert!((extreme_high - 2.0).abs() < 1e-6);

        assert!((compute_preamp_volume_scale(Some(-6.0), false) - 1.0).abs() < 1e-6);
        assert!((compute_preamp_volume_scale(Some(4.0), false) - 1.0).abs() < 1e-6);
    }
}
