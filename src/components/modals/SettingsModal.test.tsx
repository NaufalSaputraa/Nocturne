import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsModal, type NocturneSettings } from './SettingsModal';

const BASE_SETTINGS: NocturneSettings = {
  audioQuality: 'auto',
  normalizeVolume: true,
  crossfadeSec: 4,
  lruCachePath: 'C:\\Music\\NocturneCache',
  lruLimitGb: 5,
  offlineDownloadsPath: 'C:\\Music\\NocturneOffline',
  discordRpcEnabled: true,
  preferYtdlp: false,
  closeToTray: false,
  ytmConnected: false,
};

describe('SettingsModal', () => {
  it('renders Audio, Storage, Engine/Discord, and YTM Account controls', () => {
    render(
      <SettingsModal
        open={true}
        settings={BASE_SETTINGS}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Audio Stream Quality')).toBeInTheDocument();
    expect(screen.getByText('Normalize Volume')).toBeInTheDocument();
    expect(screen.getByLabelText('Crossfade Duration')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Storage & Cache/i }));
    expect(screen.getByText('Clear Cache')).toBeInTheDocument();
    expect(screen.getByText('Offline Downloads Folder')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Engine & Discord/i }));
    expect(screen.getByText('Discord Rich Presence')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check for Updates/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Account & Shortcuts/i }));
    expect(screen.getByText(/Disconnect|Connect Account/i)).toBeInTheDocument();
  });
});
