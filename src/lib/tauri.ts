import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  DownloadProgressPayload,
  LyricsPayload,
  OfflineTrackEntry,
  PlaybackSession,
  PlaybackSyncPayload,
  PlaylistSummary,
  SearchResult,
  SyncStatusPayload,
  TrackMetadata,
} from '../types/nocturne';

export function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)
  );
}

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<T>(cmd, args);
}

export const tauriApi = {
  searchCatalog: (query: string) =>
    safeInvoke<SearchResult>('search_catalog', { query }),
  getHomeFeed: () => safeInvoke<TrackMetadata[]>('get_home_feed'),
  getArtistTracks: (artistId: string) =>
    safeInvoke<TrackMetadata[]>('get_artist_tracks', { artistId }),
  playTrack: (track: TrackMetadata) => safeInvoke<void>('play_track', { track }),
  togglePlayback: () => safeInvoke<void>('toggle_playback'),
  seekTo: (positionMs: number) => safeInvoke<void>('seek_to', { positionMs }),
  setVolume: (volume: number) => safeInvoke<void>('set_volume', { volume }),
  setQueue: (queue: TrackMetadata[], currentIndex: number) =>
    safeInvoke<void>('set_queue', { queue, currentIndex }),
  nextTrack: () => safeInvoke<void>('next_track'),
  prevTrack: () => safeInvoke<void>('prev_track'),
  setShuffle: (enabled: boolean) => safeInvoke<void>('set_shuffle', { enabled }),
  setRepeatMode: (mode: string) => safeInvoke<void>('set_repeat_mode', { mode }),
  setAutoplay: (enabled: boolean) => safeInvoke<void>('set_autoplay', { enabled }),
  setNormalization: (enabled: boolean) =>
    safeInvoke<void>('set_normalization', { enabled }),
  setCrossfadeMs: (crossfadeMs: number) =>
    safeInvoke<void>('set_crossfade_ms', { crossfadeMs }),
  restoreSession: () => safeInvoke<PlaybackSession>('restore_session'),
  getSyncedLyrics: (
    videoId: string,
    title: string,
    artist: string,
    durationSec: number,
  ) =>
    safeInvoke<LyricsPayload>('get_synced_lyrics', {
      videoId,
      title,
      artist,
      durationSec,
    }),
  setLyricOffset: (videoId: string, offsetMs: number) =>
    safeInvoke<void>('set_lyric_offset', { videoId, offsetMs }),
  downloadTrack: (track: TrackMetadata, quality: string) =>
    safeInvoke<OfflineTrackEntry>('download_track', { track, quality }),
  downloadPlaylist: (tracks: TrackMetadata[], quality: string) =>
    safeInvoke<OfflineTrackEntry[]>('download_playlist', { tracks, quality }),
  listOfflineTracks: () => safeInvoke<OfflineTrackEntry[]>('list_offline_tracks'),
  removeOfflineTrack: (videoId: string) =>
    safeInvoke<void>('remove_offline_track', { videoId }),
  clearLruCache: () => safeInvoke<number>('clear_lru_cache'),
  updateYtdlpBinary: () => safeInvoke<string>('update_ytdlp_binary'),
  setDiscordRpcEnabled: (enabled: boolean) =>
    safeInvoke<void>('set_discord_rpc_enabled', { enabled }),
  connectYtmAccount: (credential: string) =>
    safeInvoke<void>('connect_ytm_account', { credential }),
  disconnectYtmAccount: () => safeInvoke<void>('disconnect_ytm_account'),
  toggleLikeSong: (track: TrackMetadata, liked: boolean) =>
    safeInvoke<void>('toggle_like_song', { track, liked }),
  listLikedSongs: () => safeInvoke<TrackMetadata[]>('list_liked_songs'),
  listPlaylists: () => safeInvoke<PlaylistSummary[]>('list_playlists'),
  createPlaylist: (name: string, source: string) =>
    safeInvoke<PlaylistSummary>('create_playlist', { name, source }),
  renamePlaylist: (playlistId: number, newName: string) =>
    safeInvoke<void>('rename_playlist', { playlistId, newName }),
  deletePlaylist: (playlistId: number) =>
    safeInvoke<void>('delete_playlist', { playlistId }),
  addTrackToPlaylist: (playlistId: number, track: TrackMetadata) =>
    safeInvoke<void>('add_track_to_playlist', { playlistId, track }),
  removeTrackFromPlaylist: (playlistId: number, videoId: string) =>
    safeInvoke<void>('remove_track_from_playlist', { playlistId, videoId }),
  reconcileYtmSync: () => safeInvoke<void>('reconcile_ytm_sync'),
};

export async function subscribeTauriEvents(handlers: {
  onPlaybackSync?: (payload: PlaybackSyncPayload) => void;
  onTrackChanged?: (track: TrackMetadata | null) => void;
  onQueueUpdated?: (payload: { queue: TrackMetadata[]; current_index: number }) => void;
  onDownloadProgress?: (payload: DownloadProgressPayload) => void;
  onSyncStatus?: (payload: SyncStatusPayload) => void;
}): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const unlisteners: UnlistenFn[] = [];
  if (handlers.onPlaybackSync) {
    unlisteners.push(
      await listen<PlaybackSyncPayload>('playback-sync', (e) =>
        handlers.onPlaybackSync?.(e.payload),
      ),
    );
  }
  if (handlers.onTrackChanged) {
    unlisteners.push(
      await listen<TrackMetadata | null>('track-changed', (e) =>
        handlers.onTrackChanged?.(e.payload),
      ),
    );
  }
  if (handlers.onQueueUpdated) {
    unlisteners.push(
      await listen<{ queue: TrackMetadata[]; current_index: number }>(
        'queue-updated',
        (e) => handlers.onQueueUpdated?.(e.payload),
      ),
    );
  }
  if (handlers.onDownloadProgress) {
    unlisteners.push(
      await listen<DownloadProgressPayload>('download-progress', (e) =>
        handlers.onDownloadProgress?.(e.payload),
      ),
    );
  }
  if (handlers.onSyncStatus) {
    unlisteners.push(
      await listen<SyncStatusPayload>('sync-status', (e) =>
        handlers.onSyncStatus?.(e.payload),
      ),
    );
  }

  return () => {
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}
