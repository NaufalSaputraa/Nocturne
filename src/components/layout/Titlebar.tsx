import React, { useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Search,
  Settings,
  Square,
  X,
} from 'lucide-react';

export interface TitlebarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onOpenSettings: () => void;
  ytmConnected: boolean;
  onToggleYtmProfile: () => void;
}

async function runWindowAction(action: 'minimize' | 'toggleMaximize' | 'close') {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (action === 'minimize') await win.minimize();
    if (action === 'toggleMaximize') await win.toggleMaximize();
    if (action === 'close') await win.close();
  } catch {
    // Running inside Vite preview or Vitest without Tauri runtime
  }
}

export const Titlebar: React.FC<TitlebarProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onOpenSettings,
  ytmConnected,
  onToggleYtmProfile,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="h-16 w-full bg-[#121212] border-b border-[#27272A] shrink-0 px-6 flex items-center justify-between select-none z-40"
    >
      {/* Left: Nocturne Brand & Navigation */}
      <div className="flex items-center gap-5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#18181B] border border-[#27272A] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8" stroke="#FAFAFA" strokeWidth="1.75" />
              <circle cx="12" cy="12" r="2.75" fill="#F43F5E" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-[#FAFAFA] whitespace-nowrap">
            Nocturne
          </span>
        </div>

        <div className="flex items-center gap-1 pl-3 border-l border-[#27272A]">
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack}
            aria-label="Back"
            title="Back"
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              canGoBack
                ? 'text-[#A1A1AA] hover:text-white hover:bg-[#222226]'
                : 'text-[#52525B] cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onForward}
            disabled={!canGoForward}
            aria-label="Forward"
            title="Forward"
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              canGoForward
                ? 'text-[#A1A1AA] hover:text-white hover:bg-[#222226]'
                : 'text-[#52525B] cursor-not-allowed'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center: Wide Centered Search Pill */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit();
        }}
        className="w-[480px] max-w-[44vw] bg-[#222226] rounded-full px-4 py-1.5 flex items-center gap-2.5 border border-[#2E2E33] focus-within:border-[#52525B] focus-within:bg-[#28282D] transition-colors"
      >
        <Search className="w-4 h-4 text-[#A1A1AA] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => {
            if (searchQuery.trim().length > 0) onSearchSubmit();
          }}
          placeholder="Search songs, artists, albums, or paste YouTube link..."
          className="bg-transparent border-none outline-none text-xs text-[#FAFAFA] placeholder-[#71717A] flex-1 min-w-0 p-0 focus:ring-0"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            title="Clear search"
            className="w-4 h-4 rounded-full bg-[#3F3F46] hover:bg-[#52525B] text-[#FAFAFA] flex items-center justify-center shrink-0 transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
        <kbd className="text-[10px] font-medium uppercase tracking-wider text-[#A1A1AA] bg-[#161618] border border-[#2E2E33] px-2 py-0.5 rounded whitespace-nowrap shrink-0">
          CTRL K
        </kbd>
      </form>

      {/* Right: Settings, YTM Profile Status & Windows 11 Caption Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#222226] transition-colors"
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>

        <button
          type="button"
          onClick={onToggleYtmProfile}
          title={
            ytmConnected
              ? 'YouTube Music Connected (Two-Way Sync Active)'
              : 'Local Mode Only — Click to Connect YTM Account'
          }
          className="relative cursor-pointer group focus:outline-none"
        >
          <div className="w-8 h-8 rounded-full bg-[#27272A] p-[1.5px] group-hover:bg-[#3F3F46] transition-colors">
            <div className="w-full h-full rounded-full bg-[#18181B] flex items-center justify-center">
              <span className="text-xs font-semibold text-[#FAFAFA] whitespace-nowrap">
                {ytmConnected ? 'NS' : 'LC'}
              </span>
            </div>
          </div>
          <span
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#121212] ${
              ytmConnected ? 'bg-emerald-400' : 'bg-[#71717A]'
            }`}
          />
        </button>

        <div className="flex items-center ml-2 border-l border-[#27272A] pl-2 h-8 -mr-3">
          <button
            type="button"
            onClick={() => void runWindowAction('minimize')}
            aria-label="Minimize"
            title="Minimize"
            className="w-11 h-8 flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#27272A] transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void runWindowAction('toggleMaximize')}
            aria-label="Maximize"
            title="Maximize"
            className="w-11 h-8 flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#27272A] transition-colors"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => void runWindowAction('close')}
            aria-label="Close"
            title="Close"
            className="w-11 h-8 flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#E81123] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
