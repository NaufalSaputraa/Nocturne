import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
}

export interface InteractiveDropdownProps<T extends string = string> {
  label?: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  prefixIcon?: React.ReactNode;
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export function InteractiveDropdown<T extends string = string>({
  label,
  value,
  options,
  onChange,
  prefixIcon,
  align = 'left',
  size = 'md',
  ariaLabel,
}: InteractiveDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const listboxId = useId();

  const selectedOption = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((i) => (i + 1) % options.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const chosen = options[highlightedIdx];
        if (chosen) {
          onChange(chosen.value);
          setOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, highlightedIdx, options, onChange]);

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        setHighlightedIdx(Math.max(0, options.findIndex((o) => o.value === value)));
      }
      return next;
    });
  };

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      {label && (
        <label
          htmlFor={buttonId}
          className="block text-xs text-[#A1A1AA] font-medium mb-1.5"
        >
          {label}
        </label>
      )}
      <button
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel ?? label}
        onClick={handleToggle}
        className={`w-full flex items-center justify-between gap-2.5 rounded-xl border transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]/60 ${
          size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2.5 text-xs'
        } ${
          open
            ? 'bg-[#222226] border-[#52525B] text-[#FAFAFA]'
            : 'bg-[#121212] border-[#27272A] text-[#FAFAFA] hover:bg-[#1E1E22] hover:border-[#3F3F46]'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {prefixIcon && <span className="shrink-0 text-[#F43F5E]">{prefixIcon}</span>}
          <span className="font-medium truncate">{selectedOption?.label}</span>
          {selectedOption?.badge && (
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#27272A] text-[#A1A1AA] whitespace-nowrap shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[#A1A1AA] shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-[#FAFAFA]' : ''
          }`}
        />
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={buttonId}
          className={`absolute z-50 mt-1.5 min-w-full w-max max-w-[360px] rounded-xl bg-[#18181B] border border-[#27272A] p-1.5 shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIdx;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightedIdx(idx)}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex items-start justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#222226] text-[#FAFAFA]'
                    : isHighlighted
                      ? 'bg-[#222226]/70 text-[#FAFAFA]'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{opt.label}</span>
                    {opt.badge && (
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#121212] border border-[#27272A] text-[#A1A1AA] whitespace-nowrap">
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  {opt.description && (
                    <p className="text-[11px] text-[#71717A] mt-0.5 leading-snug">
                      {opt.description}
                    </p>
                  )}
                </div>
                <span className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5">
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#F43F5E]" />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
