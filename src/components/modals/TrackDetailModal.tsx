import React, { useEffect } from 'react';
import {
  Check,
  Clock,
  Disc3,
  Download,
  ExternalLink,
  Heart,
  ListPlus,
  Mic2,
  Play,
  X,
} from 'lucide-react';
import { formatTimeSec, type DemoTrack } from '../../data/mockLibrary';
import { ArtworkImage } from '../ui/ArtworkImage';

export interface TrackDetailModalProps {
  track: DemoTrack | null;
  onClose: () => void;
  onPlayTrack: (track: DemoTrack) => void;
  onAddToQueue: (track: DemoTrack) => void;
  onToggleLike: (videoId: string) => void;
  onToggleOffline: (videoId: string) => void;
  onOpenLyrics: (track: DemoTrack) => void;
}

export const TrackDetailModal: React.FC<TrackDetailModalProps> = ({
  track,
  onClose,
  onPlayTrack,
  onAddToQueue,
  onToggleLike,
  onToggleOffline,
  onOpenLyrics,
}) => {
  useEffect(() => {
    if (!track) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [track, onClose]);

  if (!track) return null;

  const ytmUrl = `https://music.youtube.com/watch?v=${encodeURIComponent(track.video_id)}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Track details for ${track.title}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#18181B] border border-[#27272A] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#27272A]">
          <h2 className="text-sm font-semibold text-[#FAFAFA] tracking-tight">
            Track Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close track details"
            className="p-1.5 rounded-lg text-[#8E8E98] hover:text-white hover:bg-[#222226] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <ArtworkImage
              src={track.thumbnail_url}
              alt={track.title}
              className="w-24 h-24 rounded-xl aspect-square object-cover shrink-0 border border-[#27272A] bg-[#27272A]"
            />
            <div className="flex flex-col min-w-0 flex-1 gap-1">
              <h3 className="text-lg font-bold text-[#FAFAFA] leading-snug break-words">
                {track.title}
              </h3>
              <p className="text-sm text-[#A1A1AA] truncate">{track.artist}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#222226] border border-[#27272A] text-[11px] text-[#A1A1AA]">
                  <Clock className="w-3 h-3" />
                  <span className="font-mono tabular-nums">
                    {formatTimeSec(track.duration_sec)}
                  </span>
                </span>
                {track.offline && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-400">
                    <Check className="w-3 h-3" />
                    <span>Offline</span>
                  </span>
                )}
                {track.liked && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F43F5E]/15 border border-[#F43F5E]/30 text-[11px] text-[#F43F5E]">
                    <Heart className="w-3 h-3 fill-[#F43F5E]" />
                    <span>Liked</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-[#121212] border border-[#27272A] divide-y divide-[#27272A]/60 text-xs">
            <div className="flex items-center justify-between px-4 py-2.5 gap-4">
              <span className="text-[#8E8E98] flex items-center gap-1.5">
                <Disc3 className="w-3.5 h-3.5" />
                Album
              </span>
              <span className="text-[#FAFAFA] font-medium truncate">
                {track.album || 'Single'}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 gap-4">
              <span className="text-[#8E8E98]">Video ID</span>
              <code className="text-[#FAFAFA] font-mono bg-[#18181B] px-2 py-0.5 rounded border border-[#27272A]">
                {track.video_id}
              </code>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 gap-4">
              <span className="text-[#8E8E98]">Source</span>
              <a
                href={ytmUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#F43F5E] hover:underline inline-flex items-center gap-1 font-medium"
              >
                <span>YouTube Music</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onPlayTrack(track);
                onClose();
              }}
              className="h-9 px-4 rounded-full bg-white text-black hover:bg-[#E4E4E7] flex items-center gap-2 text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play Now</span>
            </button>

            <button
              type="button"
              onClick={() => onAddToQueue(track)}
              className="h-9 px-3.5 rounded-full bg-[#222226] border border-[#27272A] hover:bg-[#27272A] flex items-center gap-1.5 text-xs font-medium text-[#FAFAFA] transition-colors whitespace-nowrap"
            >
              <ListPlus className="w-3.5 h-3.5" />
              <span>Add to Queue</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleLike(track.video_id)}
              className={`h-9 px-3.5 rounded-full border flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                track.liked
                  ? 'bg-[#F43F5E]/15 border-[#F43F5E]/40 text-[#F43F5E]'
                  : 'bg-[#222226] border-[#27272A] text-[#FAFAFA] hover:bg-[#27272A]'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${track.liked ? 'fill-[#F43F5E]' : ''}`} />
              <span>{track.liked ? 'Liked' : 'Like'}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleOffline(track.video_id)}
              className={`h-9 px-3.5 rounded-full border flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                track.offline
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-[#222226] border-[#27272A] text-[#FAFAFA] hover:bg-[#27272A]'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{track.offline ? 'Offline Saved' : 'Download'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenLyrics(track);
                onClose();
              }}
              className="h-9 px-3.5 rounded-full bg-[#222226] border border-[#27272A] hover:bg-[#27272A] flex items-center gap-1.5 text-xs font-medium text-[#FAFAFA] transition-colors whitespace-nowrap"
            >
              <Mic2 className="w-3.5 h-3.5" />
              <span>Lyrics</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
