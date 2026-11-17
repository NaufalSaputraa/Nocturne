import React, { useEffect, useRef, useState } from 'react';
import { Heart, Mic2, Radio, RotateCcw } from 'lucide-react';
import {
  formatTimeSec,
  type DemoTrack,
} from '../../data/mockLibrary';
import type { LyricLine } from '../../types/nocturne';
import { InteractiveLyricLine } from '../lyrics/InteractiveLyricLine';
import { ArtworkImage } from '../ui/ArtworkImage';

export interface RightPanelProps {
  currentTrack: DemoTrack;
  queue: DemoTrack[];
  canUndoClear: boolean;
  autoplayEnabled: boolean;
  currentTimeMs: number;
  lyrics: LyricLine[];
  lyricOffsetMs?: number;
  onToggleAutoplay: () => void;
  onClearQueue: () => void;
  onUndoClearQueue: () => void;
  onSelectTrack: (track: DemoTrack) => void;
  onToggleLike: (videoId: string) => void;
  onSeekMs: (timeMs: number) => void;
  onOpenLyricsView: () => void;
  onInspectTrack?: (track: DemoTrack) => void;
  activeTab?: 'queue' | 'lyrics';
  onTabChange?: (tab: 'queue' | 'lyrics') => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  currentTrack,
  queue,
  canUndoClear,
  autoplayEnabled,
  currentTimeMs,
  lyrics,
  lyricOffsetMs = 0,
  onToggleAutoplay,
  onClearQueue,
  onUndoClearQueue,
  onSelectTrack,
  onToggleLike,
  onSeekMs,
  onOpenLyricsView,
  onInspectTrack,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<'queue' | 'lyrics'>('queue');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: 'queue' | 'lyrics') => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };
  const activeLyricRef = useRef<HTMLDivElement>(null);
  const effectiveTimeMs = currentTimeMs + lyricOffsetMs;
  const activeLyricIdx = lyrics.findIndex(
    (line) => effectiveTimeMs >= line.start_time_ms && effectiveTimeMs < line.end_time_ms,
  );

  useEffect(() => {
    if (activeTab === 'lyrics' && activeLyricRef.current?.scrollIntoView) {
      activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLyricIdx, activeTab]);

  return (
    <aside className="w-[300px] shrink-0 bg-[#18181B] border-l border-[#27272A] p-4 flex flex-col gap-4 overflow-hidden select-none">
      {/* Segmented Tab Switch */}
      <div
        role="tablist"
        aria-label="Queue and lyrics panel"
        className="flex items-center p-1 bg-[#121212] rounded-lg border border-[#27272A] shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'queue'}
          onClick={() => setActiveTab('queue')}
          className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'queue'
              ? 'bg-[#27272A] text-white'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          Queue
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'lyrics'}
          onClick={() => setActiveTab('lyrics')}
          className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'lyrics'
              ? 'bg-[#27272A] text-white'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          Lyrics
        </button>
      </div>

      {/* Compact Now Playing Header Card */}
      <div
        role={onInspectTrack ? 'button' : undefined}
        tabIndex={onInspectTrack ? 0 : undefined}
        onClick={() => onInspectTrack?.(currentTrack)}
        onKeyDown={(e) => {
          if (onInspectTrack && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onInspectTrack(currentTrack);
          }
        }}
        title={onInspectTrack ? 'View track details' : undefined}
        className={`flex items-center gap-3 p-2.5 rounded-xl bg-[#121212] border border-[#27272A] shrink-0 ${
          onInspectTrack ? 'cursor-pointer hover:bg-[#222226]/70 transition-colors' : ''
        }`}
      >
        <ArtworkImage
          src={currentTrack.thumbnail_url}
          alt={currentTrack.title}
          className="w-12 h-12 rounded-lg aspect-square object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#FAFAFA] truncate">
            {currentTrack.title}
          </h3>
          <p className="text-xs text-[#A1A1AA] truncate">{currentTrack.artist}</p>
          <p className="text-[11px] text-[#8E8E98] truncate mt-0.5">
            {currentTrack.album}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggleLike(currentTrack.video_id)}
          aria-label={currentTrack.liked ? 'Unlike track' : 'Like track'}
          className={`p-1.5 rounded-lg transition-colors shrink-0 ${
            currentTrack.liked
              ? 'text-[#F43F5E] hover:bg-[#222226]'
              : 'text-[#8E8E98] hover:text-white hover:bg-[#222226]'
          }`}
        >
          <Heart className={`w-4 h-4 ${currentTrack.liked ? 'fill-[#F43F5E]' : ''}`} />
        </button>
      </div>

      {activeTab === 'queue' ? (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <span className="text-xs font-medium text-[#8E8E98] whitespace-nowrap">
              Next in queue
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleAutoplay}
                aria-pressed={autoplayEnabled}
                title="Automatically queue related tracks"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap ${
                  autoplayEnabled
                    ? 'bg-[#F43F5E]/15 text-[#F43F5E] border-[#F43F5E]/40'
                    : 'bg-[#222226] text-[#A1A1AA] border-[#27272A] hover:text-white'
                }`}
              >
                <Radio className="w-3 h-3" />
                <span>Autoplay</span>
              </button>
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={onClearQueue}
                  className="text-xs text-[#8E8E98] hover:text-white transition-colors whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {canUndoClear && queue.length === 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#222226] border border-[#27272A] text-xs shrink-0">
              <span className="text-[#A1A1AA]">Queue cleared</span>
              <button
                type="button"
                onClick={onUndoClearQueue}
                className="inline-flex items-center gap-1 text-[#F43F5E] font-medium hover:underline whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Undo</span>
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1 overflow-y-auto pr-0.5 flex-1 min-h-0">
            {queue.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8E8E98] px-3">
                {autoplayEnabled
                  ? 'Autoplay is on — related tracks will queue automatically.'
                  : 'Your queue is empty. Pick a song to start listening.'}
              </div>
            ) : (
              queue.map((track) => (
                <button
                  key={track.video_id}
                  type="button"
                  onClick={() => onSelectTrack(track)}
                  className="w-full flex items-center gap-3 p-1.5 rounded-lg hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 transition-colors text-left group"
                >
                  <ArtworkImage
                    src={track.thumbnail_url}
                    alt={track.title}
                    className="w-10 h-10 rounded-md aspect-square object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#FAFAFA] truncate group-hover:text-white">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-[#A1A1AA] truncate">{track.artist}</p>
                  </div>
                  <span className="text-xs font-mono text-[#8E8E98] tabular-nums shrink-0">
                    {formatTimeSec(track.duration_sec)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-[#8E8E98] whitespace-nowrap">
              Synced lyrics
            </span>
            <button
              type="button"
              onClick={onOpenLyricsView}
              className="inline-flex items-center gap-1 text-xs text-[#F43F5E] hover:underline whitespace-nowrap"
            >
              <Mic2 className="w-3 h-3" />
              <span>Lyrics</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pl-5 pr-1">
            {lyrics.length === 0 ? (
              <p className="text-xs text-[#8E8E98] py-6 text-center">
                No synced lyrics available for this track.
              </p>
            ) : (
              lyrics.map((line, idx) => {
                const isActive = idx === activeLyricIdx;
                const isPast = effectiveTimeMs >= line.end_time_ms;
                return (
                  <div
                    key={line.start_time_ms}
                    ref={isActive ? activeLyricRef : undefined}
                  >
                    <InteractiveLyricLine
                      text={line.text}
                      startTimeMs={line.start_time_ms}
                      endTimeMs={line.end_time_ms}
                      currentTimeMs={effectiveTimeMs}
                      isActive={isActive}
                      isPast={isPast}
                      words={line.words}
                      fontSizeClass="text-sm"
                      onClickLine={(t) => onSeekMs(Math.max(0, t - lyricOffsetMs))}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
