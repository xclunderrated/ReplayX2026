import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Navigation, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { getSessionJumpTimestamp, getNextTradingDayMs, SESSIONS, type GoToSessionId } from '../lib/goToSessions';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { useShallow } from 'zustand/react/shallow';
import { GoToDateModal } from './GoToDateModal';

export const GoToDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { session, chartTimezone, goToTimestamp } = useSimulatorStore(
    useShallow((state) => ({
      session: state.sessions.find((s) => s.id === state.currentSessionId) || null,
      chartTimezone: state.chartTimezone,
      goToTimestamp: state.goToTimestamp,
    }))
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard shortcut: G to toggle dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;

      if (e.key === 'g' || e.key === 'G') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }

      // Shift+Left/Right for day navigation
      if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleDayNav(e.key === 'ArrowRight' ? 1 : -1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [session, chartTimezone]);

  const goToSession = useCallback(
    (sessionId: GoToSessionId) => {
      if (!session) return;
      const candle = session.data[session.currentIndex];
      if (!candle) return;

      // FXreplay-style: clicking a session jumps the REPLAY CURSOR forward to
      // the next occurrence of that session open (today if it's still ahead,
      // otherwise the next trading day). This prunes trades placed after the
      // target, recomputes balance, and pauses playback. `goToTimestamp` also
      // sets `session.targetTimestamp` when the target falls outside the loaded
      // window, which triggers a re-anchored data load (`useSessionLoader`).
      // The chart auto-pans to the new `currentIndex` on data change, so no
      // explicit `setVisibleRange` is needed (matches FXreplay, where jumping
      // centers the chart on the session open bar).
      const target = getSessionJumpTimestamp(candle.timestamp, sessionId, chartTimezone);
      goToTimestamp(target);
      setIsOpen(false);
    },
    [session, chartTimezone, goToTimestamp]
  );

  const handleDayNav = useCallback(
    (direction: 1 | -1) => {
      if (!session) return;
      const candle = session.data[session.currentIndex];
      if (!candle) return;

      const nextDayMs = getNextTradingDayMs(candle.timestamp, direction);
      goToTimestamp(nextDayMs);
      setIsOpen(false);
    },
    [session, goToTimestamp]
  );

  // Current date for display
  const currentCandle = session?.data[session.currentIndex];
  const currentDateLabel = currentCandle
    ? new Date(currentCandle.timestamp).toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-[var(--surface-2)] transition-colors text-[var(--text-primary)] font-medium"
          title="Go To (G)"
        >
          <Navigation size={16} strokeWidth={2} />
          <span className="hidden sm:inline">Go to</span>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] shadow-md overflow-hidden py-1"
            >
              {/* Section 1: Sessions */}
              <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Sessions
              </div>
              {SESSIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => goToSession(opt.id)}
                  className="w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left transition-colors text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                >
                  <span className="font-bold tracking-[0.08em]">{opt.label}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{opt.timeLabel}</span>
                </button>
              ))}

              {/* Divider */}
              <div className="mx-2 my-1.5 h-px bg-[var(--border-soft)]" />

              {/* Section 2: Day Navigation */}
              <div className="px-3 pb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Day Navigation
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                <button
                  onClick={() => handleDayNav(-1)}
                  className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-primary)] transition-colors flex items-center gap-1 text-[11px] font-medium"
                  title="Previous Day (Shift+←)"
                >
                  <ChevronLeft size={14} strokeWidth={2} />
                  <span>Prev</span>
                </button>
                {currentDateLabel && (
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                    {currentDateLabel}
                  </span>
                )}
                <button
                  onClick={() => handleDayNav(1)}
                  className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-primary)] transition-colors flex items-center gap-1 text-[11px] font-medium"
                  title="Next Day (Shift+→)"
                >
                  <span>Next</span>
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              </div>

              {/* Divider */}
              <div className="mx-2 my-1.5 h-px bg-[var(--border-soft)]" />

              {/* Section 3: Go to Date */}
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsDateModalOpen(true);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] mb-1"
              >
                <Calendar size={14} strokeWidth={2.5} />
                <span className="font-bold tracking-[0.08em]">Go to Date…</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <GoToDateModal
        isOpen={isDateModalOpen}
        onClose={() => setIsDateModalOpen(false)}
      />
    </>
  );
};
