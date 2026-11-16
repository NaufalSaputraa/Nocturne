import { useCallback, useEffect, useState } from 'react';
import {
  computeClockTimeMs,
  getClockAnchor,
  resetClockAnchorForSeek,
  setClockAnchor,
} from './hooks/usePlaybackClock';
import {
  isTauriRuntime,
  subscribeTauriEvents,
  tauriApi,
} from './lib/tauri';
import { Titlebar } from './components/layout/Titlebar';
import { Sidebar, type NavSection } from './components/layout/Sidebar';
import { RightPanel } from './components/layout/RightPanel';
import { PlayerDock } from './components/layout/PlayerDock';
import { HomeView } from './views/HomeView';
import { SearchView } from './views/SearchView';
import { PlaylistDetailView } from './views/PlaylistDetailView';
import { ZenLyricsView } from './views/ZenLyricsView';
import {
  SettingsModal,
  type NocturneSettings,
  type SettingsTab,
} from './components/modals/SettingsModal';
import {
  DEMO_ALBUMS,
  DEMO_ARTISTS,
  DEMO_PLAYLISTS,
  DEMO_TRACKS,
  DEMO_ZEN_LYRICS,
  type DemoPlaylist,
  type DemoTrack,
} from './data/mockLibrary';

type ActiveRoute =
  | { kind: 'nav'; section: NavSection }
  | { kind: 'search' }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'lyrics' };

function routesEqual(a: ActiveRoute, b: ActiveRoute): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'nav' && b.kind === 'nav') return a.section === b.section;
  if (a.kind === 'playlist' && b.kind === 'playlist')
    return a.playlistId === b.playlistId;
  return true;
}

export function App() {
  const [tracks, setTracks] = useState<DemoTrack[]>(DEMO_TRACKS);
  const [playlists, setPlaylists] = useState<DemoPlaylist[]>(DEMO_PLAYLISTS);
  const [history, setHistory] = useState<ActiveRoute[]>([
    { kind: 'nav', section: 'home' },
  ]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'queue' | 'lyrics'>('queue');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('audio');
  const [ipcError, setIpcError] = useState<string | null>(null);
  const [bannerSaved, setBannerSaved] = useState(false);

  const [activeTrackId, setActiveTrackId] = useState<string>(DEMO_TRACKS[0].video_id);
  const [playHistoryIds, setPlayHistoryIds] = useState<string[]>([
    DEMO_TRACKS[0].video_id,
    DEMO_TRACKS[1].video_id,
  ]);
  const [queueIds, setQueueIds] = useState<string[]>(
    DEMO_TRACKS.slice(1, 7).map((t) => t.video_id),
  );
  const [clearedQueueBackup, setClearedQueueBackup] = useState<string[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeMs, setCurrentTimeMs] = useState(84_000);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('all');
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [volume, setVolume] = useState(0.65);
  const [muted, setMuted] = useState(false);
  const [lyricOffsetMs, setLyricOffsetMs] = useState(0);

  const [settings, setSettings] = useState<NocturneSettings>({
    audioQuality: 'Opus 160kbps',
    normalizeVolume: true,
    crossfadeSec: 4,
    lruCachePath: 'C:\\Users\\Naufal\\Music\\NocturneCache',
    lruLimitGb: 5.0,
    offlineDownloadsPath: 'C:\\Users\\Naufal\\Music\\NocturneOffline',
    discordRpcEnabled: true,
    ytmConnected: true,
  });

  const route = history[historyIdx];
  const currentTrack =
    tracks.find((t) => t.video_id === activeTrackId) ?? tracks[0];
  const durationMs = currentTrack.duration_sec * 1000;

  const queueTracks = queueIds
    .map((id) => tracks.find((t) => t.video_id === id))
    .filter((t): t is DemoTrack => Boolean(t));

  const pushRoute = useCallback(
    (nextRoute: ActiveRoute) => {
      if (routesEqual(history[historyIdx], nextRoute)) return;
      const sliced = history.slice(0, historyIdx + 1);
      setHistory([...sliced, nextRoute]);
      setHistoryIdx(sliced.length);
    },
    [history, historyIdx],
  );

  // Hydrate SQLite session & subscribe to Rust backend events in Tauri runtime
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const [session, feed, liked, offline] = await Promise.all([
        tauriApi.restoreSession(),
        tauriApi.getHomeFeed(),
        tauriApi.listLikedSongs(),
        tauriApi.listOfflineTracks(),
      ]);

      if (feed && feed.length > 0) {
        const likedSet = new Set((liked ?? []).map((t) => t.video_id));
        const offlineSet = new Set((offline ?? []).map((t) => t.video_id));
        setTracks(
          feed.map((t) => ({
            ...t,
            album: t.album ?? 'Single',
            year: new Date().getFullYear(),
            date_added: 'Today',
            accentColor: '#F43F5E',
            liked: likedSet.has(t.video_id),
            offline: offlineSet.has(t.video_id),
          })),
        );
      }

      if (session) {
        if (session.current_track) {
          setActiveTrackId(session.current_track.video_id);
        }
        setCurrentTimeMs(session.position_ms);
        setShuffle(session.shuffle);
        setRepeatMode(
          session.repeat_mode === 'all' || session.repeat_mode === 'one'
            ? session.repeat_mode
            : 'off',
        );
        setAutoplayEnabled(session.autoplay_enabled);
        setVolume(session.volume);
        setIsPlaying(false);
        setClockAnchor({
          position_ms: session.position_ms,
          duration_ms: (session.current_track?.duration_sec ?? 0) * 1000,
          is_playing: false,
          is_buffering: false,
          server_ts_ms: Date.now(),
        });
      }

      unlisten = await subscribeTauriEvents({
        onPlaybackSync: (payload) => {
          setClockAnchor(payload);
          setIsPlaying(payload.is_playing);
          setCurrentTimeMs(payload.position_ms);
        },
        onTrackChanged: (track) => {
          if (!track) return;
          setActiveTrackId(track.video_id);
          setTracks((prev) =>
            prev.some((t) => t.video_id === track.video_id)
              ? prev
              : [
                  {
                    ...track,
                    album: track.album ?? 'Single',
                    year: new Date().getFullYear(),
                    date_added: 'Today',
                    accentColor: '#F43F5E',
                    liked: false,
                    offline: false,
                  },
                  ...prev,
                ],
          );
        },
        onQueueUpdated: ({ queue }) => {
          setQueueIds(queue.map((t) => t.video_id));
        },
      });
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  // Smooth requestAnimationFrame clock: uses rAF anchor interpolation in Tauri runtime,
  // and local preview clock in browser/Vitest mode.
  useEffect(() => {
    if (!isPlaying) return;
    let frameId = 0;
    let lastNow = performance.now();

    const tick = (now: number) => {
      if (isTauriRuntime()) {
        setCurrentTimeMs(computeClockTimeMs(getClockAnchor(), now));
      } else {
        const dt = now - lastNow;
        lastNow = now;
        setCurrentTimeMs((prev) => {
          const next = prev + dt;
          return next >= durationMs ? 0 : next;
        });
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, durationMs]);

  // Global keyboard shortcuts (Space, ArrowLeft/Right, M, L)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || settingsOpen) {
        return;
      }
      if (e.code === 'Space') {
        if (target?.closest('button, [role="button"], [role="slider"], a')) return;
        e.preventDefault();
        setIsPlaying((p) => !p);
        void tauriApi.togglePlayback().catch((err) => setIpcError(String(err)));
      } else if (e.key === 'ArrowRight') {
        if (target?.closest('[role="slider"], input[type="range"]')) return;
        e.preventDefault();
        const nextPos = Math.min(durationMs, currentTimeMs + 5_000);
        setCurrentTimeMs(nextPos);
        resetClockAnchorForSeek(nextPos);
        void tauriApi.seekTo(nextPos).catch((err) => setIpcError(String(err)));
      } else if (e.key === 'ArrowLeft') {
        if (target?.closest('[role="slider"], input[type="range"]')) return;
        e.preventDefault();
        const nextPos = Math.max(0, currentTimeMs - 5_000);
        setCurrentTimeMs(nextPos);
        resetClockAnchorForSeek(nextPos);
        void tauriApi.seekTo(nextPos).catch((err) => setIpcError(String(err)));
      } else if (e.key.toLowerCase() === 'm') {
        setMuted((m) => {
          const next = !m;
          void tauriApi.setVolume(next ? 0 : volume).catch((err) => setIpcError(String(err)));
          return next;
        });
      } else if (e.key.toLowerCase() === 'l') {
        if (route.kind === 'lyrics') {
          if (historyIdx > 0) setHistoryIdx(historyIdx - 1);
        } else {
          pushRoute({ kind: 'lyrics' });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTimeMs, durationMs, historyIdx, pushRoute, route.kind, settingsOpen, volume]);

  const recordTrackPlay = (videoId: string) => {
    setPlayHistoryIds((prev) => [videoId, ...prev.filter((id) => id !== videoId)]);
  };

  const handlePlayTrack = (track: DemoTrack) => {
    setActiveTrackId(track.video_id);
    recordTrackPlay(track.video_id);
    setCurrentTimeMs(0);
    setIsPlaying(true);
    resetClockAnchorForSeek(0);
    void tauriApi.playTrack(track);
  };

  const handlePlayAll = (list: DemoTrack[]) => {
    if (list.length === 0) return;
    setActiveTrackId(list[0].video_id);
    recordTrackPlay(list[0].video_id);
    setQueueIds(list.slice(1).map((t) => t.video_id));
    setClearedQueueBackup(null);
    setCurrentTimeMs(0);
    setIsPlaying(true);
    resetClockAnchorForSeek(0);
    void tauriApi.setQueue(list, 0);
    void tauriApi.playTrack(list[0]);
  };

  const handleToggleLike = (videoId: string) => {
    const target = tracks.find((t) => t.video_id === videoId);
    const nextLiked = target ? !target.liked : true;
    setTracks((prev) =>
      prev.map((t) => (t.video_id === videoId ? { ...t, liked: nextLiked } : t)),
    );
    if (target) {
      void tauriApi.toggleLikeSong(target, nextLiked);
    }
  };

  const handleToggleOffline = (videoId: string) => {
    const target = tracks.find((t) => t.video_id === videoId);
    const nextOffline = target ? !target.offline : true;
    setTracks((prev) =>
      prev.map((t) => (t.video_id === videoId ? { ...t, offline: nextOffline } : t)),
    );
    if (target) {
      if (nextOffline) {
        void tauriApi.downloadTrack(
          target,
          settings.audioQuality.toLowerCase().includes('m4a') ? 'aac_128' : 'opus_160',
        );
      } else {
        void tauriApi.removeOfflineTrack(videoId);
      }
    }
  };

  const handleSeek = (posMs: number) => {
    setCurrentTimeMs(posMs);
    resetClockAnchorForSeek(posMs);
    void tauriApi.seekTo(posMs);
  };

  const handleTogglePlay = () => {
    setIsPlaying((p) => !p);
    void tauriApi.togglePlayback();
  };

  const handleNext = () => {
    if (queueTracks.length > 0) {
      const [nextTrack, ...rest] = queueTracks;
      setActiveTrackId(nextTrack.video_id);
      recordTrackPlay(nextTrack.video_id);
      setQueueIds(rest.map((t) => t.video_id));
      setCurrentTimeMs(0);
      setIsPlaying(true);
      return;
    }
    const idx = tracks.findIndex((t) => t.video_id === activeTrackId);
    const next = tracks[(idx + 1) % tracks.length];
    handlePlayTrack(next);
  };

  const handlePrev = () => {
    if (currentTimeMs > 3000) {
      setCurrentTimeMs(0);
      return;
    }
    const idx = tracks.findIndex((t) => t.video_id === activeTrackId);
    const prev = tracks[(idx - 1 + tracks.length) % tracks.length];
    handlePlayTrack(prev);
  };

  const handleCreatePlaylist = (name: string, source: 'local' | 'ytm') => {
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const created: DemoPlaylist = {
      id,
      name,
      description:
        source === 'ytm'
          ? 'Synced with your YouTube Music library.'
          : 'Saved in your local library.',
      source,
      curator: source === 'ytm' ? 'YouTube Music' : 'Local Library',
      cover_url: tracks[0].thumbnail_url,
      tracks: [currentTrack.video_id],
    };
    setPlaylists((prev) => [...prev, created]);
    pushRoute({ kind: 'playlist', playlistId: id });
  };

  if (route.kind === 'lyrics') {
    return (
      <>
        <ZenLyricsView
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          currentTimeMs={currentTimeMs}
          durationMs={durationMs}
          shuffle={shuffle}
          repeatMode={repeatMode}
          upNext={queueTracks}
          lyrics={DEMO_ZEN_LYRICS}
          lyricSource="LRCLIB"
          lyricOffsetMs={lyricOffsetMs}
          onBack={() =>
            historyIdx > 0
              ? setHistoryIdx(historyIdx - 1)
              : pushRoute({ kind: 'nav', section: 'home' })
          }
          onOpenFullQueue={() => {
            setRightPanelTab('queue');
            setShowRightPanel(true);
            if (historyIdx > 0) {
              setHistoryIdx(historyIdx - 1);
            } else {
              pushRoute({ kind: 'nav', section: 'home' });
            }
          }}
          onTogglePlay={handleTogglePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          onToggleShuffle={() => {
            setShuffle((s) => {
              const next = !s;
              void tauriApi.setShuffle(next);
              return next;
            });
          }}
          onCycleRepeat={() =>
            setRepeatMode((r) => {
              const next = r === 'off' ? 'all' : r === 'all' ? 'one' : 'off';
              void tauriApi.setRepeatMode(next);
              return next;
            })
          }
          onToggleLike={handleToggleLike}
          onSeekMs={handleSeek}
          onSelectTrack={handlePlayTrack}
          onAdjustOffsetMs={(delta) =>
            setLyricOffsetMs((v) => {
              const next = v + delta;
              void tauriApi.setLyricOffset(currentTrack.video_id, next);
              return next;
            })
          }
        />
        <SettingsModal
          open={settingsOpen}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={setSettings}
        />
      </>
    );
  }

  const activeNav =
    route.kind === 'nav'
      ? route.section
      : route.kind === 'playlist'
        ? 'playlist'
        : 'search';

  const activePlaylist =
    route.kind === 'playlist'
      ? playlists.find((p) => p.id === route.playlistId) ?? playlists[0]
      : null;

  const getSectionTracks = (section: NavSection): DemoTrack[] => {
    if (section === 'liked') return tracks.filter((t) => t.liked);
    if (section === 'offline') return tracks.filter((t) => t.offline);
    if (section === 'history') {
      return playHistoryIds
        .map((id) => tracks.find((t) => t.video_id === id))
        .filter((t): t is DemoTrack => Boolean(t));
    }
    if (section === 'explore') return tracks.slice(4);
    if (section === 'trending') return [...tracks].reverse();
    return tracks;
  };

  return (
    <div className="h-screen w-screen bg-[#121212] text-[#FAFAFA] flex flex-col overflow-hidden">
      <Titlebar
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          if (route.kind !== 'search' && q.trim().length > 0) {
            pushRoute({ kind: 'search' });
          }
        }}
        onSearchSubmit={() => pushRoute({ kind: 'search' })}
        canGoBack={historyIdx > 0}
        canGoForward={historyIdx < history.length - 1}
        onBack={() => setHistoryIdx((i) => Math.max(0, i - 1))}
        onForward={() => setHistoryIdx((i) => Math.min(history.length - 1, i + 1))}
        onOpenSettings={() => {
          setSettingsTab('audio');
          setSettingsOpen(true);
        }}
        ytmConnected={settings.ytmConnected}
        onToggleYtmProfile={() => {
          setSettingsTab('account');
          setSettingsOpen(true);
        }}
      />

      {ipcError && (
        <div
          role="alert"
          className="px-6 py-2 bg-[#F43F5E]/15 border-b border-[#F43F5E]/40 text-xs text-[#FAFAFA] flex items-center justify-between gap-4 shrink-0"
        >
          <span className="truncate">{ipcError}</span>
          <button
            type="button"
            onClick={() => setIpcError(null)}
            className="text-xs font-medium text-[#F43F5E] hover:underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          activeNav={activeNav}
          activePlaylistId={route.kind === 'playlist' ? route.playlistId : null}
          playlists={playlists}
          offlineCount={tracks.filter((t) => t.offline).length}
          ytmConnected={settings.ytmConnected}
          onSelectNav={(section) => pushRoute({ kind: 'nav', section })}
          onSelectPlaylist={(playlistId) => pushRoute({ kind: 'playlist', playlistId })}
          onCreatePlaylist={handleCreatePlaylist}
        />

        <main className="flex-1 overflow-y-auto p-6 bg-[#121212]">
          {route.kind === 'search' && (
            <SearchView
              query={searchQuery}
              tracks={tracks}
              albums={DEMO_ALBUMS}
              artists={DEMO_ARTISTS}
              playlists={playlists}
              onPlayTrack={handlePlayTrack}
              onPlayAll={handlePlayAll}
              onToggleLike={handleToggleLike}
              onSelectPlaylist={(playlistId) =>
                pushRoute({ kind: 'playlist', playlistId })
              }
              onClearSearch={() => setSearchQuery('')}
            />
          )}

          {route.kind === 'playlist' && activePlaylist && (
            <PlaylistDetailView
              playlist={activePlaylist}
              tracks={activePlaylist.tracks
                .map((id) => tracks.find((t) => t.video_id === id))
                .filter((t): t is DemoTrack => Boolean(t))}
              activeTrackId={activeTrackId}
              isPlaying={isPlaying}
              onPlayTrack={handlePlayTrack}
              onPlayAll={handlePlayAll}
              onShufflePlay={(list) => {
                setShuffle(true);
                handlePlayAll([...list].reverse());
              }}
              onToggleLike={handleToggleLike}
              onDownloadAll={(list) => {
                const ids = new Set(list.map((t) => t.video_id));
                setTracks((prev) =>
                  prev.map((t) => (ids.has(t.video_id) ? { ...t, offline: true } : t)),
                );
              }}
              onRenamePlaylist={(id, newName) =>
                setPlaylists((prev) =>
                  prev.map((p) => (p.id === id ? { ...p, name: newName } : p)),
                )
              }
              onDeletePlaylist={(id) => {
                setPlaylists((prev) => prev.filter((p) => p.id !== id));
                pushRoute({ kind: 'nav', section: 'home' });
              }}
            />
          )}

          {route.kind === 'nav' && (
            <HomeView
              sectionTitle={
                route.section === 'home'
                  ? undefined
                  : route.section === 'liked'
                    ? 'Liked Songs'
                    : route.section === 'offline'
                      ? 'Offline Downloads'
                      : route.section.charAt(0).toUpperCase() + route.section.slice(1)
              }
              tracks={getSectionTracks(route.section)}
              albums={DEMO_ALBUMS}
              playlists={playlists}
              activeTrackId={activeTrackId}
              isPlaying={isPlaying}
              bannerSaved={bannerSaved}
              initialFilter={route.section === 'offline' ? 'Offline' : 'All'}
              onPlayTrack={handlePlayTrack}
              onPlayAll={handlePlayAll}
              onToggleSaveBanner={() => setBannerSaved((v) => !v)}
              onToggleLike={handleToggleLike}
              onToggleOffline={handleToggleOffline}
              onSelectPlaylist={(playlistId) =>
                pushRoute({ kind: 'playlist', playlistId })
              }
            />
          )}
        </main>

        {showRightPanel && (
          <RightPanel
            currentTrack={currentTrack}
            queue={queueTracks}
            canUndoClear={clearedQueueBackup !== null}
            autoplayEnabled={autoplayEnabled}
            currentTimeMs={currentTimeMs}
            lyrics={DEMO_ZEN_LYRICS}
            activeTab={rightPanelTab}
            onTabChange={setRightPanelTab}
            onToggleAutoplay={() => setAutoplayEnabled((v) => !v)}
            onClearQueue={() => {
              setClearedQueueBackup(queueIds);
              setQueueIds([]);
            }}
            onUndoClearQueue={() => {
              if (clearedQueueBackup) {
                setQueueIds(clearedQueueBackup);
                setClearedQueueBackup(null);
              }
            }}
            onSelectTrack={handlePlayTrack}
            onToggleLike={handleToggleLike}
            onSeekMs={handleSeek}
            onOpenLyricsView={() => pushRoute({ kind: 'lyrics' })}
          />
        )}
      </div>

      <PlayerDock
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        shuffle={shuffle}
        repeatMode={repeatMode}
        volume={volume}
        muted={muted}
        showRightPanel={showRightPanel}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        onToggleShuffle={() => {
          setShuffle((s) => {
            const next = !s;
            void tauriApi.setShuffle(next);
            return next;
          });
        }}
        onCycleRepeat={() =>
          setRepeatMode((r) => {
            const next = r === 'off' ? 'all' : r === 'all' ? 'one' : 'off';
            void tauriApi.setRepeatMode(next);
            return next;
          })
        }
        onSeekMs={handleSeek}
        onVolumeChange={(v) => {
          setVolume(v);
          if (v > 0 && muted) setMuted(false);
          void tauriApi.setVolume(v);
        }}
        onToggleMute={() =>
          setMuted((m) => {
            const next = !m;
            void tauriApi.setVolume(next ? 0 : volume);
            return next;
          })
        }
        onToggleLike={handleToggleLike}
        onOpenZenMode={() => pushRoute({ kind: 'lyrics' })}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
      />

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => {
          setSettings(next);
          void tauriApi.setNormalization(next.normalizeVolume);
          void tauriApi.setCrossfadeMs(next.crossfadeSec * 1000);
          void tauriApi.setDiscordRpcEnabled(next.discordRpcEnabled);
        }}
      />
    </div>
  );
}

export default App;
