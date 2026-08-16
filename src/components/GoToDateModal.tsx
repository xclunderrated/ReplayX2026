import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, AlertTriangle } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { useShallow } from 'zustand/react/shallow';
import { getDateTimestampMs } from '../lib/goToSessions';

interface GoToDateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoToDateModal: React.FC<GoToDateModalProps> = ({ isOpen, onClose }) => {
  const { session, goToTimestamp } = useSimulatorStore(
    useShallow((state) => ({
      session: state.sessions.find((s) => s.id === state.currentSessionId) || null,
      goToTimestamp: state.goToTimestamp,
    }))
  );

  const [dateValue, setDateValue] = useState('');
  const [timeValue, setTimeValue] = useState('00:00');

  if (!isOpen || !session) return null;

  const currentTimestamp = session.data[session.currentIndex]?.timestamp;
  const hasActiveTrades = session.trades.some((t) => t.status === 'open' || t.status === 'pending');

  // Parse target timestamp
  let targetMs: number | null = null;
  let hasTradesAfterTarget = false;
  if (dateValue) {
    const [y, m, d] = dateValue.split('-').map(Number);
    const [h, min] = timeValue.split(':').map(Number);
    targetMs = getDateTimestampMs(y, m, d, h || 0, min || 0);
    hasTradesAfterTarget = session.trades.some((t) => t.orderTime > targetMs!);
  }

  const showWarning = hasActiveTrades || hasTradesAfterTarget;

  const handleConfirm = () => {
    if (targetMs === null) return;
    goToTimestamp(targetMs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--app-bg)]/80 font-mono text-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md border-2 border-[var(--border-panel)] bg-[var(--app-bg)] shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[var(--border-panel)] px-5 py-4">
          <div>
            <h2 className="font-bold tracking-widest text-[var(--accent-1)]">/go_to_date</h2>
            <p className="mt-1 text-[var(--text-muted)]">jump replay to a specific date and time</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-5 px-5 py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="block tracking-widest text-[var(--text-muted)]">DATE</span>
              <input
                type="date"
                value={dateValue}
                min={session.startDate}
                max={session.endDate}
                onChange={(e) => setDateValue(e.target.value)}
                className="w-full border border-[var(--border-panel)] bg-[var(--app-bg)] px-3 py-2 font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]"
              />
            </label>
            <label className="space-y-2">
              <span className="block tracking-widest text-[var(--text-muted)]">TIME (ET)</span>
              <input
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                className="w-full border border-[var(--border-panel)] bg-[var(--app-bg)] px-3 py-2 font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]"
              />
            </label>
          </div>

          {/* Current position info */}
          {currentTimestamp && (
            <div className="border border-[var(--border-panel)] px-3 py-2 text-[var(--text-muted)]">
              <span className="tracking-widest">CURRENT POSITION </span>
              <span className="text-[var(--text-secondary)]">
                {new Date(currentTimestamp).toLocaleString('en-US', {
                  timeZone: 'America/New_York',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
                {' ET'}
              </span>
            </div>
          )}

          {/* Warning */}
          {showWarning && targetMs !== null && (
            <div className="flex items-start gap-3 border border-[#f97316]/30 bg-[var(--surface-panel)] px-3 py-3">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-[#f97316]" />
              <div className="text-[var(--text-secondary)]">
                {hasActiveTrades && (
                  <p>Open trades will be cancelled.</p>
                )}
                {hasTradesAfterTarget && (
                  <p>Trades placed after this date will be removed.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-6 border-t-2 border-[var(--border-panel)] px-5 py-4">
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors tracking-widest font-bold text-sm"
          >
            [CANCEL]
          </button>
          <button
            onClick={handleConfirm}
            disabled={!dateValue}
            className={`tracking-widest font-bold text-sm transition-colors ${
              dateValue
                ? 'text-[#10b981] hover:text-[#34d399]'
                : 'text-[var(--text-muted)] cursor-not-allowed opacity-40'
            }`}
          >
            [GO]
          </button>
        </div>
      </motion.div>
    </div>
  );
};
