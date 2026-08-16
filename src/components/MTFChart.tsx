/**
 * MTFChart - Secondary multi-timeframe pane.
 *
 * Renders a full TradingViewChart instance driven by derived higher-timeframe
 * candle data from `useTimeframeData`, while keeping playback ownership on the
 * primary chart only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useSimulatorStore, type Timeframe } from '../store/useSimulatorStore';
import { useShallow } from 'zustand/react/shallow';
import { useTimeframeData } from '../hooks/useTimeframeData';
import { TradingViewChart } from './TradingViewChart';
import { canDeriveTimeframe } from '../lib/timeframe';

const TIMEFRAMES: Array<{ value: Timeframe; label: string }> = [
  { value: 'tick', label: 'Tick' },
  { value: 's5', label: '5s' },
  { value: 's15', label: '15s' },
  { value: 's30', label: '30s' },
  { value: 'm1', label: '1m' },
  { value: 'm5', label: '5m' },
  { value: 'm15', label: '15m' },
  { value: 'm30', label: '30m' },
  { value: 'h1', label: '1H' },
  { value: 'h4', label: '4H' },
  { value: 'd1', label: '1D' },
  { value: 'mn1', label: '1M' },
];

interface MTFChartProps {
  paneIndex: number;
  paneTimeframe: string;
  syncedTimestamp: number | null;
  onCrosshairMove: (timestamp: number | null, paneIndex: number) => void;
  onRemovePane: (paneIndex: number) => void;
  onActivate: (paneIndex: number) => void;
  externalChartRef?: React.MutableRefObject<IChartApi | null>;
  externalSeriesRef?: React.MutableRefObject<ISeriesApi<any> | null>;
  externalContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
}

const MTFChartInner: React.FC<MTFChartProps> = ({
  paneIndex,
  paneTimeframe,
  syncedTimestamp,
  onCrosshairMove,
  onRemovePane,
  onActivate,
  externalChartRef,
  externalSeriesRef,
  externalContainerRef,
}) => {
  const [showTfDropdown, setShowTfDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const { session, setTimeframePaneAt } = useSimulatorStore(
    useShallow((state) => {
      const current = state.sessions.find((entry) => entry.id === state.currentSessionId) || null;
      return {
        session: current,
        setTimeframePaneAt: state.setTimeframePaneAt,
      };
    })
  );

  useEffect(() => {
    if (!showTfDropdown) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTfDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTfDropdown]);

  const baseTimeframe = session?.timeframe || 'm5';
  const sessionData = session?.data || [];
  const currentIndex = session?.currentIndex || 0;
  const paneTimeframes = session?.timeframePanes || [];

  const availableTimeframes = useMemo(() => {
    const usedByOtherPanes = new Set(
      paneTimeframes.filter((timeframe, index) => index !== paneIndex)
    );

    return TIMEFRAMES.filter(({ value }) => {
      if (value === paneTimeframe) {
        return true;
      }

      return value !== baseTimeframe && canDeriveTimeframe(baseTimeframe, value) && !usedByOtherPanes.has(value);
    });
  }, [baseTimeframe, paneIndex, paneTimeframe, paneTimeframes]);

  const derivedCandles = useTimeframeData(sessionData, currentIndex, paneTimeframe, baseTimeframe);

  const handleCrosshairMove = useCallback(
    (timestamp: number | null) => {
      onCrosshairMove(timestamp, paneIndex);
    },
    [onCrosshairMove, paneIndex]
  );

  const handleTfChange = (timeframe: string) => {
    if (timeframe === paneTimeframe) {
      setShowTfDropdown(false);
      return;
    }

    setTimeframePaneAt(paneIndex, timeframe);
    setShowTfDropdown(false);
  };

  const tfLabel = TIMEFRAMES.find((entry) => entry.value === paneTimeframe)?.label || paneTimeframe;
  const statusMessage = !sessionData.length
    ? 'Waiting for market data...'
    : derivedCandles.length === 0
      ? 'No candles available for this pane yet.'
      : null;

  return (
    <div
      className="relative flex-1 min-h-0 min-w-0 z-[46] overflow-hidden border-l border-[var(--border-soft)]/60"
      onMouseEnter={() => onActivate(paneIndex)}
      onMouseDownCapture={() => onActivate(paneIndex)}
    >
      <div className="absolute left-3 top-3 z-30 flex items-center gap-1 pointer-events-auto text-[13px]" ref={dropdownRef}>
        <div className="relative">
          <button
            onClick={() => setShowTfDropdown((current) => !current)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[var(--surface-2)] transition-colors text-[var(--text-primary)] font-medium"
            title="Pane timeframe"
          >
            {tfLabel}
            <span className="text-[9px] opacity-70">▼</span>
          </button>
          
          {showTfDropdown && (
            <div className="absolute left-0 top-full mt-1 min-w-[124px] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] p-1.5 shadow-md z-50">
              {availableTimeframes.map((timeframe) => (
                <button
                  key={timeframe.value}
                  onClick={() => handleTfChange(timeframe.value)}
                  className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                    paneTimeframe === timeframe.value
                      ? 'bg-[var(--surface-3)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {timeframe.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => onRemovePane(paneIndex)}
          className="p-1.5 rounded text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors ml-1"
          title="Remove pane"
        >
          ✕
        </button>
      </div>

      {statusMessage && (
        <div className="absolute right-3 top-3 z-30 rounded border border-[var(--border-soft)] bg-[var(--surface-1)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] shadow-lg">
          {statusMessage}
        </div>
      )}

      <TradingViewChart
        overrideData={derivedCandles}
        playbackOwner={false}
        onCrosshairMove={handleCrosshairMove}
        syncedCrosshairTimestamp={syncedTimestamp}
        externalChartRef={externalChartRef}
        externalSeriesRef={externalSeriesRef}
        externalContainerRef={externalContainerRef}
        timeframe={paneTimeframe}
      />
    </div>
  );
};

export const MTFChart = React.memo(MTFChartInner, (prev, next) => {
  return (
    prev.paneIndex === next.paneIndex &&
    prev.paneTimeframe === next.paneTimeframe &&
    prev.syncedTimestamp === next.syncedTimestamp
  );
});

export default MTFChart;
