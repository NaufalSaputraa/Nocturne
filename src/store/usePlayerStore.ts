import { create } from 'zustand';
import {
  resetClockAnchorForSeek,
  setClockAnchor,
} from '../hooks/usePlaybackClock';
import { subscribeTauriEvents, tauriApi } from '../lib/tauri';
import type {
  AppSettings,
  DownloadProgressPayload,
  LyricsPayload,
  OfflineTrackEntry,
  PlaylistSummary,
  SearchResult,
  SyncStatusPayload,
  TrackMetadata,
} from '../types/nocturne';

interface PlayerStoreState {
  currentTrack: TrackMetadata | null;
  queue: TrackMetadata[];
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  durationMs: number;
  volume: number;
  shuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  autoplayEnabled: boolean;
  lyrics: LyricsPayload;
  playlists: PlaylistSummary[];
  likedSongs: TrackMetadata[];
  offlineTracks: OfflineTrackEntry[];
  downloadProgress: Record<string, DownloadProgressPayload>;
  syncStatus: SyncStatusPayload;
  searchResult: SearchResult | null;
  settings: AppSettings;

  hydrateSession: () => Promise<void>;
  initListeners: () => Promise<() => void>;
  playTrack: (track: TrackMetadata) => Promise<void>;
  togglePlayback: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  setQueue: (queue: TrackMetadata[], index: number) => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  setShuffle: (enabled: boolean) => Promise<void>;
  cycleRepeatMode: () => Promise<void>;
  setAutoplay: (enabled: boolean) => Promise<void>;
  searchCatalog: (query: string) => Promise<void>;
  fetchLyricsForTrack: (track: TrackMetadata) => Promise<void>;
  setLyricOffset: (videoId: string, offsetMs: number) => Promise<void>;
  toggleLikeSong: (track: TrackMetadata) => Promise<void>;
  downloadTrack: (track: TrackMetadata) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export const usePlayerStore = create<PlayerStoreState>((set, get) => ({
  currentTrack: null,
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  isBuffering: false,
  durationMs: 0,
  volume: 0.8,
  shuffle: false,
  repeatMode: 'off',
  autoplayEnabled: true,
  lyrics: { lines: [], source: 'none', offset_ms: 0 },
  playlists: [],
  likedSongs: [],
  offlineTracks: [],
  downloadProgress: {},
  syncStatus: { state: 'idle', message: null },
  searchResult: null,
  settings: {
    audioQuality: 'opus_160',
    loudnessNormalization: true,
    crossfadeMs: 0,
    lruCacheLimitGb: 2,
    offlineDownloadsDir: 'Downloads/Nocturne',
    discordRpcEnabled: true,
    ytmConnected: false,
  },

  hydrateSession: async () => {
    const [session, playlists, liked, offline] = await Promise.all([
      tauriApi.restoreSession(),
      tauriApi.listPlaylists(),
      tauriApi.listLikedSongs(),
      tauriApi.listOfflineTracks(),
    ]);
    if (session) {
      set({
        currentTrack: session.current_track,
        queue: session.queue,
        shuffle: session.shuffle,
        repeatMode:
          session.repeat_mode === 'all' || session.repeat_mode === 'one'
            ? session.repeat_mode
            : 'off',
        autoplayEnabled: session.autoplay_enabled,
        volume: session.volume,
        durationMs: (session.current_track?.duration_sec ?? 0) * 1000,
      });
      setClockAnchor({
        position_ms: session.position_ms,
        duration_ms: (session.current_track?.duration_sec ?? 0) * 1000,
        is_playing: false,
        is_buffering: false,
        server_ts_ms: Date.now(),
      });
    }
    if (playlists) set({ playlists });
    if (liked) set({ likedSongs: liked });
    if (offline) set({ offlineTracks: offline });
  },

  initListeners: async () => {
    return subscribeTauriEvents({
      onPlaybackSync: (payload) => {
        setClockAnchor(payload);
        set({
          isPlaying: payload.is_playing,
          isBuffering: payload.is_buffering,
          durationMs: payload.duration_ms,
        });
      },
      onTrackChanged: (track) => {
        set({
          currentTrack: track,
          durationMs: (track?.duration_sec ?? 0) * 1000,
        });
        if (track) {
          void get().fetchLyricsForTrack(track);
        }
      },
      onQueueUpdated: ({ queue, current_index }) => {
        set({ queue, currentIndex: current_index });
      },
      onDownloadProgress: (payload) => {
        set((state) => ({
          downloadProgress: {
            ...state.downloadProgress,
            [payload.video_id]: payload,
          },
        }));
        if (payload.status === 'completed') {
          void tauriApi.listOfflineTracks().then((list) => {
            if (list) set({ offlineTracks: list });
          });
        }
      },
      onSyncStatus: (syncStatus) => {
        set({ syncStatus });
      },
    });
  },

  playTrack: async (track) => {
    set({
      currentTrack: track,
      isPlaying: true,
      durationMs: track.duration_sec * 1000,
    });
    resetClockAnchorForSeek(0);
    await tauriApi.playTrack(track);
    void get().fetchLyricsForTrack(track);
  },

  togglePlayback: async () => {
    set((s) => ({ isPlaying: !s.isPlaying }));
    await tauriApi.togglePlayback();
  },

  seekTo: async (positionMs) => {
    resetClockAnchorForSeek(positionMs);
    await tauriApi.seekTo(positionMs);
  },

  setVolume: async (volume) => {
    set({ volume });
    await tauriApi.setVolume(volume);
  },

  setQueue: async (queue, index) => {
    set({ queue, currentIndex: index });
    await tauriApi.setQueue(queue, index);
  },

  nextTrack: async () => {
    await tauriApi.nextTrack();
  },

  prevTrack: async () => {
    await tauriApi.prevTrack();
  },

  setShuffle: async (enabled) => {
    set({ shuffle: enabled });
    await tauriApi.setShuffle(enabled);
  },

  cycleRepeatMode: async () => {
    const next =
      get().repeatMode === 'off'
        ? 'all'
        : get().repeatMode === 'all'
          ? 'one'
          : 'off';
    set({ repeatMode: next });
    await tauriApi.setRepeatMode(next);
  },

  setAutoplay: async (enabled) => {
    set({ autoplayEnabled: enabled });
    await tauriApi.setAutoplay(enabled);
  },

  searchCatalog: async (query) => {
    const res = await tauriApi.searchCatalog(query);
    if (res) set({ searchResult: res });
  },

  fetchLyricsForTrack: async (track) => {
    const lyrics = await tauriApi.getSyncedLyrics(
      track.video_id,
      track.title,
      track.artist,
      track.duration_sec,
    );
    if (lyrics) set({ lyrics });
  },

  setLyricOffset: async (videoId, offsetMs) => {
    set((s) => ({ lyrics: { ...s.lyrics, offset_ms: offsetMs } }));
    await tauriApi.setLyricOffset(videoId, offsetMs);
  },

  toggleLikeSong: async (track) => {
    const exists = get().likedSongs.some((t) => t.video_id === track.video_id);
    const liked = !exists;
    set((s) => ({
      likedSongs: liked
        ? [track, ...s.likedSongs]
        : s.likedSongs.filter((t) => t.video_id !== track.video_id),
    }));
    await tauriApi.toggleLikeSong(track, liked);
  },

  downloadTrack: async (track) => {
    const quality = get().settings.audioQuality;
    await tauriApi.downloadTrack(track, quality);
  },

  updateSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    if (typeof patch.loudnessNormalization === 'boolean') {
      void tauriApi.setNormalization(patch.loudnessNormalization);
    }
    if (typeof patch.crossfadeMs === 'number') {
      void tauriApi.setCrossfadeMs(patch.crossfadeMs);
    }
    if (typeof patch.discordRpcEnabled === 'boolean') {
      void tauriApi.setDiscordRpcEnabled(patch.discordRpcEnabled);
    }
  },
}));
