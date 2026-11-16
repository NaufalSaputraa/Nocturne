use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient as RawDiscordIpcClient};

use crate::models::{AppError, TrackMetadata};

/// Abstraction over native Discord IPC so `DiscordRpcBridge` can be unit-tested offline.
pub trait RichPresenceClient: Send {
    fn connect(&mut self) -> Result<(), AppError>;
    fn set_activity(&mut self, details: &str, state: &str) -> Result<(), AppError>;
    fn clear(&mut self) -> Result<(), AppError>;
}

/// Live Discord Rich Presence client using `discord-rich-presence` named pipe IPC.
pub struct DiscordIpcClient {
    client: Option<RawDiscordIpcClient>,
    connected: bool,
}

impl DiscordIpcClient {
    pub fn new(client_id: &str) -> Self {
        Self {
            client: RawDiscordIpcClient::new(client_id).ok(),
            connected: false,
        }
    }
}

impl RichPresenceClient for DiscordIpcClient {
    fn connect(&mut self) -> Result<(), AppError> {
        if self.connected {
            return Ok(());
        }
        let Some(client) = &mut self.client else {
            return Err(AppError::Other("Discord IPC unavailable".to_string()));
        };
        client
            .connect()
            .map_err(|e| AppError::Other(format!("Discord IPC connect failed: {e}")))?;
        self.connected = true;
        Ok(())
    }

    fn set_activity(&mut self, details: &str, state: &str) -> Result<(), AppError> {
        if !self.connected {
            self.connect()?;
        }
        let Some(client) = &mut self.client else {
            return Ok(());
        };
        let act = activity::Activity::new()
            .details(details)
            .state(state);
        if client.set_activity(act).is_err() {
            self.connected = false;
        }
        Ok(())
    }

    fn clear(&mut self) -> Result<(), AppError> {
        if self.connected {
            if let Some(client) = &mut self.client {
                let _ = client.clear_activity();
            }
        }
        Ok(())
    }
}

/// Non-blocking Discord Rich Presence bridge that safely ignores missing Discord clients
/// and immediately clears presence when toggled off in Settings.
pub struct DiscordRpcBridge {
    client: Box<dyn RichPresenceClient>,
    enabled: bool,
}

impl DiscordRpcBridge {
    pub fn new(client: Box<dyn RichPresenceClient>, enabled: bool) -> Self {
        Self { client, enabled }
    }

    /// Enables or disables Discord Rich Presence; disabling clears any active presence.
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        if !enabled {
            let _ = self.client.clear();
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Updates Discord Rich Presence for `track` if enabled (silently ignoring IPC errors).
    pub fn update_activity(&mut self, track: &TrackMetadata) {
        if !self.enabled {
            return;
        }
        let state = format!("by {}", track.artist);
        let _ = self.client.set_activity(&track.title, &state);
    }

    /// Clears Discord Rich Presence.
    pub fn clear_activity(&mut self) {
        let _ = self.client.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct MockRpcState {
        updates: Vec<(String, String)>,
        clears: usize,
    }

    struct MockRpcClient {
        state: Arc<Mutex<MockRpcState>>,
    }

    impl RichPresenceClient for MockRpcClient {
        fn connect(&mut self) -> Result<(), AppError> {
            Ok(())
        }

        fn set_activity(&mut self, details: &str, state: &str) -> Result<(), AppError> {
            self.state
                .lock()
                .unwrap()
                .updates
                .push((details.to_string(), state.to_string()));
            Ok(())
        }

        fn clear(&mut self) -> Result<(), AppError> {
            self.state.lock().unwrap().clears += 1;
            Ok(())
        }
    }

    #[test]
    fn disabled_discord_rpc_skips_updates_and_clears_presence() {
        let state = Arc::new(Mutex::new(MockRpcState::default()));
        let mut bridge = DiscordRpcBridge::new(
            Box::new(MockRpcClient {
                state: Arc::clone(&state),
            }),
            true,
        );

        let track = TrackMetadata {
            video_id: "v1".to_string(),
            title: "Taruh".to_string(),
            artist: "Nadin Amizah".to_string(),
            album: None,
            duration_sec: 240,
            thumbnail_url: String::new(),
        };

        bridge.update_activity(&track);
        assert_eq!(state.lock().unwrap().updates.len(), 1);

        bridge.set_enabled(false);
        assert_eq!(state.lock().unwrap().clears, 1);

        bridge.update_activity(&track);
        assert_eq!(
            state.lock().unwrap().updates.len(),
            1,
            "disabled bridge must skip updates"
        );
    }
}
