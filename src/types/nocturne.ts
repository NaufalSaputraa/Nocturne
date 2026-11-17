export interface TrackMetadata {
  video_id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_sec: number;
  thumbnail_url: string;
}

export interface PlaybackSyncPayload {
  position_ms: number;
  duration_ms: number;
  is_playing: boolean;
  is_buffering: boolean;
  server_ts_ms: number;
}

export interface PlaybackSession {
  current_track: TrackMetadata | null;
  position_ms: number;
  queue: TrackMetadata[];
  shuffle: boolean;
  repeat_mode: 'off' | 'all' | 'one' | string;
  autoplay_enabled: boolean;
  volume: number;
}

export interface LyricWord {
  start_time_ms: number;
  end_time_ms: number;
  text: string;
}

export interface LyricLine {
  start_time_ms: number;
  end_time_ms: number;
  text: string;
  words?: LyricWord[];
}

export interface PersistedSettings {
  audio_quality: string;
  normalize_volume: boolean;
  crossfade_sec: number;
  lru_cache_path: string;
  lru_limit_gb: number;
  offline_downloads_path: string;
  discord_rpc_enabled: boolean;
  prefer_ytdlp: boolean;
  close_to_tray: boolean;
}

export interface StorageStats {
  cache_used_bytes: number;
  cache_limit_bytes: number;
  cache_file_count: number;
  cache_path: string;
  downloads_path: string;
  offline_track_count: number;
  offline_total_bytes: number;
}

export interface EngineDiagnostics {
  mpv_active: boolean;
  ytdlp_available: boolean;
  ytdlp_version: string;
  prefer_ytdlp: boolean;
  memory_cache_entries: number;
}

export interface YtmAccountStatus {
  connected: boolean;
  pending_sync_count: number;
}

export interface LyricsPayload {
  lines: LyricLine[];
  source: 'lrclib' | 'ytm' | 'none' | string;
  offset_ms: number;
}

export interface DownloadProgressPayload {
  video_id: string;
  downloaded_bytes: number;
  total_bytes: number | null;
  status: 'downloading' | 'completed' | 'failed' | string;
}

export interface SyncStatusPayload {
  state: 'idle' | 'syncing' | 'synced' | 'warning' | 'error' | string;
  message: string | null;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  source: 'local' | 'ytm' | string;
  ytm_playlist_id: string | null;
  sync_status: string;
  track_count: number;
}

export interface AlbumSummary {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  thumbnail_url: string;
}

export interface ArtistSummary {
  id: string;
  name: string;
  subscribers: string | null;
  thumbnail_url: string;
}

export interface TopResultItem {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  thumbnail_url: string;
  track: TrackMetadata | null;
}

export interface SearchResult {
  top_result: TopResultItem | null;
  songs: TrackMetadata[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
}

export interface OfflineTrackEntry {
  video_id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_sec: number;
  thumbnail_url: string;
  file_path: string;
  file_size_bytes: number;
  quality: string;
}

export interface AppSettings {
  audioQuality: 'opus_160' | 'aac_128' | 'auto';
  loudnessNormalization: boolean;
  crossfadeMs: number;
  lruCacheLimitGb: number;
  offlineDownloadsDir: string;
  discordRpcEnabled: boolean;
  ytmConnected: boolean;
}
