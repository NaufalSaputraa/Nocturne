import React from 'react';
import {
  Heart,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatTimeSec, type DemoTrack } from '../../data/mockLibrary';

export interface PlayerDockProps {
  currentTrack: DemoTrack;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  shuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  volume: number;
  muted: boolean;
  showRightPanel: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSeekMs: (timeMs: number) => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onToggleLike: (videoId: string) => void;
  onOpenZenMode: () => void;
  onToggleRightPanel: () => void;
}

export const PlayerDock: React.FC<PlayerDockProps> = ({
  currentTrack,
  isPlaying,
  currentTimeMs,
  durationMs,
  shuffle,
  repeatMode,
  volume,
  muted,
  showRightPanel,
  onTogglePlay,
  onPrev,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
  onSeekMs,
  onVolumeChange,
  onToggleMute,
  onToggleLike,
  onOpenZenMode,
  onToggleRightPanel,
}) => {
  const progressPct =
    durationMs > 0 ? Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100)) : 0;

  const handleBarSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeekMs(Math.round(ratio * durationMs));
  };

  return (
    <footer className="h-20 w-full bg-[#18181B] border-t border-[#27272A] shrink-0 px-6 flex items-center justify-between select-none z-40">
      {/* Left: Currently Playing Song (25%) */}
      <div className="w-1/4 flex items-center gap-3 min-w-0">
        <img
          src={currentTrack.thumbnail_url}
          alt={currentTrack.title}
          className="w-12 h-12 rounded-md aspect-square object-cover shrink-0 border border-[#27272A]"
        />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-[#FAFAFA] truncate">
            {currentTrack.title}
          </span>
          <span className="text-xs text-[#A1A1AA] truncate">{currentTrack.artist}</span>
        </div>
        <button
          type="button"
          onClick={() => onToggleLike(currentTrack.video_id)}
          title={currentTrack.liked ? 'Liked' : 'Like song'}
          className={`ml-1 p-1.5 rounded-lg transition-colors shrink-0 ${
            currentTrack.liked
              ? 'text-[#F43F5E] hover:bg-[#222226]'
              : 'text-[#8E8E98] hover:text-white hover:bg-[#222226]'
          }`}
        >
          <Heart className={`w-4 h-4 ${currentTrack.liked ? 'fill-[#F43F5E]' : ''}`} />
        </button>
      </div>

      {/* Center: Transport Controls & Scrub Bar (50%) */}
      <div className="w-2/4 flex flex-col items-center gap-1.5 px-4">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={onToggleShuffle}
            aria-label="Shuffle"
            title="Shuffle"
            className={`transition-colors ${
              shuffle ? 'text-[#F43F5E]' : 'text-[#8E8E98] hover:text-[#FAFAFA]'
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous"
            title="Previous"
            className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-[#E4E4E7] transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            aria-label="Next"
            title="Next"
            className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          <button
            type="button"
            onClick={onCycleRepeat}
            aria-label={`Repeat: ${repeatMode}`}
            title={`Repeat: ${repeatMode}`}
            className={`relative transition-colors ${
              repeatMode !== 'off'
                ? 'text-[#F43F5E]'
                : 'text-[#8E8E98] hover:text-[#FAFAFA]'
            }`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-4 h-4" />
            ) : (
              <Repeat className="w-4 h-4" />
            )}
            {repeatMode !== 'off' && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#F43F5E] rounded-full" />
            )}
          </button>
        </div>

        <div className="w-full max-w-lg flex items-center gap-3">
          <span className="text-xs font-mono text-[#A1A1AA] w-10 text-right tabular-nums">
            {formatTimeSec(currentTimeMs / 1000)}
          </span>
          <div
            onClick={handleBarSeek}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              handleBarSeek(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) handleBarSeek(e);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                onSeekMs(Math.min(durationMs, currentTimeMs + 5_000));
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onSeekMs(Math.max(0, currentTimeMs - 5_000));
              }
            }}
            tabIndex={0}
            role="slider"
            aria-label="Seek position"
            aria-valuemin={0}
            aria-valuemax={durationMs}
            aria-valuenow={Math.round(currentTimeMs)}
            className="flex-1 h-1.5 bg-[#27272A] rounded-full overflow-hidden relative cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60"
          >
            <div
              className="h-full bg-[#FAFAFA] group-hover:bg-[#F43F5E] transition-colors rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-mono text-[#8E8E98] w-10 tabular-nums">
            {formatTimeSec(durationMs / 1000)}
          </span>
        </div>
      </div>

      {/* Right: Zen Lyrics Trigger, Queue Toggle & Volume (25%) */}
      <div className="w-1/4 flex items-center justify-end gap-3 text-[#A1A1AA]">
        <button
          type="button"
          onClick={onOpenZenMode}
          title="Enter Zen Focus Lyrics Mode"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#222226] border border-[#27272A] text-xs font-medium text-[#FAFAFA] hover:border-[#3F3F46] hover:bg-[#28282D] transition-colors whitespace-nowrap"
        >
          <Mic2 className="w-3.5 h-3.5 text-[#F43F5E]" />
          <span>Lyrics</span>
        </button>

        <button
          type="button"
          onClick={onToggleRightPanel}
          aria-label="Toggle Queue Panel"
          title="Toggle Queue Panel"
          className={`p-1.5 rounded-lg transition-colors ${
            showRightPanel
              ? 'text-white bg-[#222226]'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <ListMusic className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="hover:text-white transition-colors"
          >
            {muted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            aria-label="Volume"
            className="w-20 accent-[#FAFAFA] cursor-pointer h-1 bg-[#27272A] rounded-full"
          />
        </div>
      </div>
    </footer>
  );
};
