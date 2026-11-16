import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Heart,
  Minus,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  X,
} from 'lucide-react';
import {
  formatTimeSec,
  type DemoLyricLine,
  type DemoTrack,
} from '../data/mockLibrary';
import { runWindowAction } from '../lib/windowControls';
import { InteractiveLyricLine } from '../components/lyrics/InteractiveLyricLine';

export interface ZenLyricsViewProps {
  currentTrack: DemoTrack;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  shuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  upNext: DemoTrack[];
  lyrics: DemoLyricLine[];
  lyricSource: 'LRCLIB' | 'YouTube Music';
  lyricOffsetMs: number;
  onBack: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLike: (videoId: string) => void;
  onSeekMs: (timeMs: number) => void;
  onSelectTrack: (track: DemoTrack) => void;
  onAdjustOffsetMs: (deltaMs: number) => void;
}

const RING_RADIUS = 150;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const ZenLyricsView: React.FC<ZenLyricsViewProps> = ({
  currentTrack,
  isPlaying,
  currentTimeMs,
  durationMs,
  shuffle,
  repeatMode,
  upNext,
  lyrics,
  lyricSource,
  lyricOffsetMs,
  onBack,
  onTogglePlay,
  onPrev,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
  onToggleLike,
  onSeekMs,
  onSelectTrack,
  onAdjustOffsetMs,
}) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [largeText, setLargeText] = useState(false);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const progress =
    durationMs > 0 ? Math.min(1, Math.max(0, currentTimeMs / durationMs)) : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  const angleRad = progress * Math.PI * 2;
  const knobX = 160 + RING_RADIUS * Math.sin(angleRad);
  const knobY = 160 - RING_RADIUS * Math.cos(angleRad);

  const effectiveTimeMs = currentTimeMs + lyricOffsetMs;
  const activeIdx = lyrics.findIndex(
    (line) => effectiveTimeMs >= line.start_time_ms && effectiveTimeMs < line.end_time_ms,
  );

  useEffect(() => {
    if (autoScroll && activeLineRef.current?.scrollIntoView) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIdx, autoScroll]);

  const handleRingClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let theta = Math.atan2(dx, -dy);
    if (theta < 0) theta += Math.PI * 2;
    onSeekMs(Math.round((theta / (Math.PI * 2)) * durationMs));
  };

  return (
    <div className="h-screen w-screen bg-[#121212] text-[#FAFAFA] flex flex-col overflow-hidden select-none">
      {/* Top Window Header */}
      <header
        data-tauri-drag-region
        className="h-14 min-h-[56px] w-full px-6 flex items-center justify-between border-b border-[#27272A]/70 bg-[#121212] z-30"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#18181B] border border-[#27272A] text-sm text-[#FAFAFA] hover:bg-[#222226] transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4 text-[#A1A1AA]" />
            <span className="font-medium tracking-tight">Back to Library</span>
          </button>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#18181B] border border-[#27272A]">
          <span className="w-2 h-2 rounded-full bg-[#F43F5E] animate-pulse" />
          <span className="text-xs font-medium text-[#A1A1AA] tracking-wide whitespace-nowrap">
            YouTube Audio • Ad-Free
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#18181B] border border-[#27272A] text-xs">
            <span className="text-[#71717A] whitespace-nowrap">Timing</span>
            <button
              type="button"
              onClick={() => onAdjustOffsetMs(-100)}
              className="px-1.5 py-0.5 rounded bg-[#222226] hover:bg-[#27272A] text-[#FAFAFA] font-mono tabular-nums whitespace-nowrap"
              title="Show lyrics 100ms earlier"
            >
              -100ms
            </button>
            <span className="font-mono tabular-nums text-[#FAFAFA] min-w-[48px] text-center">
              {lyricOffsetMs >= 0 ? `+${lyricOffsetMs}ms` : `${lyricOffsetMs}ms`}
            </span>
            <button
              type="button"
              onClick={() => onAdjustOffsetMs(100)}
              className="px-1.5 py-0.5 rounded bg-[#222226] hover:bg-[#27272A] text-[#FAFAFA] font-mono tabular-nums whitespace-nowrap"
              title="Show lyrics 100ms later"
            >
              +100ms
            </button>
          </div>

          <div className="flex items-center border-l border-[#27272A] pl-2">
            <button
              type="button"
              onClick={() => void runWindowAction('minimize')}
              aria-label="Minimize"
              title="Minimize"
              className="w-9 h-8 flex items-center justify-center text-[#A1A1AA] hover:bg-[#27272A] hover:text-white rounded"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void runWindowAction('toggleMaximize')}
              aria-label="Maximize"
              title="Maximize"
              className="w-9 h-8 flex items-center justify-center text-[#A1A1AA] hover:bg-[#27272A] hover:text-white rounded"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => void runWindowAction('close')}
              aria-label="Close"
              title="Close"
              className="w-9 h-8 flex items-center justify-center text-[#A1A1AA] hover:bg-[#E81123] hover:text-white rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main 2-Column Stage */}
      <main className="flex-1 flex flex-row w-full min-h-0 overflow-hidden">
        {/* Left Column (45%): Vinyl Deck & Radial Seek Ring */}
        <section className="w-[45%] max-w-[580px] h-full p-8 flex flex-col justify-between items-center border-r border-[#27272A]/70 bg-[#121212] relative overflow-hidden">
          <div
            data-testid="zen-ambient-glow"
            style={{
              backgroundColor: currentTrack.accentColor,
              opacity: 0.12,
              filter: 'blur(96px)',
            }}
            className="absolute w-[440px] h-[440px] -top-4 pointer-events-none rounded-full"
          />

          <div className="relative flex flex-col items-center justify-center mt-2 z-10">
            <div className="relative w-[320px] h-[320px] flex items-center justify-center">
              <svg
                onClick={handleRingClick}
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
                className="w-[320px] h-[320px] -rotate-90 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60"
                viewBox="0 0 320 320"
                role="slider"
                aria-label="Radial seek ring"
                aria-valuemin={0}
                aria-valuemax={durationMs}
                aria-valuenow={Math.round(currentTimeMs)}
              >
                <circle
                  cx="160"
                  cy="160"
                  r={RING_RADIUS}
                  fill="transparent"
                  stroke="#27272A"
                  strokeWidth="3.5"
                />
                <circle
                  cx="160"
                  cy="160"
                  r={RING_RADIUS}
                  fill="transparent"
                  stroke="#F43F5E"
                  strokeDasharray={RING_CIRCUMFERENCE.toFixed(2)}
                  strokeDashoffset={dashOffset.toFixed(2)}
                  strokeLinecap="round"
                  strokeWidth="3.5"
                />
              </svg>

              <div
                style={{ left: `${knobX - 7}px`, top: `${knobY - 7}px` }}
                className="absolute w-3.5 h-3.5 rounded-full bg-white border border-[#18181B] pointer-events-none"
              />

              <div className="absolute w-[280px] h-[280px] rounded-full overflow-hidden bg-[#09090B] border border-[#27272A] flex items-center justify-center pointer-events-none">
                <div className="absolute inset-0 vinyl-grooves rounded-full z-10" />
                <div
                  className={`w-full h-full rounded-full overflow-hidden ${
                    isPlaying ? 'animate-vinyl-spin' : 'animate-vinyl-paused'
                  }`}
                >
                  <img
                    src={currentTrack.thumbnail_url}
                    alt={currentTrack.title}
                    className="w-full h-full aspect-square object-cover rounded-full"
                  />
                </div>
                <div className="absolute z-20 w-[64px] h-[64px] rounded-full bg-[#18181B] border-2 border-[#27272A] flex flex-col items-center justify-center gap-1">
                  <span className="text-[7px] font-mono tracking-widest text-[#A1A1AA] uppercase font-bold">
                    NOCTURNE
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#121212] border border-[#3F3F46]" />
                </div>
              </div>
            </div>

            <div className="w-[260px] flex items-center justify-between mt-3 px-2 font-mono text-xs tabular-nums">
              <span className="text-[#FAFAFA] font-medium">
                {formatTimeSec(currentTimeMs / 1000)}
              </span>
              <span className="text-[#71717A]">
                {formatTimeSec(durationMs / 1000)}
              </span>
            </div>

            <div className="flex items-center justify-center gap-7 mt-5">
              <button
                type="button"
                onClick={onToggleShuffle}
                aria-label="Shuffle"
                className={`p-1.5 transition-colors ${
                  shuffle ? 'text-[#F43F5E]' : 'text-[#71717A] hover:text-white'
                }`}
              >
                <Shuffle className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onPrev}
                aria-label="Previous"
                className="p-1.5 text-[#A1A1AA] hover:text-white transition-colors"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-[52px] h-[52px] rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
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
                className="p-1.5 text-[#A1A1AA] hover:text-white transition-colors"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
              <button
                type="button"
                onClick={onCycleRepeat}
                aria-label={`Repeat: ${repeatMode}`}
                className={`p-1.5 relative transition-colors ${
                  repeatMode !== 'off'
                    ? 'text-[#F43F5E]'
                    : 'text-[#71717A] hover:text-white'
                }`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-5 h-5" />
                ) : (
                  <Repeat className="w-5 h-5" />
                )}
                {repeatMode !== 'off' && (
                  <span className="absolute bottom-0.5 right-1 w-1 h-1 rounded-full bg-[#F43F5E]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onToggleLike(currentTrack.video_id)}
                aria-label="Like"
                className={`p-1.5 transition-transform hover:scale-110 ${
                  currentTrack.liked ? 'text-[#F43F5E]' : 'text-[#71717A] hover:text-white'
                }`}
              >
                <Heart
                  className={`w-5 h-5 ${currentTrack.liked ? 'fill-[#F43F5E]' : ''}`}
                />
              </button>
            </div>
          </div>

          <div className="w-full mt-auto pt-5 border-t border-[#27272A]/60 z-10">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] uppercase tracking-wider text-[#71717A] font-semibold whitespace-nowrap">
                UP NEXT
              </span>
              <button
                type="button"
                onClick={onBack}
                className="text-xs text-[#A1A1AA] hover:text-white transition-colors font-medium whitespace-nowrap"
              >
                Full Queue
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5 w-full">
              {upNext.slice(0, 3).map((track) => (
                <button
                  key={track.video_id}
                  type="button"
                  onClick={() => onSelectTrack(track)}
                  className="bg-[#18181B] border border-[#27272A] rounded-xl p-2.5 flex items-center gap-2.5 hover:bg-[#222226] transition-colors text-left group min-w-0"
                >
                  <img
                    src={track.thumbnail_url}
                    alt={track.title}
                    className="w-9 h-9 rounded-full aspect-square object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#FAFAFA] truncate">
                      {track.title}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-[#71717A]">
                      <span className="truncate">{track.artist}</span>
                      <span className="font-mono tabular-nums ml-1 shrink-0">
                        {formatTimeSec(track.duration_sec)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column (55%): Character-by-Character Synced Lyrics */}
        <section className="w-[55%] h-full p-10 flex flex-col justify-between bg-[#121212] relative overflow-hidden">
          <div className="flex items-start justify-between z-10">
            <div>
              <h1 className="text-3xl font-bold text-[#FAFAFA] tracking-tight">
                {currentTrack.title}
              </h1>
              <p className="text-[15px] font-medium text-[#A1A1AA] mt-1 flex items-center gap-2">
                <span>{currentTrack.artist}</span>
                <span className="text-[#3F3F46]">•</span>
                <span className="text-[#71717A]">{currentTrack.album}</span>
                <span className="text-[#3F3F46]">•</span>
                <span className="text-xs text-[#71717A] font-mono tabular-nums">
                  {currentTrack.year}
                </span>
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181B] border border-[#27272A] text-emerald-400 text-xs font-medium tracking-wide whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>SYNCED LYRICS</span>
            </div>
          </div>

          <div className="my-auto py-6 px-5 lyrics-mask flex flex-col space-y-5 z-10 max-h-[580px] overflow-y-auto">
            {lyrics.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-base font-medium text-[#A1A1AA]">
                  Instrumental or no synced lyrics available
                </p>
                <p className="text-xs text-[#71717A] mt-1">
                  Enjoy the music in distraction-free mode.
                </p>
              </div>
            ) : (
              lyrics.map((line, idx) => {
                const isActive = idx === activeIdx;
                const isPast = effectiveTimeMs >= line.end_time_ms;
                return (
                  <div
                    key={line.start_time_ms}
                    ref={isActive ? activeLineRef : undefined}
                  >
                    <InteractiveLyricLine
                      text={line.text}
                      startTimeMs={line.start_time_ms}
                      endTimeMs={line.end_time_ms}
                      currentTimeMs={effectiveTimeMs}
                      isActive={isActive}
                      isPast={isPast}
                      fontSizeClass={largeText ? 'text-[32px]' : 'text-[28px]'}
                      onClickLine={(t) => onSeekMs(Math.max(0, t - lyricOffsetMs))}
                    />
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-[#71717A] pt-4 border-t border-[#27272A]/60 z-10">
            <span>Synced via {lyricSource} • Click any line to jump</span>

            <div className="flex items-center gap-4 text-[#A1A1AA]">
              <button
                type="button"
                onClick={() => setLargeText((v) => !v)}
                className="hover:text-white transition-colors flex items-center gap-1.5 font-mono text-xs whitespace-nowrap"
              >
                <span>Text</span>
                <span className="text-xs bg-[#18181B] border border-[#27272A] px-1.5 py-0.5 rounded text-[#FAFAFA]">
                  {largeText ? 'Large' : 'Normal'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAutoScroll((v) => !v)}
                className="hover:text-white transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    autoScroll ? 'text-emerald-400' : 'text-[#71717A]'
                  }`}
                />
                <span>Auto-scroll {autoScroll ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
