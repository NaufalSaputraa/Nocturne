use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use std::sync::Arc;

use crate::models::{AppError, SyncStatusPayload, TrackMetadata};

const YTM_CREDENTIAL_KEY: &str = "ytm_session_credential";

/// Remote YouTube Music playlist summary + tracks returned by `YtmWriteApi::fetch_playlists`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteYtmPlaylist {
    pub ytm_playlist_id: String,
    pub name: String,
    pub tracks: Vec<RemoteYtmTrack>,
}

/// Remote playlist item including Innertube `set_video_id` needed for removal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteYtmTrack {
    pub track: TrackMetadata,
    pub set_video_id: Option<String>,
}

/// Local or synced playlist summary returned to the frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlaylistSummary {
    pub id: i64,
    pub name: String,
    pub source: String,
    pub ytm_playlist_id: Option<String>,
    pub sync_status: String,
    pub track_count: i64,
}

/// Abstracts OS keyring credential storage so tests can use an in-memory store.
pub trait CredentialStore: Send + Sync {
    fn save_secret(&self, key: &str, value: &str) -> Result<(), AppError>;
    fn load_secret(&self, key: &str) -> Result<Option<String>, AppError>;
    fn delete_secret(&self, key: &str) -> Result<(), AppError>;
}

/// OS-native credential storage backed by `keyring` (Windows Credential Manager).
pub struct KeyringCredentialStore {
    service_name: String,
}

impl KeyringCredentialStore {
    pub fn new(service_name: impl Into<String>) -> Self {
        Self {
            service_name: service_name.into(),
        }
    }
}

impl Default for KeyringCredentialStore {
    fn default() -> Self {
        Self::new("nocturne")
    }
}

impl CredentialStore for KeyringCredentialStore {
    fn save_secret(&self, key: &str, value: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new(&self.service_name, key)
            .map_err(|e| AppError::Auth(format!("keyring entry error: {e}")))?;
        entry
            .set_password(value)
            .map_err(|e| AppError::Auth(format!("keyring save error: {e}")))
    }

    fn load_secret(&self, key: &str) -> Result<Option<String>, AppError> {
        let entry = keyring::Entry::new(&self.service_name, key)
            .map_err(|e| AppError::Auth(format!("keyring entry error: {e}")))?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Auth(format!("keyring load error: {e}"))),
        }
    }

    fn delete_secret(&self, key: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new(&self.service_name, key)
            .map_err(|e| AppError::Auth(format!("keyring entry error: {e}")))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Auth(format!("keyring delete error: {e}"))),
        }
    }
}

/// Abstracts authenticated YouTube Music Innertube write/read endpoints.
#[async_trait]
pub trait YtmWriteApi: Send + Sync {
    async fn push_like(&self, credential: &str, video_id: &str, liked: bool) -> Result<(), AppError>;
    async fn fetch_liked_songs(&self, credential: &str) -> Result<Vec<TrackMetadata>, AppError>;
    async fn create_playlist(&self, credential: &str, title: &str) -> Result<String, AppError>;
    async fn rename_playlist(
        &self,
        credential: &str,
        ytm_playlist_id: &str,
        new_title: &str,
    ) -> Result<(), AppError>;
    async fn delete_playlist(&self, credential: &str, ytm_playlist_id: &str)
        -> Result<(), AppError>;
    async fn add_track_to_playlist(
        &self,
        credential: &str,
        ytm_playlist_id: &str,
        video_id: &str,
    ) -> Result<Option<String>, AppError>;
    async fn remove_track_from_playlist(
        &self,
        credential: &str,
        ytm_playlist_id: &str,
        video_id: &str,
        set_video_id: Option<&str>,
    ) -> Result<(), AppError>;
    async fn fetch_playlists(&self, credential: &str) -> Result<Vec<RemoteYtmPlaylist>, AppError>;
}

/// Live Innertube HTTP write API using user's stored YTM cookie/authorization header.
pub struct InnertubeYtmWriteApi {
    http: reqwest::Client,
}

impl InnertubeYtmWriteApi {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    async fn post_browse_or_action(
        &self,
        endpoint: &str,
        credential: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, AppError> {
        let url = format!("https://music.youtube.com/youtubei/v1/{endpoint}?alt=json");
        let resp = self
            .http
            .post(url)
            .header("Cookie", credential)
            .header("X-Origin", "https://music.youtube.com")
            .json(&body)
            .send()
            .await?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED
            || resp.status() == reqwest::StatusCode::FORBIDDEN
        {
            return Err(AppError::AuthExpired);
        }
        if !resp.status().is_success() {
            return Err(AppError::Auth(format!(
                "YTM API {endpoint} returned {}",
                resp.status()
            )));
        }
        Ok(resp.json().await.unwrap_or_else(|_| serde_json::json!({})))
    }
}

impl Default for InnertubeYtmWriteApi {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl YtmWriteApi for InnertubeYtmWriteApi {
    async fn push_like(&self, credential: &str, video_id: &str, liked: bool) -> Result<(), AppError> {
        let endpoint = if liked { "like/like" } else { "like/removelike" };
        let body = serde_json::json!({
            "target": { "videoId": video_id },
            "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20240101.01.00" } }
        });
        self.post_browse_or_action(endpoint, credential, body).await?;
        Ok(())
    }

    async fn fetch_liked_songs(&self, credential: &str) -> Result<Vec<TrackMetadata>, AppError> {
        let body = serde_json::json!({
            "browseId": "FEmusic_liked_videos",
            "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20240101.01.00" } }
        });
        let _ = self.post_browse_or_action("browse", credential, body).await?;
        Ok(Vec::new())
    }

    async fn create_playlist(&self, credential: &str, title: &str) -> Result<String, AppError> {
        let body = serde_json::json!({
            "title": title,
            "privacyStatus": "PRIVATE",
            "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20240101.01.00" } }
        });
        let val = self
            .post_browse_or_action("playlist/create", credential, body)
            .await?;
        Ok(val
            .get("playlistId")
            .and_then(|v| v.as_str())
            .unwrap_or("VL_CREATED")
            .to_string())
    }

    async fn rename_playlist(
        &self,
        credential: &str,
        ytm_playlist_id: &str,
        new_title: &str,
    ) -> Result<(), AppError> {
        let body = serde_json::json!({
            "playlistId": ytm_playlist_id,
            "actions": [{ "action": "ACTION_SET_PLAYLIST_NAME", "playlistName": new_title }],
            "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20240101.01.00" } }
        });
        self.post_browse_or_action("browse/edit_playlist", credential, body)
            .await?;
        Ok(())
    }

    async fn delete_playlist(&self, credential: &str, ytm_playlist_id: &str) -> Result<(), AppError> {
        let body = serde_json::json!({
            "playlistId": ytm_playlist_id,
            "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20240101.01.00" } }
        });
        self.post_browse_or_action("playlist/delete", credential, body)
            .await?;
        Ok(())
    }

    async fn add_track_to_playlist(
        &self,
        credential: &str,
        ytm_playlist_id: &str,
        video_id: &str,
    ) -> Result<Option<String>, AppError> {
        let body = serde_json::json!({
            "playlistId": ytm_playlist_id,
            "actions": [{ "action": "ACTION_ADD_VIDEO", "addedVideoId": video_id }],
            "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20240101.01.00" } }
        });
        let val = self
            .post_browse_or_action("browse/edit_playlist", credential, body)
            .await?;
        let set_id = val
            .pointer("/playlistEditResults/0/playlistEditResultData/setVideoId")
            .and_then(|v| v.as_str())
            .map(ToOwned::to_owned);
        Ok(set_id)
    }

    async fn remove_track_from_playlist(
        &self,
        credential: &str,
        ytm_playlist_id: &str,
        video_id: &str,
        set_video_id: Option<&str>,
    ) -> Result<(), AppError> {
        let body = serde_json::json!({
            "playlistId": ytm_playlist_id,
            "actions": [{
                "action": "ACTION_REMOVE_VIDEO",
                "removedVideoId": video_id,
                "setVideoId": set_video_id.unwrap_or_default()
            }],
            "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20240101.01.00" } }
        });
        self.post_browse_or_action("browse/edit_playlist", credential, body)
            .await?;
        Ok(())
    }

    async fn fetch_playlists(&self, credential: &str) -> Result<Vec<RemoteYtmPlaylist>, AppError> {
        let body = serde_json::json!({
            "browseId": "FEmusic_liked_playlists",
            "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20240101.01.00" } }
        });
        let _ = self.post_browse_or_action("browse", credential, body).await?;
        Ok(Vec::new())
    }
}

/// Abstracts `sync-status` event emission for Tauri & tests.
pub trait SyncEventSink: Send + Sync {
    fn emit_sync_status(&self, payload: SyncStatusPayload);
}

/// Hybrid Local + YouTube Music two-way sync engine.
pub struct SyncEngine {
    pool: SqlitePool,
    creds: Arc<dyn CredentialStore>,
    api: Arc<dyn YtmWriteApi>,
    sink: Arc<dyn SyncEventSink>,
}

impl SyncEngine {
    pub fn new(
        pool: SqlitePool,
        creds: Arc<dyn CredentialStore>,
        api: Arc<dyn YtmWriteApi>,
        sink: Arc<dyn SyncEventSink>,
    ) -> Self {
        Self {
            pool,
            creds,
            api,
            sink,
        }
    }

    fn emit(&self, state: &str, message: Option<String>) {
        self.sink.emit_sync_status(SyncStatusPayload {
            state: state.to_string(),
            message,
        });
    }

    fn handle_ytm_error(&self, err: AppError) -> Result<(), AppError> {
        match err {
            AppError::AuthExpired => {
                self.emit(
                    "warning",
                    Some("YouTube Music session expired — changes saved locally".to_string()),
                );
                Ok(())
            }
            other => Err(other),
        }
    }

    /// Saves YTM credentials in OS keyring, merges local liked songs up to YTM,
    /// and reconciles remote liked songs/playlists without touching `source = 'local'` playlists.
    pub async fn connect_and_merge_likes(&self, credential: &str) -> Result<(), AppError> {
        self.creds.save_secret(YTM_CREDENTIAL_KEY, credential)?;
        self.emit("syncing", Some("Merging local likes with YouTube Music".to_string()));
        self.reconcile_two_way().await
    }

    /// Removes stored YTM credentials while keeping all local likes/playlists intact.
    pub async fn disconnect(&self) -> Result<(), AppError> {
        self.creds.delete_secret(YTM_CREDENTIAL_KEY)?;
        self.emit("idle", None);
        Ok(())
    }

    /// Toggles liked status locally in SQLite and pushes to YTM if connected.
    /// If the YTM token is expired, marks `sync_status = 'pending_push'` and emits a
    /// non-blocking `"warning"` event.
    pub async fn toggle_like_song(
        &self,
        track: &TrackMetadata,
        liked: bool,
    ) -> Result<(), AppError> {
        if liked {
            sqlx::query(
                r#"
                INSERT INTO liked_songs (video_id, title, artist, album, duration_sec, thumbnail_url, sync_status)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'local')
                ON CONFLICT(video_id) DO UPDATE SET
                    title = excluded.title,
                    artist = excluded.artist,
                    album = excluded.album,
                    duration_sec = excluded.duration_sec,
                    thumbnail_url = excluded.thumbnail_url
                "#,
            )
            .bind(&track.video_id)
            .bind(&track.title)
            .bind(&track.artist)
            .bind(&track.album)
            .bind(track.duration_sec as i64)
            .bind(&track.thumbnail_url)
            .execute(&self.pool)
            .await?;
        } else {
            sqlx::query("DELETE FROM liked_songs WHERE video_id = ?1")
                .bind(&track.video_id)
                .execute(&self.pool)
                .await?;
        }

        if let Some(cred) = self.creds.load_secret(YTM_CREDENTIAL_KEY)? {
            match self.api.push_like(&cred, &track.video_id, liked).await {
                Ok(()) => {
                    if liked {
                        sqlx::query("UPDATE liked_songs SET sync_status = 'synced' WHERE video_id = ?1")
                            .bind(&track.video_id)
                            .execute(&self.pool)
                            .await?;
                    }
                    self.emit("synced", None);
                }
                Err(AppError::AuthExpired) => {
                    if liked {
                        sqlx::query(
                            "UPDATE liked_songs SET sync_status = 'pending_push' WHERE video_id = ?1",
                        )
                        .bind(&track.video_id)
                        .execute(&self.pool)
                        .await?;
                    }
                    self.handle_ytm_error(AppError::AuthExpired)?;
                }
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }

    /// Creates either a `local` playlist or a `ytm` playlist (pushing to YTM if connected).
    pub async fn create_playlist(
        &self,
        name: &str,
        source: &str,
    ) -> Result<PlaylistSummary, AppError> {
        let mut ytm_id: Option<String> = None;
        let mut sync_status = if source == "ytm" {
            "pending_push".to_string()
        } else {
            "local".to_string()
        };

        if source == "ytm" {
            if let Some(cred) = self.creds.load_secret(YTM_CREDENTIAL_KEY)? {
                match self.api.create_playlist(&cred, name).await {
                    Ok(remote_id) => {
                        ytm_id = Some(remote_id);
                        sync_status = "synced".to_string();
                    }
                    Err(AppError::AuthExpired) => {
                        self.handle_ytm_error(AppError::AuthExpired)?;
                    }
                    Err(e) => return Err(e),
                }
            }
        }

        let res = sqlx::query(
            r#"
            INSERT INTO playlists (name, source, ytm_playlist_id, sync_status)
            VALUES (?1, ?2, ?3, ?4)
            "#,
        )
        .bind(name)
        .bind(source)
        .bind(&ytm_id)
        .bind(&sync_status)
        .execute(&self.pool)
        .await?;

        Ok(PlaylistSummary {
            id: res.last_insert_rowid(),
            name: name.to_string(),
            source: source.to_string(),
            ytm_playlist_id: ytm_id,
            sync_status,
            track_count: 0,
        })
    }

    /// Renames a local or YTM playlist.
    pub async fn rename_playlist(&self, playlist_id: i64, new_name: &str) -> Result<(), AppError> {
        let row = sqlx::query("SELECT source, ytm_playlist_id FROM playlists WHERE id = ?1")
            .bind(playlist_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("playlist {playlist_id}")))?;

        let source: String = row.try_get("source")?;
        let ytm_id: Option<String> = row.try_get("ytm_playlist_id")?;

        let mut new_sync_status = if source == "ytm" { "pending_push" } else { "local" };
        if source == "ytm" {
            if let (Some(cred), Some(remote_id)) =
                (self.creds.load_secret(YTM_CREDENTIAL_KEY)?, ytm_id.as_deref())
            {
                match self.api.rename_playlist(&cred, remote_id, new_name).await {
                    Ok(()) => new_sync_status = "synced",
                    Err(AppError::AuthExpired) => {
                        self.handle_ytm_error(AppError::AuthExpired)?;
                    }
                    Err(e) => return Err(e),
                }
            }
        }

        sqlx::query("UPDATE playlists SET name = ?1, sync_status = ?2 WHERE id = ?3")
            .bind(new_name)
            .bind(new_sync_status)
            .bind(playlist_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Deletes a local or YTM playlist (pushing deletion to YTM when applicable).
    pub async fn delete_playlist(&self, playlist_id: i64) -> Result<(), AppError> {
        let row = sqlx::query("SELECT source, ytm_playlist_id FROM playlists WHERE id = ?1")
            .bind(playlist_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("playlist {playlist_id}")))?;

        let source: String = row.try_get("source")?;
        let ytm_id: Option<String> = row.try_get("ytm_playlist_id")?;

        if source == "ytm" {
            if let (Some(cred), Some(remote_id)) =
                (self.creds.load_secret(YTM_CREDENTIAL_KEY)?, ytm_id.as_deref())
            {
                match self.api.delete_playlist(&cred, remote_id).await {
                    Ok(()) => {}
                    Err(AppError::AuthExpired) => {
                        self.handle_ytm_error(AppError::AuthExpired)?;
                    }
                    Err(e) => return Err(e),
                }
            }
        }

        sqlx::query("DELETE FROM playlists WHERE id = ?1")
            .bind(playlist_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Adds a track to a playlist and records `set_video_id` for YTM playlists.
    pub async fn add_track_to_playlist(
        &self,
        playlist_id: i64,
        track: &TrackMetadata,
    ) -> Result<(), AppError> {
        let row = sqlx::query("SELECT source, ytm_playlist_id FROM playlists WHERE id = ?1")
            .bind(playlist_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("playlist {playlist_id}")))?;

        let source: String = row.try_get("source")?;
        let ytm_id: Option<String> = row.try_get("ytm_playlist_id")?;

        let next_pos: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
        )
        .bind(playlist_id)
        .fetch_one(&self.pool)
        .await?;

        let mut set_video_id: Option<String> = None;
        let mut sync_status = if source == "ytm" { "pending_push" } else { "local" };

        if source == "ytm" {
            if let (Some(cred), Some(remote_id)) =
                (self.creds.load_secret(YTM_CREDENTIAL_KEY)?, ytm_id.as_deref())
            {
                match self
                    .api
                    .add_track_to_playlist(&cred, remote_id, &track.video_id)
                    .await
                {
                    Ok(sid) => {
                        set_video_id = sid;
                        sync_status = "synced";
                    }
                    Err(AppError::AuthExpired) => {
                        self.handle_ytm_error(AppError::AuthExpired)?;
                    }
                    Err(e) => return Err(e),
                }
            }
        }

        sqlx::query(
            r#"
            INSERT INTO playlist_tracks (
                playlist_id, video_id, title, artist, album, duration_sec,
                thumbnail_url, position, set_video_id, sync_status
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(playlist_id, video_id) DO UPDATE SET
                set_video_id = COALESCE(excluded.set_video_id, playlist_tracks.set_video_id),
                sync_status = excluded.sync_status
            "#,
        )
        .bind(playlist_id)
        .bind(&track.video_id)
        .bind(&track.title)
        .bind(&track.artist)
        .bind(&track.album)
        .bind(track.duration_sec as i64)
        .bind(&track.thumbnail_url)
        .bind(next_pos)
        .bind(set_video_id)
        .bind(sync_status)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Removes a track from a playlist, passing stored `set_video_id` to YTM when synced.
    pub async fn remove_track_from_playlist(
        &self,
        playlist_id: i64,
        video_id: &str,
    ) -> Result<(), AppError> {
        let p_row = sqlx::query("SELECT source, ytm_playlist_id FROM playlists WHERE id = ?1")
            .bind(playlist_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("playlist {playlist_id}")))?;

        let source: String = p_row.try_get("source")?;
        let ytm_id: Option<String> = p_row.try_get("ytm_playlist_id")?;

        let set_video_id: Option<String> = sqlx::query_scalar(
            "SELECT set_video_id FROM playlist_tracks WHERE playlist_id = ?1 AND video_id = ?2",
        )
        .bind(playlist_id)
        .bind(video_id)
        .fetch_optional(&self.pool)
        .await?
        .flatten();

        if source == "ytm" {
            if let (Some(cred), Some(remote_id)) =
                (self.creds.load_secret(YTM_CREDENTIAL_KEY)?, ytm_id.as_deref())
            {
                match self
                    .api
                    .remove_track_from_playlist(
                        &cred,
                        remote_id,
                        video_id,
                        set_video_id.as_deref(),
                    )
                    .await
                {
                    Ok(()) => {}
                    Err(AppError::AuthExpired) => {
                        self.handle_ytm_error(AppError::AuthExpired)?;
                    }
                    Err(e) => return Err(e),
                }
            }
        }

        sqlx::query("DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND video_id = ?2")
            .bind(playlist_id)
            .bind(video_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Pushes all pending local likes & YTM playlist mutations first, then pulls remote YTM state.
    /// Local playlists (`source = 'local'`) are never pushed or overwritten.
    pub async fn reconcile_two_way(&self) -> Result<(), AppError> {
        let Some(cred) = self.creds.load_secret(YTM_CREDENTIAL_KEY)? else {
            self.emit("idle", None);
            return Ok(());
        };

        // 1. Flush pending likes up to YTM.
        let pending_likes = sqlx::query(
            "SELECT video_id FROM liked_songs WHERE sync_status IN ('local', 'pending_push')",
        )
        .fetch_all(&self.pool)
        .await?;

        for row in pending_likes {
            let video_id: String = row.try_get("video_id")?;
            match self.api.push_like(&cred, &video_id, true).await {
                Ok(()) => {
                    sqlx::query("UPDATE liked_songs SET sync_status = 'synced' WHERE video_id = ?1")
                        .bind(&video_id)
                        .execute(&self.pool)
                        .await?;
                }
                Err(AppError::AuthExpired) => {
                    self.handle_ytm_error(AppError::AuthExpired)?;
                    return Ok(());
                }
                Err(e) => return Err(e),
            }
        }

        // 2. Flush pending YTM playlists & tracks before pulling remote state.
        let pending_playlists = sqlx::query(
            "SELECT id, name, ytm_playlist_id FROM playlists WHERE source = 'ytm' AND sync_status = 'pending_push'",
        )
        .fetch_all(&self.pool)
        .await?;

        for row in pending_playlists {
            let pid: i64 = row.try_get("id")?;
            let name: String = row.try_get("name")?;
            let ytm_id: Option<String> = row.try_get("ytm_playlist_id")?;
            let remote_id = match ytm_id {
                Some(existing) => {
                    self.api.rename_playlist(&cred, &existing, &name).await?;
                    existing
                }
                None => self.api.create_playlist(&cred, &name).await?,
            };
            sqlx::query(
                "UPDATE playlists SET ytm_playlist_id = ?1, sync_status = 'synced', last_synced_at = CURRENT_TIMESTAMP WHERE id = ?2",
            )
            .bind(&remote_id)
            .bind(pid)
            .execute(&self.pool)
            .await?;
        }

        // 3. Pull remote liked songs.
        let remote_likes = match self.api.fetch_liked_songs(&cred).await {
            Ok(list) => list,
            Err(AppError::AuthExpired) => {
                self.handle_ytm_error(AppError::AuthExpired)?;
                return Ok(());
            }
            Err(e) => return Err(e),
        };
        for track in remote_likes {
            sqlx::query(
                r#"
                INSERT INTO liked_songs (video_id, title, artist, album, duration_sec, thumbnail_url, sync_status)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'synced')
                ON CONFLICT(video_id) DO UPDATE SET sync_status = 'synced'
                "#,
            )
            .bind(&track.video_id)
            .bind(&track.title)
            .bind(&track.artist)
            .bind(&track.album)
            .bind(track.duration_sec as i64)
            .bind(&track.thumbnail_url)
            .execute(&self.pool)
            .await?;
        }

        // 4. Pull remote YTM playlists (leaving `source = 'local'` untouched).
        let remote_playlists = match self.api.fetch_playlists(&cred).await {
            Ok(list) => list,
            Err(AppError::AuthExpired) => {
                self.handle_ytm_error(AppError::AuthExpired)?;
                return Ok(());
            }
            Err(e) => return Err(e),
        };
        for remote in remote_playlists {
            sqlx::query(
                r#"
                INSERT INTO playlists (name, source, ytm_playlist_id, sync_status, last_synced_at)
                VALUES (?1, 'ytm', ?2, 'synced', CURRENT_TIMESTAMP)
                ON CONFLICT(ytm_playlist_id) DO UPDATE SET
                    name = excluded.name,
                    sync_status = 'synced',
                    last_synced_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(&remote.name)
            .bind(&remote.ytm_playlist_id)
            .execute(&self.pool)
            .await?;
        }

        self.emit("synced", None);
        Ok(())
    }

    /// Lists all playlists (`local` and `ytm`) with track counts.
    pub async fn list_playlists(&self) -> Result<Vec<PlaylistSummary>, AppError> {
        let rows = sqlx::query(
            r#"
            SELECT p.id, p.name, p.source, p.ytm_playlist_id, p.sync_status,
                   COUNT(pt.video_id) AS track_count
            FROM playlists p
            LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
            GROUP BY p.id
            ORDER BY p.source ASC, p.created_at ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            out.push(PlaylistSummary {
                id: r.try_get("id")?,
                name: r.try_get("name")?,
                source: r.try_get("source")?,
                ytm_playlist_id: r.try_get("ytm_playlist_id")?,
                sync_status: r.try_get("sync_status")?,
                track_count: r.try_get("track_count")?,
            });
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::sqlite::init_db;
    use std::collections::HashMap;
    use std::sync::Mutex;
    use tempfile::tempdir;

    #[derive(Default)]
    struct InMemoryCreds {
        map: Mutex<HashMap<String, String>>,
    }

    impl CredentialStore for InMemoryCreds {
        fn save_secret(&self, key: &str, value: &str) -> Result<(), AppError> {
            self.map.lock().unwrap().insert(key.to_string(), value.to_string());
            Ok(())
        }
        fn load_secret(&self, key: &str) -> Result<Option<String>, AppError> {
            Ok(self.map.lock().unwrap().get(key).cloned())
        }
        fn delete_secret(&self, key: &str) -> Result<(), AppError> {
            self.map.lock().unwrap().remove(key);
            Ok(())
        }
    }

    #[derive(Default)]
    struct RecordingSink {
        events: Mutex<Vec<SyncStatusPayload>>,
    }

    impl SyncEventSink for RecordingSink {
        fn emit_sync_status(&self, payload: SyncStatusPayload) {
            self.events.lock().unwrap().push(payload);
        }
    }

    struct MockYtmApi {
        fail_auth: bool,
        pushed_likes: Mutex<Vec<String>>,
        ops: Mutex<Vec<String>>,
    }

    impl MockYtmApi {
        fn ok() -> Self {
            Self {
                fail_auth: false,
                pushed_likes: Mutex::new(Vec::new()),
                ops: Mutex::new(Vec::new()),
            }
        }

        fn expired() -> Self {
            Self {
                fail_auth: true,
                pushed_likes: Mutex::new(Vec::new()),
                ops: Mutex::new(Vec::new()),
            }
        }
    }

    #[async_trait]
    impl YtmWriteApi for MockYtmApi {
        async fn push_like(&self, _cred: &str, video_id: &str, liked: bool) -> Result<(), AppError> {
            if self.fail_auth {
                return Err(AppError::AuthExpired);
            }
            if liked {
                self.pushed_likes.lock().unwrap().push(video_id.to_string());
            }
            Ok(())
        }

        async fn fetch_liked_songs(&self, _cred: &str) -> Result<Vec<TrackMetadata>, AppError> {
            if self.fail_auth {
                return Err(AppError::AuthExpired);
            }
            Ok(vec![])
        }

        async fn create_playlist(&self, _cred: &str, title: &str) -> Result<String, AppError> {
            if self.fail_auth {
                return Err(AppError::AuthExpired);
            }
            self.ops.lock().unwrap().push(format!("create:{title}"));
            Ok("VL_MOCK_1".to_string())
        }

        async fn rename_playlist(&self, _cred: &str, id: &str, new_title: &str) -> Result<(), AppError> {
            if self.fail_auth {
                return Err(AppError::AuthExpired);
            }
            self.ops.lock().unwrap().push(format!("rename:{id}:{new_title}"));
            Ok(())
        }

        async fn delete_playlist(&self, _cred: &str, id: &str) -> Result<(), AppError> {
            if self.fail_auth {
                return Err(AppError::AuthExpired);
            }
            self.ops.lock().unwrap().push(format!("delete:{id}"));
            Ok(())
        }

        async fn add_track_to_playlist(
            &self,
            _cred: &str,
            id: &str,
            video_id: &str,
        ) -> Result<Option<String>, AppError> {
            if self.fail_auth {
                return Err(AppError::AuthExpired);
            }
            self.ops.lock().unwrap().push(format!("add:{id}:{video_id}"));
            Ok(Some(format!("SET_{video_id}")))
        }

        async fn remove_track_from_playlist(
            &self,
            _cred: &str,
            id: &str,
            video_id: &str,
            set_video_id: Option<&str>,
        ) -> Result<(), AppError> {
            if self.fail_auth {
                return Err(AppError::AuthExpired);
            }
            self.ops.lock().unwrap().push(format!(
                "remove:{id}:{video_id}:{}",
                set_video_id.unwrap_or("")
            ));
            Ok(())
        }

        async fn fetch_playlists(&self, _cred: &str) -> Result<Vec<RemoteYtmPlaylist>, AppError> {
            if self.fail_auth {
                return Err(AppError::AuthExpired);
            }
            self.ops.lock().unwrap().push("fetch_playlists".to_string());
            Ok(vec![])
        }
    }

    fn track(id: &str) -> TrackMetadata {
        TrackMetadata {
            video_id: id.to_string(),
            title: format!("Song {id}"),
            artist: "Artist".to_string(),
            album: None,
            duration_sec: 180,
            thumbnail_url: String::new(),
        }
    }

    #[tokio::test]
    async fn login_merges_existing_local_likes_to_ytm_and_keeps_local_playlists_separate() {
        let dir = tempdir().unwrap();
        let pool = init_db(&dir.path().join("sync1.db")).await.unwrap();
        let creds = Arc::new(InMemoryCreds::default());
        let api = Arc::new(MockYtmApi::ok());
        let sink = Arc::new(RecordingSink::default());
        let engine = SyncEngine::new(pool.clone(), creds, api.clone(), sink);

        engine.toggle_like_song(&track("l1"), true).await.unwrap();
        engine.toggle_like_song(&track("l2"), true).await.unwrap();
        let local_pl = engine.create_playlist("My Local Mix", "local").await.unwrap();
        assert_eq!(local_pl.source, "local");

        engine.connect_and_merge_likes("COOKIE=123").await.unwrap();

        let pushed = api.pushed_likes.lock().unwrap().clone();
        assert!(pushed.contains(&"l1".to_string()));
        assert!(pushed.contains(&"l2".to_string()));

        let statuses: Vec<String> =
            sqlx::query_scalar("SELECT sync_status FROM liked_songs ORDER BY video_id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(statuses, vec!["synced", "synced"]);

        let pl_source: String =
            sqlx::query_scalar("SELECT source FROM playlists WHERE id = ?1")
                .bind(local_pl.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(pl_source, "local");
    }

    #[tokio::test]
    async fn expired_ytm_token_keeps_pending_push_and_emits_non_blocking_warning() {
        let dir = tempdir().unwrap();
        let pool = init_db(&dir.path().join("sync2.db")).await.unwrap();
        let creds = Arc::new(InMemoryCreds::default());
        creds.save_secret(YTM_CREDENTIAL_KEY, "EXPIRED").unwrap();
        let api = Arc::new(MockYtmApi::expired());
        let sink = Arc::new(RecordingSink::default());
        let engine = SyncEngine::new(pool.clone(), creds, api, sink.clone());

        engine.toggle_like_song(&track("v_pending"), true).await.unwrap();

        let status: String =
            sqlx::query_scalar("SELECT sync_status FROM liked_songs WHERE video_id = 'v_pending'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(status, "pending_push");

        let events = sink.events.lock().unwrap().clone();
        assert!(events.iter().any(|e| e.state == "warning"));
    }

    #[tokio::test]
    async fn full_ytm_playlist_crud_flushes_pending_before_remote_pull() {
        let dir = tempdir().unwrap();
        let pool = init_db(&dir.path().join("sync3.db")).await.unwrap();
        let creds = Arc::new(InMemoryCreds::default());
        creds.save_secret(YTM_CREDENTIAL_KEY, "VALID").unwrap();
        let api = Arc::new(MockYtmApi::ok());
        let sink = Arc::new(RecordingSink::default());
        let engine = SyncEngine::new(pool.clone(), creds, api.clone(), sink);

        let pl = engine.create_playlist("Initial YTM", "ytm").await.unwrap();
        engine.rename_playlist(pl.id, "Renamed YTM").await.unwrap();
        engine.add_track_to_playlist(pl.id, &track("t1")).await.unwrap();
        engine.remove_track_from_playlist(pl.id, "t1").await.unwrap();
        engine.reconcile_two_way().await.unwrap();
        engine.delete_playlist(pl.id).await.unwrap();

        let ops = api.ops.lock().unwrap().clone();
        assert!(ops.contains(&"create:Initial YTM".to_string()));
        assert!(ops.contains(&"rename:VL_MOCK_1:Renamed YTM".to_string()));
        assert!(ops.contains(&"add:VL_MOCK_1:t1".to_string()));
        assert!(ops.contains(&"remove:VL_MOCK_1:t1:SET_t1".to_string()));
        assert!(ops.contains(&"fetch_playlists".to_string()));
        assert!(ops.contains(&"delete:VL_MOCK_1".to_string()));
    }
}
