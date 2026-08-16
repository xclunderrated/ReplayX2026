import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
  Save,
  Tag,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useSimulatorStore, type Session } from '../../store/useSimulatorStore';
import { TradeReplayChart } from './TradeReplayChart';
import { GradeBadge } from './AnalyticsPrimitives';
import { formatCurrency, formatDuration } from './formatters';
import type { TradeReplayData, GradedTrade } from './analyticsEngine';
import { extractTradeReplayData } from './analyticsEngine';
import { ensureTradeReplayData } from '../../lib/replayDataFetcher';

const QUICK_TAGS = [
  'FOMO', 'Revenge', 'Perfect Setup', 'Early Exit', 'Late Entry',
  'Oversize', 'Followed Plan', 'News Trade', 'Scalp', 'Patience',
];

const SPEEDS = [1, 2, 5, 10];
const REPLAY_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h'];

interface TradeReplayModalProps {
  trade: GradedTrade;
  sessions: Session[];
  onClose: () => void;
}

export const TradeReplayModal: React.FC<TradeReplayModalProps> = ({ trade, sessions, onClose }) => {
  const addJournalEntry = useSimulatorStore((s) => s.addJournalEntry);

  const [selectedTimeframe, setSelectedTimeframe] = useState<string>(trade.timeframe || '1m');

  const [replayData, setReplayData] = useState<TradeReplayData | null>(null);
  const [replayStatus, setReplayStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryNonce, setRetryNonce] = useState(0);

  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [note, setNote] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const replayDataRef = useRef(replayData);
  const replayIndexRef = useRef(replayIndex);
  replayDataRef.current = replayData;
  replayIndexRef.current = replayIndex;

  // Always read the latest session data, but never let session identity churn
  // retrigger the loader. `setTradeCandles` (which caches fetched candles back
  // onto the trade) creates a new sessions array every call — including it in
  // the effect deps would cancel the in-flight fetch right before its result
  // is applied, leaving the modal stuck on "Loading replay data".
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Timestamp of the candle the user was on when switching timeframe; the
  // loader restores the closest candle once fresh data for the new TF arrives.
  const lastTimestampRef = useRef<number | null>(null);

  // Load replay data, fetching from the market data server when the stored
  // candles or session data don't cover the requested timeframe (e.g. deleted
  // session, or switching to a TF finer than what was stored).
  useEffect(() => {
    let cancelled = false;

    const preserveTs = lastTimestampRef.current;

    const applyData = (data: TradeReplayData) => {
      if (cancelled) return;
      setReplayData(data);
      setReplayStatus('ready');

      if (preserveTs != null) {
        let closestIndex = 0;
        let minDelta = Infinity;
        for (let i = 0; i < data.candles.length; i++) {
          const delta = Math.abs(data.candles[i].timestamp - preserveTs);
          if (delta < minDelta) {
            minDelta = delta;
            closestIndex = i;
          }
        }
        setReplayIndex(closestIndex);
      } else {
        setReplayIndex(data.entryIndex);
      }
    };

    // Sync fast path: stored trade candles or session data already cover it —
    // no loading flash, no network.
    const syncData = extractTradeReplayData(trade, sessionsRef.current, selectedTimeframe, { fullDay: true });
    if (syncData) {
      applyData(syncData);
      return () => {
        cancelled = true;
      };
    }

    setReplayStatus('loading');
    setReplayData(null);
    setIsPlaying(false);

    ensureTradeReplayData(trade, sessionsRef.current, selectedTimeframe).then((data) => {
      if (cancelled) return;
      if (!data) {
        setReplayStatus('error');
        return;
      }
      applyData(data);
    });

    return () => {
      cancelled = true;
    };
  }, [trade, selectedTimeframe, retryNonce]);

  const handleTimeframeChange = (newTf: string) => {
    if (newTf === selectedTimeframe) return;

    const currentData = replayDataRef.current;
    const currentIdx = replayIndexRef.current;
    lastTimestampRef.current = currentData?.candles[currentIdx]?.timestamp ?? null;

    setSelectedTimeframe(newTf);
  };

  const maxIndex = replayData ? replayData.candles.length - 1 : 0;

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !replayData) return;
    const interval = setInterval(() => {
      setReplayIndex((i) => {
        const next = i + 1;
        if (next >= maxIndex) {
          setIsPlaying(false);
          return maxIndex;
        }
        return next;
      });
    }, 200 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, speed, maxIndex, replayData]);

  const togglePlay = () => setIsPlaying((p) => !p);
  const stepForward = () => setReplayIndex((i) => Math.min(i + 1, maxIndex));
  const stepBack = () => setReplayIndex((i) => Math.max(i - 1, 0));
  const jumpToEntry = () => replayData && setReplayIndex(replayData.entryIndex);
  const jumpToExit = () => replayData && setReplayIndex(replayData.exitIndex);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const addCustomTag = () => {
    const trimmed = customTag.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
      setCustomTag('');
    }
  };

  const handleSaveToJournal = () => {
    addJournalEntry(
      {
        title: `${trade.instrument.toUpperCase()} ${trade.type.toUpperCase()} Replay`,
        note: [
          note,
          selectedTags.length > 0 ? `Tags: ${selectedTags.join(', ')}` : '',
          `P&L: ${formatCurrency(trade.pnlValue)} | R: ${trade.rMultiple !== null ? `${trade.rMultiple.toFixed(2)}` : 'N/A'} | Grade: ${trade.grade ?? 'N/A'}`,
        ]
          .filter(Boolean)
          .join('\n'),
        imageDataUrl: '',
        instrument: trade.instrument,
        timeframe: trade.timeframe,
        tradeId: trade.id,
        tradeType: trade.type,
        pnl: trade.pnlValue,
        tags: selectedTags,
      },
      trade.sessionId,
    );
    setSavedMessage('Saved to journal!');
    setTimeout(() => setSavedMessage(''), 2500);
  };

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight') stepForward();
      if (e.key === 'ArrowLeft') stepBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (replayStatus === 'loading') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80">
        <div className="border border-[var(--border-soft)] rounded-xl bg-[var(--surface-1)] p-8 text-center max-w-md">
          <Loader2 size={28} className="mx-auto animate-spin text-[var(--accent-1)]" />
          <h2 className="mt-4 text-lg font-semibold text-white">Loading replay data</h2>
          <p className="mt-3 text-[13px] text-[var(--text-secondary)]">
            Fetching {trade.instrument.toUpperCase()} {selectedTimeframe.toUpperCase()} market data for this trade…
          </p>
        </div>
      </div>
    );
  }

  if (replayStatus === 'error' || !replayData) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 ">
        <div className="border border-[var(--border-soft)] rounded-xl bg-[var(--surface-1)] p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold text-white">Replay Unavailable</h2>
          <p className="mt-3 text-[13px] text-[var(--text-secondary)]">
            Candle data for this trade could not be loaded. Make sure the data server is running and that market data exists for this period, then retry.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              onClick={() => setRetryNonce((n) => n + 1)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-1)] text-[var(--accent-contrast)] text-[13px] font-semibold hover:bg-[var(--accent-1)]/85 transition-colors"
            >
              <RefreshCw size={14} />
              Retry
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[var(--border-soft)] text-[13px] font-semibold text-[var(--text-secondary)] hover:text-white transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pnlColor = trade.pnlValue >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]';
  const progressPct = maxIndex > 0 ? (replayIndex / maxIndex) * 100 : 0;

  // Determine which phase we're in
  const phase =
    replayIndex < replayData.entryIndex ? 'pre-entry' :
    replayIndex < replayData.exitIndex ? 'in-trade' :
    'post-exit';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col bg-[var(--app-bg)]"
    >
      {/* Header */}
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-[var(--border-soft)] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-1)]/10 border border-[var(--accent-1)]/20">
            <Play size={14} className="text-[var(--accent-1)]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-white">Trade Replay</span>
            <span className="text-[var(--border-strong)]">—</span>
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">
              {replayData.instrument.toUpperCase()} {trade.type === 'buy' ? 'Long' : 'Short'}
            </span>
            <span className="text-[var(--border-strong)]">·</span>
            <span className="text-[12px] text-[var(--text-muted)]">{replayData.sessionName}</span>
          </div>
        </div>

        {/* Timeframe Switcher */}
        <div className="flex items-center gap-1.5 bg-[var(--surface-ghost)] border border-[var(--border-soft)] rounded-lg p-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] px-1">TF:</span>
          {REPLAY_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => handleTimeframeChange(tf)}
              className={`px-2.5 py-0.5 text-[11px] font-bold rounded transition-colors ${
                selectedTimeframe === tf
                  ? 'bg-[var(--accent-1)] text-[var(--accent-contrast)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-white hover:bg-white/10'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-white transition-colors" title="Close (Esc)">
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Chart area */}
        <div className="flex-1 min-w-0 relative">
          {/* Phase indicator */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
            <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold border ${
              phase === 'pre-entry' ? 'bg-[#f59e0b]/10 border-[#f59e0b]/20 text-[#f59e0b]' :
              phase === 'in-trade' ? 'bg-[#94a3b8]/10 border-[#94a3b8]/20 text-[#94a3b8]' :
              'bg-[#10b981]/10 border-[#10b981]/20 text-[#10b981]'
            }`}>
              <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{
                backgroundColor: phase === 'pre-entry' ? '#f59e0b' : phase === 'in-trade' ? '#94a3b8' : '#10b981',
              }} />
              {phase === 'pre-entry' ? 'Pre-Entry' : phase === 'in-trade' ? 'In Trade' : 'Post-Exit'}
            </div>
          </div>
          <TradeReplayChart replayData={replayData} visibleUpTo={replayIndex} />
        </div>

        {/* Info panel (right sidebar) */}
        <div className="w-[280px] flex-shrink-0 border-l border-[var(--border-soft)] bg-[var(--surface-1)] flex flex-col overflow-y-auto">
          {/* Trade Info */}
          <div className="p-4 border-b border-[var(--border-soft)]">
            <h3 className="text-[13px] font-semibold text-white mb-3">Trade Details</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">Side</span>
                <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium border ${trade.type === 'buy' ? 'border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981]' : 'border-[var(--accent-1)]/30 bg-[var(--accent-1)]/10 text-[var(--accent-1)]'}`}>
                  {trade.type === 'buy' ? 'Long' : 'Short'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">Entry</span>
                <span className="text-[12px] font-semibold text-white">{replayData.entryPrice.toFixed(5)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">Exit</span>
                <span className="text-[12px] font-semibold text-white">{replayData.exitPrice.toFixed(5)}</span>
              </div>
              {replayData.sl && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">Stop Loss</span>
                  <span className="text-[12px] font-semibold text-[#ef4444]">{replayData.sl.toFixed(5)}</span>
                </div>
              )}
              {replayData.tp && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">Take Profit</span>
                  <span className="text-[12px] font-semibold text-[#10b981]">{replayData.tp.toFixed(5)}</span>
                </div>
              )}
              <div className="h-px bg-[var(--border-soft)] my-1" />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">P&L</span>
                <span className={`text-[14px] font-bold ${pnlColor}`}>{formatCurrency(trade.pnlValue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">R-Multiple</span>
                <span className={`text-[12px] font-semibold ${trade.rMultiple === null ? 'text-[var(--text-muted)]' : trade.rMultiple >= 1 ? 'text-[#10b981]' : trade.rMultiple >= 0 ? 'text-white' : 'text-[#ef4444]'}`}>
                  {trade.rMultiple !== null ? `${trade.rMultiple.toFixed(2)}R` : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">Hold Time</span>
                <span className="text-[12px] font-medium text-white">{formatDuration(trade.holdingMs)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">Grade</span>
                <GradeBadge grade={trade.grade} reason={trade.gradeReason} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">Closed</span>
                <span className="text-[12px] text-[var(--text-secondary)]">{new Date(trade.closedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="p-4 border-b border-[var(--border-soft)]">
            <div className="flex items-center gap-2 mb-3">
              <Tag size={12} className="text-[var(--accent-1)]" />
              <h3 className="text-[13px] font-semibold text-white">Tags</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium border transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-[var(--accent-1)]/15 border-[var(--accent-1)]/30 text-[var(--accent-1)]'
                      : 'bg-transparent border-[var(--border-soft)] text-[var(--text-muted)] hover:text-white hover:border-[var(--border-strong)]'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-2.5">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                placeholder="Custom tag..."
                className="flex-1 border border-[var(--border-soft)] rounded-lg bg-[var(--app-bg)] px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-[var(--accent-1)] placeholder:text-[var(--text-muted)]"
              />
              <button onClick={addCustomTag} className="px-2 py-1.5 rounded-lg bg-[var(--surface-2)] text-[11px] text-[var(--text-muted)] hover:text-white transition-colors">
                Add
              </button>
            </div>
          </div>

          {/* Notes + Save */}
          <div className="p-4 flex-1 flex flex-col">
            <h3 className="text-[13px] font-semibold text-white mb-2">Notes</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you learn from this trade?"
              rows={4}
              className="w-full flex-1 resize-none border border-[var(--border-soft)] rounded-lg bg-[var(--app-bg)] p-3 text-[12px] text-white outline-none focus:border-[var(--accent-1)] placeholder:text-[var(--text-muted)]"
            />
            <button
              onClick={handleSaveToJournal}
              className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-1)] px-4 py-2.5 text-[12px] font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-1)]/85 transition-colors"
            >
              <Save size={14} />
              Save to Journal
            </button>
            {savedMessage && (
              <div className="mt-2 text-center text-[11px] font-medium text-[#10b981]">{savedMessage}</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom playback controls */}
      <div className="flex h-14 flex-shrink-0 items-center gap-4 border-t border-[var(--border-soft)] bg-[var(--surface-1)] px-5">
        {/* Skip/step controls */}
        <div className="flex items-center gap-1">
          <button onClick={jumpToEntry} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-white transition-colors" title="Jump to entry">
            <SkipBack size={16} strokeWidth={2} />
          </button>
          <button onClick={stepBack} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-white transition-colors" title="Step back (←)">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
          <button
            onClick={togglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-1)] text-[var(--accent-contrast)] hover:bg-[var(--accent-1)]/85 transition-colors"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={16} strokeWidth={2.5} /> : <Play size={16} strokeWidth={2.5} />}
          </button>
          <button onClick={stepForward} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-white transition-colors" title="Step forward (→)">
            <ChevronRight size={18} strokeWidth={2} />
          </button>
          <button onClick={jumpToExit} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-white transition-colors" title="Jump to exit">
            <SkipForward size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-3">
          <div className="relative flex-1 h-2 rounded-full bg-[var(--surface-2)] cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setReplayIndex(Math.round(pct * maxIndex));
              setIsPlaying(false);
            }}
          >
            {/* Entry/exit markers on progress bar */}
            {replayData && (
              <>
                <div className="absolute top-0 h-full w-0.5 bg-[#089981] z-10" style={{ left: `${(replayData.entryIndex / maxIndex) * 100}%` }} title="Entry" />
                <div className="absolute top-0 h-full w-0.5 bg-[var(--accent-1)] z-10" style={{ left: `${(replayData.exitIndex / maxIndex) * 100}%` }} title="Exit" />
              </>
            )}
            <div className="h-full rounded-full bg-[var(--accent-1)]/40 transition-all duration-75" style={{ width: `${progressPct}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-[var(--accent-1)] border-2 border-[var(--accent-contrast)] shadow-lg transition-all duration-75 group-hover:scale-110"
              style={{ left: `calc(${progressPct}% - 8px)` }}
            />
          </div>
          <span className="text-[11px] font-mono text-[var(--text-muted)] whitespace-nowrap min-w-[80px] text-right">
            {replayIndex + 1} / {maxIndex + 1}
          </span>
        </div>

        {/* Speed selector */}
        <div className="flex items-center gap-1 border border-[var(--border-soft)] rounded-lg p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                speed === s
                  ? 'bg-[var(--accent-1)]/15 text-[var(--accent-1)]'
                  : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--surface-2)]'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
