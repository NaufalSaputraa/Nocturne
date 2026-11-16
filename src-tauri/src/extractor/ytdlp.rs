use std::path::PathBuf;
use std::process::Stdio;
use async_trait::async_trait;
use tokio::process::Command;

use crate::extractor::cache::STREAM_TTL_SECS;
use crate::extractor::stream::FallbackStreamProvider;
use crate::models::{AppError, StreamInfo, StreamSource};

/// Sidecar wrapper around `yt-dlp` used strictly as a fallback stream resolver
/// and updater when `rustypipe` fails (e.g., YouTube cipher/signature updates).
#[derive(Debug, Clone)]
pub struct YtdlpSidecar {
    binary_path: PathBuf,
}

impl YtdlpSidecar {
    /// Creates a sidecar pointing to a specific `yt-dlp` executable path.
    pub fn new(binary_path: PathBuf) -> Self {
        Self { binary_path }
    }

    /// Resolves the default `yt-dlp` executable from `resource_dir/binaries` if present,
    /// otherwise falls back to `yt-dlp` on `PATH`.
    pub fn resolve_default(resource_dir: Option<&std::path::Path>) -> Self {
        let exe_name = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
        if let Some(dir) = resource_dir {
            let bundled = dir.join("binaries").join(exe_name);
            if bundled.exists() {
                return Self::new(bundled);
            }
            let direct = dir.join(exe_name);
            if direct.exists() {
                return Self::new(direct);
            }
        }
        Self::new(PathBuf::from(exe_name))
    }

    fn format_selector(quality: &str) -> &'static str {
        match quality {
            "opus_160" | "high" | "auto" => "bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio",
            "aac_128" | "medium" => "bestaudio[ext=m4a]/bestaudio",
            _ => "bestaudio[ext=webm]/bestaudio",
        }
    }

    /// Runs `yt-dlp -U` to update the sidecar binary in-place and returns the output summary.
    pub async fn update_ytdlp_binary(&self) -> Result<String, AppError> {
        let mut cmd = Command::new(&self.binary_path);
        cmd.arg("-U")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let output = cmd.output().await.map_err(|e| {
            AppError::Extraction(format!(
                "Failed to execute yt-dlp updater ({}): {e}",
                self.binary_path.display()
            ))
        })?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if !output.status.success() {
            return Err(AppError::Extraction(format!(
                "yt-dlp -U failed: {stderr}"
            )));
        }

        Ok(if stdout.is_empty() { stderr } else { stdout })
    }
}

#[async_trait]
impl FallbackStreamProvider for YtdlpSidecar {
    async fn fetch_stream(&self, video_id: &str, quality: &str) -> Result<StreamInfo, AppError> {
        let target_url = format!("https://music.youtube.com/watch?v={video_id}");
        let mut cmd = Command::new(&self.binary_path);
        cmd.args([
            "-f",
            Self::format_selector(quality),
            "-g",
            "--no-playlist",
            "--no-warnings",
            &target_url,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let output = cmd.output().await.map_err(|e| {
            AppError::Extraction(format!(
                "yt-dlp fallback failed to launch ({}): {e}",
                self.binary_path.display()
            ))
        })?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Extraction(format!(
                "yt-dlp exited with error for {video_id}: {}",
                err.trim()
            )));
        }

        let url = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .map(str::trim)
            .unwrap_or_default()
            .to_string();

        if url.is_empty() {
            return Err(AppError::Extraction(format!(
                "yt-dlp returned empty stream URL for {video_id}"
            )));
        }

        let now = chrono::Utc::now().timestamp();
        Ok(StreamInfo {
            video_id: video_id.to_string(),
            url,
            format: if quality.contains("aac") {
                "m4a".to_string()
            } else {
                "opus".to_string()
            },
            perceptual_loudness_db: None,
            source: StreamSource::YtdlpFallback,
            expires_at_unix: now + STREAM_TTL_SECS,
        })
    }
}
