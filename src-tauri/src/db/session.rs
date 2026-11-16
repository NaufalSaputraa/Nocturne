use sqlx::{Row, SqlitePool};

use crate::models::{PlaybackSession, TrackMetadata};

/// Debounce interval for periodic `playback_session` writes during playback (5 seconds).
pub const SESSION_SAVE_DEBOUNCE_MS: i64 = 5_000;

/// Manages debounced periodic writes and immediate event flushes to the
/// `playback_session` singleton row in SQLite.
#[derive(Debug, Clone)]
pub struct SessionPersistence {
    pool: SqlitePool,
    last_write_ms: Option<i64>,
}

impl SessionPersistence {
    /// Creates a new `SessionPersistence` handle backed by `pool`.
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            last_write_ms: None,
        }
    }

    /// Writes `session` to SQLite only if `now_ms - last_write_ms >= 5_000` (or on first write).
    /// Returns `Ok(true)` if a write occurred, `Ok(false)` if debounced.
    pub async fn maybe_save_tick(
        &mut self,
        session: &PlaybackSession,
        now_ms: i64,
    ) -> Result<bool, sqlx::Error> {
        let should_write = match self.last_write_ms {
            None => true,
            Some(prev) => now_ms.saturating_sub(prev) >= SESSION_SAVE_DEBOUNCE_MS,
        };
        if !should_write {
            return Ok(false);
        }
        self.flush_now(session, now_ms).await?;
        Ok(true)
    }

    /// Immediately persists `session` to SQLite regardless of the 5s debounce timer
    /// (used on pause, seek, track change, and `CloseRequested`).
    pub async fn flush_now(
        &mut self,
        session: &PlaybackSession,
        now_ms: i64,
    ) -> Result<(), sqlx::Error> {
        let current_track_json = session
            .current_track
            .as_ref()
            .and_then(|t| serde_json::to_string(t).ok());
        let queue_json =
            serde_json::to_string(&session.queue).unwrap_or_else(|_| "[]".to_string());

        sqlx::query(
            r#"
            INSERT INTO playback_session (
                id, current_track_json, position_ms, queue_json,
                shuffle, repeat_mode, autoplay_enabled, volume, updated_at
            )
            VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                current_track_json = excluded.current_track_json,
                position_ms = excluded.position_ms,
                queue_json = excluded.queue_json,
                shuffle = excluded.shuffle,
                repeat_mode = excluded.repeat_mode,
                autoplay_enabled = excluded.autoplay_enabled,
                volume = excluded.volume,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(current_track_json)
        .bind(session.position_ms as i64)
        .bind(queue_json)
        .bind(if session.shuffle { 1_i64 } else { 0_i64 })
        .bind(&session.repeat_mode)
        .bind(if session.autoplay_enabled { 1_i64 } else { 0_i64 })
        .bind(session.volume as f64)
        .execute(&self.pool)
        .await?;

        self.last_write_ms = Some(now_ms);
        Ok(())
    }

    /// Loads the persisted `PlaybackSession` singleton row for cold-start restore.
    pub async fn load_session(pool: &SqlitePool) -> Result<Option<PlaybackSession>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT current_track_json, position_ms, queue_json,
                   shuffle, repeat_mode, autoplay_enabled, volume
            FROM playback_session
            WHERE id = 1
            "#,
        )
        .fetch_optional(pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let current_track_json: Option<String> = row.try_get("current_track_json")?;
        let current_track: Option<TrackMetadata> = current_track_json
            .as_deref()
            .and_then(|json| serde_json::from_str(json).ok());
        let queue_json: String = row.try_get("queue_json")?;
        let queue: Vec<TrackMetadata> =
            serde_json::from_str(&queue_json).unwrap_or_default();

        let position_ms = row.try_get::<i64, _>("position_ms")?.max(0) as u64;
        let shuffle = row.try_get::<i64, _>("shuffle")? != 0;
        let repeat_mode: String = row.try_get("repeat_mode")?;
        let autoplay_enabled = row.try_get::<i64, _>("autoplay_enabled")? != 0;
        let volume = row.try_get::<f64, _>("volume")? as f32;

        Ok(Some(PlaybackSession {
            current_track,
            position_ms,
            queue,
            shuffle,
            repeat_mode,
            autoplay_enabled,
            volume,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::sqlite::init_db;
    use std::time::Instant;
    use tempfile::tempdir;

    fn sample_session(pos_ms: u64) -> PlaybackSession {
        PlaybackSession {
            current_track: Some(TrackMetadata {
                video_id: "vid_restore".to_string(),
                title: "Restored Track".to_string(),
                artist: "Nocturne Artist".to_string(),
                album: Some("Night Tape".to_string()),
                duration_sec: 210,
                thumbnail_url: "https://example.com/thumb.jpg".to_string(),
            }),
            position_ms: pos_ms,
            queue: vec![],
            shuffle: true,
            repeat_mode: "all".to_string(),
            autoplay_enabled: true,
            volume: 0.75,
        }
    }

    #[tokio::test]
    async fn session_persistence_debounces_500ms_ticks_to_5s_and_flushes_immediately_on_events() {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("nocturne_session.db");
        let pool = init_db(&db_path).await.expect("init_db");
        let mut persistence = SessionPersistence::new(pool.clone());

        let s1 = sample_session(1_000);
        assert!(persistence.maybe_save_tick(&s1, 0).await.unwrap());

        let s2 = sample_session(1_500);
        let s3 = sample_session(5_500);
        assert!(!persistence.maybe_save_tick(&s2, 500).await.unwrap());
        assert!(!persistence.maybe_save_tick(&s3, 4_500).await.unwrap());

        // SQLite should still hold s1's position_ms while debounced.
        let mid = SessionPersistence::load_session(&pool).await.unwrap().unwrap();
        assert_eq!(mid.position_ms, 1_000);

        // At 5,000 ms threshold, periodic tick writes.
        let s4 = sample_session(6_000);
        assert!(persistence.maybe_save_tick(&s4, 5_000).await.unwrap());

        // Immediate flush writes despite < 5,000 ms elapsed.
        let s5 = sample_session(92_450);
        persistence.flush_now(&s5, 5_200).await.unwrap();

        let started = Instant::now();
        let restored = SessionPersistence::load_session(&pool).await.unwrap().unwrap();
        let elapsed_ms = started.elapsed().as_millis();

        assert_eq!(restored.position_ms, 92_450);
        assert_eq!(
            restored.current_track.as_ref().map(|t| t.video_id.as_str()),
            Some("vid_restore")
        );
        assert!(elapsed_ms < 100, "cold-start restore took {elapsed_ms}ms");
    }
}
