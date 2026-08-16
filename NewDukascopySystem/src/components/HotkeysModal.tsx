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
    <div className="fixed inset-0 z-50 bg-[#0c0d10]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#131722] border border-[#1e222d] rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#1e222d] pb-3">
          <div className="flex items-center space-x-2 text-[#d1d4dc] font-bold text-sm">
            <Keyboard className="w-4 h-4 text-[#2962ff]" />
            <span>Keyboard Shortcuts</span>
          </div>
          <button
            onClick={onClose}
            className="text-[#868993] hover:text-[#d1d4dc] p-1 rounded hover:bg-[#1e222d] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((sc, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-[#1e222d] last:border-none">
              <span className="text-[#d1d4dc] font-medium">{sc.desc}</span>
              <kbd className="bg-[#0c0d10] text-[#2962ff] border border-[#363a45] font-mono px-2 py-0.5 rounded text-[11px] font-bold shadow-sm">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 text-right">
          <button
            onClick={onClose}
            className="bg-[#1e222d] hover:bg-[#363a45] text-[#d1d4dc] text-xs px-4 py-1.5 rounded font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
