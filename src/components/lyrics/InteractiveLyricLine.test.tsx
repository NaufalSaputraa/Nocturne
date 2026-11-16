import { describe, expect, it } from 'vitest';
import { computeLyricSweep } from './InteractiveLyricLine';

describe('InteractiveLyricLine', () => {
  it('caps sweep duration at 90ms per character before long interlude', () => {
    const res = computeLyricSweep('Wait', 10_000, 26_000);
    expect(res.activeSweepDuration).toBe(360);
    expect(res.words.length).toBe(1);
    expect(res.words[0].length).toBe(4);
  });
});
