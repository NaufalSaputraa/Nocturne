use serde::{Deserialize, Serialize};

/// Canonical metadata describing an audio track across catalog, queue, and persistence layers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrackMetadata {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration_sec: u64,
    pub thumbnail_url: String,
}

/// Provenance of a resolved audio stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StreamSource {
    Rustypipe,
    YtdlpFallback,
    LocalFile,
}

/// Resolved audio stream URL/path and loudness normalization metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StreamInfo {
    pub video_id: String,
    pub url: String,
    pub format: String,
    pub perceptual_loudness_db: Option<f32>,
    pub source: StreamSource,
    pub expires_at_unix: i64,
}

/// Periodic (500ms) and transition-immediate playback synchronization event payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlaybackSyncPayload {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub is_playing: bool,
    pub is_buffering: bool,
    pub server_ts_ms: i64,
}

/// Persisted playback state restored on cold start.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlaybackSession {
    pub current_track: Option<TrackMetadata>,
    pub position_ms: u64,
    pub queue: Vec<TrackMetadata>,
    pub shuffle: bool,
    pub repeat_mode: String,
    pub autoplay_enabled: bool,
    pub volume: f32,
}

impl Default for PlaybackSession {
    fn default() -> Self {
        Self {
            current_track: None,
            position_ms: 0,
            queue: Vec::new(),
            shuffle: false,
            repeat_mode: "off".to_string(),
            autoplay_enabled: true,
            volume: 1.0,
        }
    }
}

/// Single timed lyric line in milliseconds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LyricLine {
    pub start_time_ms: u64,
    pub end_time_ms: u64,
    pub text: String,
}

/// Synced lyrics response including source identifier and per-track timing offset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LyricsPayload {
    pub lines: Vec<LyricLine>,
    pub source: String,
    pub offset_ms: i64,
}

/// Offline download progress event payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DownloadProgressPayload {
    pub video_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub status: String,
}

/// Two-way YouTube Music synchronization status event payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyncStatusPayload {
    pub state: String,
    pub message: Option<String>,
}

/// Summary card for an album in catalog search results.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AlbumSummary {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<u32>,
    pub thumbnail_url: String,
}

/// Summary card for an artist in catalog search results.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArtistSummary {
    pub id: String,
    pub name: String,
    pub subscribers: Option<String>,
    pub thumbnail_url: String,
}

/// Highlighted Top Result entry returned by catalog search.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TopResultItem {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub subtitle: String,
    pub thumbnail_url: String,
    pub track: Option<TrackMetadata>,
}

/// Categorized YouTube Music catalog search results.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchResult {
    pub top_result: Option<TopResultItem>,
    pub songs: Vec<TrackMetadata>,
    pub albums: Vec<AlbumSummary>,
    pub artists: Vec<ArtistSummary>,
}

/// Application-wide error enum serializable across Tauri IPC boundaries.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("stream extraction failed: {0}")]
    Extraction(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("audio engine error: {0}")]
    Audio(String),
    #[error("lyrics error: {0}")]
    Lyrics(String),
    #[error("YouTube Music authentication expired")]
    AuthExpired,
    #[error("authentication error: {0}")]
    Auth(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_serializes_as_display_message() {
        let err = AppError::Extraction("cipher 403".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"stream extraction failed: cipher 403\"");

        let auth = AppError::AuthExpired;
        assert_eq!(
            serde_json::to_string(&auth).unwrap(),
            "\"YouTube Music authentication expired\""
        );
    }

    #[test]
    fn playback_session_roundtrips_json() {
        let session = PlaybackSession {
            current_track: Some(TrackMetadata {
                video_id: "dQw4w9WgXcQ".to_string(),
                title: "Track One".to_string(),
                artist: "Artist One".to_string(),
                album: Some("Album One".to_string()),
                duration_sec: 210,
                thumbnail_url: "https://example.com/thumb.jpg".to_string(),
            }),
            position_ms: 42_000,
            queue: Vec::new(),
            shuffle: true,
            repeat_mode: "all".to_string(),
            autoplay_enabled: true,
            volume: 0.85,
        };
        let encoded = serde_json::to_string(&session).unwrap();
        let decoded: PlaybackSession = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded, session);
    }
}
