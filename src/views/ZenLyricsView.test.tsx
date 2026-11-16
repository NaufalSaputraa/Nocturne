import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_TRACKS, DEMO_ZEN_LYRICS } from '../data/mockLibrary';
import { ZenLyricsView } from './ZenLyricsView';

describe('ZenLyricsView', () => {
  it('renders radial seek ring, 3 Up next cards, and lyric offset controls', () => {
    const onAdjustOffsetMs = vi.fn();
    render(
      <ZenLyricsView
        currentTrack={DEMO_TRACKS[0]}
        isPlaying={true}
        currentTimeMs={60_000}
        durationMs={200_000}
        shuffle={false}
        repeatMode="all"
        upNext={DEMO_TRACKS.slice(1, 5)}
        lyrics={DEMO_ZEN_LYRICS}
        lyricSource="LRCLIB"
        lyricOffsetMs={0}
        onBack={vi.fn()}
        onTogglePlay={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToggleShuffle={vi.fn()}
        onCycleRepeat={vi.fn()}
        onToggleLike={vi.fn()}
        onSeekMs={vi.fn()}
        onSelectTrack={vi.fn()}
        onAdjustOffsetMs={onAdjustOffsetMs}
      />,
    );

    expect(screen.getByRole('slider', { name: 'Radial seek ring' })).toBeInTheDocument();
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.getByText(DEMO_TRACKS[1].title)).toBeInTheDocument();
    expect(screen.getByText(DEMO_TRACKS[2].title)).toBeInTheDocument();
    expect(screen.getByText(DEMO_TRACKS[3].title)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '-100ms' }));
    expect(onAdjustOffsetMs).toHaveBeenCalledWith(-100);
    fireEvent.click(screen.getByRole('button', { name: '+100ms' }));
    expect(onAdjustOffsetMs).toHaveBeenCalledWith(100);
  });
});
