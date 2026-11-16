import React, { useState } from 'react';
import { ArrowLeft, BadgeCheck, Heart, Play, SearchX } from 'lucide-react';
import {
  formatTimeSec,
  type DemoAlbum,
  type DemoArtist,
  type DemoPlaylist,
  type DemoTrack,
} from '../data/mockLibrary';

export type SearchFilter = 'All' | 'Songs' | 'Albums' | 'Artists' | 'Playlists';

export interface SearchViewProps {
  query: string;
  tracks: DemoTrack[];
  albums: DemoAlbum[];
  artists: DemoArtist[];
  playlists: DemoPlaylist[];
  onPlayTrack: (track: DemoTrack) => void;
  onPlayAll: (tracks: DemoTrack[]) => void;
  onToggleLike: (videoId: string) => void;
  onSelectPlaylist: (id: string) => void;
  onClearSearch: () => void;
}

const SEARCH_FILTERS: SearchFilter[] = ['All', 'Songs', 'Albums', 'Artists', 'Playlists'];

export const SearchView: React.FC<SearchViewProps> = ({
  query,
  tracks,
  albums,
  artists,
  playlists,
  onPlayTrack,
  onPlayAll,
  onToggleLike,
  onSelectPlaylist,
  onClearSearch,
}) => {
  const [filter, setFilter] = useState<SearchFilter>('All');
  const [selectedArtist, setSelectedArtist] = useState<DemoArtist | null>(null);

  const normalized = query.trim().toLowerCase();
  const matchingTracks =
    normalized.length > 0
      ? tracks.filter(
          (t) =>
            t.title.toLowerCase().includes(normalized) ||
            t.artist.toLowerCase().includes(normalized) ||
            t.album.toLowerCase().includes(normalized),
        )
      : tracks.filter((t) => t.artist === 'Perunggu');

  const matchingAlbums =
    normalized.length > 0
      ? albums.filter(
          (a) =>
            a.title.toLowerCase().includes(normalized) ||
            a.artist.toLowerCase().includes(normalized),
        )
      : albums;

  const matchingArtists =
    normalized.length > 0
      ? artists.filter((a) => a.name.toLowerCase().includes(normalized))
      : artists;

  const matchingPlaylists =
    normalized.length > 0
      ? playlists.filter((p) => p.name.toLowerCase().includes(normalized))
      : playlists;

  const hasAnyResults =
    matchingTracks.length > 0 ||
    matchingAlbums.length > 0 ||
    matchingArtists.length > 0 ||
    matchingPlaylists.length > 0;

  const topSongs = matchingTracks.slice(0, 4);
  const topArtist = matchingArtists[0] ?? null;

  const playAlbumTracks = (album: DemoAlbum) => {
    const albumTracks = tracks.filter(
      (t) =>
        t.album.toLowerCase() === album.title.toLowerCase() ||
        t.artist.toLowerCase() === album.artist.toLowerCase(),
    );
    if (albumTracks.length > 0) {
      onPlayAll(albumTracks);
    }
  };

  if (selectedArtist) {
    const artistTracks = tracks.filter(
      (t) => t.artist.toLowerCase() === selectedArtist.name.toLowerCase(),
    );
    return (
      <div className="flex flex-col w-full gap-6">
        <button
          type="button"
          onClick={() => setSelectedArtist(null)}
          className="self-start inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#18181B] border border-[#27272A] text-xs font-medium text-[#FAFAFA] hover:bg-[#222226] whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Search Results</span>
        </button>

        <div className="flex items-center gap-5 bg-[#18181B] border border-[#27272A] rounded-2xl p-6">
          <img
            src={selectedArtist.avatar_url}
            alt={selectedArtist.name}
            className="w-24 h-24 rounded-full aspect-square object-cover border border-[#27272A]"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-[#FAFAFA] tracking-tight">
                {selectedArtist.name}
              </h1>
              {selectedArtist.verified && (
                <BadgeCheck className="w-5 h-5 text-[#FAFAFA]" />
              )}
            </div>
            <p className="text-sm text-[#A1A1AA] mt-1">{selectedArtist.listeners}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {artistTracks.length === 0 ? (
            <p className="text-sm text-[#8E8E98] py-6">
              No cached tracks found for {selectedArtist.name}.
            </p>
          ) : (
            artistTracks.map((track) => (
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
                className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <img
                    src={track.thumbnail_url}
                    alt={track.title}
                    className="w-10 h-10 rounded-md aspect-square object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#FAFAFA] truncate">
                      {track.title}
                    </p>
                    <p className="text-xs text-[#A1A1AA] truncate">
                      {track.artist} • {track.album}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-[#8E8E98] tabular-nums">
                  {formatTimeSec(track.duration_sec)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-7">
      {normalized.length > 0 && (
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#FAFAFA]">
            Results for &ldquo;{query.trim()}&rdquo;
          </h1>
        </div>
      )}

      {/* Filter Chips (audio-only scope: no Videos chip) */}
      <section className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {SEARCH_FILTERS.map((chip) => {
          const active = filter === chip;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setFilter(chip)}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 ${
                active
                  ? 'bg-white text-black font-semibold'
                  : 'bg-[#18181B] border border-[#27272A] text-[#A1A1AA] hover:text-white hover:bg-[#222226] font-medium'
              }`}
            >
              {chip}
            </button>
          );
        })}
      </section>

      {!hasAnyResults ? (
        <div className="rounded-2xl bg-[#18181B] border border-[#27272A] p-12 text-center flex flex-col items-center gap-3">
          <SearchX className="w-8 h-8 text-[#8E8E98]" />
          <p className="text-sm font-semibold text-[#FAFAFA]">
            No results found for &ldquo;{query.trim()}&rdquo;
          </p>
          <p className="text-xs text-[#8E8E98] max-w-sm">
            Try checking the spelling, searching an artist name, or pasting a direct YouTube Music URL.
          </p>
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-1 px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-[#E4E4E7] whitespace-nowrap"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          {/* Split Top Results Grid */}
          {(filter === 'All' || filter === 'Songs') && (
            <section className="grid grid-cols-12 gap-6 items-start">
              {topArtist && (
                <div className="col-span-12 lg:col-span-5 flex flex-col">
                  <h2 className="text-lg font-semibold text-white mb-3 px-1">
                    Top Result
                  </h2>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedArtist(topArtist)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedArtist(topArtist);
                      }
                    }}
                    className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 relative group hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 transition-colors flex flex-col justify-between min-h-60 cursor-pointer"
                  >
                    <div className="flex flex-col items-start">
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-[#27272A] shrink-0">
                        <img
                          src={topArtist.avatar_url}
                          alt={topArtist.name}
                          className="w-full h-full aspect-square object-cover"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <h3 className="text-2xl font-semibold text-white leading-none">
                          {topArtist.name}
                        </h3>
                        {topArtist.verified && (
                          <BadgeCheck className="w-4 h-4 text-[#FAFAFA]" />
                        )}
                      </div>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#27272A]/80 text-[#A1A1AA] text-xs font-medium mt-2.5 whitespace-nowrap">
                        <span>Artist</span>
                        <span className="text-[#8E8E98]">•</span>
                        <span>{topArtist.listeners}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (topSongs[0]) onPlayTrack(topSongs[0]);
                      }}
                      aria-label={`Play ${topArtist.name}`}
                      className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:bg-[#E4E4E7] transition-colors"
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </button>
                  </div>
                </div>
              )}

              <div
                className={`col-span-12 ${
                  topArtist ? 'lg:col-span-7' : ''
                } flex flex-col`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-lg font-bold text-white tracking-tight">Songs</h2>
                  {matchingTracks.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setFilter('Songs')}
                      className="text-xs text-[#A1A1AA] hover:text-white transition-colors font-medium whitespace-nowrap"
                    >
                      See All
                    </button>
                  )}
                </div>

                {matchingTracks.length === 0 ? (
                  <p className="text-xs text-[#8E8E98] px-1 py-4">
                    No matching songs found.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {(filter === 'Songs' ? matchingTracks : topSongs).map((track) => (
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
                        className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 pr-4">
                          <div className="relative w-10 h-10 rounded-md overflow-hidden bg-[#27272A] shrink-0">
                            <img
                              src={track.thumbnail_url}
                              alt={track.title}
                              className="w-full h-full aspect-square object-cover"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Play className="w-4 h-4 text-white fill-current" />
                            </div>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-[#FAFAFA] truncate group-hover:text-white">
                              {track.title}
                            </span>
                            <span className="text-xs text-[#A1A1AA] truncate">
                              {track.artist} • {track.album}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleLike(track.video_id);
                            }}
                            aria-label={`Like ${track.title}`}
                            className={`p-1 transition-colors ${
                              track.liked
                                ? 'text-[#F43F5E]'
                                : 'text-[#8E8E98] hover:text-white opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100'
                            }`}
                          >
                            <Heart
                              className={`w-4 h-4 ${track.liked ? 'fill-[#F43F5E]' : ''}`}
                            />
                          </button>
                          <span className="text-xs font-mono text-[#8E8E98] tabular-nums w-11 text-right">
                            {formatTimeSec(track.duration_sec)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Albums Grid */}
          {(filter === 'All' || filter === 'Albums') && matchingAlbums.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-lg font-semibold text-white">Albums</h2>
                <button
                  type="button"
                  onClick={() => setFilter('Albums')}
                  className="text-xs text-[#A1A1AA] hover:text-white transition-colors font-medium whitespace-nowrap"
                >
                  Show all
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {matchingAlbums.map((album) => (
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
                    className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5 hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 transition-colors group flex flex-col cursor-pointer"
                  >
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-[#27272A] mb-3">
                      <img
                        src={album.cover_url}
                        alt={album.title}
                        className="w-full h-full aspect-square object-cover"
                      />
                      <span className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-white text-black flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-[opacity,transform]">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-[#FAFAFA] truncate">
                      {album.title}
                    </h4>
                    <p className="text-xs text-[#A1A1AA] truncate mt-0.5">
                      {album.year} • {album.kind}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Artists Grid */}
          {(filter === 'All' || filter === 'Artists') && matchingArtists.length > 0 && (
            <section className="flex flex-col gap-3 pb-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-lg font-semibold text-white">Artists</h2>
                <button
                  type="button"
                  onClick={() => setFilter('Artists')}
                  className="text-xs text-[#A1A1AA] hover:text-white transition-colors font-medium whitespace-nowrap"
                >
                  Show all
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {matchingArtists.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => setSelectedArtist(artist)}
                    className="bg-[#18181B] border border-[#27272A] rounded-xl p-4 hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 transition-colors group flex flex-col items-center text-center cursor-pointer"
                  >
                    <div className="w-28 h-28 rounded-full overflow-hidden bg-[#27272A] mb-3">
                      <img
                        src={artist.avatar_url}
                        alt={artist.name}
                        className="w-full h-full aspect-square object-cover"
                      />
                    </div>
                    <h4 className="text-sm font-semibold text-[#FAFAFA] truncate w-full">
                      {artist.name}
                    </h4>
                    <p className="text-xs text-[#A1A1AA] mt-0.5">Artist</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Playlists Grid */}
          {filter === 'Playlists' && (
            <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {matchingPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => onSelectPlaylist(pl.id)}
                  className="bg-[#18181B] border border-[#27272A] rounded-xl p-4 hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 transition-colors text-left flex items-center gap-3.5"
                >
                  <img
                    src={pl.cover_url}
                    alt={pl.name}
                    className="w-14 h-14 rounded-lg aspect-square object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-[#FAFAFA] truncate">
                      {pl.name}
                    </h4>
                    <p className="text-xs text-[#A1A1AA] truncate">
                      {pl.source === 'ytm' ? 'YouTube Music' : 'Local Library'} •{' '}
                      {pl.tracks.length} songs
                    </p>
                  </div>
                </button>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
};
