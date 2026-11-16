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

export interface LyricLine {
  start_time_ms: number;
  end_time_ms: number;
  text: string;
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
