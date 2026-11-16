import { useEffect, useState } from 'react';
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
  | { kind: 'zen' };

export function App() {
  const [tracks, setTracks] = useState<DemoTrack[]>(DEMO_TRACKS);
  const [playlists, setPlaylists] = useState<DemoPlaylist[]>(DEMO_PLAYLISTS);
  const [history, setHistory] = useState<ActiveRoute[]>([
    { kind: 'nav', section: 'home' },
  ]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [activeTrackId, setActiveTrackId] = useState<string>(DEMO_TRACKS[0].video_id);
  const [queueIds, setQueueIds] = useState<string[]>(
    DEMO_TRACKS.slice(1, 7).map((t) => t.video_id),
  );
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

  // Smooth local requestAnimationFrame preview clock while playing
  useEffect(() => {
    if (!isPlaying) return;
    let frameId = 0;
    let lastNow = performance.now();

    const tick = (now: number) => {
      const dt = now - lastNow;
      lastNow = now;
      setCurrentTimeMs((prev) => {
        const next = prev + dt;
        return next >= durationMs ? 0 : next;
      });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, durationMs]);

  const pushRoute = (nextRoute: ActiveRoute) => {
    const sliced = history.slice(0, historyIdx + 1);
    setHistory([...sliced, nextRoute]);
    setHistoryIdx(sliced.length);
  };

  const handlePlayTrack = (track: DemoTrack) => {
    setActiveTrackId(track.video_id);
    setCurrentTimeMs(0);
    setIsPlaying(true);
  };

  const handlePlayAll = (list: DemoTrack[]) => {
    if (list.length === 0) return;
    setActiveTrackId(list[0].video_id);
    setQueueIds(list.slice(1).map((t) => t.video_id));
    setCurrentTimeMs(0);
    setIsPlaying(true);
  };

  const handleToggleLike = (videoId: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.video_id === videoId ? { ...t, liked: !t.liked } : t)),
    );
  };

  const handleToggleOffline = (videoId: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.video_id === videoId ? { ...t, offline: !t.offline } : t)),
    );
  };

  const handleNext = () => {
    if (queueTracks.length > 0) {
      const [nextTrack, ...rest] = queueTracks;
      setActiveTrackId(nextTrack.video_id);
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
          ? 'Two-way synced with your YouTube Music library.'
          : 'Stored locally in SQLite.',
      source,
      curator: source === 'ytm' ? 'YouTube Music Synced' : 'Local SQLite',
      cover_url: tracks[0].thumbnail_url,
      tracks: [currentTrack.video_id],
    };
    setPlaylists((prev) => [...prev, created]);
    pushRoute({ kind: 'playlist', playlistId: id });
  };

  if (route.kind === 'zen') {
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
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onPrev={handlePrev}
          onNext={handleNext}
          onToggleShuffle={() => setShuffle((s) => !s)}
          onCycleRepeat={() =>
            setRepeatMode((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
          }
          onToggleLike={handleToggleLike}
          onSeekMs={setCurrentTimeMs}
          onSelectTrack={handlePlayTrack}
          onAdjustOffsetMs={(delta) => setLyricOffsetMs((v) => v + delta)}
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
        onOpenSettings={() => setSettingsOpen(true)}
        ytmConnected={settings.ytmConnected}
        onToggleYtmProfile={() => setSettingsOpen(true)}
      />

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
              onToggleLike={handleToggleLike}
              onSelectPlaylist={(playlistId) =>
                pushRoute({ kind: 'playlist', playlistId })
              }
            />
          )}

          {route.kind === 'playlist' && activePlaylist && (
            <PlaylistDetailView
              playlist={activePlaylist}
              tracks={activePlaylist.tracks
                .map((id) => tracks.find((t) => t.video_id === id))
                .filter((t): t is DemoTrack => Boolean(t))}
              activeTrackId={activeTrackId}
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
              tracks={
                route.section === 'liked'
                  ? tracks.filter((t) => t.liked)
                  : route.section === 'offline'
                    ? tracks.filter((t) => t.offline)
                    : tracks
              }
              albums={DEMO_ALBUMS}
              playlists={playlists}
              activeTrackId={activeTrackId}
              initialFilter={route.section === 'offline' ? 'Offline' : 'All'}
              onPlayTrack={handlePlayTrack}
              onPlayAll={handlePlayAll}
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
            autoplayEnabled={autoplayEnabled}
            currentTimeMs={currentTimeMs}
            lyrics={DEMO_ZEN_LYRICS}
            onToggleAutoplay={() => setAutoplayEnabled((v) => !v)}
            onClearQueue={() => setQueueIds([])}
            onSelectTrack={handlePlayTrack}
            onToggleLike={handleToggleLike}
            onSeekMs={setCurrentTimeMs}
            onOpenZenMode={() => pushRoute({ kind: 'zen' })}
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
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onPrev={handlePrev}
        onNext={handleNext}
        onToggleShuffle={() => setShuffle((s) => !s)}
        onCycleRepeat={() =>
          setRepeatMode((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
        }
        onSeekMs={setCurrentTimeMs}
        onVolumeChange={(v) => {
          setVolume(v);
          if (v > 0 && muted) setMuted(false);
        }}
        onToggleMute={() => setMuted((m) => !m)}
        onToggleLike={handleToggleLike}
        onOpenZenMode={() => pushRoute({ kind: 'zen' })}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={setSettings}
      />
    </div>
  );
}

export default App;
