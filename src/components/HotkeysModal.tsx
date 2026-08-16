import React from "react";
import { X, Keyboard } from "lucide-react";

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HotkeysModal: React.FC<HotkeysModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: "Space", desc: "Toggle Play / Pause Bar Replay" },
    { key: "Right Arrow", desc: "Step Forward 1 Candle" },
    { key: "Left Arrow", desc: "Step Backward 1 Candle" },
    { key: "Home", desc: "Reset Replay to Beginning" },
    { key: "End", desc: "Jump to Latest Candle" },
    { key: "1 - 9, 0, W", desc: "Quick Switch Timeframe (5s..30s, 1m..1D, 1W)" },
    { key: "Click on Chart", desc: "Set Replay Start Point to Clicked Candle" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[var(--app-bg)]/80 flex items-center justify-center p-4">
      <div className="bg-[var(--surface-panel)] border border-[var(--border-panel)] rounded-lg p-5 max-w-md w-full shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-panel)] pb-3">
          <div className="flex items-center space-x-2 text-[var(--text-primary)] font-bold text-sm">
            <Keyboard className="w-4 h-4 text-[var(--accent-1)]" />
            <span>Keyboard Shortcuts</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded hover:bg-[var(--surface-chip)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((sc, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--border-panel)] last:border-none">
              <span className="text-[var(--text-primary)] font-medium">{sc.desc}</span>
              <kbd className="bg-[var(--surface-inset)] text-[var(--accent-1)] border border-[var(--border-panel-strong)] font-mono px-2 py-0.5 rounded text-[11px] font-bold shadow-sm">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 text-right">
          <button
            onClick={onClose}
            className="bg-[var(--surface-chip)] hover:bg-[var(--surface-chip)] text-[var(--text-primary)] text-xs px-4 py-1.5 rounded font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
