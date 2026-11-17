use async_trait::async_trait;
use rustypipe::client::RustyPipe;
use serde::Deserialize;
use sqlx::{Row, SqlitePool};

use crate::models::{AppError, LyricLine, LyricWord, LyricsPayload};

/// Abstraction over synced LRC lyrics provider (LRCLIB).
#[async_trait]
pub trait LrcProvider: Send + Sync {
    async fn fetch_lrc(
        &self,
        title: &str,
        artist: &str,
        duration_sec: u64,
    ) -> Result<Option<String>, AppError>;
}

/// Abstraction over plain/synced YouTube Music fallback lyrics provider.
#[async_trait]
pub trait YtmLyricsProvider: Send + Sync {
    async fn fetch_ytm_lyrics(&self, video_id: &str) -> Result<Option<Vec<LyricLine>>, AppError>;
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibResponse {
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
}

/// Live LRCLIB HTTP client (`https://lrclib.net/api/get`).
pub struct ReqwestLrcProvider {
    http: reqwest::Client,
}

impl ReqwestLrcProvider {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::builder()
                .user_agent("Nocturne/0.1.0 (https://github.com/nocturne)")
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }
}

impl Default for ReqwestLrcProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LrcProvider for ReqwestLrcProvider {
    async fn fetch_lrc(
        &self,
        title: &str,
        artist: &str,
        duration_sec: u64,
    ) -> Result<Option<String>, AppError> {
        let resp = self
            .http
            .get("https://lrclib.net/api/get")
            .query(&[
                ("track_name", title),
                ("artist_name", artist),
                ("duration", &duration_sec.to_string()),
            ])
            .send()
            .await?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            return Ok(None);
        }

        let body: LrclibResponse = resp.json().await?;
        if let Some(synced) = body.synced_lyrics.filter(|s| !s.trim().is_empty()) {
            return Ok(Some(synced));
        }
        let _ = body.plain_lyrics;
        Ok(None)
    }
}

/// Live YouTube Music fallback lyrics provider backed by `rustypipe`.
pub struct RustypipeYtmLyricsProvider {
    client: RustyPipe,
}

impl RustypipeYtmLyricsProvider {
    pub fn new() -> Self {
        Self {
            client: RustyPipe::new(),
        }
    }
}

impl Default for RustypipeYtmLyricsProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl YtmLyricsProvider for RustypipeYtmLyricsProvider {
    async fn fetch_ytm_lyrics(&self, video_id: &str) -> Result<Option<Vec<LyricLine>>, AppError> {
        let details = self
            .client
            .query()
            .music_details(video_id)
            .await
            .map_err(|e| AppError::Lyrics(format!("music_details failed: {e}")))?;

        let Some(lyrics_id) = details.lyrics_id else {
            return Ok(None);
        };
        let lyrics = self
            .client
            .query()
            .music_lyrics(lyrics_id)
            .await
            .map_err(|e| AppError::Lyrics(format!("music_lyrics failed: {e}")))?;

        let raw_lines: Vec<String> = lyrics
            .body
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        if raw_lines.is_empty() {
            return Ok(None);
        }

        let dur_ms = (details.track.duration.unwrap_or(180) as u64).saturating_mul(1000);
        let step = (dur_ms / raw_lines.len() as u64).max(1);
        let lines = raw_lines
            .into_iter()
            .enumerate()
            .map(|(i, text)| {
                let start = (i as u64) * step;
                let end = ((i as u64 + 1) * step).min(dur_ms.max(start + step));
                LyricLine {
                    start_time_ms: start,
                    end_time_ms: end,
                    text,
                    words: None,
                }
            })
            .collect();

        Ok(Some(lines))
    }
}

fn parse_lrc_timestamp(tag: &str) -> Option<u64> {
    let mut parts = tag.split(':');
    let mins: u64 = parts.next()?.trim().parse().ok()?;
    let sec_part = parts.next()?.trim();
    let (secs, frac_ms) = if let Some((s, frac)) = sec_part.split_once('.') {
        let s: u64 = s.parse().ok()?;
        let frac_ms: u64 = match frac.len() {
            0 => 0,
            1 => frac.parse::<u64>().ok()? * 100,
            2 => frac.parse::<u64>().ok()? * 10,
            _ => frac[..3].parse::<u64>().ok()?,
        };
        (s, frac_ms)
    } else {
        (sec_part.parse::<u64>().ok()?, 0)
    };
    Some(mins * 60_000 + secs * 1_000 + frac_ms)
}

/// Parses Enhanced LRC inline `<mm:ss.xx>` word timestamps if present, returning
/// `(clean_text, Some(words))` or `(raw_text, None)`.
fn parse_enhanced_words(raw: &str, line_start_ms: u64, line_end_ms: u64) -> (String, Option<Vec<LyricWord>>) {
    if !raw.contains('<') {
        return (raw.to_string(), None);
    }

    let mut clean = String::with_capacity(raw.len());
    let mut segments: Vec<(u64, String)> = Vec::new();
    let mut current_ts = line_start_ms;
    let mut rest = raw;

    while let Some(open) = rest.find('<') {
        let before = &rest[..open];
        if !before.is_empty() {
            clean.push_str(before);
            segments.push((current_ts, before.to_string()));
        }
        let after_open = &rest[open + 1..];
        if let Some(close) = after_open.find('>') {
            let tag = &after_open[..close];
            if let Some(ts) = parse_lrc_timestamp(tag) {
                current_ts = ts;
                rest = &after_open[close + 1..];
                continue;
            }
        }
        clean.push('<');
        rest = after_open;
    }
    if !rest.is_empty() {
        clean.push_str(rest);
        segments.push((current_ts, rest.to_string()));
    }

    let trimmed_clean = clean.trim().to_string();
    if segments.is_empty() {
        return (trimmed_clean, None);
    }

    let mut words = Vec::with_capacity(segments.len());
    for i in 0..segments.len() {
        let (start, txt) = &segments[i];
        let end = if i + 1 < segments.len() {
            segments[i + 1].0.max(*start + 1)
        } else {
            line_end_ms.max(*start + 1)
        };
        words.push(LyricWord {
            start_time_ms: *start,
            end_time_ms: end,
            text: txt.clone(),
        });
    }
    (trimmed_clean, Some(words))
}

/// Parses an LRC string into `LyricLine` entries, computing `end_time_ms` from the
/// subsequent line's timestamp (or `duration_sec * 1000` for the final line).
pub fn parse_lrc(lrc: &str, duration_sec: u64) -> Vec<LyricLine> {
    let mut parsed: Vec<(u64, String)> = Vec::new();
    for raw_line in lrc.lines() {
        let mut rest = raw_line.trim();
        let mut timestamps = Vec::new();
        while rest.starts_with('[') {
            let Some(close_idx) = rest.find(']') else {
                break;
            };
            let tag = &rest[1..close_idx];
            if let Some(ms) = parse_lrc_timestamp(tag) {
                timestamps.push(ms);
                rest = rest[close_idx + 1..].trim_start();
            } else {
                break;
            }
        }
        let text = rest.trim().to_string();
        if !timestamps.is_empty() && !text.is_empty() {
            for ts in timestamps {
                parsed.push((ts, text.clone()));
            }
        }
    }

    parsed.sort_by_key(|(ts, _)| *ts);
    let total_ms = duration_sec.saturating_mul(1000);
    let mut out = Vec::with_capacity(parsed.len());
    for i in 0..parsed.len() {
        let (start_time_ms, raw_text) = parsed[i].clone();
        let end_time_ms = if i + 1 < parsed.len() {
            parsed[i + 1].0.max(start_time_ms)
        } else {
            total_ms.max(start_time_ms)
        };
        let (text, words) = parse_enhanced_words(&raw_text, start_time_ms, end_time_ms);
        out.push(LyricLine {
            start_time_ms,
            end_time_ms,
            text,
            words,
        });
    }
    out
}

/// Persists a per-track manual lyric timing offset (`± ms`) into SQLite `lyric_offsets`.
pub async fn set_lyric_offset(
    pool: &SqlitePool,
    video_id: &str,
    offset_ms: i64,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO lyric_offsets (video_id, offset_ms, updated_at)
        VALUES (?1, ?2, CURRENT_TIMESTAMP)
        ON CONFLICT(video_id) DO UPDATE SET
            offset_ms = excluded.offset_ms,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(video_id)
    .bind(offset_ms)
    .execute(pool)
    .await?;
    Ok(())
}

async fn load_lyric_offset(pool: &SqlitePool, video_id: &str) -> Result<i64, AppError> {
    let row = sqlx::query("SELECT offset_ms FROM lyric_offsets WHERE video_id = ?1")
        .bind(video_id)
        .fetch_optional(pool)
        .await?;
    Ok(match row {
        Some(r) => r.try_get::<i64, _>("offset_ms")?,
        None => 0,
    })
}

/// Fetches synced lyrics from LRCLIB first, falling back to YTM lyrics on miss/error,
/// and attaches the persisted `lyric_offsets` value from SQLite.
pub async fn get_synced_lyrics(
    pool: &SqlitePool,
    lrc_client: &impl LrcProvider,
    ytm_lyrics: &impl YtmLyricsProvider,
    video_id: &str,
    title: &str,
    artist: &str,
    duration_sec: u64,
) -> Result<LyricsPayload, AppError> {
    let offset_ms = load_lyric_offset(pool, video_id).await.unwrap_or(0);

    if let Ok(Some(lrc)) = lrc_client.fetch_lrc(title, artist, duration_sec).await {
        let lines = parse_lrc(&lrc, duration_sec);
        if !lines.is_empty() {
            return Ok(LyricsPayload {
                lines,
                source: "lrclib".to_string(),
                offset_ms,
            });
        }
    }

    if let Ok(Some(lines)) = ytm_lyrics.fetch_ytm_lyrics(video_id).await {
        if !lines.is_empty() {
            return Ok(LyricsPayload {
                lines,
                source: "ytm".to_string(),
                offset_ms,
            });
        }
    }

    Ok(LyricsPayload {
        lines: Vec::new(),
        source: "none".to_string(),
        offset_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::sqlite::init_db;
    use tempfile::tempdir;

    struct MissLrc;

    #[async_trait]
    impl LrcProvider for MissLrc {
        async fn fetch_lrc(
            &self,
            _title: &str,
            _artist: &str,
            _duration_sec: u64,
        ) -> Result<Option<String>, AppError> {
            Ok(None)
        }
    }

    struct MockYtm;

    #[async_trait]
    impl YtmLyricsProvider for MockYtm {
        async fn fetch_ytm_lyrics(
            &self,
            _video_id: &str,
        ) -> Result<Option<Vec<LyricLine>>, AppError> {
            Ok(Some(vec![LyricLine {
                start_time_ms: 0,
                end_time_ms: 5_000,
                text: "Fallback YTM lyric line".to_string(),
                words: None,
            }]))
        }
    }

    #[test]
    fn parse_lrc_computes_end_times_from_next_line_and_track_duration() {
        let lrc = "[00:10.50]Line 1\n[00:15.00]Line 2";
        let lines = parse_lrc(lrc, 30);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].start_time_ms, 10_500);
        assert_eq!(lines[0].end_time_ms, 15_000);
        assert_eq!(lines[0].text, "Line 1");
        assert_eq!(lines[1].start_time_ms, 15_000);
        assert_eq!(lines[1].end_time_ms, 30_000);
        assert_eq!(lines[1].text, "Line 2");
    }

    #[tokio::test]
    async fn lrclib_miss_falls_back_to_ytm_lyrics_and_applies_persisted_offset() {
        let dir = tempdir().expect("tempdir");
        let pool = init_db(&dir.path().join("lyrics.db"))
            .await
            .expect("init_db");

        set_lyric_offset(&pool, "vid1", -250)
            .await
            .expect("set_lyric_offset");

        let payload = get_synced_lyrics(
            &pool,
            &MissLrc,
            &MockYtm,
            "vid1",
            "Title",
            "Artist",
            180,
        )
        .await
        .expect("get_synced_lyrics");

        assert_eq!(payload.source, "ytm");
        assert_eq!(payload.offset_ms, -250);
        assert_eq!(payload.lines.len(), 1);
    }
}
