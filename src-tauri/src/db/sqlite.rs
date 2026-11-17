use std::path::Path;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;

const SCHEMA_STATEMENTS: &[&str] = &[
    r#"
    CREATE TABLE IF NOT EXISTS liked_songs (
        video_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        duration_sec INTEGER NOT NULL,
        thumbnail_url TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'local',
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        cover_url TEXT,
        source TEXT NOT NULL DEFAULT 'local',
        ytm_playlist_id TEXT UNIQUE,
        sync_status TEXT NOT NULL DEFAULT 'local',
        last_synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        duration_sec INTEGER NOT NULL,
        thumbnail_url TEXT NOT NULL,
        position INTEGER NOT NULL,
        set_video_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'local',
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (playlist_id, video_id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        thumbnail_url TEXT NOT NULL,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS offline_downloads (
        video_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        duration_sec INTEGER NOT NULL,
        thumbnail_url TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        format TEXT NOT NULL,
        downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS lyric_offsets (
        video_id TEXT PRIMARY KEY,
        offset_ms INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS playback_session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_track_json TEXT,
        position_ms INTEGER NOT NULL DEFAULT 0,
        queue_json TEXT NOT NULL DEFAULT '[]',
        shuffle INTEGER NOT NULL DEFAULT 0,
        repeat_mode TEXT NOT NULL DEFAULT 'off',
        autoplay_enabled INTEGER NOT NULL DEFAULT 1,
        volume REAL NOT NULL DEFAULT 1.0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    "#,
    r#"
    CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        settings_json TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    "#,
];

/// Initializes the local SQLite database at `db_path` with WAL mode, foreign keys,
/// and all seven Nocturne schema tables.
pub async fn init_db(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(sqlx::Error::Io)?;
        }
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::query("PRAGMA journal_mode=WAL;").execute(&pool).await?;
    sqlx::query("PRAGMA foreign_keys=ON;").execute(&pool).await?;

    for ddl in SCHEMA_STATEMENTS {
        sqlx::query(ddl).execute(&pool).await?;
    }

    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;

    async fn table_columns(pool: &SqlitePool, table: &str) -> Vec<String> {
        let query = format!("PRAGMA table_info({table})");
        sqlx::query(&query)
            .fetch_all(pool)
            .await
            .unwrap()
            .into_iter()
            .map(|r| r.get::<String, _>("name"))
            .collect()
    }

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

        let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode;")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(journal_mode.to_lowercase(), "wal");

        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys;")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(foreign_keys, 1);

        assert_eq!(
            table_columns(&pool, "liked_songs").await,
            vec![
                "video_id",
                "title",
                "artist",
                "album",
                "duration_sec",
                "thumbnail_url",
                "sync_status",
                "added_at",
            ]
        );
        assert_eq!(
            table_columns(&pool, "playlists").await,
            vec![
                "id",
                "name",
                "description",
                "cover_url",
                "source",
                "ytm_playlist_id",
                "sync_status",
                "last_synced_at",
                "created_at",
            ]
        );
        assert_eq!(
            table_columns(&pool, "playlist_tracks").await,
            vec![
                "playlist_id",
                "video_id",
                "title",
                "artist",
                "album",
                "duration_sec",
                "thumbnail_url",
                "position",
                "set_video_id",
                "sync_status",
                "added_at",
            ]
        );
        assert_eq!(
            table_columns(&pool, "play_history").await,
            vec!["id", "video_id", "title", "artist", "thumbnail_url", "played_at"]
        );
        assert_eq!(
            table_columns(&pool, "offline_downloads").await,
            vec![
                "video_id",
                "title",
                "artist",
                "album",
                "duration_sec",
                "thumbnail_url",
                "file_path",
                "file_size_bytes",
                "format",
                "downloaded_at",
            ]
        );
        assert_eq!(
            table_columns(&pool, "lyric_offsets").await,
            vec!["video_id", "offset_ms", "updated_at"]
        );
        assert_eq!(
            table_columns(&pool, "playback_session").await,
            vec![
                "id",
                "current_track_json",
                "position_ms",
                "queue_json",
                "shuffle",
                "repeat_mode",
                "autoplay_enabled",
                "volume",
                "updated_at",
            ]
        );
    }

    #[tokio::test]
    async fn init_db_is_idempotent_and_enforces_foreign_keys_and_session_singleton() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("nested").join("nocturne_test.db");

        let pool = init_db(&db_path).await.expect("first init succeeds");

        sqlx::query("INSERT INTO playlists (id, name) VALUES (1, 'Focus')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO playlist_tracks (playlist_id, video_id, title, artist, duration_sec, thumbnail_url, position)
             VALUES (1, 'vid1', 'Song', 'Artist', 180, 'https://img', 0)",
        )
        .execute(&pool)
        .await
        .unwrap();

        // Re-initializing existing database keeps data intact
        pool.close().await;
        let pool = init_db(&db_path).await.expect("second init succeeds");

        // Deleting parent playlist cascades to playlist_tracks
        sqlx::query("DELETE FROM playlists WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap();
        let track_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM playlist_tracks")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(track_count, 0);

        // playback_session enforces id = 1 singleton check constraint
        let invalid_session = sqlx::query("INSERT INTO playback_session (id) VALUES (2)")
            .execute(&pool)
            .await;
        assert!(invalid_session.is_err());
    }
}
