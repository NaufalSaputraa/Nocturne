import React, { useEffect, useRef, useState } from 'react';
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
import { isTauriRuntime, tauriApi } from '../../lib/tauri';
import type {
  EngineDiagnostics,
  StorageStats,
  YtmAccountStatus,
} from '../../types/nocturne';

export type SettingsTab = 'audio' | 'storage' | 'engine' | 'account';

export interface NocturneSettings {
  audioQuality: string;
  normalizeVolume: boolean;
  crossfadeSec: number;
  lruCachePath: string;
  lruLimitGb: number;
  offlineDownloadsPath: string;
  discordRpcEnabled: boolean;
  preferYtdlp: boolean;
  closeToTray: boolean;
  ytmConnected: boolean;
}

export interface SettingsModalProps {
  open: boolean;
  initialTab?: SettingsTab;
  settings: NocturneSettings;
  onClose: () => void;
  onSave: (next: NocturneSettings) => void;
  onYtmStatusChanged?: (connected: boolean) => void;
}

const QUALITY_OPTIONS: DropdownOption[] = [
  {
    value: 'auto',
    label: 'Auto • Best Available (with fallback)',
    badge: 'Smart',
    description: 'Prioritizes highest Opus/M4A stream and steps down automatically on failure.',
  },
  {
    value: 'opus_160',
    label: 'High • Opus 160 kbps',
    badge: '48kHz VBR',
    description: 'Recommended balance of clarity and instant stream start.',
  },
  {
    value: 'aac_256',
    label: 'AAC High • M4A 256 kbps',
    badge: 'AAC-LC',
    description: 'Maximum compatibility for offline downloads.',
  },
  {
    value: 'opus_128',
    label: 'Data Saver • Opus 128 kbps',
    badge: 'Low BW',
    description: 'Faster buffering on slower connections.',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  initialTab = 'audio',
  settings,
  onClose,
  onSave,
  onYtmStatusChanged,
}) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [draft, setDraft] = useState<NocturneSettings>(settings);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [cacheUsedGb, setCacheUsedGb] = useState(0);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [ytdlpStatus, setYtdlpStatus] = useState('Checking yt-dlp...');
  const [isUpdatingYtdlp, setIsUpdatingYtdlp] = useState(false);
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [ytmStatus, setYtmStatus] = useState<YtmAccountStatus | null>(null);
  const [ytmCookieInput, setYtmCookieInput] = useState('');
  const [ytmBusy, setYtmBusy] = useState(false);
  const [ytmNotice, setYtmNotice] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const requestClose = () => {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    setDraft(settings);
    setCacheNotice(null);
    setYtmNotice(null);
    setConfirmDiscard(false);
    if (open) setTab(initialTab);
  }, [settings, open, initialTab]);

  useEffect(() => {
    if (!open || !isTauriRuntime()) return;
    let cancelled = false;
    void (async () => {
      const [stats, diag, ytm] = await Promise.all([
        tauriApi.getStorageStats().catch(() => null),
        tauriApi.getEngineDiagnostics().catch(() => null),
        tauriApi.getYtmAccountStatus().catch(() => null),
      ]);
      if (cancelled) return;
      if (stats) {
        setStorageStats(stats);
        setCacheUsedGb(stats.cache_used_bytes / (1024 * 1024 * 1024));
      }
      if (diag) {
        setDiagnostics(diag);
        setYtdlpStatus(
          diag.ytdlp_available
            ? `Ready • v${diag.ytdlp_version}`
            : 'yt-dlp binary not found',
        );
      }
      if (ytm) {
        setYtmStatus(ytm);
        setDraft((prev) => ({ ...prev, ytmConnected: ytm.connected }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusables = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDirty) {
          setConfirmDiscard(true);
        } else {
          onClose();
        }
        return;
      }
      if (e.key === 'Tab' && dialog) {
        const list = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      prevFocused?.focus?.();
    };
  }, [open, isDirty, onClose]);

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
          tab === id ? 'text-[#F43F5E]' : 'text-[#8E8E98]'
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
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div
        ref={dialogRef}
        className="w-[704px] max-w-full h-[544px] max-h-[85vh] bg-[#18181B] border border-[#27272A] rounded-2xl flex overflow-hidden select-none"
      >
        <aside className="w-48 shrink-0 bg-[#121212] border-r border-[#27272A] p-4 flex flex-col justify-between">
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

          <div className="flex flex-col gap-1 text-[11px] text-[#8E8E98] px-1">
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
              <p className="text-xs text-[#8E8E98]">
                Configure audio quality, caching, account sync, and shortcuts
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close Settings"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#8E8E98] hover:text-white hover:bg-[#222226] transition-colors"
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
                    <p className="text-xs text-[#8E8E98]">
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
                      <span className="text-xs text-[#8E8E98] ml-2">
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
                      onClick={async () => {
                        if (isTauriRuntime()) {
                          const freed = await tauriApi.clearLruCache().catch(() => null);
                          const stats = await tauriApi.getStorageStats().catch(() => null);
                          if (stats) {
                            setStorageStats(stats);
                            setCacheUsedGb(stats.cache_used_bytes / (1024 * 1024 * 1024));
                          } else {
                            setCacheUsedGb(0);
                          }
                          const freedMb = freed ? (freed / (1024 * 1024)).toFixed(1) : '0.0';
                          setCacheNotice(`Cleared ${freedMb} MB from stream cache.`);
                        } else {
                          setCacheUsedGb(0);
                          setCacheNotice('Playback cache cleared.');
                        }
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
                  <div className="flex items-center justify-between text-[11px] text-[#8E8E98] font-mono tabular-nums">
                    <span>
                      {cacheUsedGb.toFixed(2)} GB used of {draft.lruLimitGb.toFixed(1)} GB limit
                      {storageStats ? ` (${storageStats.cache_file_count} files)` : ''}
                    </span>
                    <span>{usagePct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#27272A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FAFAFA] rounded-full transition-[width]"
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
                  <p className="text-[11px] text-[#8E8E98]">
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
                    <p
                      className={`text-xs flex items-center gap-1 mt-0.5 ${
                        diagnostics === null || diagnostics.mpv_active
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {diagnostics === null
                          ? 'Active • Ready for low-latency playback'
                          : diagnostics.mpv_active
                            ? 'libmpv-2 active • Hardware-ready audio pipeline'
                            : 'Fallback mode • libmpv-2.dll not loaded'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121212] border border-[#27272A] flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      Backup Extractor (yt-dlp)
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${
                        diagnostics?.ytdlp_available === false
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {ytdlpStatus}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isUpdatingYtdlp}
                    onClick={async () => {
                      if (!isTauriRuntime()) {
                        setYtdlpStatus('Checked • Latest v2026.11.12');
                        return;
                      }
                      setIsUpdatingYtdlp(true);
                      setYtdlpStatus('Updating yt-dlp...');
                      try {
                        const msg = await tauriApi.updateYtdlpBinary();
                        const diag = await tauriApi.getEngineDiagnostics().catch(() => null);
                        if (diag) setDiagnostics(diag);
                        setYtdlpStatus(
                          diag?.ytdlp_available
                            ? `Updated • v${diag.ytdlp_version}`
                            : msg || 'Update complete',
                        );
                      } catch (err) {
                        setYtdlpStatus(`Update failed: ${String(err)}`);
                      } finally {
                        setIsUpdatingYtdlp(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#222226] hover:bg-[#27272A] disabled:opacity-50 text-xs font-medium text-[#FAFAFA] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isUpdatingYtdlp ? 'animate-spin' : ''}`}
                    />
                    <span>{isUpdatingYtdlp ? 'Updating...' : 'Check for Updates'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#121212] border border-[#27272A]">
                  <div className="pr-4">
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      Prefer yt-dlp Over Native Extractor
                    </p>
                    <p className="text-xs text-[#8E8E98]">
                      Use yt-dlp first if YouTube throttles native streams
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Prefer yt-dlp Over Native Extractor"
                    aria-checked={draft.preferYtdlp}
                    onClick={() =>
                      setDraft({ ...draft, preferYtdlp: !draft.preferYtdlp })
                    }
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                      draft.preferYtdlp ? 'bg-[#F43F5E]' : 'bg-[#27272A]'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        draft.preferYtdlp ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#121212] border border-[#27272A]">
                  <div className="pr-4">
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      Discord Rich Presence
                    </p>
                    <p className="text-xs text-[#8E8E98]">
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
                    aria-expanded={showDiagnostics}
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
                    <div className="px-3.5 pb-3 pt-1 text-[11px] font-mono text-[#8E8E98] space-y-1 border-t border-[#27272A]">
                      <p>
                        Audio backend:{' '}
                        {diagnostics
                          ? diagnostics.mpv_active
                            ? 'libmpv-2 (active)'
                            : 'NoopAudioBackend (libmpv-2.dll missing)'
                          : 'libmpv-2'}
                      </p>
                      <p>
                        Primary extractor:{' '}
                        {diagnostics?.prefer_ytdlp ? 'yt-dlp sidecar' : 'rustypipe (< 250 ms)'}
                      </p>
                      <p>
                        Memory URL cache: {diagnostics?.memory_cache_entries ?? 0} entries (5.5h TTL)
                      </p>
                      <p>Loudness: static pre-amp via perceptualLoudnessDb</p>
                      <p>Storage: SQLite WAL + 5s debounced session restore</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === 'account' && (
              <>
                <div className="p-4 rounded-xl bg-[#121212] border border-[#27272A] flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[#FAFAFA]">
                        YouTube Music Account
                      </p>
                      <p className="text-xs text-[#8E8E98] mt-0.5">
                        {draft.ytmConnected
                          ? `Connected — Likes & playlists sync with YTM${
                              ytmStatus && ytmStatus.pending_sync_count > 0
                                ? ` (${ytmStatus.pending_sync_count} pending)`
                                : ''
                            }.`
                          : 'Local-only mode. Paste your YTM Cookie header to sync Likes & playlists.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {draft.ytmConnected ? (
                        <>
                          {isTauriRuntime() && (
                            <button
                              type="button"
                              disabled={ytmBusy}
                              onClick={async () => {
                                setYtmBusy(true);
                                setYtmNotice(null);
                                try {
                                  await tauriApi.reconcileYtmSync();
                                  const st = await tauriApi.getYtmAccountStatus().catch(() => null);
                                  if (st) setYtmStatus(st);
                                  setYtmNotice('YouTube Music library synced.');
                                } catch (err) {
                                  setYtmNotice(`Sync failed: ${String(err)}`);
                                } finally {
                                  setYtmBusy(false);
                                }
                              }}
                              className="px-3 py-1.5 rounded-full bg-[#222226] hover:bg-[#27272A] text-xs font-medium text-[#FAFAFA] whitespace-nowrap"
                            >
                              {ytmBusy ? 'Syncing...' : 'Sync Now'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={ytmBusy}
                            onClick={async () => {
                              if (isTauriRuntime()) {
                                setYtmBusy(true);
                                try {
                                  await tauriApi.disconnectYtmAccount();
                                  setYtmNotice('Disconnected. Local library preserved.');
                                } finally {
                                  setYtmBusy(false);
                                }
                              }
                              setDraft({ ...draft, ytmConnected: false });
                              onYtmStatusChanged?.(false);
                            }}
                            className="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-[#222226] text-[#FAFAFA] border border-[#3F3F46]"
                          >
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={ytmBusy || (isTauriRuntime() && ytmCookieInput.trim().length < 8)}
                          onClick={async () => {
                            if (isTauriRuntime()) {
                              setYtmBusy(true);
                              setYtmNotice(null);
                              try {
                                await tauriApi.connectYtmAccount(ytmCookieInput.trim());
                                const st = await tauriApi.getYtmAccountStatus().catch(() => null);
                                if (st) setYtmStatus(st);
                                setYtmCookieInput('');
                                setYtmNotice('Connected & merged with YouTube Music.');
                                setDraft({ ...draft, ytmConnected: true });
                                onYtmStatusChanged?.(true);
                              } catch (err) {
                                setYtmNotice(`Connection failed: ${String(err)}`);
                              } finally {
                                setYtmBusy(false);
                              }
                            } else {
                              setDraft({ ...draft, ytmConnected: true });
                              onYtmStatusChanged?.(true);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-white text-black disabled:opacity-50"
                        >
                          {ytmBusy ? 'Connecting...' : 'Connect Account'}
                        </button>
                      )}
                    </div>
                  </div>

                  {!draft.ytmConnected && (
                    <div className="flex flex-col gap-1.5 pt-1 border-t border-[#27272A]/60">
                      <label className="text-[11px] text-[#A1A1AA]" htmlFor="ytm-cookie-input">
                        YTM Cookie Header (open music.youtube.com → F12 → Network → copy{' '}
                        <code className="text-[#FAFAFA]">Cookie</code> header)
                      </label>
                      <input
                        id="ytm-cookie-input"
                        type="password"
                        value={ytmCookieInput}
                        onChange={(e) => setYtmCookieInput(e.target.value)}
                        placeholder="SAPISID=...; __Secure-3PAPISID=...; ..."
                        className="bg-[#18181B] border border-[#27272A] rounded-lg px-3 py-1.5 text-xs font-mono text-[#FAFAFA] outline-none focus:border-[#52525B]"
                      />
                    </div>
                  )}

                  {ytmNotice && (
                    <p className="text-[11px] text-emerald-400">{ytmNotice}</p>
                  )}
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#121212] border border-[#27272A]">
                  <div className="pr-4">
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      Close to System Tray
                    </p>
                    <p className="text-xs text-[#8E8E98]">
                      Keep music playing in the background when closing the window
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Close to System Tray"
                    aria-checked={draft.closeToTray}
                    onClick={() =>
                      setDraft({ ...draft, closeToTray: !draft.closeToTray })
                    }
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                      draft.closeToTray ? 'bg-[#F43F5E]' : 'bg-[#27272A]'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        draft.closeToTray ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
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

          <div className="pt-4 border-t border-[#27272A] flex items-center justify-between gap-2.5 shrink-0">
            <div className="text-xs">
              {confirmDiscard && (
                <span className="text-[#F43F5E] font-medium">
                  Unsaved changes — discard them?
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              {confirmDiscard ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDiscard(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#222226] hover:bg-[#27272A] text-[#FAFAFA] text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    Keep Editing
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDiscard(false);
                      onClose();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Discard
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={requestClose}
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
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
