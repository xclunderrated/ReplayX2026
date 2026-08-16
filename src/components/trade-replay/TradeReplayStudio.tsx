import React, { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { EnrichedTrade } from '../../services/math/tradeMetrics';
import { useSimulatorStore, Session, Strategy } from '../../store/useSimulatorStore';
import { TradeReplayChart } from '../analytics/TradeReplayChart';
import { extractTradeReplayData, TradeReplayData } from '../analytics/analyticsEngine';
import { ensureTradeReplayData } from '../../lib/replayDataFetcher';
import { generateCandlestickChartDataUrl } from '../../services/pdfChartRenderer';
import ReplayScrubberBar from './ReplayScrubberBar';
import ReplayTelemetryWidget from './ReplayTelemetryWidget';
import ReplayReflectionPanel from './ReplayReflectionPanel';
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Clock,
  Sparkles,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface TradeReplayStudioProps {
  trade: EnrichedTrade;
  onBackToLog: () => void;
  onExportPdf: (trade: EnrichedTrade, chartBase64?: string | null) => void;
  strategies: Strategy[];
}

const REPLAY_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', 'd1'];

export default function TradeReplayStudio({
  trade,
  onBackToLog,
  onExportPdf,
  strategies,
}: TradeReplayStudioProps) {
  const sessions = useSimulatorStore((s) => s.sessions);
  const addJournalEntry = useSimulatorStore((s) => s.addJournalEntry);

  const [selectedTimeframe, setSelectedTimeframe] = useState<string>(trade.timeframe || '15m');
  const [replayData, setReplayData] = useState<TradeReplayData | null>(null);
  const [replayStatus, setReplayStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryNonce, setRetryNonce] = useState(0);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Load replay candle data
  useEffect(() => {
    let cancelled = false;

    const applyData = (data: TradeReplayData) => {
      if (cancelled) return;
      setReplayData(data);
      setReplayStatus('ready');
      setCurrentIndex(data.entryIndex);
    };

    const syncData = extractTradeReplayData(trade as any, sessionsRef.current, selectedTimeframe, { fullDay: true });
    if (syncData) {
      applyData(syncData);
      return () => {
        cancelled = true;
      };
    }

    setReplayStatus('loading');
    setReplayData(null);
    setIsPlaying(false);

    ensureTradeReplayData(trade as any, sessionsRef.current, selectedTimeframe).then((data) => {
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

  const maxIndex = replayData ? replayData.candles.length - 1 : 0;

  // Playback timer
  useEffect(() => {
    if (!isPlaying || !replayData) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= maxIndex) {
          setIsPlaying(false);
          return maxIndex;
        }
        return next;
      });
    }, 200 / speed);

    return () => clearInterval(interval);
  }, [isPlaying, speed, maxIndex, replayData]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        setCurrentIndex((i) => Math.min(i + 1, maxIndex));
      } else if (e.key === 'ArrowLeft' || e.key === 'j') {
        setCurrentIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Escape') {
        onBackToLog();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [maxIndex, onBackToLog]);

  // Calculate MAE / MFE index points among candles
  let maeIndex: number | undefined;
  let mfeIndex: number | undefined;

  if (replayData && replayData.entryIndex >= 0 && replayData.exitIndex >= replayData.entryIndex) {
    const candlesInTrade = replayData.candles.slice(replayData.entryIndex, replayData.exitIndex + 1);
    const entryPrice = replayData.entryPrice;

    if (trade.type === 'buy') {
      let lowestLow = Infinity;
      let highestHigh = -Infinity;
      let lowestIdx = replayData.entryIndex;
      let highestIdx = replayData.entryIndex;

      candlesInTrade.forEach((c, idx) => {
        if (c.low < lowestLow) {
          lowestLow = c.low;
          lowestIdx = replayData.entryIndex + idx;
        }
        if (c.high > highestHigh) {
          highestHigh = c.high;
          highestIdx = replayData.entryIndex + idx;
        }
      });

      maeIndex = lowestIdx;
      mfeIndex = highestIdx;
    } else {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      let highestIdx = replayData.entryIndex;
      let lowestIdx = replayData.entryIndex;

      candlesInTrade.forEach((c, idx) => {
        if (c.high > highestHigh) {
          highestHigh = c.high;
          highestIdx = replayData.entryIndex + idx;
        }
        if (c.low < lowestLow) {
          lowestLow = c.low;
          lowestIdx = replayData.entryIndex + idx;
        }
      });

      maeIndex = highestIdx;
      mfeIndex = lowestIdx;
    }
  }

  const handleCaptureSnapshot = () => {
    let snapshotUrl = '';
    if (replayData) {
      try {
        snapshotUrl = generateCandlestickChartDataUrl(trade, replayData);
      } catch (err) {
        console.warn('Could not generate chart snapshot for journal:', err);
      }
    }

    // Save to Journal
    addJournalEntry(
      {
        title: `${trade.instrument} ${trade.type.toUpperCase()} Trade Autopsy`,
        note: `Replay Snapshot | PnL: $${Number(trade.pnl || 0).toFixed(2)} (${trade.calculatedRMultiple}R) | Session: ${trade.sessionName}`,
        imageDataUrl: snapshotUrl,
        instrument: trade.instrument,
        timeframe: selectedTimeframe,
        tradeId: trade.id,
        tradeType: trade.type,
        pnl: trade.pnl,
        tags: [trade.instrument, trade.type, trade.grade || 'Ungraded'],
      },
      trade.sessionId
    );
  };

  const handleExportWithSnapshot = () => {
    let chartUrl: string | null = null;
    if (replayData) {
      try {
        chartUrl = generateCandlestickChartDataUrl(trade, replayData);
      } catch (err) {
        console.warn('Could not generate chart snapshot for PDF:', err);
      }
    }
    onExportPdf(trade, chartUrl);
  };

  const currentCandle = replayData?.candles[currentIndex];

  return (
    <div className="flex flex-col h-full w-full bg-[var(--app-bg)] overflow-hidden select-none">
      {/* Top Header Strip */}
      <div className="flex h-13 shrink-0 items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-ghost)] px-4">
        {/* Back Button & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToLog}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs font-semibold text-[var(--text-primary)] border border-[var(--border-soft)] transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Back to Trade Log</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">Trade Replay Studio</span>
            <span className="text-[var(--text-muted)]">—</span>
            <span className="text-xs font-semibold text-[var(--accent-1)]">{trade.instrument}</span>
            <span className="text-xs text-[var(--text-muted)]">({trade.sessionName})</span>
          </div>
        </div>

        {/* Timeframe Switcher */}
        <div className="flex items-center gap-1 bg-[var(--app-bg)] p-1 rounded-xl border border-[var(--border-soft)]">
          <span className="text-[10px] font-bold text-[var(--text-muted)] px-1 uppercase">TF</span>
          {REPLAY_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={clsx(
                'px-2 py-0.5 rounded-lg text-xs font-bold transition-all',
                selectedTimeframe === tf
                  ? 'bg-[var(--accent-1)] text-white shadow-2xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main Replay Stage + Reflection Panel */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Center Chart Container */}
        <div className="relative flex-1 min-w-0 h-full flex flex-col bg-[var(--app-bg)]">
          {replayStatus === 'loading' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[var(--app-bg)]/80 backdrop-blur-xs">
              <Loader2 size={32} className="animate-spin text-[var(--accent-1)] mb-2" />
              <p className="text-xs font-semibold text-[var(--text-primary)]">Loading high-resolution replay candles...</p>
            </div>
          )}

          {replayStatus === 'error' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[var(--app-bg)] p-6 text-center">
              <p className="text-sm font-bold text-rose-500 mb-1">Replay Data Unavailable</p>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mb-4">
                Unable to fetch market candles for {trade.instrument} on {selectedTimeframe.toUpperCase()}.
              </p>
              <button
                onClick={() => setRetryNonce((n) => n + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent-1)] text-white text-xs font-semibold"
              >
                <RefreshCw size={13} />
                <span>Retry Fetch</span>
              </button>
            </div>
          )}

          {/* Dynamic Floating Telemetry Widget */}
          {replayData && (
            <ReplayTelemetryWidget
              trade={trade}
              currentCandle={currentCandle}
              visibleIndex={currentIndex}
              entryIndex={replayData.entryIndex}
              exitIndex={replayData.exitIndex}
            />
          )}

          {/* Candlestick Replay Chart */}
          <div className="flex-1 min-h-0 w-full relative">
            {replayData && (
              <TradeReplayChart replayData={replayData} visibleUpTo={currentIndex} />
            )}
          </div>

          {/* Interactive Milestone Scrubber */}
          {replayData && (
            <ReplayScrubberBar
              currentIndex={currentIndex}
              maxIndex={maxIndex}
              isPlaying={isPlaying}
              speed={speed}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onStepBack={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
              onStepForward={() => setCurrentIndex((i) => Math.min(i + 1, maxIndex))}
              onSeek={(idx) => setCurrentIndex(idx)}
              onSetSpeed={(s) => setSpeed(s)}
              entryIndex={replayData.entryIndex}
              exitIndex={replayData.exitIndex}
              maeIndex={maeIndex}
              mfeIndex={mfeIndex}
            />
          )}
        </div>

        {/* Right Reflection & Autopsy Panel */}
        <div className="w-80 shrink-0 h-full border-l border-[var(--border-soft)] bg-[var(--surface-ghost)]">
          <ReplayReflectionPanel
            trade={trade}
            onExportPdf={handleExportWithSnapshot}
            onCaptureSnapshot={handleCaptureSnapshot}
            strategies={strategies}
          />
        </div>
      </div>
    </div>
  );
}
