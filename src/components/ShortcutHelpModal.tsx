import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';
import { createShortcutMap } from '../lib/drawings/shortcuts';

interface ShortcutHelpModalProps {
  onClose: () => void;
}

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({ onClose }) => {
  const commands = createShortcutMap();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-bg)]/70 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[var(--surface-overlay)] border border-[var(--border-soft)] rounded-2xl shadow-lg p-6 text-[var(--text-primary)] relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2.5 mb-5 border-b border-[var(--border-soft)] pb-4">
          <div className="p-2.5 rounded-xl bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/30 text-[var(--accent-1)]">
            <Keyboard className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Drawing Keyboard Shortcuts</h2>
            <p className="text-xs text-[var(--text-muted)]">TradingView-standard quick access keys</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
          {commands.map((cmd) => (
            <div
              key={cmd.id}
              className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--border-soft)] hover:border-[var(--accent-1)]/30 transition"
            >
              <span className="text-xs font-medium text-[var(--text-secondary)]">{cmd.label || cmd.id}</span>
              <kbd className="px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--border-soft)] font-mono text-[11px] text-[var(--accent-1)] font-semibold shadow-inner">
                {cmd.shortcut}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-[var(--border-soft)] flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="flex items-center space-x-1">
            <Command className="w-3.5 h-3.5 text-[var(--accent-1)]" />
            <span>Hold Shift while drawing trendlines to snap angles to 45°</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--accent-1)] text-[var(--accent-contrast)] font-medium hover:opacity-90 transition cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
