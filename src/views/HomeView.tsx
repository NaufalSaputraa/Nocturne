import React, { useEffect, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Clock,
  Download,
  Heart,
  Play,
} from 'lucide-react';
import {
  FEATURED_BANNER_COVER,
  formatTimeSec,
  type DemoAlbum,
  type DemoPlaylist,
  type DemoTrack,
} from '../data/mockLibrary';

export type HomeFilter = 'All' | 'Songs' | 'Albums' | 'Playlists' | 'Offline';

export interface HomeViewProps {
  sectionTitle?: string;
  tracks: DemoTrack[];
  albums: DemoAlbum[];
  playlists: DemoPlaylist[];
  activeTrackId: string;
  isPlaying?: boolean;
  bannerSaved: boolean;
  initialFilter?: HomeFilter;
  onPlayTrack: (track: DemoTrack) => void;
  onPlayAll: (tracks: DemoTrack[]) => void;
  onToggleSaveBanner: () => void;
  onToggleLike: (videoId: string) => void;
  onToggleOffline: (videoId: string) => void;
  onSelectPlaylist: (id: string) => void;
}

const FILTER_PILLS: HomeFilter[] = ['All', 'Songs', 'Albums', 'Playlists', 'Offline'];

export const HomeView: React.FC<HomeViewProps> = ({
  sectionTitle,
  tracks,
  albums,
  playlists,
  activeTrackId,
  isPlaying = true,
  bannerSaved,
  initialFilter = 'All',
  onPlayTrack,
  onPlayAll,
  onToggleSaveBanner,
  onToggleLike,
  onToggleOffline,
  onSelectPlaylist,
}) => {
  const [filter, setFilter] = useState<HomeFilter>(initialFilter);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const visibleTracks =
    filter === 'Offline' ? tracks.filter((t) => t.offline) : tracks;

  const playAlbumTracks = (album: DemoAlbum) => {
    const matched = tracks.filter(
      (t) =>
        t.album.toLowerCase() === album.title.toLowerCase() ||
        t.artist.toLowerCase() === album.artist.toLowerCase(),
    );
    onPlayAll(matched.length > 0 ? matched : tracks);
  };

  return (
    <div className="flex flex-col w-full gap-6">
      {sectionTitle && (
        <h1 className="text-2xl font-semibold text-[#FAFAFA]">
          {sectionTitle}
        </h1>
      )}

      {/* Top Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {FILTER_PILLS.map((pill) => {
          const active = filter === pill;
          return (
            <button
              key={pill}
              type="button"
              onClick={() => setFilter(pill)}
              className={`px-4 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 ${
                active
                  ? 'bg-white text-black font-semibold'
                  : 'bg-[#18181B] border border-[#27272A] text-[#A1A1AA] hover:text-white hover:bg-[#222226] font-medium'
              }`}
            >
              {pill}
            </button>
          );
        })}
      </div>

      {/* Featured Hero Banner */}
      {(filter === 'All' || filter === 'Playlists') && !sectionTitle && (
        <section className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 flex flex-col sm:flex-row gap-6 items-center">
          <div className="relative w-40 h-40 shrink-0 rounded-xl overflow-hidden bg-[#121212] border border-[#27272A]">
            <img
              src={FEATURED_BANNER_COVER}
              alt="Chill Coding & Lo-Fi Beats"
              className="w-full h-full aspect-square object-cover"
            />
          </div>
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <span className="text-xs font-medium text-[#F43F5E] mb-1 whitespace-nowrap">
              Curated playlist
            </span>
            <h1 className="text-2xl font-semibold text-[#FAFAFA] mb-2">
              Chill Coding &amp; Lo-Fi Beats
            </h1>
            <p className="text-sm text-[#A1A1AA] mb-5">
              Curated for deep focus • {tracks.length} songs • Direct high-bitrate stream
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => onPlayAll(tracks)}
                className="h-9 px-5 rounded-full bg-white text-black font-semibold text-sm inline-flex items-center gap-2 hover:bg-[#E4E4E7] transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span>Play All</span>
              </button>
              <button
                type="button"
                onClick={onToggleSaveBanner}
                className="h-9 px-4 rounded-full border border-[#3F3F46] text-[#FAFAFA] font-medium text-sm inline-flex items-center gap-2 hover:bg-[#222226] transition-colors whitespace-nowrap shrink-0"
              >
                {bannerSaved ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <BookmarkPlus className="w-4 h-4 shrink-0" />
                )}
                <span>{bannerSaved ? 'Saved to Library' : 'Save to Library'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Albums Grid */}
      {filter === 'Albums' && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {albums.map((album) => (
            <div
              key={album.id}
              role="button"
              tabIndex={0}
              onClick={() => playAlbumTracks(album)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  playAlbumTracks(album);
                }
              }}
              className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5 hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 transition-colors cursor-pointer group"
            >
              <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-[#27272A] mb-3">
                <img
                  src={album.cover_url}
                  alt={album.title}
                  className="w-full h-full aspect-square object-cover"
                />
              </div>
              <h3 className="text-sm font-semibold text-[#FAFAFA] truncate">
                {album.title}
              </h3>
              <p className="text-xs text-[#A1A1AA] truncate mt-0.5">
                {album.artist} • {album.year}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* Playlists Grid */}
      {filter === 'Playlists' && (
        <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => onSelectPlaylist(pl.id)}
              className="bg-[#18181B] border border-[#27272A] rounded-xl p-4 hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 transition-colors text-left flex items-center gap-4"
            >
              <img
                src={pl.cover_url}
                alt={pl.name}
                className="w-16 h-16 rounded-lg aspect-square object-cover shrink-0"
              />
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-[#F43F5E]">
                  {pl.source === 'ytm' ? 'YouTube Music' : 'Local Library'}
                </span>
                <h3 className="text-sm font-semibold text-[#FAFAFA] truncate">
                  {pl.name}
                </h3>
                <p className="text-xs text-[#A1A1AA] truncate">
                  {pl.tracks.length} songs
                </p>
              </div>
            </button>
          ))}
        </section>
      )}

      {/* Clean Tracklist Table */}
      {(filter === 'All' || filter === 'Songs' || filter === 'Offline') && (
        <div className="w-full">
          {visibleTracks.length === 0 ? (
            <div className="rounded-2xl bg-[#18181B] border border-[#27272A] p-10 text-center flex flex-col items-center gap-3">
              <p className="text-sm font-medium text-[#FAFAFA]">
                No tracks here yet
              </p>
              <p className="text-xs text-[#8E8E98] max-w-sm">
                {filter === 'Offline'
                  ? 'Download tracks from any playlist or library list to play them offline.'
                  : 'Play or like songs to populate this list.'}
              </p>
              {filter !== 'All' && (
                <button
                  type="button"
                  onClick={() => setFilter('All')}
                  className="px-4 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-[#E4E4E7] whitespace-nowrap"
                >
                  Show All Tracks
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-[#8E8E98] border-b border-[#27272A] select-none">
                <div className="col-span-1 flex items-center">#</div>
                <div className="col-span-5 flex items-center whitespace-nowrap">Title</div>
                <div className="col-span-3 flex items-center whitespace-nowrap">Album</div>
                <div className="col-span-1 flex items-center justify-center whitespace-nowrap">
                  Offline
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <Heart className="w-4 h-4" />
                </div>
                <div className="col-span-1 flex items-center justify-end">
                  <Clock className="w-4 h-4" />
                </div>
              </div>

              <div className="divide-y divide-[#27272A]/40">
                {visibleTracks.map((track, idx) => {
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
                      className={`grid grid-cols-12 gap-4 px-4 h-[52px] items-center rounded-lg transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 ${
                        isActive ? 'bg-[#1E1E22]' : 'hover:bg-[#222226]'
                      }`}
                    >
                      <div className="col-span-1 flex items-center">
                        {isActive ? (
                          <div
                            className="flex items-end gap-0.5 h-3.5 w-3.5"
                            aria-label={isPlaying ? 'Playing' : 'Paused'}
                          >
                            <span className={`w-1 bg-[#F43F5E] rounded-full ${isPlaying ? 'h-full' : 'h-1.5 opacity-60'}`} />
                            <span className={`w-1 bg-[#F43F5E] rounded-full ${isPlaying ? 'h-2' : 'h-1.5 opacity-60'}`} />
                            <span className={`w-1 bg-[#F43F5E] rounded-full ${isPlaying ? 'h-3' : 'h-1.5 opacity-60'}`} />
                          </div>
                        ) : (
                          <>
                            <span className="text-xs font-medium text-[#8E8E98] tabular-nums group-hover:hidden">
                              {idx + 1}
                            </span>
                            <Play className="w-4 h-4 text-white fill-current hidden group-hover:block" />
                          </>
                        )}
                      </div>

                      <div className="col-span-5 flex items-center gap-3 min-w-0">
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

                      <div className="col-span-3 text-sm text-[#A1A1AA] truncate">
                        {track.album}
                      </div>

                      <div className="col-span-1 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleOffline(track.video_id);
                          }}
                          aria-label={
                            track.offline
                              ? `Remove ${track.title} from offline`
                              : `Download ${track.title} for offline`
                          }
                          title={
                            track.offline ? 'Available Offline' : 'Download for Offline'
                          }
                          className={`p-1 rounded transition-colors ${
                            track.offline
                              ? 'text-emerald-400'
                              : 'text-[#8E8E98] hover:text-white opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100'
                          }`}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="col-span-1 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLike(track.video_id);
                          }}
                          aria-label={`Like ${track.title}`}
                          className={`p-1 rounded transition-colors ${
                            track.liked
                              ? 'text-[#F43F5E]'
                              : 'text-[#8E8E98] hover:text-white opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100'
                          }`}
                        >
                          <Heart
                            className={`w-4 h-4 ${track.liked ? 'fill-[#F43F5E]' : ''}`}
                          />
                        </button>
                      </div>

                      <div
                        className={`col-span-1 flex items-center justify-end text-xs font-mono tabular-nums ${
                          isActive ? 'text-[#F43F5E] font-medium' : 'text-[#8E8E98]'
                        }`}
                      >
                        {formatTimeSec(track.duration_sec)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
