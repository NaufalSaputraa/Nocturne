import React, { useMemo } from 'react';
import type { LyricWord } from '../../types/nocturne';

export interface SweptChar {
  char: string;
  charStart: number;
  charEnd: number;
}

export interface LyricSweepResult {
  activeSweepDuration: number;
  words: SweptChar[][];
}

function charWeight(ch: string): number {
  if (ch === ',' || ch === ';' || ch === '—') return 1.8;
  if (ch === '.' || ch === '!' || ch === '?') return 2.2;
  if (ch === ' ') return 0.55;
  return 1.0;
}

/**
 * Computes per-character karaoke timing. Uses exact Enhanced LRC word timestamps
 * when available, and falls back to punctuation-weighted interpolation capped at
 * 90ms/char so short lines before long instrumental interludes animate naturally.
 */
export function computeLyricSweep(
  text: string,
  startTimeMs: number,
  endTimeMs: number,
  timedWords?: LyricWord[],
): LyricSweepResult {
  if (timedWords && timedWords.length > 0) {
    const words: SweptChar[][] = [];
    for (const tw of timedWords) {
      const wordDur = Math.max(tw.end_time_ms - tw.start_time_ms, 40);
      const parts = tw.text.split(' ');
      let cursor = 0;
      const totalLen = Math.max(tw.text.length, 1);
      for (const part of parts) {
        if (!part) {
          cursor++;
          continue;
        }
        const chars = part.split('').map((char) => {
          const charStart = tw.start_time_ms + (cursor / totalLen) * wordDur;
          const charEnd = tw.start_time_ms + ((cursor + 1.2) / totalLen) * wordDur;
          cursor++;
          return { char, charStart, charEnd };
        });
        cursor++;
        words.push(chars);
      }
    }
    const lastEnd = timedWords[timedWords.length - 1]?.end_time_ms ?? endTimeMs;
    return {
      activeSweepDuration: Math.max(lastEnd - startTimeMs, 1),
      words,
    };
  }

  const totalChars = Math.max(text.length, 1);
  const totalDuration = Math.max(endTimeMs - startTimeMs, 200);
  const activeSweepDuration = Math.min(totalDuration * 0.88, totalChars * 90);

  const rawWords = text.split(' ');
  const totalWeight = Math.max(
    text.split('').reduce((acc, ch) => acc + charWeight(ch), 0),
    1,
  );

  let elapsedWeight = 0;
  const words = rawWords.map((word, wIdx) => {
    const chars = word.split('').map((char) => {
      const w = charWeight(char);
      const charStart = startTimeMs + (elapsedWeight / totalWeight) * activeSweepDuration;
      const charEnd =
        startTimeMs +
        ((elapsedWeight + Math.max(w * 1.5, 1.2)) / totalWeight) * activeSweepDuration;
      elapsedWeight += w;
      return { char, charStart, charEnd };
    });
    if (wIdx < rawWords.length - 1) {
      elapsedWeight += charWeight(' ');
    }
    return chars;
  });

  return { activeSweepDuration, words };
}

export interface InteractiveLyricLineProps {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  currentTimeMs: number;
  isActive: boolean;
  isPast: boolean;
  words?: LyricWord[];
  fontSizeClass?: string;
  onClickLine?: (timeMs: number) => void;
}

export const InteractiveLyricLine: React.FC<InteractiveLyricLineProps> = ({
  text,
  startTimeMs,
  endTimeMs,
  currentTimeMs,
  isActive,
  isPast,
  words: timedWords,
  fontSizeClass = 'text-2xl',
  onClickLine,
}) => {
  const { words } = useMemo(
    () => computeLyricSweep(text, startTimeMs, endTimeMs, timedWords),
    [text, startTimeMs, endTimeMs, timedWords],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClickLine?.(startTimeMs)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClickLine?.(startTimeMs);
        }
      }}
      className={`cursor-pointer select-none transition-[opacity,transform,border-color] duration-300 ease-out rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 ${
        isActive
          ? 'opacity-100 scale-[1.01] origin-left border-l-2 border-[#F43F5E] pl-5 -ml-5 py-2'
          : isPast
            ? 'opacity-45 hover:opacity-80 py-1.5'
            : 'opacity-40 hover:opacity-75 py-1.5'
      }`}
    >
      <p
        className={`${fontSizeClass} leading-[1.4] font-semibold flex flex-wrap gap-x-1.5`}
      >
        {words.map((wordChars, wIdx) => (
          <span key={wIdx} className="inline-flex">
            {wordChars.map((item, cIdx) => {
              let progress = 0;
              if (isPast) {
                progress = 1;
              } else if (isActive) {
                const raw =
                  (currentTimeMs - item.charStart) /
                  Math.max(item.charEnd - item.charStart, 1);
                progress = Math.min(Math.max(raw, 0), 1);
              }

              const popCurve = Math.sin(progress * Math.PI);
              const scale = isActive ? 1 + popCurve * 0.14 : 1;
              const translateY = isActive ? -popCurve * 2.5 : 0;

              return (
                <span
                  key={cIdx}
                  style={{
                    transform: `translate3d(0, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`,
                    color:
                      progress > 0.15
                        ? `rgba(255, 255, 255, ${0.5 + progress * 0.5})`
                        : isPast
                          ? 'rgba(142, 142, 152, 0.85)'
                          : 'rgba(161, 161, 170, 0.6)',
                  }}
                  className="inline-block will-change-transform"
                >
                  {item.char}
                </span>
              );
            })}
          </span>
        ))}
      </p>
    </div>
  );
};
