import React from 'react';
import { clsx } from 'clsx';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Target,
  Flame,
  ShieldAlert,
  Flag,
} from 'lucide-react';

interface ReplayScrubberBarProps {
  currentIndex: number;
  maxIndex: number;
  isPlaying: boolean;
  speed: number;
  onTogglePlay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSeek: (index: number) => void;
  onSetSpeed: (speed: number) => void;
  entryIndex: number;
  exitIndex: number;
  maeIndex?: number;
  mfeIndex?: number;
}

const SPEEDS = [0.5, 1, 2, 5, 10];

export default function ReplayScrubberBar({
  currentIndex,
  maxIndex,
  isPlaying,
  speed,
  onTogglePlay,
  onStepBack,
  onStepForward,
  onSeek,
  onSetSpeed,
  entryIndex,
  exitIndex,
  maeIndex,
  mfeIndex,
}: ReplayScrubberBarProps) {
  const progressPercent = maxIndex > 0 ? (currentIndex / maxIndex) * 100 : 0;
  const entryPercent = maxIndex > 0 ? (entryIndex / maxIndex) * 100 : 0;
  const exitPercent = maxIndex > 0 ? (exitIndex / maxIndex) * 100 : 0;
  const maePercent = maxIndex > 0 && maeIndex !== undefined ? (maeIndex / maxIndex) * 100 : undefined;
  const mfePercent = maxIndex > 0 && mfeIndex !== undefined ? (mfeIndex / maxIndex) * 100 : undefined;

  return (
    <div className="flex flex-col gap-2 p-3 bg-[var(--surface-2)] border-t border-[var(--border-soft)] select-none">
      {/* Interactive Milestone Scrubber Track */}
      <div className="relative flex items-center w-full group">
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={currentIndex}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-2 rounded-lg bg-[var(--surface-3)] appearance-none cursor-pointer accent-[var(--accent-1)] focus:outline-none"
        />

        {/* Milestone Indicator Flags on Track */}
        {entryIndex >= 0 && (
          <div
            style={{ left: `${entryPercent}%` }}
            title={`Entry Candle (Bar #${entryIndex})`}
            onClick={() => onSeek(entryIndex)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-xs cursor-pointer hover:scale-125 transition-transform"
          />
        )}

        {maePercent !== undefined && maeIndex !== undefined && (
          <div
            style={{ left: `${maePercent}%` }}
            title={`Max Drawdown / MAE (Bar #${maeIndex})`}
            onClick={() => onSeek(maeIndex)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-rose-500 border border-white shadow-xs cursor-pointer hover:scale-125 transition-transform"
          />
        )}

        {mfePercent !== undefined && mfeIndex !== undefined && (
          <div
            style={{ left: `${mfePercent}%` }}
            title={`Max Peak Profit / MFE (Bar #${mfeIndex})`}
            onClick={() => onSeek(mfeIndex)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-teal-400 border border-white shadow-xs cursor-pointer hover:scale-125 transition-transform"
          />
        )}

        {exitIndex >= 0 && (
          <div
            style={{ left: `${exitPercent}%` }}
            title={`Exit Candle (Bar #${exitIndex})`}
            onClick={() => onSeek(exitIndex)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-xs cursor-pointer hover:scale-125 transition-transform"
          />
        )}
      </div>

      {/* Control Buttons & Milestone Jumpers */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Milestone Jump Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSeek(Math.max(0, entryIndex - 15))}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--app-bg)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] border border-[var(--border-soft)] font-medium text-[11px] transition-colors"
            title="Pre-trade context (15 candles before entry)"
          >
            <span>Pre-Trade</span>
          </button>

          <button
            onClick={() => onSeek(entryIndex)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20 font-bold text-[11px] transition-colors"
            title="Jump to Entry execution bar"
          >
            <Target size={11} />
            <span>Entry</span>
          </button>

          {maeIndex !== undefined && (
            <button
              onClick={() => onSeek(maeIndex)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-semibold text-[11px] transition-colors"
              title="Jump to Max Adverse Excursion (Heat point)"
            >
              <ShieldAlert size={11} />
              <span>MAE</span>
            </button>
          )}

          {mfeIndex !== undefined && (
            <button
              onClick={() => onSeek(mfeIndex)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 font-semibold text-[11px] transition-colors"
              title="Jump to Max Favorable Excursion (Peak point)"
            >
              <Flame size={11} />
              <span>MFE</span>
            </button>
          )}

          <button
            onClick={() => onSeek(exitIndex)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 font-bold text-[11px] transition-colors"
            title="Jump to Exit closing bar"
          >
            <Flag size={11} />
            <span>Exit</span>
          </button>

          <button
            onClick={() => onSeek(maxIndex)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--app-bg)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] border border-[var(--border-soft)] font-medium text-[11px] transition-colors"
            title="Post-trade outcome (all subsequent candles)"
          >
            <span>Post-Trade</span>
          </button>
        </div>

        {/* Step & Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSeek(0)}
            className="p-1.5 rounded-lg bg-[var(--app-bg)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-soft)] transition-colors"
            title="Beginning"
          >
            <SkipBack size={13} />
          </button>

          <button
            onClick={onStepBack}
            className="p-1.5 rounded-lg bg-[var(--app-bg)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-soft)] transition-colors"
            title="Step 1 bar backward (Left Arrow)"
          >
            <ChevronLeft size={14} />
          </button>

          <button
            onClick={onTogglePlay}
            className="flex items-center justify-center h-8 w-14 rounded-xl bg-[var(--accent-1)] text-white hover:opacity-90 transition-opacity shadow-xs font-semibold"
            title={isPlaying ? 'Pause Replay (Space)' : 'Play Replay (Space)'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>

          <button
            onClick={onStepForward}
            className="p-1.5 rounded-lg bg-[var(--app-bg)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-soft)] transition-colors"
            title="Step 1 bar forward (Right Arrow)"
          >
            <ChevronRight size={14} />
          </button>

          <button
            onClick={() => onSeek(maxIndex)}
            className="p-1.5 rounded-lg bg-[var(--app-bg)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-soft)] transition-colors"
            title="End"
          >
            <SkipForward size={13} />
          </button>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-[var(--app-bg)] p-0.5 rounded-lg border border-[var(--border-soft)] ml-2">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => onSetSpeed(s)}
                className={clsx(
                  'px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors',
                  speed === s
                    ? 'bg-[var(--accent-1)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                )}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Counter Display */}
        <div className="text-[11px] font-mono text-[var(--text-muted)]">
          Bar <span className="font-bold text-[var(--text-primary)]">{currentIndex}</span> / {maxIndex} ({progressPercent.toFixed(0)}%)
        </div>
      </div>
    </div>
  );
}
