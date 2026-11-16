import React, { useState } from 'react';
import {
  Clock,
  Compass,
  Download,
  Heart,
  Home,
  ListMusic,
  Plus,
  TrendingUp,
} from 'lucide-react';
import type { DemoPlaylist } from '../../data/mockLibrary';

export type NavSection = 'home' | 'explore' | 'trending' | 'liked' | 'history' | 'offline';

export interface SidebarProps {
  activeNav: NavSection | 'playlist' | 'search';
  activePlaylistId: string | null;
  playlists: DemoPlaylist[];
  offlineCount: number;
  ytmConnected: boolean;
  onSelectNav: (nav: NavSection) => void;
  onSelectPlaylist: (id: string) => void;
  onCreatePlaylist: (name: string, source: 'local' | 'ytm') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  activePlaylistId,
  playlists,
  offlineCount,
  ytmConnected,
  onSelectNav,
  onSelectPlaylist,
  onCreatePlaylist,
}) => {
  const [creating, setCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [newPlaylistSource, setNewPlaylistSource] = useState<'local' | 'ytm'>('local');

  const ytmPlaylists = playlists.filter((p) => p.source === 'ytm');
  const localPlaylists = playlists.filter((p) => p.source === 'local');

  const navClass = (selected: boolean) =>
    `w-full rounded-lg flex items-center justify-between px-3 py-2 text-sm transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 ${
      selected
        ? 'bg-[#27272A] text-white font-medium'
        : 'text-[#A1A1AA] hover:text-white hover:bg-[#1E1E22]'
    }`;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) {
      setNameError('Enter a playlist name');
      return;
    }
    setNameError(null);
    onCreatePlaylist(trimmed, ytmConnected ? newPlaylistSource : 'local');
    setNewPlaylistName('');
    setCreating(false);
  };

  return (
    <aside className="w-[220px] shrink-0 bg-[#18181B] border-r border-[#27272A] p-4 flex flex-col gap-6 overflow-y-auto select-none">
      {/* Menu Section */}
      <div>
        <div className="text-xs font-medium text-[#8E8E98] mb-2 px-3 whitespace-nowrap">
          Menu
        </div>
        <nav className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onSelectNav('home')}
            className={navClass(activeNav === 'home')}
          >
            <span className="flex items-center gap-3 whitespace-nowrap">
              <Home className="w-4 h-4 shrink-0" />
              <span>Home</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSelectNav('explore')}
            className={navClass(activeNav === 'explore')}
          >
            <span className="flex items-center gap-3 whitespace-nowrap">
              <Compass className="w-4 h-4 shrink-0" />
              <span>Explore</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSelectNav('trending')}
            className={navClass(activeNav === 'trending')}
          >
            <span className="flex items-center gap-3 whitespace-nowrap">
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>Trending</span>
            </span>
          </button>
        </nav>
      </div>

      {/* Library Section */}
      <div>
        <div className="text-xs font-medium text-[#8E8E98] mb-2 px-3 whitespace-nowrap">
          Library
        </div>
        <nav className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onSelectNav('liked')}
            className={navClass(activeNav === 'liked')}
          >
            <span className="flex items-center gap-3 whitespace-nowrap">
              <Heart className="w-4 h-4 shrink-0 text-[#F43F5E] fill-[#F43F5E]" />
              <span className="font-medium text-[#FAFAFA]">Liked Songs</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSelectNav('history')}
            className={navClass(activeNav === 'history')}
          >
            <span className="flex items-center gap-3 whitespace-nowrap">
              <Clock className="w-4 h-4 shrink-0" />
              <span>History</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSelectNav('offline')}
            className={navClass(activeNav === 'offline')}
          >
            <span className="flex items-center gap-3 whitespace-nowrap">
              <Download className="w-4 h-4 shrink-0" />
              <span>Offline</span>
            </span>
            <span className="text-[11px] font-mono tabular-nums text-[#8E8E98] bg-[#222226] px-1.5 py-0.5 rounded">
              {offlineCount}
            </span>
          </button>
        </nav>
      </div>

      {/* Playlists Section (Local & YTM separated per hybrid design) */}
      <div className="flex-1 flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-xs font-medium text-[#8E8E98] whitespace-nowrap">
              Playlists
            </span>
            <button
              type="button"
              onClick={() => setCreating((prev) => !prev)}
              aria-label="Create Playlist"
              title="Create Playlist"
              className="text-[#8E8E98] hover:text-white transition-colors p-0.5 rounded hover:bg-[#222226]"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {creating && (
            <form
              onSubmit={handleCreateSubmit}
              className="mb-3 p-2.5 rounded-lg bg-[#222226] border border-[#27272A] flex flex-col gap-2"
            >
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => {
                  setNewPlaylistName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Playlist name"
                autoFocus
                className="w-full bg-[#121212] border border-[#27272A] rounded px-2 py-1 text-xs text-[#FAFAFA] placeholder-[#8E8E98] outline-none focus:border-[#52525B]"
              />
              {nameError && (
                <p className="text-[11px] text-[#F43F5E]">{nameError}</p>
              )}
              {ytmConnected && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setNewPlaylistSource('local')}
                    className={`flex-1 py-1 rounded whitespace-nowrap ${
                      newPlaylistSource === 'local'
                        ? 'bg-[#27272A] text-white'
                        : 'text-[#8E8E98] hover:text-white'
                    }`}
                  >
                    Local
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPlaylistSource('ytm')}
                    className={`flex-1 py-1 rounded whitespace-nowrap ${
                      newPlaylistSource === 'ytm'
                        ? 'bg-[#27272A] text-white'
                        : 'text-[#8E8E98] hover:text-white'
                    }`}
                  >
                    YTM Sync
                  </button>
                </div>
              )}
              <button
                type="submit"
                className="w-full py-1 rounded bg-white text-black text-xs font-semibold hover:bg-[#E4E4E7] transition-colors whitespace-nowrap"
              >
                Create
              </button>
            </form>
          )}

          {ytmConnected && ytmPlaylists.length > 0 && (
            <div className="mb-3">
              <div className="px-3 mb-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-400/90">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="whitespace-nowrap">YouTube Music</span>
              </div>
              <nav className="flex flex-col gap-0.5">
                {ytmPlaylists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() => onSelectPlaylist(playlist.id)}
                    className={navClass(
                      activeNav === 'playlist' && activePlaylistId === playlist.id,
                    )}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <ListMusic className="w-4 h-4 shrink-0 text-[#8E8E98]" />
                      <span className="truncate">{playlist.name}</span>
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          )}

          <div>
            <div className="px-3 mb-1 text-[11px] font-medium text-[#8E8E98] whitespace-nowrap">
              Local Library
            </div>
            <nav className="flex flex-col gap-0.5">
              {localPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  onClick={() => onSelectPlaylist(playlist.id)}
                  className={navClass(
                    activeNav === 'playlist' && activePlaylistId === playlist.id,
                  )}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <ListMusic className="w-4 h-4 shrink-0 text-[#8E8E98]" />
                    <span className="truncate">{playlist.name}</span>
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </aside>
  );
};
