import React, { useEffect, useState } from 'react';
import {
  AudioLines,
  CheckCircle2,
  ChevronDown,
  Folder,
  Palette,
  RefreshCw,
  SlidersHorizontal,
  Terminal,
  X,
} from 'lucide-react';
import {
  InteractiveDropdown,
  type DropdownOption,
} from '../ui/InteractiveDropdown';

export type SettingsTab = 'audio' | 'storage' | 'engine' | 'account';

export interface NocturneSettings {
  audioQuality: string;
  normalizeVolume: boolean;
  crossfadeSec: number;
  lruCachePath: string;
  lruLimitGb: number;
  offlineDownloadsPath: string;
  discordRpcEnabled: boolean;
  ytmConnected: boolean;
}

export interface SettingsModalProps {
  open: boolean;
  settings: NocturneSettings;
  onClose: () => void;
  onSave: (next: NocturneSettings) => void;
}

const QUALITY_OPTIONS: DropdownOption[] = [
  {
    value: 'Opus 160kbps',
    label: 'High • Opus 160 kbps',
    badge: '48kHz VBR',
    description: 'Recommended balance of clarity and instant stream start.',
  },
  {
    value: 'M4A 256kbps',
    label: 'AAC High • M4A 256 kbps',
    badge: 'AAC-LC',
    description: 'Maximum compatibility for offline downloads.',
  },
  {
    value: 'Opus 128kbps',
    label: 'Data Saver • Opus 128 kbps',
    badge: 'Low BW',
    description: 'Faster buffering on slower connections.',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  onClose,
  onSave,
}) => {
  const [tab, setTab] = useState<SettingsTab>('audio');
  const [draft, setDraft] = useState<NocturneSettings>(settings);
  const [cacheUsedGb, setCacheUsedGb] = useState(1.4);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [ytdlpStatus, setYtdlpStatus] = useState('Up to date • v2026.11.12');
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    setDraft(settings);
    setCacheNotice(null);
  }, [settings, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const usagePct =
    draft.lruLimitGb > 0
      ? Math.min(100, Math.round((cacheUsedGb / draft.lruLimitGb) * 100))
      : 0;

  const navBtn = (id: SettingsTab, label: string, Icon: React.ElementType) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2.5 transition-colors whitespace-nowrap ${
        tab === id
          ? 'bg-[#222226] text-[#FAFAFA] font-semibold'
          : 'text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#222226]/60'
      }`}
    >
      <Icon
        className={`w-4 h-4 shrink-0 ${
          tab === id ? 'text-[#F43F5E]' : 'text-[#71717A]'
        }`}
      />
      <span>{label}</span>
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nocturne Settings"
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-[700px] max-w-full h-[540px] max-h-[85vh] bg-[#18181B] border border-[#27272A] rounded-2xl flex overflow-hidden select-none">
        <aside className="w-[196px] shrink-0 bg-[#121212] border-r border-[#27272A] p-4 flex flex-col justify-between">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2 px-1">
              <SlidersHorizontal className="w-4 h-4 text-[#F43F5E]" />
              <h2 className="text-sm font-semibold text-[#FAFAFA] tracking-tight">
                Settings
              </h2>
            </div>

            <nav className="flex flex-col gap-1">
              {navBtn('audio', 'Audio & Playback', SlidersHorizontal)}
              {navBtn('storage', 'Storage & Cache', Folder)}
              {navBtn('engine', 'Engine & Discord', Terminal)}
              {navBtn('account', 'Account & Shortcuts', Palette)}
            </nav>
          </div>

          <div className="flex flex-col gap-1 text-[11px] text-[#71717A] px-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-medium text-[#A1A1AA]">Nocturne Client</span>
            </div>
            <span>v1.0.0 • Windows x64</span>
          </div>
        </aside>

        <section className="flex-1 p-6 flex flex-col justify-between overflow-hidden bg-[#18181B]">
          <div className="flex items-center justify-between pb-4 border-b border-[#27272A] shrink-0">
            <div>
              <h3 className="text-base font-semibold text-[#FAFAFA]">
                {tab === 'audio' && 'Audio & Playback'}
                {tab === 'storage' && 'Storage, Cache & Offline'}
                {tab === 'engine' && 'Playback Engine & Discord'}
                {tab === 'account' && 'YouTube Music & Shortcuts'}
              </h3>
              <p className="text-xs text-[#71717A]">
                Configure audio quality, caching, account sync, and shortcuts
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Settings"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#71717A] hover:text-white hover:bg-[#222226] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 pr-1 space-y-4">
            {tab === 'audio' && (
              <>
                <InteractiveDropdown
                  label="Audio Stream Quality"
                  value={draft.audioQuality}
                  options={QUALITY_OPTIONS}
                  prefixIcon={<AudioLines className="w-4 h-4" />}
                  onChange={(audioQuality) =>
                    setDraft({ ...draft, audioQuality })
                  }
                />

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#121212] border border-[#27272A]">
                  <div className="pr-4">
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      Normalize Volume
                    </p>
                    <p className="text-xs text-[#71717A]">
                      Balance volume levels automatically across tracks
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Normalize Volume"
                    aria-checked={draft.normalizeVolume}
                    onClick={() =>
                      setDraft({ ...draft, normalizeVolume: !draft.normalizeVolume })
                    }
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                      draft.normalizeVolume ? 'bg-[#F43F5E]' : 'bg-[#27272A]'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        draft.normalizeVolume ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121212] border border-[#27272A] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-[#FAFAFA]">
                        Track Fade Transition
                      </span>
                      <span className="text-xs text-[#71717A] ml-2">
                        (Gapless + smooth fade)
                      </span>
                    </div>
                    <span className="text-xs font-mono tabular-nums bg-[#222226] text-[#FAFAFA] px-2 py-0.5 rounded">
                      {draft.crossfadeSec}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    value={draft.crossfadeSec}
                    onChange={(e) =>
                      setDraft({ ...draft, crossfadeSec: Number(e.target.value) })
                    }
                    aria-label="Crossfade Duration"
                    className="w-full accent-[#F43F5E] cursor-pointer"
                  />
                </div>
              </>
            )}

            {tab === 'storage' && (
              <>
                <div className="p-3.5 rounded-xl bg-[#121212] border border-[#27272A] flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#FAFAFA]">
                      Playback Stream Cache
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCacheUsedGb(0);
                        setCacheNotice('Playback cache cleared.');
                      }}
                      className="text-xs text-[#F43F5E] hover:underline whitespace-nowrap"
                    >
                      Clear Cache
                    </button>
                  </div>
                  <input
                    type="text"
                    value={draft.lruCachePath}
                    onChange={(e) =>
                      setDraft({ ...draft, lruCachePath: e.target.value })
                    }
                    aria-label="Stream cache folder path"
                    className="bg-[#18181B] border border-[#27272A] rounded-lg px-3 py-1.5 text-xs font-mono text-[#A1A1AA] outline-none"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#A1A1AA]">Cache Size Limit</span>
                    <span className="font-mono tabular-nums text-[#FAFAFA]">
                      {draft.lruLimitGb.toFixed(1)} GB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={0.5}
                    value={draft.lruLimitGb}
                    onChange={(e) =>
                      setDraft({ ...draft, lruLimitGb: Number(e.target.value) })
                    }
                    aria-label="Cache Size Limit"
                    className="w-full accent-[#F43F5E] cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] text-[#71717A] font-mono tabular-nums">
                    <span>
                      {cacheUsedGb.toFixed(1)} GB used of {draft.lruLimitGb.toFixed(1)} GB limit
                    </span>
                    <span>{usagePct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#27272A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FAFAFA] rounded-full transition-all"
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                  {cacheNotice && (
                    <p className="text-[11px] text-emerald-400">{cacheNotice}</p>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-[#121212] border border-[#27272A] flex flex-col gap-2">
                  <span className="text-xs font-medium text-[#FAFAFA]">
                    Offline Downloads Folder
                  </span>
                  <input
                    type="text"
                    value={draft.offlineDownloadsPath}
                    onChange={(e) =>
                      setDraft({ ...draft, offlineDownloadsPath: e.target.value })
                    }
                    aria-label="Offline downloads folder path"
                    className="bg-[#18181B] border border-[#27272A] rounded-lg px-3 py-1.5 text-xs font-mono text-[#A1A1AA] outline-none"
                  />
                  <p className="text-[11px] text-[#71717A]">
                    Explicitly downloaded tracks stay saved even when the stream cache rotates.
                  </p>
                </div>
              </>
            )}

            {tab === 'engine' && (
              <>
                <div className="p-3.5 rounded-xl bg-[#121212] border border-[#27272A] flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      Instant Native Stream Engine
                    </p>
                    <p className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active • Ready for low-latency playback</span>
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121212] border border-[#27272A] flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      Backup Extractor (yt-dlp)
                    </p>
                    <p className="text-xs text-emerald-400 mt-0.5">{ytdlpStatus}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setYtdlpStatus('Checked • Latest v2026.11.12')}
                    className="px-3 py-1.5 rounded-lg bg-[#222226] hover:bg-[#27272A] text-xs font-medium text-[#FAFAFA] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Check for Updates</span>
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#121212] border border-[#27272A]">
                  <div className="pr-4">
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      Discord Rich Presence
                    </p>
                    <p className="text-xs text-[#71717A]">
                      Show active track, cover art, and remaining time in Discord
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Discord Rich Presence"
                    aria-checked={draft.discordRpcEnabled}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        discordRpcEnabled: !draft.discordRpcEnabled,
                      })
                    }
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                      draft.discordRpcEnabled ? 'bg-[#F43F5E]' : 'bg-[#27272A]'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        draft.discordRpcEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Collapsible technical telemetry for power users */}
                <div className="rounded-xl bg-[#121212] border border-[#27272A] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics((v) => !v)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-[#A1A1AA] hover:text-white"
                  >
                    <span>Engine Diagnostics</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        showDiagnostics ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {showDiagnostics && (
                    <div className="px-3.5 pb-3 pt-1 text-[11px] font-mono text-[#71717A] space-y-1 border-t border-[#27272A]">
                      <p>Primary extractor: rustypipe (&lt; 250 ms Innertube)</p>
                      <p>Fallback sidecar: yt-dlp (5.5h stream URL cache)</p>
                      <p>Loudness: static pre-amp via perceptualLoudnessDb</p>
                      <p>Storage: SQLite WAL + 5s debounced session restore</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === 'account' && (
              <>
                <div className="p-4 rounded-xl bg-[#121212] border border-[#27272A] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      YouTube Music Account
                    </p>
                    <p className="text-xs text-[#71717A] mt-0.5">
                      {draft.ytmConnected
                        ? 'Connected — Likes and YouTube Music playlists stay in sync.'
                        : 'Local-only mode. Connect your account to sync Likes & playlists.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, ytmConnected: !draft.ytmConnected })
                    }
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                      draft.ytmConnected
                        ? 'bg-[#222226] text-[#FAFAFA] border border-[#3F3F46]'
                        : 'bg-white text-black'
                    }`}
                  >
                    {draft.ytmConnected ? 'Disconnect' : 'Connect Account'}
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-[#121212] border border-[#27272A]">
                  <p className="text-sm font-medium text-[#FAFAFA] mb-2.5">
                    Keyboard Shortcuts
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between text-[#A1A1AA]">
                      <span>Search</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-[#222226] text-[#FAFAFA] font-mono text-[11px]">
                        Ctrl K
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between text-[#A1A1AA]">
                      <span>Play / Pause</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-[#222226] text-[#FAFAFA] font-mono text-[11px]">
                        Space
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between text-[#A1A1AA]">
                      <span>Seek ±5s</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-[#222226] text-[#FAFAFA] font-mono text-[11px]">
                        ← / →
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between text-[#A1A1AA]">
                      <span>Toggle Lyrics</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-[#222226] text-[#FAFAFA] font-mono text-[11px]">
                        L
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between text-[#A1A1AA]">
                      <span>Mute</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-[#222226] text-[#FAFAFA] font-mono text-[11px]">
                        M
                      </kbd>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="pt-4 border-t border-[#27272A] flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#222226] hover:bg-[#27272A] text-[#FAFAFA] text-xs font-medium transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg bg-white hover:bg-[#E4E4E7] text-black text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Save Changes
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
