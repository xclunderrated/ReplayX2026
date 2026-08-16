import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  GripVertical,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'motion/react';

const SPEEDS = [1, 2, 5, 10, 50] as const;

export const ControlPanel: React.FC = () => {
  const {
    hasSession,
    isPlaying,
    playbackSpeed,
    currentIndex,
    totalCandles,
    play,
    pause,
    setSpeed,
    tick,
    reset,
    goToIndex,
  } = useSimulatorStore(
    useShallow((state) => {
      const session = state.sessions.find(
        (s) => s.id === state.currentSessionId,
      );
      return {
        hasSession: !!session,
        isPlaying: session?.isPlaying ?? false,
        playbackSpeed: session?.playbackSpeed ?? 1,
        currentIndex: session?.currentIndex ?? 0,
        totalCandles: session?.data?.length ?? 0,
        play: state.play,
        pause: state.pause,
        setSpeed: state.setSpeed,
        tick: state.tick,
        reset: state.reset,
        goToIndex: state.goToIndex,
      };
    }),
  );

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const progressPct =
    totalCandles > 1
      ? (currentIndex / (totalCandles - 1)) * 100
      : 0;

  const handleReset = useCallback(() => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    reset();
    setConfirmingReset(false);
  }, [confirmingReset, reset]);

  useEffect(() => {
    if (!confirmingReset) return;
    const timer = setTimeout(() => setConfirmingReset(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmingReset]);

  const handleStepBack = useCallback(() => {
    if (currentIndex > 0) {
      goToIndex(currentIndex - 1);
    }
  }, [currentIndex, goToIndex]);

  const handleStepForward = useCallback(() => {
    if (currentIndex < totalCandles - 1) {
      goToIndex(currentIndex + 1);
    }
  }, [currentIndex, totalCandles, goToIndex]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (totalCandles < 2) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      goToIndex(Math.round(pct * (totalCandles - 1)));
    },
    [totalCandles, goToIndex],
  );

  const handleProgressPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (totalCandles < 2) return;
      setIsDraggingProgress(true);
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      goToIndex(Math.round(pct * (totalCandles - 1)));
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [totalCandles, goToIndex],
  );

  const handleProgressPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingProgress || totalCandles < 2) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      goToIndex(Math.round(pct * (totalCandles - 1)));
    },
    [isDraggingProgress, totalCandles, goToIndex],
  );

  const handleProgressPointerUp = useCallback(() => {
    setIsDraggingProgress(false);
  }, []);

  useEffect(() => {
    if (!hasSession) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        isPlaying ? pause() : play();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        tick();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentIndex > 0) goToIndex(currentIndex - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasSession, isPlaying, play, pause, tick, currentIndex, goToIndex]);

  if (!hasSession) return null;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0}
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        className="pointer-events-auto rounded-xl overflow-hidden shadow-lg border border-[var(--border-panel-strong)] bg-[var(--surface-panel)] text-[var(--text-primary)] select-none"
        whileHover={{ boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)' }}
      >
        {/* Integrated Top Thin Scrub Line */}
        {totalCandles > 1 && !isCollapsed && (
          <div
            ref={progressRef}
            className="relative h-1 w-full bg-[var(--surface-chip)] cursor-pointer group hover:h-1.5 transition-all"
            onClick={handleProgressClick}
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerUp}
            title={`Candle ${currentIndex + 1} of ${totalCandles}`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-[var(--accent-1)] transition-[width] duration-75"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        <AnimatePresence initial={false}>
          {!isCollapsed ? (
            <motion.div
              key="compact-expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 px-1.5 py-1 text-xs"
            >
              {/* Drag handle */}
              <div
                className="flex items-center justify-center p-0.5 cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                title="Drag panel"
              >
                <GripVertical size={13} />
              </div>

              {/* Reset */}
              <button
                onClick={handleReset}
                className={`flex h-6 w-6 items-center justify-center rounded transition cursor-pointer ${
                  confirmingReset
                    ? 'bg-red-500/20 text-red-400 font-bold'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-chip)] hover:text-[var(--text-primary)]'
                }`}
                title={confirmingReset ? 'Click to confirm reset' : 'Reset session'}
              >
                <RotateCcw size={12} strokeWidth={2} />
              </button>

              <div className="w-px h-3.5 bg-[var(--border-panel)]" />

              {/* Step back */}
              <button
                onClick={handleStepBack}
                disabled={currentIndex === 0}
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-chip)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title="Step back (Left Arrow)"
              >
                <ChevronLeft size={14} strokeWidth={2} />
              </button>

              {/* Play / Pause */}
              <button
                onClick={isPlaying ? pause : play}
                className="flex h-6 w-6 items-center justify-center rounded bg-[var(--accent-1)]/20 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/30 transition cursor-pointer"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <Pause size={13} strokeWidth={2.5} />
                ) : (
                  <Play size={13} strokeWidth={2.5} className="ml-0.5" />
                )}
              </button>

              {/* Step forward */}
              <button
                onClick={handleStepForward}
                disabled={currentIndex >= totalCandles - 1}
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-chip)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title="Step forward (Right Arrow)"
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>

              <div className="w-px h-3.5 bg-[var(--border-panel)]" />

              {/* Compact Speed Selector Segment */}
              <div className="flex items-center gap-0.5 rounded bg-[var(--surface-inset)] p-0.5 border border-[var(--border-panel)]">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`px-1 py-0.5 text-[9px] font-bold rounded transition cursor-pointer ${
                      playbackSpeed === s
                        ? 'bg-[var(--surface-chip)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              <div className="w-px h-3.5 bg-[var(--border-panel)]" />

              {/* Candle counter */}
              <span className="font-mono text-[9px] font-semibold text-[var(--text-muted)] px-1 select-none">
                {currentIndex + 1}/{totalCandles}
              </span>

              {/* Collapse toggle */}
              <button
                onClick={() => setIsCollapsed(true)}
                className="flex h-6 w-4 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
                title="Collapse replay bar"
              >
                <ChevronDown size={11} strokeWidth={2} />
              </button>
            </motion.div>
          ) : (
            /* Collapsed Micro Bar */
            <motion.div
              key="mini"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs"
            >
              <div className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] p-0.5">
                <GripVertical size={12} />
              </div>
              <button
                onClick={isPlaying ? pause : play}
                className="text-[var(--accent-1)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <span className="font-mono text-[9px] font-semibold text-[var(--text-muted)]">
                {currentIndex + 1}/{totalCandles}
              </span>
              <button
                onClick={() => setIsCollapsed(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer ml-1"
                title="Expand controls"
              >
                <ChevronUp size={11} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
