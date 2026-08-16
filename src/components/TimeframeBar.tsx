import React from "react";
import { TimeframeId } from "../types";
import { TIMEFRAMES } from "../utils/timeframe";

interface TimeframeBarProps {
  currentTimeframe: TimeframeId;
  onSelectTimeframe: (tf: TimeframeId) => void;
  disabled?: boolean;
}

export const TimeframeBar: React.FC<TimeframeBarProps> = ({
  currentTimeframe,
  onSelectTimeframe,
  disabled = false,
}) => {
  return (
    <div id="timeframe-bar" className="flex items-center space-x-1 bg-[#0c0d10] p-1 rounded-lg border border-[#363a45] overflow-x-auto max-w-full">
      <span className="text-[10px] font-bold text-[#868993] uppercase tracking-wider px-2 hidden sm:inline shrink-0">
        TF:
      </span>
      {TIMEFRAMES.map((tf) => {
        const isActive = currentTimeframe === tf.id;
        return (
          <button
            key={tf.id}
            id={`tf-btn-${tf.id}`}
            type="button"
            onClick={() => onSelectTimeframe(tf.id)}
            disabled={disabled}
            className={`px-2 py-1 text-[11px] font-bold rounded transition-all cursor-pointer shrink-0 ${
              isActive
                ? "bg-[#363a45] text-white shadow-sm"
                : "text-[#868993] hover:text-[#d1d4dc] hover:bg-[#1e222d]"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {tf.label}
          </button>
        );
      })}
    </div>
  );
};
