import React, { Suspense, lazy, useState, useRef, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ControlPanel } from './ControlPanel';
import { IndicatorModal } from './IndicatorModal';
import { OrderPlacementOverlay } from './OrderPlacementOverlay';
import { AnalyticsModal } from './AnalyticsModal';
import { StrategyPopup } from './StrategyPopup';
import { useSimulatorStore, Timeframe } from '../store/useSimulatorStore';
import { getContractMultiplier } from '../lib/orders';
import { useShallow } from 'zustand/react/shallow';
import { Activity, Camera, BarChart2, BookOpen, Maximize, Minimize, CheckSquare, Columns, Rows, PanelRightOpen, Settings, Newspaper, AlertTriangle, RefreshCw, Volume2, VolumeX, Layers, LineChart, FlaskConical } from 'lucide-react';
import { GoToDropdown } from './GoToDropdown';
import { motion } from 'motion/react';
import { DrawingToolbar } from './DrawingToolbar';
import { DrawingInspector } from './DrawingInspector';
import { DrawingPropertiesBar } from './drawings/DrawingPropertiesBar';
import { DrawingSettingsModal } from './drawings/DrawingSettingsModal';
import { ShortcutHelpModal } from './ShortcutHelpModal';
import { createShortcutMap, normalizeShortcutEvent, findMatchingCommand } from '../lib/drawings/shortcuts';
import { MultiChartContainer } from './multichart/MultiChartContainer';
import { MultiChartLayoutSelector } from './multichart/MultiChartLayoutSelector';
import { MultiChartSyncControls } from './multichart/MultiChartSyncControls';
import { LastTradeScreenshotsTestPanel } from './testing/LastTradeScreenshotsTestPanel';

const TradingViewChart = lazy(() => import('./TradingViewChart'));
const MTFChart = lazy(() => import('./MTFChart'));

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
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

interface ChartBindingRefs {
  chartRef: React.MutableRefObject<IChartApi | null>;
  seriesRef: React.MutableRefObject<ISeriesApi<any> | null>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

export const SessionView: React.FC<{ onOpenJournal?: () => void; onOpenSettings?: () => void }> = ({ onOpenJournal, onOpenSettings }) => {
  const {
    currentSessionId,
    session,
    activeStrategyId,
    orderDraft,
    setTimeframe,
    isFullScreen,
    toggleFullScreen,
    addJournalEntry,
    startOrderDraft,
    addTimeframePane,
    setMtfLayout,
    soundEffectsEnabled,
    toggleSoundEffects,
    autoOpenLastTradeScreenshots,
    isNewsPanelOpen,
    setIsNewsPanelOpen,
    toggleNewsPanel,
  } = useSimulatorStore(useShallow((state) => ({
    currentSessionId: state.currentSessionId,
    session: state.sessions.find((s) => s.id === state.currentSessionId) || null,
    activeStrategyId: state.activeStrategyId,
    orderDraft: state.orderDraft,
    setTimeframe: state.setTimeframe,
    isFullScreen: state.isFullScreen,
    toggleFullScreen: state.toggleFullScreen,
    addJournalEntry: state.addJournalEntry,
    startOrderDraft: state.startOrderDraft,
    addTimeframePane: state.addTimeframePane,
    removeTimeframePane: state.removeTimeframePane,
    setMtfLayout: state.setMtfLayout,
    soundEffectsEnabled: state.soundEffectsEnabled,
    toggleSoundEffects: state.toggleSoundEffects,
    autoOpenLastTradeScreenshots: state.autoOpenLastTradeScreenshots,
    isNewsPanelOpen: state.isNewsPanelOpen,
    setIsNewsPanelOpen: state.setIsNewsPanelOpen,
    toggleNewsPanel: state.toggleNewsPanel,
  })));
  const [showTimeframes, setShowTimeframes] = useState(false);
  const [isIndicatorModalOpen, setIsIndicatorModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isStrategyPopupOpen, setIsStrategyPopupOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTestScreenshotPanelOpen, setIsTestScreenshotPanelOpen] = useState(false);
  const [settingsDrawingId, setSettingsDrawingId] = useState<string | null>(null);
  const [captureRequestId, setCaptureRequestId] = useState(0);
  // Remembers the last data warning the user dismissed, so a *new* warning still
  // surfaces but the current one does not nag on every re-render.
  const [dismissedDataWarning, setDismissedDataWarning] = useState<string | null>(null);
  const dataWarning = session.dataState?.dataWarning ?? null;
  const visibleDataWarning = dataWarning && dataWarning !== dismissedDataWarning ? dataWarning : null;

  // Drawing system keyboard listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = !!(
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      );

      if (e.key === '?' && !isTyping) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
        return;
      }

      const normalized = normalizeShortcutEvent(e, { isTyping });
      if (normalized.blocked) return;

      const shortcuts = createShortcutMap();
      const match = findMatchingCommand(shortcuts, normalized);
      if (!match) return;

      if (match.id.startsWith('tool.')) {
        e.preventDefault();
        const toolId = match.id.replace('tool.', '') as any;
        useSimulatorStore.getState().setActiveDrawingTool(toolId);
      } else if (match.id === 'selection.delete' || match.id === 'selection.deleteAlt') {
        e.preventDefault();
        const sess = useSimulatorStore.getState().sessions.find((s) => s.id === useSimulatorStore.getState().currentSessionId);
        if (sess?.drawingDocument?.selectedIds.length) {
          useSimulatorStore.getState().deleteDrawingObjects(sess.drawingDocument.selectedIds);
        }
      } else if (match.id === 'selection.duplicate') {
        e.preventDefault();
        useSimulatorStore.getState().duplicateSelectedDrawings();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const closedTradeCountRef = useRef<number | null>(null);
  React.useEffect(() => {
    const closedCount = (session?.trades ?? []).filter((t) => t.status === 'closed').length;
    if (closedTradeCountRef.current === null) {
      closedTradeCountRef.current = closedCount;
      return;
    }
    if (closedCount > closedTradeCountRef.current) {
      // Auto-open screenshots panel if enabled in preferences
      if (autoOpenLastTradeScreenshots) {
        setIsTestScreenshotPanelOpen(true);
      }
    }
    closedTradeCountRef.current = closedCount;
  }, [session?.trades, autoOpenLastTradeScreenshots]);

  const [pendingCapture, setPendingCapture] = useState<{ imageDataUrl: string } | null>(null);

  const [captureTitle, setCaptureTitle] = useState('');
  const [captureNote, setCaptureNote] = useState('');
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const paneBindingsRef = useRef<Record<number, ChartBindingRefs>>({});
  const [activeDrawingPane, setActiveDrawingPane] = useState<number>(-1);

  const getPaneBindings = useCallback((paneIndex: number): ChartBindingRefs => {
    if (!paneBindingsRef.current[paneIndex]) {
      paneBindingsRef.current[paneIndex] = {
        chartRef: { current: null },
        seriesRef: { current: null },
        containerRef: { current: null },
      };
    }
    return paneBindingsRef.current[paneIndex];
  }, []);

  const activeDrawingBindings = activeDrawingPane >= 0
    ? getPaneBindings(activeDrawingPane)
    : {
        chartRef,
        seriesRef,
        containerRef: chartContainerRef,
      };

  const handleActivatePane = useCallback((paneIndex: number) => {
    setActiveDrawingPane((current) => (current === paneIndex ? current : paneIndex));
  }, []);

  // Crosshair synchronization
  const [syncedTimestamp, setSyncedTimestamp] = useState<number | null>(null);
  const [syncSourcePane, setSyncSourcePane] = useState<number>(-1); // -1 = primary chart
  const crosshairTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCrosshairMove = useCallback((timestamp: number | null, paneIndex: number) => {
    setSyncedTimestamp(timestamp);
    setSyncSourcePane(paneIndex);
    if (crosshairTimeoutRef.current) clearTimeout(crosshairTimeoutRef.current);
    if (timestamp === null) {
      crosshairTimeoutRef.current = setTimeout(() => {
        setSyncedTimestamp(null);
        setSyncSourcePane(-1);
      }, 100);
    }
  }, []);

  const handlePrimaryChartCrosshairMove = useCallback((timestamp: number | null) => {
    handleCrosshairMove(timestamp, -1);
  }, [handleCrosshairMove]);

  const handleRemovePane = useCallback((paneIndex: number) => {
    setActiveDrawingPane((current) => (current === paneIndex ? -1 : current > paneIndex ? current - 1 : current));
    useSimulatorStore.getState().removeTimeframePane(paneIndex);
  }, []);

  React.useEffect(() => {
    const panesLength = session?.timeframePanes?.length ?? 0;
    if (activeDrawingPane >= panesLength) {
      setActiveDrawingPane(-1);
    }
  }, [activeDrawingPane, session?.timeframePanes?.length]);

  // Resize handle for split panes
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const isDraggingRef = useRef(false);
  const containerLayoutRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsResizingSplit(true);
    const container = containerLayoutRef.current;
    if (!container) return;

    const onMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !container) return;
      const rect = container.getBoundingClientRect();
      const isHorizontal = session?.mtfLayout === 'horizontal';
      const pos = isHorizontal
        ? (moveEvent.clientX - rect.left) / rect.width
        : (moveEvent.clientY - rect.top) / rect.height;
      setSplitRatio(Math.max(0.15, Math.min(0.85, pos)));
      window.dispatchEvent(new Event('resize'));
    };

    const onUp = () => {
      isDraggingRef.current = false;
      setIsResizingSplit(false);
      window.dispatchEvent(new Event('resize'));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [session?.mtfLayout]);

  const handleAddSplitPane = useCallback(() => {
    if (!session) return;
    const { timeframe, timeframePanes } = session;
    const tfOrder = TIMEFRAMES.map((entry) => entry.value);
    const currentIdx = tfOrder.indexOf(timeframe as Timeframe);
    const preferredOrder = [
      ...tfOrder.slice(currentIdx + 1),
      ...tfOrder.slice(0, currentIdx).reverse(),
    ];
    const nextTf = preferredOrder.find((entry) => entry !== timeframe && !timeframePanes.includes(entry));

    if (nextTf) {
      addTimeframePane(nextTf);
    }
  }, [session, addTimeframePane]);

  if (!session || !currentSessionId) return null;

  const { data, currentIndex, instrument, timeframe, balance, trades, timeframePanes, mtfLayout } = session;
  const hasMtfPanes = timeframePanes && timeframePanes.length > 0;

  const handleBuy = () => {
    if (!data[currentIndex]) return;
    startOrderDraft('buy', 'market', data[currentIndex].close);
  };

  const handleSell = () => {
    if (!data[currentIndex]) return;
    startOrderDraft('sell', 'market', data[currentIndex].close);
  };

  const realizedPnL = trades.reduce((acc, t) => {
    if (t.status === 'closed') {
      return acc + (t.pnl || 0);
    }
    const partialRealized = (t.scaleOuts ?? [])
      .filter((s) => s.executed)
      .reduce((sum, s) => sum + (s.pnl ?? 0), 0);
    return acc + partialRealized;
  }, 0);
  
  // Calculate unrealized PnL
  const currentCandle = data[currentIndex];
  const mult = getContractMultiplier(instrument);
  const unrealizedPnL = trades.filter(t => t.status === 'open').reduce((acc, t) => {
    if (!currentCandle || t.entryPrice === undefined) return acc;
    const effectiveSize = t.remainingSize ?? t.size;
    const pnl = t.type === 'buy' 
      ? (currentCandle.close - t.entryPrice) * effectiveSize * mult
      : (t.entryPrice - currentCandle.close) * effectiveSize * mult;
    return acc + pnl;
  }, 0);

  const handleCaptureToJournal = () => {
    setCaptureRequestId((prev) => prev + 1);
  };

  const handleCaptureReady = (imageDataUrl: string) => {
    const relatedTrade = [...trades]
      .filter((trade) => (trade.entryTime ?? trade.orderTime) <= (currentCandle?.timestamp ?? Number.MAX_SAFE_INTEGER))
      .sort((a, b) => (b.exitTime ?? b.entryTime ?? b.orderTime) - (a.exitTime ?? b.entryTime ?? b.orderTime))[0];

    const defaultTitle = relatedTrade
      ? `${instrument.toUpperCase()} ${relatedTrade.type.toUpperCase()} ${timeframe}`
      : `${instrument.toUpperCase()} ${timeframe} Snapshot`;

    setPendingCapture({ imageDataUrl });
    setCaptureTitle(defaultTitle);
    setCaptureNote('');
  };

  const confirmCapture = () => {
    if (!pendingCapture) return;
    addJournalEntry({
      title: captureTitle,
      note: captureNote || undefined,
      imageDataUrl: pendingCapture.imageDataUrl,
      instrument,
      timeframe,
      candleTimestamp: currentCandle?.timestamp,
    }, session.id);
    setPendingCapture(null);
    setCaptureTitle('');
    setCaptureNote('');
    onOpenJournal?.();
  };

  const cancelCapture = () => {
    setPendingCapture(null);
    setCaptureTitle('');
    setCaptureNote('');
  };

  const canAddSplitPane = timeframePanes.length < 3 && TIMEFRAMES.some((entry) => entry.value !== timeframe && !timeframePanes.includes(entry.value));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col flex-1 h-full w-full overflow-hidden bg-transparent text-[var(--text-primary)]"
    >
      {/* 1. TOP HEADER BAR */}
      <div className="session-view-header flex h-[42px] flex-shrink-0 items-center justify-between border-b border-[var(--border-soft)] bg-transparent px-2 z-[48] text-[13px] text-[var(--text-secondary)] select-none">
        <div className="flex items-center gap-1">
          <div className="flex items-center px-2 py-1 hover:bg-[var(--surface-2)] rounded cursor-pointer transition-colors" title="Change instrument">
            <span className="font-bold text-[var(--text-primary)] text-sm tracking-tight">{instrument.toUpperCase()}</span>
            {session.name && (
              <>
                <span className="mx-1.5 text-[var(--border-strong)]">/</span>
                <span className="text-[var(--text-secondary)] text-[12px] font-medium truncate max-w-[140px]">{session.name}</span>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-[var(--border-strong)] mx-1" />

          <div className="relative">
            <button
              onClick={() => setShowTimeframes(!showTimeframes)}
              data-onboarding="timeframe-switcher"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[var(--surface-2)] transition-colors text-[var(--text-primary)] font-medium"
            >
              <span>{TIMEFRAMES.find(t => t.value === timeframe)?.label || timeframe.toUpperCase()}</span>
              <span className="text-[9px] opacity-70">▼</span>
            </button>

            {showTimeframes && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[124px] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] p-1.5 shadow-md">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf.value}
                    onClick={() => {
                      setTimeframe(tf.value);
                      setShowTimeframes(false);
                    }}
                    className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${timeframe === tf.value ? 'bg-[var(--surface-3)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'}`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-[var(--border-strong)] mx-1" />

          <button
            onClick={() => setIsIndicatorModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-[var(--surface-2)] transition-colors text-[var(--text-primary)] font-medium"
            title="Indicators"
          >
            <Activity size={16} strokeWidth={2} />
            <span className="hidden sm:inline">Indicators</span>
          </button>

          {/* Sound FX Toggle */}
          <button
            onClick={toggleSoundEffects}
            className={`flex items-center gap-1 p-1.5 rounded transition-all text-xs ${
              soundEffectsEnabled
                ? 'text-[#2962ff] hover:bg-[var(--surface-2)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] opacity-60'
            }`}
            title={soundEffectsEnabled ? 'Execution Sound Effects: ON' : 'Execution Sound Effects: OFF'}
          >
            {soundEffectsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          <GoToDropdown />

          <div className="h-4 w-px bg-[var(--border-strong)] mx-1" />

          {/* Multi-Chart Layout & MTF Controls */}
          <MultiChartLayoutSelector />
          <MultiChartSyncControls />
        </div>

        <div className="flex items-center gap-1">
          {currentCandle && (
            <div className="mr-2 flex items-center px-2 py-1">
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                {currentCandle.close.toFixed(5)}
              </span>
            </div>
          )}
          
          <div className="h-4 w-px bg-[var(--border-strong)] mx-1 hidden sm:block" />

          {/* Last Trade Screenshots Toggle Button */}
          <button
            onClick={() => setIsTestScreenshotPanelOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
              isTestScreenshotPanelOpen
                ? 'bg-[var(--accent-1)]/20 text-[var(--accent-1)] border-[var(--accent-1)]/40 shadow-xs'
                : 'bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] border-[var(--border-soft)]'
            }`}
            title="View Multi-Timeframe Screenshots of Last Trade"
          >
            <Camera size={14} className="text-[var(--accent-1)]" />
            <span className="hidden md:inline">Last Trade Screenshots</span>
          </button>
          
          <button 
            onClick={handleCaptureToJournal} 
            className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-primary)] transition-colors"
            title="Take screenshot"
          >
            <Camera size={18} strokeWidth={1.5} />
          </button>

          <button
            onClick={toggleFullScreen}
            className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-primary)] transition-colors"
            title={isFullScreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullScreen ? <Minimize size={18} strokeWidth={1.5} /> : <Maximize size={18} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 w-full relative">
        {/* LEFT TOOLBAR (Drawings) */}
        <DrawingToolbar
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
          onOpenInspector={() => setIsInspectorOpen((prev) => !prev)}
        />

        {/* 3. CENTER AREA (Charts + Bottom Bar) */}
        <div className="flex flex-1 flex-col min-w-0 relative">
          
          {/* Chart Content */}
          <div
            ref={containerLayoutRef}
            className={`flex-1 min-h-0 relative flex ${hasMtfPanes ? (mtfLayout === 'horizontal' ? 'flex-row' : 'flex-col') : ''}`}
          >
            {/* Primary chart pane */}
            <div
              className="relative min-h-0 min-w-0 z-[46]"
              onMouseEnter={() => handleActivatePane(-1)}
              onMouseDownCapture={() => handleActivatePane(-1)}
              style={hasMtfPanes ? {
                [mtfLayout === 'horizontal' ? 'width' : 'height']: `${splitRatio * 100}%`,
                flexShrink: 0,
              } : { flex: 1 }}
            >
              <div className="pointer-events-none absolute left-3 top-3 z-30 flex">
                <div className="pointer-events-auto flex items-center rounded-xl border border-[var(--border-soft)] bg-[#0e121b]/95 shadow-xl backdrop-blur-md overflow-hidden p-0.5 gap-0.5">
                  <button
                    onClick={handleSell}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition-all hover:bg-[#f23645]/20 cursor-pointer ${
                      orderDraft?.type === 'sell'
                        ? 'bg-[#f23645] text-white shadow-xs'
                        : 'text-[#f23645]'
                    }`}
                  >
                    <span className="text-[10px] font-bold tracking-wider uppercase">SELL</span>
                    <span className={`font-mono text-[11px] font-bold ${orderDraft?.type === 'sell' ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                      {currentCandle ? currentCandle.close.toFixed(5) : '--'}
                    </span>
                  </button>
                  <div className="w-px h-4 bg-[var(--border-soft)] opacity-60" />
                  <button
                    onClick={handleBuy}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition-all hover:bg-[#089981]/20 cursor-pointer ${
                      orderDraft?.type === 'buy'
                        ? 'bg-[#089981] text-white shadow-xs'
                        : 'text-[#089981]'
                    }`}
                  >
                    <span className="text-[10px] font-bold tracking-wider uppercase">BUY</span>
                    <span className={`font-mono text-[11px] font-bold ${orderDraft?.type === 'buy' ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                      {currentCandle ? currentCandle.close.toFixed(5) : '--'}
                    </span>
                  </button>
                </div>
              </div>
              <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--text-muted)]">Loading chart workstation...</div>}>
                <MultiChartContainer
                  onOpenSettings={onOpenSettings}
                  onOpenDrawingSettings={(id) => setSettingsDrawingId(id)}
                  captureRequestId={captureRequestId}
                  onCaptureReady={handleCaptureReady}
                  isNewsPanelOpen={isNewsPanelOpen}
                  onCloseNewsPanel={() => setIsNewsPanelOpen(false)}
                />
              </Suspense>

              {/* In-Chart Floating Drawing Properties Toolbar when a drawing is selected */}
              <DrawingPropertiesBar onOpenSettingsModal={(id) => setSettingsDrawingId(id)} />

              {/* In-Chart Compact Order Placement Menu at Bottom-Left */}
              <OrderPlacementOverlay />

              {isInspectorOpen && (
                <div className="absolute top-12 right-3 z-30 pointer-events-auto max-h-[calc(100%-80px)]">
                  <DrawingInspector
                    onClose={() => setIsInspectorOpen(false)}
                    onOpenSettingsModal={(obj) => setSettingsDrawingId(obj.id)}
                  />
                </div>
              )}

              {/* Non-blocking data warning: the chart is usable, but not for the
                  full range the session asked for. Hidden while the loading /
                  error overlay owns the screen. */}
              {visibleDataWarning && session.data.length > 0 && (
                <div className="absolute top-2 left-1/2 z-40 w-[min(38rem,calc(100%-2rem))] -translate-x-1/2">
                  <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 shadow-lg backdrop-blur">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                    <p className="flex-1 text-[11px] leading-relaxed text-amber-100">{visibleDataWarning}</p>
                    <button
                      onClick={() => setDismissedDataWarning(visibleDataWarning)}
                      className="flex-shrink-0 rounded px-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80 hover:text-amber-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Chart Stage Loading / Error Overlay */}
              {(session.data.length === 0 || session.dataState?.isLoading) && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--app-bg)]/85 transition-all duration-300">
                  <div className="surface-panel-strong flex flex-col items-center justify-center max-w-md w-full p-8 rounded-2xl border border-[var(--border-soft)] shadow-lg text-center space-y-4">
                    {session.dataState?.error ? (
                      <>
                        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center">
                          <AlertTriangle className="w-6 h-6" />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-center gap-2 pb-1">
                            <span className="bg-red-500/15 text-red-400 border border-red-500/30 font-bold px-2.5 py-0.5 text-xs rounded-md uppercase tracking-wider">
                              {instrument}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-red-400 tracking-tight">Market Data Error</h3>
                          <p className="text-xs text-[var(--text-secondary)] font-mono leading-relaxed px-2">
                            {session.dataState.error}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 pt-2 w-full">
                          <button
                            onClick={() => window.location.hash = ''}
                            className="flex-1 py-2 px-4 rounded-lg bg-[var(--surface-3)] hover:bg-[var(--surface-2)] text-[var(--text-secondary)] text-xs font-semibold transition"
                          >
                            Dashboard
                          </button>
                          <button
                            onClick={() => {
                              const store = useSimulatorStore.getState();
                              if (store.currentSessionId) {
                                store.reloadSessionData(store.currentSessionId);
                              }
                            }}
                            className="flex-1 py-2 px-4 rounded-lg bg-[var(--accent-1)] hover:opacity-90 text-[var(--accent-contrast)] text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Retry
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Animated Glow Ring Loader */}
                        <div className="relative flex items-center justify-center w-14 h-14">
                          <div className="absolute inset-0 rounded-full bg-[var(--accent-1)]/20 animate-ping" />
                          <div className="w-12 h-12 border-3 border-[var(--accent-1)] border-t-transparent rounded-full animate-spin shadow-sm" />
                        </div>

                        {/* Status Text & Session Badges */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-center gap-2">
                            <span className="bg-[var(--accent-1)]/15 text-[var(--accent-1)] border border-[var(--accent-1)]/30 font-bold px-2.5 py-0.5 text-xs rounded-md uppercase tracking-wider">
                              {instrument}
                            </span>
                            <span className="bg-[var(--surface-3)] text-[var(--text-secondary)] border border-[var(--border-soft)] font-semibold px-2 py-0.5 text-xs rounded-md uppercase">
                              {timeframe}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight pt-1">
                            {session.dataState?.isLoading ? (session.dataState?.userMessage || 'Loading Market Data...') : 'Restoring Replay Session...'}
                          </h3>
                          <p className="text-xs text-[var(--text-muted)] font-mono">
                            {session.name || `${instrument.toUpperCase()} ${timeframe.toUpperCase()}`}
                          </p>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full space-y-1.5 pt-1">
                          <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] transition-all duration-200 rounded-full"
                              style={{ width: `${Math.max(8, Math.min(100, session.dataState?.progress || 0))}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                            <span>{session.dataState?.activeLoadKind ? `Fetching ${session.dataState.activeLoadKind}` : 'Processing OHLC candles'}</span>
                            <span className="font-semibold text-[var(--text-primary)]">{Math.round(session.dataState?.progress || 0)}%</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Bar attached to Chart */}
          <div className="flex h-8 flex-shrink-0 flex-wrap items-center justify-between border-t border-[var(--border-soft)] bg-transparent px-3 py-1 z-30 font-mono text-[11px] text-[var(--text-secondary)]">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--text-muted)]">BAL</span>
                <span className="text-[var(--text-primary)]">${balance.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)]">REALIZED</span>
                <span className={`${realizedPnL >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{realizedPnL >= 0 ? '+' : '-'}${Math.abs(realizedPnL).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)]">UNREALIZED</span>
                <span className={`${unrealizedPnL >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{unrealizedPnL >= 0 ? '+' : '-'}${Math.abs(unrealizedPnL).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              <span className="text-[var(--text-secondary)]">›</span>
              <span>{instrument.toUpperCase()}</span>
              <span className="text-[var(--border-strong)]">·</span>
              <span>{timeframe.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* 3.5. Testing Panel: Live Screenshots of Last Trade (Mounted Next to Chart) */}
        <LastTradeScreenshotsTestPanel
          session={session}
          isOpen={isTestScreenshotPanelOpen}
          onClose={() => setIsTestScreenshotPanelOpen(false)}
          onOpenJournal={onOpenJournal}
        />

        {/* 4. RIGHT TOOLBAR (Widgets) */}
        <div className="w-[52px] flex-shrink-0 border-l border-[var(--border-soft)] bg-[var(--surface-1)] flex flex-col items-center py-3 gap-2.5 z-40 text-[var(--text-secondary)]">
          {/* Last Trade Screenshots Button */}
          <button 
            onClick={() => setIsTestScreenshotPanelOpen((prev) => !prev)} 
            className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
              isTestScreenshotPanelOpen
                ? 'text-[var(--accent-1)] bg-[var(--accent-1)]/20 border border-[var(--accent-1)]/40 font-semibold scale-105 shadow-sm'
                : 'hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30 border border-transparent text-[var(--text-secondary)]'
            }`}
            title="Last Trade Screenshots"
          >
            <Camera size={18} strokeWidth={2} />
          </button>

          <button 
            onClick={onOpenJournal} 
            className="p-2.5 rounded-xl hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30 border border-transparent transition-all duration-200 cursor-pointer"
            title="Journal"
          >
            <BookOpen size={18} strokeWidth={2} />
          </button>
          
          <button 
            onClick={() => setIsAnalyticsModalOpen(true)} 
            className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
              isAnalyticsModalOpen
                ? 'text-[var(--accent-1)] bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/40 font-semibold scale-105'
                : 'hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30 border border-transparent'
            }`}
            title="Session Analytics"
          >
            <BarChart2 size={18} strokeWidth={2} />
          </button>

          <button 
            onClick={toggleNewsPanel} 
            className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
              isNewsPanelOpen
                ? 'text-[var(--accent-1)] bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/40 font-semibold scale-105'
                : 'hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30 border border-transparent'
            }`}
            title="News"
          >
            <Newspaper size={18} strokeWidth={2} />
          </button>

          {activeStrategyId && (
            <button 
              onClick={() => setIsStrategyPopupOpen(!isStrategyPopupOpen)} 
              className={`p-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                isStrategyPopupOpen
                ? 'text-[var(--accent-1)] bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/40 font-semibold scale-105'
                : 'hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30 border border-transparent'
            }`}
            title="Checklist"
            >
              <CheckSquare size={18} strokeWidth={2} />
            </button>
          )}

          <div className="flex-1" />

          <button 
            onClick={onOpenSettings} 
            className="p-2.5 rounded-xl hover:text-[var(--accent-1)] hover:bg-[var(--accent-1)]/10 hover:border-[var(--accent-1)]/30 border border-transparent transition-all duration-200 mb-1 cursor-pointer"
            title="Settings"
          >
            <Settings size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <ControlPanel />

      {pendingCapture && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--app-bg)]/80 ">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md border border-[var(--border-soft)] rounded-lg bg-[var(--app-bg)] p-5"
          >
            <div className="border-b border-[var(--border-soft)] pb-3 mb-4">
              <h3 className="font-semibold text-[var(--accent-1)] text-sm">Save to Journal</h3>
              <p className="mt-1 text-[var(--text-muted)] text-[12px]">Add a title and optional note</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-[var(--accent-1)] font-medium text-[12px]">Title</label>
                <input
                  type="text"
                  value={captureTitle}
                  onChange={(e) => setCaptureTitle(e.target.value)}
                  className="w-full border border-[var(--border-soft)] rounded bg-[var(--app-bg)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-1)] placeholder:text-[var(--text-muted)]"
                />
              </div>
              <div>
                <label className="mb-2 block text-[var(--accent-1)] font-medium text-[12px]">Note</label>
                <textarea
                  value={captureNote}
                  onChange={(e) => setCaptureNote(e.target.value)}
                  rows={3}
                  className="w-full resize-none border border-[var(--border-soft)] rounded bg-[var(--app-bg)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-1)] placeholder:text-[var(--text-muted)]"
                  placeholder="Optional notes..."
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-4 border-t border-[var(--border-soft)] pt-4">
              <button
                onClick={cancelCapture}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmCapture}
                className="text-[#10b981] hover:text-[#34d399] transition-colors font-semibold text-sm"
              >
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <IndicatorModal isOpen={isIndicatorModalOpen} onClose={() => setIsIndicatorModalOpen(false)} />
      <AnalyticsModal isOpen={isAnalyticsModalOpen} onClose={() => setIsAnalyticsModalOpen(false)} />
      <StrategyPopup isOpen={isStrategyPopupOpen} onClose={() => setIsStrategyPopupOpen(false)} />
      {isShortcutsOpen && <ShortcutHelpModal onClose={() => setIsShortcutsOpen(false)} />}
      {settingsDrawingId && (
        <DrawingSettingsModal
          drawingId={settingsDrawingId}
          onClose={() => setSettingsDrawingId(null)}
        />
      )}
    </motion.div>
  );
};


