import React, { useMemo } from 'react';

export interface SweptChar {
  char: string;
  charStart: number;
  charEnd: number;
}

export interface LyricSweepResult {
  activeSweepDuration: number;
  words: SweptChar[][];
}

/**
 * Computes per-character karaoke timing while capping sweep speed at 90ms/char
 * so short lines before long instrumental interludes animate at natural vocal cadence.
 */
export function computeLyricSweep(
  text: string,
  startTimeMs: number,
  endTimeMs: number,
): LyricSweepResult {
  const totalChars = Math.max(text.length, 1);
  const totalDuration = Math.max(endTimeMs - startTimeMs, 200);
  const activeSweepDuration = Math.min(totalDuration * 0.88, text.length * 90);

  let globalCharIndex = 0;
  const words = text.split(' ').map((word) => {
    const chars = word.split('').map((char) => {
      const charStart = startTimeMs + (globalCharIndex / totalChars) * activeSweepDuration;
      const charEnd =
        startTimeMs + ((globalCharIndex + 1.8) / totalChars) * activeSweepDuration;
      globalCharIndex++;
      return { char, charStart, charEnd };
    });
    globalCharIndex++;
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
  fontSizeClass = 'text-[28px]',
  onClickLine,
}) => {
  const { words } = useMemo(
    () => computeLyricSweep(text, startTimeMs, endTimeMs),
    [text, startTimeMs, endTimeMs],
  );

  return (
    <div
      onClick={() => onClickLine?.(startTimeMs)}
      className={`cursor-pointer select-none transition-all duration-300 ease-out rounded-xl ${
        isActive
          ? 'opacity-100 scale-[1.01] origin-left border-l-[3.5px] border-[#F43F5E] pl-5 -ml-5 py-2'
          : isPast
            ? 'opacity-40 hover:opacity-75 py-1.5'
            : 'opacity-35 hover:opacity-70 py-1.5'
      }`}
    >
      <p
        className={`${fontSizeClass} leading-[1.4] font-bold tracking-tight flex flex-wrap gap-x-[0.28em]`}
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
                        ? `rgba(255, 255, 255, ${0.45 + progress * 0.55})`
                        : isPast
                          ? 'rgba(113, 113, 122, 0.85)'
                          : 'rgba(161, 161, 170, 0.55)',
                    textShadow:
                      isActive && popCurve > 0.1
                        ? `0 0 ${(popCurve * 18).toFixed(1)}px rgba(255, 255, 255, ${(popCurve * 0.55).toFixed(2)})`
                        : 'none',
                  }}
                  className="inline-block will-change-transform transition-[color] duration-75"
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
