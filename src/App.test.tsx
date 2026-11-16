import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { computeLyricSweep } from './components/lyrics/InteractiveLyricLine';

describe('Nocturne Stitch UI Integration', () => {
  it('renders Nocturne branding, Home view pills, and switches across all 5 views', () => {
    render(<App />);

    // 1. Home view & single-line controls
    expect(screen.getByText('Nocturne')).toBeInTheDocument();
    expect(screen.getByText('Chill Coding & Lo-Fi Beats')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play All/i })).toHaveClass('whitespace-nowrap');

    // 2. Search view (without Videos chip) + explicit zero-result empty state
    const searchInput = screen.getByPlaceholderText(
      /Search songs, artists, or paste link/i,
    );
    fireEvent.change(searchInput, { target: { value: 'Perunggu' } });
    expect(screen.getByText('Top Result')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Videos' })).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'zzzz-nonexistent' } });
    expect(screen.getByText(/No results found for/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear search'));

    // 3. Playlist Detail view, interactive sort dropdown, and 2-step delete confirmation
    fireEvent.click(screen.getByRole('button', { name: /Late Night Coding/i }));
    expect(screen.getByText('Date added')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Filter tracks')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sort playlist tracks' }));
    fireEvent.click(screen.getByRole('option', { name: /Sort: Title/i }));
    expect(screen.getByRole('button', { name: 'Sort playlist tracks' })).toHaveTextContent(
      'Sort: Title',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Playlist options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete playlist' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // 4. RightPanel Queue clear + Undo recovery
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Queue cleared')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByText('Queue cleared')).not.toBeInTheDocument();

    // 5. Settings Modal (interactive dropdown, cache clear, diagnostics drawer)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Nocturne Settings' })).toBeInTheDocument();
    expect(screen.getByText('Nocturne Client')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Audio Stream Quality/i }));
    fireEvent.click(screen.getByRole('option', { name: /M4A 256 kbps/i }));
    fireEvent.click(screen.getByRole('button', { name: /Storage & Cache/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Cache' }));
    expect(screen.getByText('Playback cache cleared.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Engine & Discord/i }));
    expect(screen.getByText('Discord Rich Presence')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Engine Diagnostics' }));
    expect(screen.getByText(/rustypipe/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // 6. Lyrics Focus View (Nocturne spindle, interactive lyrics)
    fireEvent.click(screen.getByTitle('Enter Zen Focus Lyrics Mode'));
    expect(screen.getByText('Nocturne')).toBeInTheDocument();
    expect(screen.getByText('Synced lyrics')).toBeInTheDocument();
    expect(screen.getByText('Back to Library')).toBeInTheDocument();
  }, 15_000);

  it('caps InteractiveLyricLine sweep duration at 90ms per character', () => {
    const { activeSweepDuration, words } = computeLyricSweep('Wait', 10_000, 26_000);
    expect(activeSweepDuration).toBe(360);
    expect(words).toHaveLength(1);
    expect(words[0]).toHaveLength(4);
  });
});
