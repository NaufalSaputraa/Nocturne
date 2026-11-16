use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::RwLock;

use crate::models::{AppError, StreamInfo};

/// Default in-memory stream URL TTL: 5.5 hours (19,800 seconds),
/// safely below YouTube's ~6 hour signed URL expiration.
pub const STREAM_TTL_SECS: i64 = 19_800;

/// Thread-safe in-memory cache for resolved stream URLs keyed by `"{video_id}:{quality}"`.
#[derive(Debug, Default)]
pub struct MemoryStreamCache {
    entries: RwLock<HashMap<String, StreamInfo>>,
}

impl MemoryStreamCache {
    /// Creates an empty in-memory stream cache.
    pub fn new() -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
        }
    }

    /// Builds the composite cache key for a video ID and requested quality tier.
    pub fn cache_key(video_id: &str, quality: &str) -> String {
        format!("{video_id}:{quality}")
    }

    /// Returns a cached `StreamInfo` if it has not yet expired relative to `now_unix`.
    pub async fn get(&self, key: &str, now_unix: i64) -> Option<StreamInfo> {
        let guard = self.entries.read().await;
        guard
            .get(key)
            .filter(|info| info.expires_at_unix > now_unix)
            .cloned()
    }

    /// Stores a `StreamInfo` under `key`.
    pub async fn insert(&self, key: String, info: StreamInfo) {
        let mut guard = self.entries.write().await;
        guard.insert(key, info);
    }

    /// Removes all cached stream URLs.
    pub async fn clear(&self) {
        let mut guard = self.entries.write().await;
        guard.clear();
    }
}

#[derive(Debug, Clone)]
struct DiskEntry {
    path: PathBuf,
    size_bytes: u64,
    last_used_seq: u64,
}

/// Bounded on-disk LRU cache for recently played audio files.
#[derive(Debug)]
pub struct LruDiskCache {
    dir: PathBuf,
    max_bytes: u64,
    seq_counter: AtomicU64,
    entries: std::sync::RwLock<HashMap<String, DiskEntry>>,
}

impl LruDiskCache {
    /// Creates a new LRU disk cache in `dir` bounded to `max_bytes`.
    pub fn new(dir: PathBuf, max_bytes: u64) -> Result<Self, AppError> {
        std::fs::create_dir_all(&dir)?;
        let cache = Self {
            dir,
            max_bytes,
            seq_counter: AtomicU64::new(1),
            entries: std::sync::RwLock::new(HashMap::new()),
        };
        cache.scan_existing()?;
        Ok(cache)
    }

    fn scan_existing(&self) -> Result<(), AppError> {
        let mut guard = self
            .entries
            .write()
            .map_err(|e| AppError::Other(format!("LRU lock poisoned: {e}")))?;
        for entry in std::fs::read_dir(&self.dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                let meta = entry.metadata()?;
                let modified_seq = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_nanos() as u64)
                    .unwrap_or_else(|| self.next_seq());
                guard.insert(
                    stem.to_string(),
                    DiskEntry {
                        path,
                        size_bytes: meta.len(),
                        last_used_seq: modified_seq,
                    },
                );
            }
        }
        Ok(())
    }

    fn next_seq(&self) -> u64 {
        self.seq_counter.fetch_add(1, Ordering::SeqCst)
    }

    /// Returns the cached audio file path for `video_id` if present on disk,
    /// updating its LRU recency.
    pub fn get_path(&self, video_id: &str) -> Option<PathBuf> {
        let seq = self.next_seq();
        let mut guard = self.entries.write().ok()?;
        let entry = guard.get_mut(video_id)?;
        if !entry.path.exists() {
            guard.remove(video_id);
            return None;
        }
        entry.last_used_seq = seq;
        Some(entry.path.clone())
    }

    /// Writes `data` for `video_id` with extension `ext`, evicting oldest entries
    /// until total size is within `max_bytes`.
    pub fn put_bytes(&self, video_id: &str, ext: &str, data: &[u8]) -> Result<PathBuf, AppError> {
        let clean_ext = ext.trim_start_matches('.');
        let file_path = self.dir.join(format!("{video_id}.{clean_ext}"));
        std::fs::write(&file_path, data)?;

        let seq = self.next_seq();
        let size_bytes = data.len() as u64;

        let mut guard = self
            .entries
            .write()
            .map_err(|e| AppError::Other(format!("LRU lock poisoned: {e}")))?;
        guard.insert(
            video_id.to_string(),
            DiskEntry {
                path: file_path.clone(),
                size_bytes,
                last_used_seq: seq,
            },
        );

        self.evict_if_needed_locked(&mut guard, Some(video_id));
        Ok(file_path)
    }

    fn evict_if_needed_locked(
        &self,
        guard: &mut HashMap<String, DiskEntry>,
        protected_id: Option<&str>,
    ) {
        if self.max_bytes == 0 {
            return;
        }
        let mut total_bytes: u64 = guard.values().map(|e| e.size_bytes).sum();
        while total_bytes > self.max_bytes {
            let victim = guard
                .iter()
                .filter(|(id, _)| Some(id.as_str()) != protected_id)
                .min_by_key(|(_, entry)| entry.last_used_seq)
                .map(|(id, _)| id.clone());
            let Some(victim_id) = victim else {
                break;
            };
            if let Some(removed) = guard.remove(&victim_id) {
                total_bytes = total_bytes.saturating_sub(removed.size_bytes);
                let _ = std::fs::remove_file(removed.path);
            }
        }
    }

    /// Removes all files from the LRU disk cache and returns total bytes freed.
    pub fn clear(&self) -> Result<u64, AppError> {
        let mut guard = self
            .entries
            .write()
            .map_err(|e| AppError::Other(format!("LRU lock poisoned: {e}")))?;
        let mut freed = 0u64;
        for (_, entry) in guard.drain() {
            freed = freed.saturating_add(entry.size_bytes);
            let _ = std::fs::remove_file(entry.path);
        }
        Ok(freed)
    }

    /// Returns the total bytes currently tracked by the LRU disk cache.
    pub fn total_bytes(&self) -> u64 {
        self.entries
            .read()
            .map(|guard| guard.values().map(|e| e.size_bytes).sum())
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn lru_disk_cache_evicts_oldest_file_when_exceeding_max_bytes() {
        let dir = tempdir().expect("tempdir");
        let cache = LruDiskCache::new(dir.path().to_path_buf(), 8 * 1024).expect("create cache");

        let chunk = vec![0xABu8; 4 * 1024];
        let path_1 = cache.put_bytes("track_1", "webm", &chunk).expect("put track_1");
        let path_2 = cache.put_bytes("track_2", "webm", &chunk).expect("put track_2");

        // Touch track_1 so track_2 becomes the least-recently-used entry.
        assert_eq!(cache.get_path("track_1"), Some(path_1.clone()));

        let path_3 = cache.put_bytes("track_3", "webm", &chunk).expect("put track_3");

        assert!(path_1.exists(), "touched track_1 should remain");
        assert!(!path_2.exists(), "oldest track_2 should be evicted");
        assert!(path_3.exists(), "newly inserted track_3 should remain");
        assert!(cache.total_bytes() <= 8 * 1024);
    }
}
