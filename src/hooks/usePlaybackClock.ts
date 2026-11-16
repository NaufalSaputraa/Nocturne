import { useEffect, useState } from 'react';
import type { PlaybackSyncPayload } from '../types/nocturne';

export interface ClockAnchor {
  anchorPositionMs: number;
  anchorPerfNow: number;
  durationMs: number;
  isPlaying: boolean;
  isBuffering: boolean;
}

const DEFAULT_ANCHOR: ClockAnchor = {
  anchorPositionMs: 0,
  anchorPerfNow: 0,
  durationMs: 0,
  isPlaying: false,
  isBuffering: false,
};

let currentAnchor: ClockAnchor = { ...DEFAULT_ANCHOR };
const listeners = new Set<() => void>();

/**
 * Applies a backend `playback-sync` event to the clock anchor, immediately resetting
 * `anchorPositionMs` and `anchorPerfNow` on every sync (especially buffering/seek).
 */
export function applySyncToAnchor(
  prev: ClockAnchor,
  sync: PlaybackSyncPayload,
  perfNow: number,
): ClockAnchor {
  return {
    anchorPositionMs: Math.max(0, sync.position_ms),
    anchorPerfNow: perfNow,
    durationMs: sync.duration_ms > 0 ? sync.duration_ms : prev.durationMs,
    isPlaying: sync.is_playing,
    isBuffering: sync.is_buffering,
  };
}

/**
 * Computes the interpolated playback timestamp in ms.
 * Freezes interpolation whenever `isPlaying === false` or `isBuffering === true`.
 */
export function computeClockTimeMs(anchor: ClockAnchor, perfNow: number): number {
  if (!anchor.isPlaying || anchor.isBuffering) {
    return anchor.anchorPositionMs;
  }
  const elapsed = Math.max(0, perfNow - anchor.anchorPerfNow);
  const next = anchor.anchorPositionMs + elapsed;
  return anchor.durationMs > 0 ? Math.min(anchor.durationMs, next) : next;
}

export function getClockAnchor(): ClockAnchor {
  return currentAnchor;
}

export function setClockAnchor(sync: PlaybackSyncPayload, perfNow = performance.now()): void {
  currentAnchor = applySyncToAnchor(currentAnchor, sync, perfNow);
  listeners.forEach((cb) => cb());
}

export function resetClockAnchorForSeek(
  positionMs: number,
  perfNow = performance.now(),
): void {
  currentAnchor = {
    ...currentAnchor,
    anchorPositionMs: Math.max(0, positionMs),
    anchorPerfNow: perfNow,
  };
  listeners.forEach((cb) => cb());
}

/**
 * High-precision `requestAnimationFrame` playback clock isolated from Zustand
 * re-renders so unrelated views stay completely idle during 60fps lyric/seekbar updates.
 */
export function usePlaybackClock(): number {
  const [timeMs, setTimeMs] = useState<number>(() =>
    computeClockTimeMs(currentAnchor, performance.now()),
  );

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const anchor = getClockAnchor();
      setTimeMs(computeClockTimeMs(anchor, performance.now()));
      if (anchor.isPlaying && !anchor.isBuffering) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onAnchorChange = () => {
      cancelAnimationFrame(rafId);
      const anchor = getClockAnchor();
      setTimeMs(computeClockTimeMs(anchor, performance.now()));
      if (anchor.isPlaying && !anchor.isBuffering) {
        rafId = requestAnimationFrame(tick);
      }
    };

    listeners.add(onAnchorChange);
    onAnchorChange();

    return () => {
      listeners.delete(onAnchorChange);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return timeMs;
}
