import { describe, expect, it } from 'vitest';
import { computeLyricSweep } from './InteractiveLyricLine';

describe('InteractiveLyricLine', () => {
  it('caps sweep duration at 90ms per character before long interlude', () => {
    const res = computeLyricSweep('Wait', 10_000, 26_000);
    expect(res.activeSweepDuration).toBe(360);
    expect(res.words.length).toBe(1);
    expect(res.words[0].length).toBe(4);
  });

  it('uses exact Enhanced LRC word timestamps when timedWords are provided', () => {
    const res = computeLyricSweep('Hello world', 1_000, 5_000, [
      { start_time_ms: 1_000, end_time_ms: 1_500, text: 'Hello ' },
      { start_time_ms: 2_000, end_time_ms: 2_800, text: 'world' },
    ]);
    expect(res.words.length).toBe(2);
    expect(res.words[0][0].charStart).toBe(1_000);
    expect(res.words[1][0].charStart).toBe(2_000);
  });
});
