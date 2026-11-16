use std::sync::Arc;
use async_trait::async_trait;
use rustypipe::client::RustyPipe;
use rustypipe::model::AudioCodec;

use crate::extractor::cache::{LruDiskCache, MemoryStreamCache, STREAM_TTL_SECS};
use crate::models::{AppError, StreamInfo, StreamSource};

/// Primary in-process stream resolver (implemented by `RustypipeStreamProvider`).
#[async_trait]
pub trait PrimaryStreamProvider: Send + Sync {
    async fn fetch_stream(&self, video_id: &str, quality: &str) -> Result<StreamInfo, AppError>;
}

/// Secondary out-of-process fallback resolver (implemented by `YtdlpSidecar`).
#[async_trait]
pub trait FallbackStreamProvider: Send + Sync {
    async fn fetch_stream(&self, video_id: &str, quality: &str) -> Result<StreamInfo, AppError>;
}

/// Primary stream extractor backed by `rustypipe` in pure Rust.
#[derive(Clone)]
pub struct RustypipeStreamProvider {
    client: RustyPipe,
}

impl RustypipeStreamProvider {
    /// Creates a new `rustypipe` stream provider.
    pub fn new() -> Self {
        Self {
            client: RustyPipe::new(),
        }
    }

    /// Creates a provider sharing an existing `RustyPipe` client instance.
    pub fn with_client(client: RustyPipe) -> Self {
        Self { client }
    }
}

impl Default for RustypipeStreamProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl PrimaryStreamProvider for RustypipeStreamProvider {
    async fn fetch_stream(&self, video_id: &str, quality: &str) -> Result<StreamInfo, AppError> {
        let player = self
            .client
            .query()
            .player(video_id)
            .await
            .map_err(|e| AppError::Extraction(format!("rustypipe player error: {e}")))?;

        let prefer_aac = quality.contains("aac") || quality == "medium";
        let best = player
            .audio_streams
            .iter()
            .max_by_key(|s| {
                let codec_score: u64 = match s.codec {
                    AudioCodec::Opus if !prefer_aac => 2,
                    AudioCodec::Mp4a if prefer_aac => 2,
                    AudioCodec::Opus | AudioCodec::Mp4a => 1,
                    _ => 0,
                };
                (codec_score, s.bitrate as u64)
            })
            .ok_or_else(|| {
                AppError::Extraction(format!("No audio streams found for {video_id}"))
            })?;

        let now = chrono::Utc::now().timestamp();
        let codec = match best.codec {
            AudioCodec::Opus => "opus".to_string(),
            AudioCodec::Mp4a => "m4a".to_string(),
            AudioCodec::Ac3 => "ac3".to_string(),
            AudioCodec::Ec3 => "ec3".to_string(),
            AudioCodec::Unknown | _ => "audio".to_string(),
        };

        Ok(StreamInfo {
            video_id: video_id.to_string(),
            url: best.url.clone(),
            format: codec,
            perceptual_loudness_db: best.loudness_db,
            source: StreamSource::Rustypipe,
            expires_at_unix: now + STREAM_TTL_SECS,
        })
    }
}

/// Orchestrates `LruDiskCache` -> `MemoryStreamCache` -> `PrimaryStreamProvider` -> `FallbackStreamProvider`.
pub struct DualTierExtractor {
    primary: Arc<dyn PrimaryStreamProvider>,
    fallback: Arc<dyn FallbackStreamProvider>,
    memory_cache: Arc<MemoryStreamCache>,
    disk_cache: Option<Arc<LruDiskCache>>,
    clock_fn: Arc<dyn Fn() -> i64 + Send + Sync>,
}

impl DualTierExtractor {
    /// Creates a new `DualTierExtractor` with real wall-clock timestamps.
    pub fn new(
        primary: Arc<dyn PrimaryStreamProvider>,
        fallback: Arc<dyn FallbackStreamProvider>,
        memory_cache: Arc<MemoryStreamCache>,
        disk_cache: Option<Arc<LruDiskCache>>,
    ) -> Self {
        Self {
            primary,
            fallback,
            memory_cache,
            disk_cache,
            clock_fn: Arc::new(|| chrono::Utc::now().timestamp()),
        }
    }

    /// Creates a `DualTierExtractor` with a deterministic clock for testing.
    pub fn with_clock(
        primary: Arc<dyn PrimaryStreamProvider>,
        fallback: Arc<dyn FallbackStreamProvider>,
        memory_cache: Arc<MemoryStreamCache>,
        disk_cache: Option<Arc<LruDiskCache>>,
        clock_fn: Arc<dyn Fn() -> i64 + Send + Sync>,
    ) -> Self {
        Self {
            primary,
            fallback,
            memory_cache,
            disk_cache,
            clock_fn,
        }
    }

    /// Resolves a playable stream URL or local cached file path for `video_id` at `quality`.
    pub async fn resolve_stream(&self, video_id: &str, quality: &str) -> Result<StreamInfo, AppError> {
        // 1. Check LRU disk cache first for instant offline/zero-network playback.
        if let Some(disk) = &self.disk_cache {
            if let Some(path) = disk.get_path(video_id) {
                let ext = path
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("webm")
                    .to_string();
                return Ok(StreamInfo {
                    video_id: video_id.to_string(),
                    url: path.to_string_lossy().to_string(),
                    format: ext,
                    perceptual_loudness_db: None,
                    source: StreamSource::LocalFile,
                    expires_at_unix: i64::MAX,
                });
            }
        }

        // 2. Check 5.5h in-memory URL cache.
        let now = (self.clock_fn)();
        let cache_key = MemoryStreamCache::cache_key(video_id, quality);
        if let Some(cached) = self.memory_cache.get(&cache_key, now).await {
            return Ok(cached);
        }

        // 3. Try primary in-process Rustypipe extractor; on error fall back to yt-dlp sidecar.
        let mut info = match self.primary.fetch_stream(video_id, quality).await {
            Ok(info) => info,
            Err(primary_err) => self
                .fallback
                .fetch_stream(video_id, quality)
                .await
                .map_err(|fallback_err| {
                    AppError::Extraction(format!(
                        "Primary failed ({primary_err}); fallback failed ({fallback_err})"
                    ))
                })?,
        };

        // Ensure TTL is normalized to `now + 19_800` (5.5h).
        info.expires_at_unix = now + STREAM_TTL_SECS;
        self.memory_cache.insert(cache_key, info.clone()).await;
        Ok(info)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct FailingPrimary;

    #[async_trait]
    impl PrimaryStreamProvider for FailingPrimary {
        async fn fetch_stream(
            &self,
            _video_id: &str,
            _quality: &str,
        ) -> Result<StreamInfo, AppError> {
            Err(AppError::Extraction("cipher 403".to_string()))
        }
    }

    struct CountingFallback {
        calls: AtomicUsize,
    }

    #[async_trait]
    impl FallbackStreamProvider for CountingFallback {
        async fn fetch_stream(
            &self,
            video_id: &str,
            _quality: &str,
        ) -> Result<StreamInfo, AppError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(StreamInfo {
                video_id: video_id.to_string(),
                url: format!("https://fallback.local/{video_id}.webm"),
                format: "opus".to_string(),
                perceptual_loudness_db: Some(-3.5),
                source: StreamSource::YtdlpFallback,
                expires_at_unix: 0,
            })
        }
    }

    #[tokio::test]
    async fn primary_failure_triggers_ytdlp_fallback_and_caches_with_5_5h_ttl() {
        let now = 1_700_000_000i64;
        let primary = Arc::new(FailingPrimary);
        let fallback = Arc::new(CountingFallback {
            calls: AtomicUsize::new(0),
        });
        let memory_cache = Arc::new(MemoryStreamCache::new());

        let extractor = DualTierExtractor::with_clock(
            primary,
            fallback.clone(),
            memory_cache,
            None,
            Arc::new(move || now),
        );

        let first = extractor
            .resolve_stream("dQw4w9WgXcQ", "opus_160")
            .await
            .expect("fallback should succeed");
        assert_eq!(first.source, StreamSource::YtdlpFallback);
        assert_eq!(first.url, "https://fallback.local/dQw4w9WgXcQ.webm");
        assert_eq!(first.expires_at_unix, now + 19_800);
        assert_eq!(fallback.calls.load(Ordering::SeqCst), 1);

        let second = extractor
            .resolve_stream("dQw4w9WgXcQ", "opus_160")
            .await
            .expect("second call should hit memory cache");
        assert_eq!(second.url, first.url);
        assert_eq!(fallback.calls.load(Ordering::SeqCst), 1);
    }
}
