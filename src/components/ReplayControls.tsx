import React from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Clock,
  HelpCircle,
  Gauge,
} from "lucide-react";
import { formatUTCTimestamp } from "../lib/timezone";

interface ReplayControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onResetStart: () => void;
  onJumpEnd: () => void;
  currentIndex: number;
  totalCount: number;
  onSeekIndex: (idx: number) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  currentTimestampSec?: number;
  onOpenHotkeysModal: () => void;
  disabled?: boolean;
}

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10, 20, 50];

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  isPlaying,
  onTogglePlay,
  onStepForward,
  onStepBackward,
  onResetStart,
  onJumpEnd,
  currentIndex,
  totalCount,
  onSeekIndex,
  speed,
  onSpeedChange,
  currentTimestampSec = 0,
  onOpenHotkeysModal,
  disabled = false,
}) => {
  const maxIdx = Math.max(0, totalCount - 1);
  const progressPercent = maxIdx > 0 ? Math.round((currentIndex / maxIdx) * 100) : 0;

  return (
    <div id="replay-controls" className="bg-[#131722] border-t border-[#1e222d] p-3 text-[#d1d4dc] space-y-2.5">
      {/* Top Timeline Scrubber Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        {/* Scrubber Range Input */}
        <div className="flex-1 flex items-center space-x-3">
          <span className="text-[#868993] font-bold text-[10px] uppercase tracking-wider min-w-[70px]">
            Replay Progress:
          </span>
          <input
            type="range"
            min={0}
            max={maxIdx}
            value={currentIndex}
            onChange={(e) => onSeekIndex(Number(e.target.value))}
            disabled={disabled || totalCount === 0}
            className="w-full h-1.5 bg-[#0c0d10] rounded appearance-none cursor-pointer accent-[#2962ff] disabled:opacity-30"
          />
          <span className="text-[#d1d4dc] font-mono text-[11px] min-w-[90px] text-right font-semibold">
            {currentIndex + 1} / {totalCount} ({progressPercent}%)
          </span>
        </div>

        {/* Current Replay Date & Time Badge */}
        {currentTimestampSec > 0 && (
          <div className="flex items-center gap-1.5 bg-[#0c0d10] border border-[#1e222d] px-3 py-1 rounded text-[#2962ff] font-mono text-xs font-bold self-start sm:self-auto">
            <Clock className="w-3.5 h-3.5 text-[#868993]" />
            <span>{formatUTCTimestamp(currentTimestampSec)}</span>
          </div>
        )}
      </div>

      {/* Main Controls Dock */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#1e222d]">
        {/* Playback Control Buttons */}
        <div className="flex items-center space-x-1.5">
          <button
            id="reset-start-btn"
            type="button"
            onClick={onResetStart}
            disabled={disabled || totalCount === 0 || currentIndex === 0}
            title="Reset to Start"
            className="w-8 h-8 flex items-center justify-center text-[#868993] hover:text-[#d1d4dc] hover:bg-[#1e222d] rounded transition-all disabled:opacity-30 cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            id="step-back-btn"
            type="button"
            onClick={onStepBackward}
            disabled={disabled || totalCount === 0 || currentIndex === 0}
            title="Step Backward (Left Arrow)"
            className="w-8 h-8 flex items-center justify-center text-[#868993] hover:text-[#d1d4dc] hover:bg-[#1e222d] rounded transition-all disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Primary Play/Pause Button */}
          <button
            id="play-pause-btn"
            type="button"
            onClick={onTogglePlay}
            disabled={disabled || totalCount === 0}
            title="Play / Pause Replay (Spacebar)"
            className={`px-4 h-8 rounded font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer shadow-md ${
              isPlaying
                ? "bg-[#f23645] hover:bg-[#d92b39] text-white shadow-[#f2364530]"
                : "bg-[#2962ff] hover:bg-[#1e4bd8] text-white shadow-[#2962ff30]"
            } disabled:opacity-40`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-white" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>PLAY REPLAY</span>
              </>
            )}
          </button>

          <button
            id="step-forward-btn"
            type="button"
            onClick={onStepForward}
            disabled={disabled || totalCount === 0 || currentIndex >= maxIdx}
            title="Step Forward (Right Arrow)"
            className="w-8 h-8 flex items-center justify-center text-[#868993] hover:text-[#d1d4dc] hover:bg-[#1e222d] rounded transition-all disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <button
            id="jump-end-btn"
            type="button"
            onClick={onJumpEnd}
            disabled={disabled || totalCount === 0 || currentIndex >= maxIdx}
            title="Jump to Current / End"
            className="w-8 h-8 flex items-center justify-center text-[#868993] hover:text-[#d1d4dc] hover:bg-[#1e222d] rounded transition-all disabled:opacity-30 cursor-pointer"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Speed & Help Controls */}
        <div className="flex items-center space-x-3">
          {/* Speed Selector */}
          <div className="flex items-center space-x-1.5 bg-[#0c0d10] px-2.5 py-1 rounded border border-[#1e222d] text-xs">
            <Gauge className="w-3.5 h-3.5 text-[#868993]" />
            <span className="text-[#868993] text-[10px] font-bold uppercase hidden sm:inline">Speed:</span>
            <select
              value={speed}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
              disabled={disabled}
              className="bg-transparent text-[#2962ff] font-bold focus:outline-none cursor-pointer text-xs"
            >
              {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-[#131722] text-[#d1d4dc]">
                  {s}x
                </option>
              ))}
            </select>
          </div>

          {/* Hotkeys Modal Trigger */}
          <button
            type="button"
            onClick={onOpenHotkeysModal}
            title="View Keyboard Shortcuts"
            className="flex items-center space-x-1 text-[#868993] hover:text-[#d1d4dc] text-xs px-2 py-1 rounded hover:bg-[#1e222d] transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="hidden md:inline text-[11px] font-medium">Shortcuts</span>
          </button>
        </div>
      </div>
    </div>
  );
};
