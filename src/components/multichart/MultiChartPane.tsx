import React, { useRef, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useSimulatorStore, type Timeframe } from '../../store/useSimulatorStore';
import type { ChartPaneConfig } from '../../types/multichart';
import { usePaneCandleData } from '../../hooks/usePaneCandleData';
import { TradingViewChart } from '../TradingViewChart';
import { ChartPaneHeader } from './ChartPaneHeader';
import { useMultiChartSync } from '../../hooks/useMultiChartSync';

interface MultiChartPaneProps {
  pane: ChartPaneConfig;
  isPrimary: boolean;
  isActive: boolean;
  isMaximized: boolean;
  onActivate: () => void;
  onOpenSettings?: () => void;
  onOpenDrawingSettings?: (drawingId: string) => void;
  captureRequestId?: number;
  onCaptureReady?: (dataUrl: string) => void;
  isNewsPanelOpen?: boolean;
  onCloseNewsPanel?: () => void;
}

export const MultiChartPane: React.FC<MultiChartPaneProps> = ({
  pane,
  isPrimary,
  isActive,
  isMaximized,
  onActivate,
  onOpenSettings,
  onOpenDrawingSettings,
  captureRequestId,
  onCaptureReady,
  isNewsPanelOpen,
  onCloseNewsPanel,
}) => {
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const session = useSimulatorStore((state) =>
    state.sessions.find((s) => s.id === state.currentSessionId)
  );

  const setChartPaneTimeframe = useSimulatorStore((state) => state.setChartPaneTimeframe);
  const setChartPaneInstrument = useSimulatorStore((state) => state.setChartPaneInstrument);
  const setMaximizedChartPane = useSimulatorStore((state) => state.setMaximizedChartPane);
  const toggleChartPaneIndicators = useSimulatorStore((state) => state.toggleChartPaneIndicators);
  const toggleChartPaneLink = useSimulatorStore((state) => state.toggleChartPaneLink);

  const sessionTimeframe = session?.timeframe || 'm5';
  const sessionInstrument = session?.instrument || 'EURUSD';
  const sessionData = session?.data || [];
  const currentIndex = session?.currentIndex || 0;

  // Use multi-symbol & multi-timeframe candle hook
  const { candles: paneCandles, isLoading, error } = usePaneCandleData(
    sessionData,
    currentIndex,
    sessionTimeframe,
    sessionInstrument,
    pane.timeframe,
    pane.instrument,
    pane.isLinkedToSessionSymbol ?? true,
    session?.startDate,
    session?.endDate
  );

  const candleDataToRender = isPrimary ? undefined : paneCandles;

  // Real-time time-range and crosshair synchronization
  useMultiChartSync(pane.id, chartRef, {
    syncCrosshair: session?.syncCrosshair ?? true,
    syncTimeRange: session?.syncTimeRange ?? true,
  });

  const handleSelectTimeframe = useCallback(
    (tf: Timeframe) => {
      setChartPaneTimeframe(pane.id, tf);
    },
    [pane.id, setChartPaneTimeframe]
  );

  const handleSelectInstrument = useCallback(
    (instrument: string) => {
      setChartPaneInstrument(pane.id, instrument);
    },
    [pane.id, setChartPaneInstrument]
  );

  const handleToggleMaximize = useCallback(() => {
    setMaximizedChartPane(isMaximized ? null : pane.id);
  }, [isMaximized, pane.id, setMaximizedChartPane]);

  const handleToggleIndicators = useCallback(() => {
    toggleChartPaneIndicators(pane.id);
  }, [pane.id, toggleChartPaneIndicators]);

  const handleToggleLink = useCallback(() => {
    toggleChartPaneLink(pane.id);
  }, [pane.id, toggleChartPaneLink]);

  return (
    <div
      ref={containerRef}
      onMouseDownCapture={onActivate}
      className={`relative w-full h-full min-w-0 min-h-0 overflow-hidden transition-all duration-150 ${
        isActive
          ? 'ring-1 ring-[#2962ff] shadow-sm'
          : 'hover:ring-1 hover:ring-[#363a45]/50'
      }`}
    >
      {/* Floating Pane Header (Secondary charts only) */}
      {!isPrimary && (
        <ChartPaneHeader
          pane={pane}
          isPrimary={isPrimary}
          isActive={isActive}
          isMaximized={isMaximized}
          sessionTimeframe={sessionTimeframe}
          sessionInstrument={sessionInstrument}
          onSelectTimeframe={handleSelectTimeframe}
          onSelectInstrument={handleSelectInstrument}
          onToggleMaximize={handleToggleMaximize}
          onToggleIndicators={handleToggleIndicators}
          onToggleLink={handleToggleLink}
        />
      )}

      {/* Pane Loading or Error overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#131722]/80 backdrop-blur-xs">
          <div className="flex items-center gap-2 text-xs text-[#868993] font-mono">
            <div className="w-3.5 h-3.5 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin" />
            <span>Loading {pane.instrument?.toUpperCase() || sessionInstrument.toUpperCase()} ({pane.timeframe.toUpperCase()})...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#131722]/90 p-4">
          <div className="text-center space-y-1 max-w-xs">
            <p className="text-xs font-semibold text-red-400">Data Unavailable</p>
            <p className="text-[11px] text-[#868993]">{error}</p>
          </div>
        </div>
      )}

      {/* Trading Chart Component */}
      <TradingViewChart
        overrideData={candleDataToRender}
        playbackOwner={isPrimary}
        timeframe={pane.timeframe}
        externalChartRef={chartRef}
        externalSeriesRef={seriesRef}
        onOpenSettings={onOpenSettings}
        onOpenDrawingSettings={onOpenDrawingSettings}
        captureRequestId={isPrimary ? captureRequestId : undefined}
        onCaptureReady={isPrimary ? onCaptureReady : undefined}
        isNewsPanelOpen={isNewsPanelOpen}
        onCloseNewsPanel={onCloseNewsPanel}
      />
    </div>
  );
};
