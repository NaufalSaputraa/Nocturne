import React, { useState } from 'react';
import { Heart, Mic2, Radio, RotateCcw } from 'lucide-react';
import {
  formatTimeSec,
  type DemoLyricLine,
  type DemoTrack,
} from '../../data/mockLibrary';
import { InteractiveLyricLine } from '../lyrics/InteractiveLyricLine';

export interface RightPanelProps {
  currentTrack: DemoTrack;
  queue: DemoTrack[];
  canUndoClear: boolean;
  autoplayEnabled: boolean;
  currentTimeMs: number;
  lyrics: DemoLyricLine[];
  onToggleAutoplay: () => void;
  onClearQueue: () => void;
  onUndoClearQueue: () => void;
  onSelectTrack: (track: DemoTrack) => void;
  onToggleLike: (videoId: string) => void;
  onSeekMs: (timeMs: number) => void;
  onOpenLyricsView: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  currentTrack,
  queue,
  canUndoClear,
  autoplayEnabled,
  currentTimeMs,
  lyrics,
  onToggleAutoplay,
  onClearQueue,
  onUndoClearQueue,
  onSelectTrack,
  onToggleLike,
  onSeekMs,
  onOpenLyricsView,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'lyrics'>('queue');

  return (
    <aside className="w-[300px] shrink-0 bg-[#18181B] border-l border-[#27272A] p-4 flex flex-col gap-4 overflow-hidden select-none">
      {/* Segmented Tab Switch */}
      <div className="flex items-center p-1 bg-[#121212] rounded-lg border border-[#27272A] shrink-0">
        <button
          type="button"
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

      {/* Compact Now Playing Header Card (gives Queue/Lyrics much more vertical space) */}
      <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#121212] border border-[#27272A] shrink-0">
        <img
          src={currentTrack.thumbnail_url}
          alt={currentTrack.title}
          className="w-14 h-14 rounded-lg aspect-square object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#FAFAFA] truncate">
            {currentTrack.title}
          </h3>
          <p className="text-xs text-[#A1A1AA] truncate">{currentTrack.artist}</p>
          <p className="text-[11px] text-[#71717A] truncate mt-0.5">
            {currentTrack.album}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggleLike(currentTrack.video_id)}
          aria-label={currentTrack.liked ? 'Unlike track' : 'Like track'}
          className={`p-1.5 rounded-full transition-transform hover:scale-110 shrink-0 ${
            currentTrack.liked ? 'text-[#F43F5E]' : 'text-[#71717A] hover:text-white'
          }`}
        >
          <Heart className={`w-4 h-4 ${currentTrack.liked ? 'fill-[#F43F5E]' : ''}`} />
        </button>
      </div>

      {activeTab === 'queue' ? (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] uppercase font-semibold text-[#71717A] tracking-wider whitespace-nowrap">
              Next in Queue
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleAutoplay}
                aria-pressed={autoplayEnabled}
                title="Automatically queue related tracks"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap ${
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
                  className="text-xs text-[#71717A] hover:text-white transition-colors whitespace-nowrap"
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
              <div className="py-8 text-center text-xs text-[#71717A] px-3">
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
                  <img
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
                  <span className="text-xs font-mono text-[#71717A] tabular-nums shrink-0">
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
            <span className="text-[11px] uppercase font-semibold text-[#71717A] tracking-wider whitespace-nowrap">
              Synced Lyrics
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
              <p className="text-xs text-[#71717A] py-6 text-center">
                No synced lyrics available for this track.
              </p>
            ) : (
              lyrics.map((line) => {
                const isActive =
                  currentTimeMs >= line.start_time_ms && currentTimeMs < line.end_time_ms;
                const isPast = currentTimeMs >= line.end_time_ms;
                return (
                  <InteractiveLyricLine
                    key={line.start_time_ms}
                    text={line.text}
                    startTimeMs={line.start_time_ms}
                    endTimeMs={line.end_time_ms}
                    currentTimeMs={currentTimeMs}
                    isActive={isActive}
                    isPast={isPast}
                    fontSizeClass="text-sm"
                    onClickLine={onSeekMs}
                  />
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
