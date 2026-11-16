import { describe, expect, it } from 'vitest';
import {
  applySyncToAnchor,
  computeClockTimeMs,
  type ClockAnchor,
} from './usePlaybackClock';

describe('usePlaybackClock', () => {
  it('freezes time when paused or buffering', () => {
    const pausedAnchor: ClockAnchor = {
      anchorPositionMs: 42_000,
      anchorPerfNow: 1_000,
      durationMs: 180_000,
      isPlaying: false,
      isBuffering: false,
    };
    expect(computeClockTimeMs(pausedAnchor, 5_000)).toBe(42_000);

    const bufferingAnchor: ClockAnchor = {
      ...pausedAnchor,
      isPlaying: true,
      isBuffering: true,
    };
    expect(computeClockTimeMs(bufferingAnchor, 5_000)).toBe(42_000);
  });

  it('resets anchors on buffering sync and post-seek sync', () => {
    const playingAnchor: ClockAnchor = {
      anchorPositionMs: 42_000,
      anchorPerfNow: 1_000,
      durationMs: 180_000,
      isPlaying: true,
      isBuffering: false,
    };

    const postSeekBuffering = applySyncToAnchor(
      playingAnchor,
      {
        position_ms: 90_000,
        duration_ms: 180_000,
        is_playing: true,
        is_buffering: true,
        server_ts_ms: 1_700_000_000_000,
      },
      1_200,
    );

    expect(postSeekBuffering.anchorPositionMs).toBe(90_000);
    expect(postSeekBuffering.anchorPerfNow).toBe(1_200);
    // Remains frozen while buffering
    expect(computeClockTimeMs(postSeekBuffering, 2_500)).toBe(90_000);

    const resumed = applySyncToAnchor(
      postSeekBuffering,
      {
        position_ms: 90_050,
        duration_ms: 180_000,
        is_playing: true,
        is_buffering: false,
        server_ts_ms: 1_700_000_000_500,
      },
      2_600,
    );
    expect(computeClockTimeMs(resumed, 3_100)).toBe(90_550);
  });
});
