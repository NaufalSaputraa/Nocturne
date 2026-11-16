import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { computeLyricSweep } from './components/lyrics/InteractiveLyricLine';

describe('Nocturne Stitch UI Integration', () => {
  it('renders Nocturne branding, Home view pills, and switches across all 5 Stitch views', () => {
    render(<App />);

    // 1. Home view & single-line controls
    expect(screen.getByText('Nocturne')).toBeInTheDocument();
    expect(screen.getByText('Chill Coding & Lo-Fi Beats')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play All/i })).toHaveClass('whitespace-nowrap');

    // 2. Search view (without non-goal Videos chip)
    const searchInput = screen.getByPlaceholderText(
      /Search songs, artists, albums/i,
    );
    fireEvent.change(searchInput, { target: { value: 'Perunggu' } });
    expect(screen.getByText('Top Result')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Videos' })).not.toBeInTheDocument();

    // 3. Playlist Detail view
    fireEvent.click(screen.getByRole('button', { name: /Late Night Coding/i }));
    expect(screen.getByText('DATE ADDED')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Find in playlist...')).toBeInTheDocument();

    // 4. Settings Modal (all tabs + Nocturne Client stamp)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Nocturne Settings' })).toBeInTheDocument();
    expect(screen.getByText('Nocturne Client')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Engine & Discord/i }));
    expect(screen.getByText('Discord Rich Presence')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // 5. Zen Focus Lyrics Mode (NOCTURNE spindle, ambient glow, interactive lyrics)
    fireEvent.click(screen.getByTitle('Enter Zen Focus Lyrics Mode'));
    expect(screen.getByText('NOCTURNE')).toBeInTheDocument();
    expect(screen.getByTestId('zen-ambient-glow')).toHaveStyle({ opacity: '0.12' });
    expect(screen.getByText('SYNCED LYRICS')).toBeInTheDocument();
    expect(screen.getByText('Back to Library')).toBeInTheDocument();
  });

  it('caps InteractiveLyricLine sweep duration at 90ms per character', () => {
    const { activeSweepDuration, words } = computeLyricSweep('Wait', 10_000, 26_000);
    expect(activeSweepDuration).toBe(360);
    expect(words).toHaveLength(1);
    expect(words[0]).toHaveLength(4);
  });
});
