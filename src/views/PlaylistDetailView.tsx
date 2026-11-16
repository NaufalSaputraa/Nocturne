import React, { useEffect, useState } from 'react';
import {
  ArrowUpDown,
  BadgeCheck,
  Clock,
  Download,
  Heart,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Play,
  Search,
  Shuffle,
  Trash2,
} from 'lucide-react';
import {
  InteractiveDropdown,
  type DropdownOption,
} from '../components/ui/InteractiveDropdown';
import {
  formatTimeSec,
  type DemoPlaylist,
  type DemoTrack,
} from '../data/mockLibrary';

type SortKey = 'custom' | 'title' | 'duration';

const SORT_OPTIONS: DropdownOption<SortKey>[] = [
  { value: 'custom', label: 'Sort: Custom Order' },
  { value: 'title', label: 'Sort: Title (A–Z)' },
  { value: 'duration', label: 'Sort: Duration' },
];

export interface PlaylistDetailViewProps {
  playlist: DemoPlaylist;
  tracks: DemoTrack[];
  activeTrackId: string;
  onPlayTrack: (track: DemoTrack) => void;
  onPlayAll: (tracks: DemoTrack[]) => void;
  onShufflePlay: (tracks: DemoTrack[]) => void;
  onToggleLike: (videoId: string) => void;
  onDownloadAll: (tracks: DemoTrack[]) => void;
  onRenamePlaylist: (id: string, newName: string) => void;
  onDeletePlaylist: (id: string) => void;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({
  playlist,
  tracks,
  activeTrackId,
  onPlayTrack,
  onPlayAll,
  onShufflePlay,
  onToggleLike,
  onDownloadAll,
  onRenamePlaylist,
  onDeletePlaylist,
}) => {
  const [filterText, setFilterText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('custom');
  const [layoutMode, setLayoutMode] = useState<'list' | 'grid'>('list');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(playlist.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  useEffect(() => {
    setDraftName(playlist.name);
    setEditingName(false);
    setMenuOpen(false);
    setConfirmDelete(false);
  }, [playlist.id, playlist.name]);

  const filtered = tracks
    .filter(
      (t) =>
        t.title.toLowerCase().includes(filterText.trim().toLowerCase()) ||
        t.artist.toLowerCase().includes(filterText.trim().toLowerCase()) ||
        t.album.toLowerCase().includes(filterText.trim().toLowerCase()),
    )
    .sort((a, b) => {
      if (sortKey === 'title') return a.title.localeCompare(b.title);
      if (sortKey === 'duration') return a.duration_sec - b.duration_sec;
      return 0;
    });

  const totalSec = tracks.reduce((sum, t) => sum + t.duration_sec, 0);
  const totalMins = Math.round(totalSec / 60);
  const durationLabel =
    totalMins >= 60
      ? `${Math.floor(totalMins / 60)} hr ${totalMins % 60} min`
      : `${totalMins} min`;

  const handleDownloadPlaylist = () => {
    setDownloadProgress(45);
    setTimeout(() => {
      onDownloadAll(tracks);
      setDownloadProgress(100);
    }, 180);
  };

  return (
    <div className="flex flex-col w-full">
      {/* Playlist Hero Section */}
      <section className="flex flex-row items-center gap-6 mb-7 group">
        <div className="relative w-[176px] h-[176px] rounded-xl overflow-hidden shrink-0 bg-[#18181B] border border-[#27272A]">
          <img
            src={playlist.cover_url}
            alt={playlist.name}
            className="w-full h-full aspect-square object-cover"
          />
        </div>

        <div className="flex flex-col justify-center min-w-0 flex-1">
          <span className="text-[11px] uppercase font-semibold tracking-wider text-[#A1A1AA] mb-1.5 whitespace-nowrap">
            {playlist.source === 'ytm' ? 'YouTube Music Playlist' : 'Local Playlist'}
          </span>

          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draftName.trim()) {
                  onRenamePlaylist(playlist.id, draftName.trim());
                }
                setEditingName(false);
              }}
              className="flex items-center gap-2 mb-1"
            >
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
                className="bg-[#222226] border border-[#3F3F46] rounded-lg px-3 py-1 text-2xl font-bold text-white outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold whitespace-nowrap"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="px-3 py-1.5 rounded-lg bg-[#222226] text-[#A1A1AA] text-xs font-medium whitespace-nowrap"
              >
                Cancel
              </button>
            </form>
          ) : (
            <h1 className="text-4xl font-bold text-white tracking-tight truncate">
              {playlist.name}
            </h1>
          )}

          <p className="text-sm text-[#A1A1AA] mt-1.5 line-clamp-1">
            {playlist.description}
          </p>

          <div className="flex items-center gap-2 mt-2 text-xs text-[#FAFAFA] flex-wrap">
            <span className="font-medium">Nocturne</span>
            <span className="text-[#71717A]">•</span>
            <span className="text-[#F43F5E] font-medium inline-flex items-center gap-1 whitespace-nowrap">
              <BadgeCheck className="w-3.5 h-3.5" />
              {playlist.source === 'ytm' ? 'YouTube Music' : 'Local Library'}
            </span>
            <span className="text-[#71717A]">•</span>
            <span className="whitespace-nowrap">{tracks.length} songs</span>
            <span className="text-[#71717A]">•</span>
            <span className="text-[#A1A1AA] tabular-nums whitespace-nowrap">
              {durationLabel}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-4 flex-wrap relative">
            <button
              type="button"
              onClick={() => onPlayAll(tracks)}
              className="bg-white hover:bg-[#E4E4E7] text-black px-6 py-2 rounded-full font-semibold text-sm inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Play All</span>
            </button>

            <button
              type="button"
              onClick={() => onShufflePlay(tracks)}
              className="bg-[#18181B] border border-[#27272A] hover:bg-[#222226] text-white px-5 py-2 rounded-full font-medium text-sm inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Shuffle className="w-4 h-4 text-[#A1A1AA]" />
              <span>Shuffle</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPlaylist}
              title="Download all for offline playback"
              className="h-9 px-3.5 rounded-full bg-[#18181B] border border-[#27272A] hover:bg-[#222226] flex items-center gap-1.5 text-xs font-medium text-[#FAFAFA] transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span className="tabular-nums">
                {downloadProgress === null
                  ? 'Download'
                  : downloadProgress < 100
                    ? `Downloading ${downloadProgress}%`
                    : 'Downloaded'}
              </span>
            </button>

            {/* Overflow menu for destructive/secondary playlist actions */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen((o) => !o);
                  setConfirmDelete(false);
                }}
                aria-label="Playlist options"
                title="Playlist options"
                className="w-9 h-9 rounded-full bg-[#18181B] border border-[#27272A] hover:bg-[#222226] flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div className="absolute left-0 mt-1.5 w-48 rounded-xl bg-[#18181B] border border-[#27272A] p-1.5 shadow-2xl z-30">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(playlist.name);
                      setEditingName(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#FAFAFA] hover:bg-[#222226] text-left"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[#A1A1AA]" />
                    <span>Rename playlist</span>
                  </button>
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#F43F5E] hover:bg-[#222226] text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete playlist</span>
                    </button>
                  ) : (
                    <div className="p-2 mt-1 rounded-lg bg-[#121212] border border-[#27272A] flex flex-col gap-1.5">
                      <span className="text-[11px] text-[#FAFAFA] font-medium">
                        Delete &ldquo;{playlist.name}&rdquo;?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onDeletePlaylist(playlist.id);
                          }}
                          className="flex-1 py-1 rounded bg-[#F43F5E] text-white text-[11px] font-semibold"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="flex-1 py-1 rounded bg-[#222226] text-[#A1A1AA] text-[11px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Filter & Layout Toolbar */}
      <div className="flex items-center justify-between py-2.5 mb-3 bg-[#18181B] border border-[#27272A] rounded-xl px-3">
        <div className="w-[240px] bg-[#222226] rounded-lg px-3 py-1.5 flex items-center gap-2">
          <Search className="w-4 h-4 text-[#71717A] shrink-0" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Find in playlist..."
            className="bg-transparent border-none outline-none text-xs text-[#FAFAFA] placeholder-[#71717A] w-full p-0 focus:ring-0"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="w-[185px]">
            <InteractiveDropdown
              ariaLabel="Sort playlist tracks"
              size="sm"
              align="right"
              value={sortKey}
              options={SORT_OPTIONS}
              prefixIcon={<ArrowUpDown className="w-3.5 h-3.5" />}
              onChange={setSortKey}
            />
          </div>

          <div className="flex items-center gap-1 bg-[#121212] border border-[#27272A] p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setLayoutMode('list')}
              aria-label="List view"
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                layoutMode === 'list' ? 'bg-[#27272A] text-white' : 'text-[#71717A] hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              aria-label="Grid view"
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                layoutMode === 'grid' ? 'bg-[#27272A] text-white' : 'text-[#71717A] hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-[#18181B] border border-[#27272A] p-10 text-center flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-[#FAFAFA]">
            No matching tracks in this playlist
          </p>
          {filterText && (
            <button
              type="button"
              onClick={() => setFilterText('')}
              className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-[#E4E4E7] whitespace-nowrap"
            >
              Clear filter
            </button>
          )}
        </div>
      ) : layoutMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((track) => (
            <div
              key={track.video_id}
              role="button"
              tabIndex={0}
              onClick={() => onPlayTrack(track)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPlayTrack(track);
                }
              }}
              className="bg-[#18181B] border border-[#27272A] rounded-xl p-3 hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 cursor-pointer"
            >
              <img
                src={track.thumbnail_url}
                alt={track.title}
                className="w-full aspect-square object-cover rounded-lg mb-2.5"
              />
              <p className="text-sm font-medium text-[#FAFAFA] truncate">{track.title}</p>
              <p className="text-xs text-[#A1A1AA] truncate">{track.artist}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col w-full">
          <div className="flex items-center text-[11px] font-semibold uppercase tracking-wider text-[#71717A] px-3 pb-2 border-b border-[#27272A] select-none">
            <div className="w-10 text-center">#</div>
            <div className="flex-1 px-3 whitespace-nowrap">Title</div>
            <div className="w-52 px-3 whitespace-nowrap">Album</div>
            <div className="w-36 px-3 whitespace-nowrap">DATE ADDED</div>
            <div className="w-10 text-center" />
            <div className="w-16 text-right flex items-center justify-end pr-2">
              <Clock className="w-4 h-4" />
            </div>
          </div>

          <div className="flex flex-col gap-0.5 mt-1">
            {filtered.map((track, idx) => {
              const isActive = track.video_id === activeTrackId;
              return (
                <div
                  key={track.video_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPlayTrack(track)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onPlayTrack(track);
                    }
                  }}
                  className={`h-[52px] rounded-lg transition-colors px-3 flex items-center group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 ${
                    isActive ? 'bg-[#1E1E22]' : 'hover:bg-[#222226]'
                  }`}
                >
                  <div className="w-10 flex items-center justify-center shrink-0">
                    {isActive ? (
                      <div className="flex items-end gap-0.5 h-3.5 w-3">
                        <span className="w-0.5 bg-[#F43F5E] animate-pulse h-full rounded-full" />
                        <span className="w-0.5 bg-[#F43F5E] animate-pulse h-2/3 rounded-full" />
                        <span className="w-0.5 bg-[#F43F5E] animate-pulse h-4/5 rounded-full" />
                      </div>
                    ) : (
                      <>
                        <span className="text-xs text-[#71717A] tabular-nums group-hover:hidden">
                          {idx + 1}
                        </span>
                        <Play className="w-4 h-4 text-white fill-current hidden group-hover:block" />
                      </>
                    )}
                  </div>

                  <div className="flex-1 flex items-center gap-3 px-3 min-w-0">
                    <img
                      src={track.thumbnail_url}
                      alt={track.title}
                      className="w-9 h-9 rounded-md aspect-square object-cover shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span
                        className={`text-sm font-medium truncate ${
                          isActive ? 'text-[#F43F5E]' : 'text-[#FAFAFA]'
                        }`}
                      >
                        {track.title}
                      </span>
                      <span className="text-xs text-[#A1A1AA] truncate">
                        {track.artist}
                      </span>
                    </div>
                  </div>

                  <div className="w-52 px-3 truncate text-sm text-[#A1A1AA]">
                    {track.album}
                  </div>

                  <div className="w-36 px-3 whitespace-nowrap text-xs text-[#71717A]">
                    {track.date_added}
                  </div>

                  <div className="w-10 flex items-center justify-center shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLike(track.video_id);
                      }}
                      aria-label={`Like ${track.title}`}
                      className={`transition-transform hover:scale-110 ${
                        track.liked
                          ? 'text-[#F43F5E]'
                          : 'text-[#71717A] hover:text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${track.liked ? 'fill-[#F43F5E]' : ''}`}
                      />
                    </button>
                  </div>

                  <div
                    className={`w-16 text-right pr-2 text-xs font-mono tabular-nums ${
                      isActive ? 'text-[#F43F5E] font-medium' : 'text-[#71717A]'
                    }`}
                  >
                    {formatTimeSec(track.duration_sec)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
