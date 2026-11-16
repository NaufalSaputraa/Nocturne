import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_ALBUMS, DEMO_PLAYLISTS, DEMO_TRACKS } from '../data/mockLibrary';
import { HomeView } from './HomeView';

describe('HomeView', () => {
  it('renders all 5 filter pills with whitespace-nowrap and filters Offline tracks', () => {
    render(
      <HomeView
        tracks={DEMO_TRACKS}
        albums={DEMO_ALBUMS}
        playlists={DEMO_PLAYLISTS}
        activeTrackId={DEMO_TRACKS[0].video_id}
        bannerSaved={false}
        onPlayTrack={vi.fn()}
        onPlayAll={vi.fn()}
        onToggleSaveBanner={vi.fn()}
        onToggleLike={vi.fn()}
        onToggleOffline={vi.fn()}
        onSelectPlaylist={vi.fn()}
      />,
    );

    for (const label of ['All', 'Songs', 'Albums', 'Playlists', 'Offline']) {
      const pill = screen.getByRole('button', { name: label });
      expect(pill).toBeInTheDocument();
      expect(pill.className).toContain('whitespace-nowrap');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Offline' }));
    const offlineTracks = DEMO_TRACKS.filter((t) => t.offline);
    expect(offlineTracks.length).toBeGreaterThan(0);
    expect(screen.getByText(offlineTracks[0].title)).toBeInTheDocument();
  });
});
