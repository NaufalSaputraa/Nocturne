use std::path::PathBuf;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tokio::io::AsyncWriteExt;

use crate::extractor::stream::DualTierExtractor;
use crate::models::{AppError, DownloadProgressPayload, TrackMetadata};

/// Indexed offline downloaded track row returned from SQLite `offline_downloads`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OfflineTrackEntry {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration_sec: u64,
    pub thumbnail_url: String,
    pub file_path: String,
    pub file_size_bytes: u64,
    pub quality: String,
}

/// Abstracts `download-progress` event emission for Tauri & tests.
pub trait DownloadEventSink: Send + Sync {
    fn emit_download_progress(&self, payload: DownloadProgressPayload);
}

/// Manages explicit user-initiated offline audio downloads and SQLite indexing.
pub struct DownloadManager {
    pool: SqlitePool,
    extractor: Arc<DualTierExtractor>,
    http: reqwest::Client,
    sink: Arc<dyn DownloadEventSink>,
    download_dir: PathBuf,
}

impl DownloadManager {
    pub fn new(
        pool: SqlitePool,
        extractor: Arc<DualTierExtractor>,
        sink: Arc<dyn DownloadEventSink>,
        download_dir: PathBuf,
    ) -> Result<Self, AppError> {
        std::fs::create_dir_all(&download_dir)?;
        Ok(Self {
            pool,
            extractor,
            http: reqwest::Client::new(),
            sink,
            download_dir,
        })
    }

    /// Downloads `track` into `download_dir`, emits `download-progress` events,
    /// and indexes it in SQLite `offline_downloads`.
    pub async fn download_track(
        &self,
        track: &TrackMetadata,
        quality: &str,
    ) -> Result<OfflineTrackEntry, AppError> {
        let stream = self.extractor.resolve_stream(&track.video_id, quality).await?;
        let ext = if stream.format.is_empty() {
            "webm".to_string()
        } else {
            stream.format.clone()
        };
        let target_path = self.download_dir.join(format!("{}.{}", track.video_id, ext));

        let file_size_bytes = if PathBuf::from(&stream.url).exists() {
            std::fs::copy(&stream.url, &target_path)?;
            std::fs::metadata(&target_path)?.len()
        } else {
            let mut resp = self.http.get(&stream.url).send().await?;
            if !resp.status().is_success() {
                self.sink.emit_download_progress(DownloadProgressPayload {
                    video_id: track.video_id.clone(),
                    downloaded_bytes: 0,
                    total_bytes: None,
                    status: "failed".to_string(),
                });
                return Err(AppError::Extraction(format!(
                    "Download HTTP error {} for {}",
                    resp.status(),
                    track.video_id
                )));
            }
            let total_bytes = resp.content_length();
            let mut file = tokio::fs::File::create(&target_path).await?;
            let mut downloaded = 0u64;

            while let Some(chunk) = resp.chunk().await? {
                file.write_all(&chunk).await?;
                downloaded = downloaded.saturating_add(chunk.len() as u64);
                self.sink.emit_download_progress(DownloadProgressPayload {
                    video_id: track.video_id.clone(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    status: "downloading".to_string(),
                });
            }
            file.flush().await?;
            downloaded
        };

        let path_str = target_path.to_string_lossy().to_string();
        sqlx::query(
            r#"
            INSERT INTO offline_downloads (
                video_id, title, artist, album, duration_sec, thumbnail_url,
                file_path, file_size_bytes, format
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(video_id) DO UPDATE SET
                file_path = excluded.file_path,
                file_size_bytes = excluded.file_size_bytes,
                format = excluded.format
            "#,
        )
        .bind(&track.video_id)
        .bind(&track.title)
        .bind(&track.artist)
        .bind(&track.album)
        .bind(track.duration_sec as i64)
        .bind(&track.thumbnail_url)
        .bind(&path_str)
        .bind(file_size_bytes as i64)
        .bind(&ext)
        .execute(&self.pool)
        .await?;

        self.sink.emit_download_progress(DownloadProgressPayload {
            video_id: track.video_id.clone(),
            downloaded_bytes: file_size_bytes,
            total_bytes: Some(file_size_bytes),
            status: "completed".to_string(),
        });

        Ok(OfflineTrackEntry {
            video_id: track.video_id.clone(),
            title: track.title.clone(),
            artist: track.artist.clone(),
            album: track.album.clone(),
            duration_sec: track.duration_sec,
            thumbnail_url: track.thumbnail_url.clone(),
            file_path: path_str,
            file_size_bytes,
            quality: quality.to_string(),
        })
    }

    /// Downloads every track in `tracks` sequentially and returns completed entries.
    pub async fn download_playlist(
        &self,
        tracks: &[TrackMetadata],
        quality: &str,
    ) -> Result<Vec<OfflineTrackEntry>, AppError> {
        let mut results = Vec::with_capacity(tracks.len());
        for track in tracks {
            results.push(self.download_track(track, quality).await?);
        }
        Ok(results)
    }

    /// Lists all downloaded offline tracks from SQLite.
    pub async fn list_offline_tracks(&self) -> Result<Vec<OfflineTrackEntry>, AppError> {
        let rows = sqlx::query(
            r#"
            SELECT video_id, title, artist, album, duration_sec, thumbnail_url,
                   file_path, file_size_bytes, format
            FROM offline_downloads
            ORDER BY downloaded_at DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            out.push(OfflineTrackEntry {
                video_id: r.try_get("video_id")?,
                title: r.try_get("title")?,
                artist: r.try_get("artist")?,
                album: r.try_get("album")?,
                duration_sec: r.try_get::<i64, _>("duration_sec")?.max(0) as u64,
                thumbnail_url: r.try_get("thumbnail_url")?,
                file_path: r.try_get("file_path")?,
                file_size_bytes: r.try_get::<i64, _>("file_size_bytes")?.max(0) as u64,
                quality: r.try_get("format")?,
            });
        }
        Ok(out)
    }

    /// Removes an offline download from disk and SQLite.
    pub async fn remove_offline_track(&self, video_id: &str) -> Result<(), AppError> {
        let path: Option<String> =
            sqlx::query_scalar("SELECT file_path FROM offline_downloads WHERE video_id = ?1")
                .bind(video_id)
                .fetch_optional(&self.pool)
                .await?;
        if let Some(p) = path {
            let _ = std::fs::remove_file(p);
        }
        sqlx::query("DELETE FROM offline_downloads WHERE video_id = ?1")
            .bind(video_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::sqlite::init_db;
    use crate::extractor::cache::MemoryStreamCache;
    use crate::extractor::stream::{FallbackStreamProvider, PrimaryStreamProvider};
    use crate::models::{StreamInfo, StreamSource};
    use async_trait::async_trait;
    use std::sync::Mutex;
    use tempfile::tempdir;
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpListener;

    struct LocalHttpPrimary {
        url: String,
    }

    #[async_trait]
    impl PrimaryStreamProvider for LocalHttpPrimary {
        async fn fetch_stream(&self, video_id: &str, _quality: &str) -> Result<StreamInfo, AppError> {
            Ok(StreamInfo {
                video_id: video_id.to_string(),
                url: self.url.clone(),
                format: "opus".to_string(),
                perceptual_loudness_db: None,
                source: StreamSource::Rustypipe,
                expires_at_unix: 0,
            })
        }
    }

    struct UnusedFallback;

    #[async_trait]
    impl FallbackStreamProvider for UnusedFallback {
        async fn fetch_stream(&self, _video_id: &str, _quality: &str) -> Result<StreamInfo, AppError> {
            Err(AppError::Extraction("unused".to_string()))
        }
    }

    #[derive(Default)]
    struct RecordingDownloadSink {
        events: Mutex<Vec<DownloadProgressPayload>>,
    }

    impl DownloadEventSink for RecordingDownloadSink {
        fn emit_download_progress(&self, payload: DownloadProgressPayload) {
            self.events.lock().unwrap().push(payload);
        }
    }

    #[tokio::test]
    async fn download_track_saves_file_emits_progress_and_indexes_sqlite() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let payload_bytes = b"NOCTURNE_MOCK_OPUS_AUDIO_BYTES".to_vec();
        let payload_len = payload_bytes.len();

        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            if let Ok((mut sock, _)) = listener.accept().await {
                let mut req_buf = [0u8; 1024];
                let _ = sock.read(&mut req_buf).await;
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {payload_len}\r\nConnection: close\r\n\r\n"
                );
                let _ = sock.write_all(header.as_bytes()).await;
                let _ = sock.write_all(&payload_bytes).await;
                let _ = sock.flush().await;
                let _ = sock.shutdown().await;
            }
        });

        let dir = tempdir().unwrap();
        let pool = init_db(&dir.path().join("dl.db")).await.unwrap();
        let extractor = Arc::new(DualTierExtractor::new(
            Arc::new(LocalHttpPrimary {
                url: format!("http://{addr}/audio.opus"),
            }),
            Arc::new(UnusedFallback),
            Arc::new(MemoryStreamCache::new()),
            None,
        ));
        let sink = Arc::new(RecordingDownloadSink::default());
        let manager =
            DownloadManager::new(pool, extractor, sink.clone(), dir.path().join("offline"))
                .unwrap();

        let track = TrackMetadata {
            video_id: "dl_vid_1".to_string(),
            title: "Offline Song".to_string(),
            artist: "Nocturne".to_string(),
            album: None,
            duration_sec: 120,
            thumbnail_url: String::new(),
        };

        let entry = manager.download_track(&track, "opus_160").await.unwrap();
        assert!(PathBuf::from(&entry.file_path).exists());
        assert_eq!(entry.file_size_bytes as usize, payload_len);

        let list = manager.list_offline_tracks().await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].video_id, "dl_vid_1");

        let events = sink.events.lock().unwrap().clone();
        assert_eq!(events.last().map(|e| e.status.as_str()), Some("completed"));
    }
}
