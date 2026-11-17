use std::ffi::c_void;
use std::time::Duration;

use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig};
use tokio::sync::mpsc;

use crate::audio::worker::AudioCommand;
use crate::models::TrackMetadata;

/// Maps a `souvlaki::MediaControlEvent` into Nocturne's internal `AudioCommand`.
pub fn map_media_control_event(event: &MediaControlEvent) -> Option<AudioCommand> {
    match event {
        MediaControlEvent::Play | MediaControlEvent::Pause | MediaControlEvent::Toggle => {
            Some(AudioCommand::TogglePlayback)
        }
        MediaControlEvent::Next => Some(AudioCommand::Next),
        MediaControlEvent::Previous => Some(AudioCommand::Prev),
        MediaControlEvent::SeekBy(souvlaki::SeekDirection::Forward, dur) => {
            Some(AudioCommand::SeekTo(dur.as_millis() as u64))
        }
        MediaControlEvent::SetPosition(MediaPosition(dur)) => {
            Some(AudioCommand::SeekTo(dur.as_millis() as u64))
        }
        _ => None,
    }
}

/// Non-fatal bridge to Windows SMTC / OS media controls via `souvlaki`.
#[derive(Default)]
pub struct MediaControlsBridge {
    controls: Option<MediaControls>,
}

impl MediaControlsBridge {
    /// Returns an inert bridge with no OS media controls attached.
    pub fn disabled() -> Self {
        Self { controls: None }
    }

    /// Attempts to initialize `souvlaki::MediaControls` (passing HWND on Windows).
    /// Failures are non-fatal so headless tests or environments without an active
    /// media session still start cleanly.
    pub fn new_optional(hwnd: Option<*mut c_void>, tx: mpsc::Sender<AudioCommand>) -> Self {
        // `souvlaki` panics on Windows if `hwnd` is `None` instead of returning an `Err`.
        #[cfg(target_os = "windows")]
        if hwnd.is_none() {
            return Self::disabled();
        }

        let config = PlatformConfig {
            dbus_name: "nocturne",
            display_name: "Nocturne",
            hwnd,
        };

        let Ok(mut controls) = MediaControls::new(config) else {
            return Self { controls: None };
        };

        if controls
            .attach(move |event| {
                if let Some(cmd) = map_media_control_event(&event) {
                    let _ = tx.try_send(cmd);
                }
            })
            .is_err()
        {
            return Self { controls: None };
        }

        Self {
            controls: Some(controls),
        }
    }

    /// Updates OS media overlay metadata for the active track.
    pub fn update_metadata(&mut self, track: &TrackMetadata) {
        if let Some(controls) = &mut self.controls {
            let _ = controls.set_metadata(MediaMetadata {
                title: Some(&track.title),
                artist: Some(&track.artist),
                album: track.album.as_deref(),
                cover_url: if track.thumbnail_url.is_empty() {
                    None
                } else {
                    Some(&track.thumbnail_url)
                },
                duration: if track.duration_sec > 0 {
                    Some(Duration::from_secs(track.duration_sec))
                } else {
                    None
                },
            });
        }
    }

    /// Updates OS media overlay play/pause state and progress position.
    pub fn update_playback_state(&mut self, is_playing: bool, position_ms: u64) {
        if let Some(controls) = &mut self.controls {
            let progress = Some(MediaPosition(Duration::from_millis(position_ms)));
            let state = if is_playing {
                MediaPlayback::Playing { progress }
            } else {
                MediaPlayback::Paused { progress }
            };
            let _ = controls.set_playback(state);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn souvlaki_event_maps_to_audio_command() {
        assert!(matches!(
            map_media_control_event(&MediaControlEvent::Next),
            Some(AudioCommand::Next)
        ));
        assert!(matches!(
            map_media_control_event(&MediaControlEvent::Previous),
            Some(AudioCommand::Prev)
        ));
        assert!(matches!(
            map_media_control_event(&MediaControlEvent::Toggle),
            Some(AudioCommand::TogglePlayback)
        ));
    }

    #[test]
    fn new_optional_without_hwnd_does_not_panic() {
        let (tx, _rx) = mpsc::channel(1);
        let bridge = MediaControlsBridge::new_optional(None, tx);
        #[cfg(target_os = "windows")]
        assert!(bridge.controls.is_none());
        let _ = bridge;
    }
}
