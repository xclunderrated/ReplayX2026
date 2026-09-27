import { create } from 'zustand';
import { persist, StateStorage, createJSONStorage } from 'zustand/middleware';

/**
 * localStorage-backed StateStorage that coalesces writes.
 *
 * During playback the React sync loop calls `set()` ~2x/sec, which zustand
 * persist would otherwise serialize + write to localStorage every time —
 * including journal base64 screenshots — blocking the main thread. This
 * wrapper:
 *  - skips writes entirely while any session is playing (the state is being
 *    mutated in-place by the playback loop anyway),
 *  - otherwise defers the write by a short debounce so bursty updates (e.g.
 *    drawing moves, playback start/stop) collapse into one write,
 *  - always persists the *latest* value, never an intermediate one.
 */
function createThrottledLocalStorage(): StateStorage {
  let pendingValue: string | null = null;
  let pendingName: string | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pendingName === null || pendingValue === null) return;
    const name = pendingName;
    const value = pendingValue;
    pendingName = null;
    pendingValue = null;
    try {
      localStorage.setItem(name, value);
    } catch (e) {
      console.warn('[persist] localStorage write failed:', e);
    }
  };

  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
      } catch (e) {
        console.warn('[persist] localStorage read failed:', e);
        return null;
      }
    },
    setItem: (name, value) => {
      // While playback is running, drop the write entirely. The playback
      // loop mutates sessions in-place without `set()`; the periodic
      // `set()` that arrives during playback only snapshots UI state that
      // is re-persisted correctly on the next pause. Skipping keeps the
      // main thread free of multi-MB serialization at 2x/sec.
      const state = useSimulatorStore.getState();
      const playing = Array.isArray(state.sessions) && state.sessions.some((s) => s?.isPlaying);
      if (playing) return;

      pendingName = name;
      pendingValue = value;
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, 250);
      }
    },
    removeItem: (name) => {
      if (pendingName === name) {
        pendingName = null;
        pendingValue = null;
      }
      try {
        localStorage.removeItem(name);
      } catch (e) {
        console.warn('[persist] localStorage remove failed:', e);
      }
    },
  };
}
import {
  advanceSessionPlayback,
  applySessionData,
  createEmptySessionDataState,
  patchSessionDataState,
  sliceCandlesForReplay,
  SessionDataState,
  type ScaleOutTarget,
  type TrailingStopConfig,
} from '../lib/simulatorEngine';
import { audioFX } from '../lib/audioFX';
import { BROWSER_TIMEZONE, type ChartTimezone } from '../lib/timezone';
import { aggregateCandles, canDeriveTimeframe, findCandleIndexByTimestamp, getTimeframeSortValue } from '../lib/timeframe';
import type { NewsImpactFilter, NewsView } from '../lib/news';
import {
  buildOrderPayloadFromDraft,
  calculatePositionSize,
  computeTradeExcursion,
  computeTradePnL,
  createOrderDraft,
  getContractMultiplier,
  getCurrentSessionPrice,
  normalizeOrderDraft,
  validateOrderDraft,
  validateTradeUpdate,
} from '../lib/orders';
import {
  createDrawingDocument,
  addDrawingObject as addDocObject,
  updateDrawingObject as updateDocObject,
  deleteDrawingObjects as deleteDocObjects,
  duplicateSelectedDrawings as dupDocDrawings,
  selectDrawingObjects as selectDocObjects,
  updateToolPreset as updateDocPreset,
  type DrawingDocument,
} from '../lib/drawings/state';
import { migrateLegacyDrawing } from '../lib/drawings/migrations';
import type { DrawingObject, DrawingToolId } from '../lib/drawings/types';
import {
  type MultiChartLayoutType,
  type ChartPaneConfig,
  type MultiChartPreset,
  MULTICHART_PRESETS,
} from '../types/multichart';
import { captureTradeMultiTimeframeScreenshots } from '../services/autoScreenshotService';
export type { MultiChartLayoutType, ChartPaneConfig, MultiChartPreset };
export { MULTICHART_PRESETS };

export type Timeframe = 'tick' | 's5' | 's15' | 's30' | 'm1' | 'm5' | 'm15' | 'm30' | 'h1' | 'h4' | 'd1' | 'mn1';

export const DEFAULT_AUTO_SCREENSHOT_TIMEFRAMES: Record<string, boolean> = {
  '5s': false,
  '15s': false,
  '30s': false,
  '1m': true,
  '5m': true,
  '15m': true,
  '30m': true,
  '1h': true,
  '4h': true,
  '1D': true,
  '1W': false,
};

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  id: string;
  type: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop';
  limitPrice?: number;
  entryPrice?: number;
  exitPrice?: number;
  size: number;
  remainingSize?: number;
  riskType?: 'percent' | 'dollar';
  riskPercent?: number;
  riskDollar?: number;
  sl?: number;
  tp?: number;
  scaleOuts?: ScaleOutTarget[];
  trailingStop?: TrailingStopConfig;
  setupTag?: string;
  mistakeTag?: string;
  confidence?: number;
  notes?: string;
  orderTime: number;
  entryTime?: number;
  exitTime?: number;
  pnl?: number;
  mae?: number;
  mfe?: number;
  status: 'pending' | 'open' | 'closed' | 'cancelled';
  /** The session timeframe the trade was actually executed/closed on. Stamped
   * at close time so the trade log stays correct even if the session's
   * timeframe is changed afterwards. Legacy trades may be missing it. */
  timeframe?: string;
  checklistHits?: string[];
  strategyId?: string;
  candles?: Candle[];
  screenshots?: Array<{ id: string; timeframe: string; title: string; dataUrl: string; createdAt: number }>;
  instrument?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  isRequired: boolean;
}

export interface Strategy {
  id: string;
  name: string;
  color: string;
  checklists: ChecklistItem[];
}

export const DEFAULT_STRATEGIES: Strategy[] = [
  {
    id: 'strategy-ict-smc',
    name: 'ICT / Smart Money Setup',
    color: '#2962ff',
    checklists: [
      { id: 'ict-1', text: 'Higher timeframe structure & bias aligned (HTF Trend)', isRequired: true },
      { id: 'ict-2', text: 'Key buy-side or sell-side liquidity swept', isRequired: true },
      { id: 'ict-3', text: 'Market Structure Shift (MSS) with displacement', isRequired: true },
      { id: 'ict-4', text: 'Fair Value Gap (FVG) or Order Block retest confirmed', isRequired: true },
      { id: 'ict-5', text: 'Risk-to-Reward ratio at least 1:2', isRequired: true },
      { id: 'ict-6', text: 'No high-impact red folder news within 15 mins', isRequired: false },
    ],
  },
  {
    id: 'strategy-breakout',
    name: 'Breakout & Retest Model',
    color: '#089981',
    checklists: [
      { id: 'brk-1', text: 'Significant Key Level or Range Boundary identified', isRequired: true },
      { id: 'brk-2', text: 'Strong impulse breakout with volume expansion', isRequired: true },
      { id: 'brk-3', text: 'Clean structural retest of broken level/zone', isRequired: true },
      { id: 'brk-4', text: 'Rejection candle confirmation (wick rejection / engulfing)', isRequired: true },
      { id: 'brk-5', text: 'Stop-loss set safely behind structural invalidation', isRequired: true },
    ],
  },
  {
    id: 'strategy-trend-pullback',
    name: 'Trend Pullback & EMA',
    color: '#f59e0b',
    checklists: [
      { id: 'tp-1', text: 'Price respecting dynamic EMA / trend structure', isRequired: true },
      { id: 'tp-2', text: 'Healthy retracement into key Fibonacci / Value Area', isRequired: true },
      { id: 'tp-3', text: 'Momentum indicator reset from overbought/oversold', isRequired: false },
      { id: 'tp-4', text: 'Calculated lot size aligns with max risk limit', isRequired: true },
    ],
  },
];

export type OrderDraft = {
  type: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop';
  entryPrice: number;
  sl?: number;
  tp?: number;
  riskType: 'percent' | 'dollar';
  riskValue: number;
  phase: 'placing-sl' | 'placing-tp' | 'ready';
} | null;

export interface IndicatorConfig {
  id: string;
  name: string;
  options?: any;
}

export interface JournalEntry {
  id: string;
  createdAt: number;
  title: string;
  note?: string;
  imageDataUrl: string;
  instrument: string;
  timeframe: string;
  candleTimestamp?: number;
  tradeId?: string;
  tradeType?: Trade['type'];
  pnl?: number;
  tags?: string[];
  isFavorite?: boolean;
}

/**
 * Snapshot of a deleted session kept so its trade log and journal screenshots
 * survive in the Journal's Archive tab. `data` is intentionally not stored —
 * replay refetches it on demand (`ensureTradeReplayData`).
 */
export interface ArchivedSession {
  id: string;
  name: string;
  instrument: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
  balance: number;
  trades: Trade[];
  journalEntries: JournalEntry[];
  deletedAt: number;
}

export interface Session {
  id: string;
  name: string;
  initialBalance: number;
  balance: number;
  instrument: string;
  timeframe: string;
  /** The timeframe of the raw candles in `data` — may differ from `timeframe`
   * when data was derived locally (e.g., `data` holds m1 candles but
   * `timeframe` is m15). Undefined means `data` is at the native `timeframe`. */
  sourceTimeframe?: string;
  startDate: string;
  endDate: string;
  trades: Trade[];
  data: Candle[];
  currentIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  indicators: IndicatorConfig[];
  targetTimestamp?: number;
  /** Monotonically increasing counter bumped every time `setTimeframe` runs.
   * Used by the session loader as a hard dependency to guarantee a reload
   * fires on every timeframe change — eliminates the race where the old
   * effect no-ops because `data.length > 0`. */
  timeframeVersion?: number;
  journalEntries: JournalEntry[];
  dataState: SessionDataState;
  checklistCheckedItems?: Record<string, boolean>;
  timeframePanes: string[];
  mtfLayout: 'horizontal' | 'vertical';
  multiChartLayout?: MultiChartLayoutType;
  multiChartPanes?: ChartPaneConfig[];
  activeChartPaneId?: string;
  maximizedChartPaneId?: string | null;
  syncCrosshair?: boolean;
  syncTimeRange?: boolean;
  syncDrawings?: boolean;
  syncSymbol?: boolean;
  compressGaps?: boolean;
  lastReplayTimestamp?: number;
  drawingDocument?: DrawingDocument;
}

export interface ChartColors {
  background: string;
  text: string;
  gridVert: string;
  gridHorz: string;
  timeScaleBorder: string;
  priceScaleBorder: string;
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  borderUpColor: string;
  borderDownColor: string;
  crosshairVert: string;
  crosshairHorz: string;
  indicatorLine1: string;
  indicatorLine2: string;
  indicatorLine3: string;
  indicatorLine4: string;
  indicatorLine5: string;
}

export const defaultChartColors: ChartColors = {
  background: 'transparent',
  text: '#a1a1aa',
  gridVert: 'rgba(255, 255, 255, 0.04)',
  gridHorz: 'rgba(255, 255, 255, 0.04)',
  timeScaleBorder: 'rgba(255, 255, 255, 0.1)',
  priceScaleBorder: 'rgba(255, 255, 255, 0.1)',
  upColor: '#089981',
  downColor: '#f23645',
  wickUpColor: '#089981',
  wickDownColor: '#f23645',
  borderUpColor: '#089981',
  borderDownColor: '#f23645',
  crosshairVert: 'rgba(255, 255, 255, 0.2)',
  crosshairHorz: 'rgba(255, 255, 255, 0.2)',
  indicatorLine1: '#3b82f6',
  indicatorLine2: '#a855f7',
  indicatorLine3: '#10b981',
  indicatorLine4: '#ec4899',
  indicatorLine5: '#eab308',
};

export const lightChartColors: ChartColors = {
  background: 'transparent',
  text: '#334155',
  gridVert: 'rgba(15, 23, 42, 0.08)',
  gridHorz: 'rgba(15, 23, 42, 0.08)',
  timeScaleBorder: 'rgba(15, 23, 42, 0.16)',
  priceScaleBorder: 'rgba(15, 23, 42, 0.16)',
  upColor: '#089981',
  downColor: '#f23645',
  wickUpColor: '#089981',
  wickDownColor: '#f23645',
  borderUpColor: '#089981',
  borderDownColor: '#f23645',
  crosshairVert: 'rgba(15, 23, 42, 0.35)',
  crosshairHorz: 'rgba(15, 23, 42, 0.35)',
  indicatorLine1: '#2563eb',
  indicatorLine2: '#7c3aed',
  indicatorLine3: '#059669',
  indicatorLine4: '#db2777',
  indicatorLine5: '#d97706',
};

interface SimulatorState {
  sessions: Session[];
  archivedSessions: ArchivedSession[];
  currentSessionId: string | null;
  chartColors: ChartColors;
  colorsCustomized: boolean;
  gridVertLinesVisible: boolean;
  gridHorzLinesVisible: boolean;
  chartTimezone: ChartTimezone;
  newsView: NewsView;
  newsImpactFilter: NewsImpactFilter;
  newsLineOpacity: number;
  isNewsPanelOpen: boolean;
  hasCompletedOnboarding: boolean;
  onboardingReplayCount: number;
  theme: 'dark' | 'light';
  soundEffectsEnabled: boolean;

  /** When true (default), 5s/15s/30s/tick candles are synthesized by
   *  interpolating real 1m candles (fast, unlimited range, but the intra-minute
   *  path is an estimate). When false, real 1-second tick data is downloaded
   *  from Dukascopy and aggregated into true sub-minute candles. */
  useSyntheticSeconds: boolean;
  
  autoScreenshotEnabled: boolean;
  autoScreenshotTimeframes: Record<string, boolean>;
  autoScreenshotSaveToJournal: boolean;
  autoOpenLastTradeScreenshots: boolean;

  isFullScreen: boolean;
  orderDraft: OrderDraft;
  
  strategies: Strategy[];
  activeStrategyId: string | null;

  // Persisted Tab & Navigation States
  mainActiveTab: string;
  analyticsScope: string;
  analyticsActiveTab: string;
  analyticsTimePreset: '7d' | '30d' | '90d' | 'all';
  journalViewMode: 'sessions' | 'all' | 'archive';
  journalViewSubMode: 'grid' | 'calendar';
  journalSelectedSessionId: string | null;
  tradeLogActiveTab: 'log' | 'replay';
  tradeLogViewMode: 'table' | 'grid';

  // Actions
  setMainActiveTab: (tab: string) => void;
  setAnalyticsScope: (scope: string) => void;
  setAnalyticsActiveTab: (tab: string) => void;
  setAnalyticsTimePreset: (preset: '7d' | '30d' | '90d' | 'all') => void;
  setJournalViewMode: (mode: 'sessions' | 'all' | 'archive') => void;
  setJournalViewSubMode: (mode: 'grid' | 'calendar') => void;
  setJournalSelectedSessionId: (id: string | null) => void;
  setTradeLogActiveTab: (tab: 'log' | 'replay') => void;
  setTradeLogViewMode: (mode: 'table' | 'grid') => void;

  setAutoScreenshotEnabled: (enabled: boolean) => void;
  setTimeframeAutoScreenshot: (timeframe: string, enabled: boolean) => void;
  setAllAutoScreenshotTimeframes: (enabled: boolean) => void;
  setAutoScreenshotSaveToJournal: (enabled: boolean) => void;
  setAutoOpenLastTradeScreenshots: (enabled: boolean) => void;

  toggleSoundEffects: () => void;
  moveToBreakEven: (tradeId: string) => void;
  partialCloseTrade: (tradeId: string, percentage: number) => void;
  setTrailingStop: (tradeId: string, distancePips: number) => void;
  updateTradeMetadata: (tradeId: string, updates: { setupTag?: string; mistakeTag?: string; confidence?: number; notes?: string; checklistHits?: string[] }) => void;
  addScaleOutTarget: (tradeId: string, target: { price: number; sizePct: number }) => void;
  removeScaleOutTarget: (tradeId: string, scaleOutId: string) => void;

  addStrategy: (strategy: Omit<Strategy, 'id' | 'checklists'>) => void;
  updateStrategy: (id: string, updates: Partial<Strategy>) => void;
  deleteStrategy: (id: string) => void;
  setActiveStrategy: (id: string | null) => void;
  
  addChecklistItem: (strategyId: string, item: Omit<ChecklistItem, 'id'>) => void;
  updateChecklistItem: (strategyId: string, itemId: string, updates: Partial<ChecklistItem>) => void;
  deleteChecklistItem: (strategyId: string, itemId: string) => void;

  toggleFullScreen: () => void;
  setChartColors: (colors: Partial<ChartColors>) => void;
  resetChartColors: () => void;
  setGridVertLinesVisible: (visible: boolean) => void;
  setGridHorzLinesVisible: (visible: boolean) => void;
  setChartTimezone: (timeZone: ChartTimezone) => void;
  setNewsView: (view: NewsView) => void;
  setNewsImpactFilter: (filter: NewsImpactFilter) => void;
  setNewsLineOpacity: (opacity: number) => void;
  setIsNewsPanelOpen: (open: boolean) => void;
  toggleNewsPanel: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setUseSyntheticSeconds: (value: boolean) => void;
  completeOnboarding: () => void;
  replayOnboarding: () => void;
  setFullScreen: (value: boolean) => void;
  toggleSessionChecklistItem: (itemId: string) => void;
  setSessionChecklistItem: (itemId: string, checked: boolean) => void;
  checkAllSessionChecklistItems: (itemIds: string[]) => void;
  clearSessionChecklistItems: () => void;
  startOrderDraft: (type: OrderDraft['type'], orderType: OrderDraft['orderType'], entryPrice: number) => void;
  updateOrderDraft: (updates: Partial<NonNullable<OrderDraft>>) => void;
  confirmOrderDraft: () => void;
  cancelOrderDraft: () => void;
  createSession: (session: Omit<Session, 'id' | 'trades' | 'data' | 'currentIndex' | 'isPlaying' | 'playbackSpeed' | 'balance' | 'indicators' | 'targetTimestamp' | 'journalEntries' | 'dataState'>) => string;
  setCurrentSession: (id: string) => void;
  deleteSession: (id: string) => void;
  restoreArchivedSession: (id: string) => void;
  permanentlyDeleteArchivedSession: (id: string) => void;
  setTradeCandles: (sessionId: string, tradeId: string, candles: Candle[]) => void;
  
  setInstrument: (instrument: string) => void;
  setTimeframe: (timeframe: string) => void;
  setData: (data: Candle[], sessionId?: string) => void;
  appendData: (data: Candle[], sessionId?: string) => void;
  prependData: (data: Candle[], sessionId?: string) => void;
  mergeData: (data: Candle[], sessionId?: string) => void;
  patchDataState: (patch: Partial<SessionDataState>, sessionId?: string) => void;
  reloadSessionData: (id: string) => void;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  tick: () => void;
  placeOrder: (order: Omit<Trade, 'id' | 'orderTime' | 'status' | 'entryTime' | 'entryPrice'>) => void;
  modifyOrder: (id: string, updates: Partial<Trade>) => void;
  cancelOrder: (id: string) => void;
  closeTrade: (id: string) => void;
  reset: () => void;
  goToIndex: (targetIndex: number) => void;
  goToTimestamp: (targetTimestampMs: number) => void;
  addIndicator: (indicatorId: string, name: string, options?: Record<string, any>) => void;
  removeIndicator: (indicatorId: string) => void;
  updateIndicator: (indicatorId: string, options: Record<string, any>) => void;

  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt'>, sessionId?: string) => void;
  removeJournalEntry: (id: string, sessionId?: string) => void;
  updateJournalEntry: (id: string, sessionId: string, updates: Partial<JournalEntry>) => void;

  // Multi-timeframe pane management
  addTimeframePane: (tf: string) => void;
  removeTimeframePane: (target: string | number) => void;
  setTimeframePaneAt: (index: number, tf: string) => void;
  setMtfLayout: (layout: 'horizontal' | 'vertical') => void;

  // Next-Gen Multi-Chart Actions
  setMultiChartLayout: (layout: MultiChartLayoutType, sessionId?: string) => void;
  setChartPaneTimeframe: (paneId: string, timeframe: Timeframe, sessionId?: string) => void;
  setChartPaneInstrument: (paneId: string, instrument: string, sessionId?: string) => void;
  toggleChartPaneLink: (paneId: string, sessionId?: string) => void;
  toggleChartPaneIndicators: (paneId: string, sessionId?: string) => void;
  setActiveChartPane: (paneId: string, sessionId?: string) => void;
  setMaximizedChartPane: (paneId: string | null, sessionId?: string) => void;
  toggleMultiChartSync: (key: 'syncCrosshair' | 'syncTimeRange' | 'syncDrawings' | 'syncSymbol', sessionId?: string) => void;
  applyMultiChartPreset: (presetId: string, sessionId?: string) => void;

  // Data pipeline settings
  toggleCompressGaps: () => void;

  // Drawing system actions
  activeDrawingTool: DrawingToolId | null;
  setActiveDrawingTool: (tool: DrawingToolId | null) => void;
  addDrawingObject: (object: DrawingObject, sessionId?: string) => void;
  updateDrawingObject: (id: string, updates: Partial<DrawingObject>, sessionId?: string) => void;
  deleteDrawingObjects: (ids: string[], sessionId?: string) => void;
  selectDrawingObjects: (ids: string[], mode?: 'replace' | 'toggle' | 'append', sessionId?: string) => void;
  duplicateSelectedDrawings: (sessionId?: string) => void;
  updateToolPreset: (tool: DrawingToolId, presetUpdates: Partial<Omit<import('../lib/drawings/defaults').ToolPreset, 'style'>> & { style?: Partial<import('../lib/drawings/types').DrawingStyle> }, sessionId?: string) => void;
}

export const calculateSize = calculatePositionSize;

const MAX_TIMEFRAME_PANES = 3;

function normalizeTimeframePanes(panes: string[] | undefined, baseTimeframe: string): string[] {
  const next: string[] = [];

  for (const pane of panes ?? []) {
    if (!pane || pane === baseTimeframe || next.includes(pane) || !canDeriveTimeframe(baseTimeframe, pane)) {
      continue;
    }

    next.push(pane);
    if (next.length >= MAX_TIMEFRAME_PANES) {
      break;
    }
  }

  return next;
}

function getDefaultMultiChartPanes(baseTimeframe: Timeframe = 'm5', layout: MultiChartLayoutType = 'single'): ChartPaneConfig[] {
  const defaultMap: Record<MultiChartLayoutType, Timeframe[]> = {
    'single': [baseTimeframe],
    'dual-horiz': [baseTimeframe, 'h1'],
    'dual-vert': [baseTimeframe, 'h1'],
    'triple-left': [baseTimeframe, 'm15', 'h1'],
    'triple-top': [baseTimeframe, 'm15', 'h1'],
    'triple-col': [baseTimeframe, 'm15', 'h1'],
    'quad': ['m1', 'm5', 'm15', 'h1'],
  };
  const tfs = defaultMap[layout] || [baseTimeframe];
  return tfs.map((tf, index) => ({
    id: `pane-${index}`,
    timeframe: tf,
    isLinkedToSessionSymbol: true,
    indicatorsEnabled: true,
    drawingFilter: 'all',
  }));
}

function migrateSessionDrawingState(session: any): Session {
  let drawingDocument: DrawingDocument = session.drawingDocument ?? createDrawingDocument();
  if (!session.drawingDocument && Array.isArray(session.drawings)) {
    session.drawings.forEach((legacyItem: any, idx: number) => {
      drawingDocument = addDocObject(drawingDocument, migrateLegacyDrawing(legacyItem, idx));
    });
  }

  // Derive initial multiChartLayout if legacy timeframePanes exist
  const legacyPanes = normalizeTimeframePanes(session.timeframePanes, session.timeframe);
  const layout: MultiChartLayoutType = session.multiChartLayout ?? (
    legacyPanes.length === 1 ? (session.mtfLayout === 'vertical' ? 'dual-vert' : 'dual-horiz') :
    legacyPanes.length === 2 ? 'triple-left' :
    legacyPanes.length >= 3 ? 'quad' : 'single'
  );

  const multiChartPanes: ChartPaneConfig[] = session.multiChartPanes && session.multiChartPanes.length > 0
    ? session.multiChartPanes
    : (legacyPanes.length > 0
        ? [
            { id: 'pane-0', timeframe: session.timeframe, isLinkedToSessionSymbol: true, indicatorsEnabled: true, drawingFilter: 'all' },
            ...legacyPanes.map((tf: string, idx: number) => ({
              id: `pane-${idx + 1}`,
              timeframe: tf as Timeframe,
              isLinkedToSessionSymbol: true,
              indicatorsEnabled: true,
              drawingFilter: 'all' as const,
            }))
          ]
        : getDefaultMultiChartPanes(session.timeframe as Timeframe, layout));

  return {
    ...session,
    drawingDocument,
    timeframePanes: legacyPanes,
    mtfLayout: session.mtfLayout ?? 'horizontal',
    multiChartLayout: layout,
    multiChartPanes,
    activeChartPaneId: session.activeChartPaneId ?? 'pane-0',
    maximizedChartPaneId: session.maximizedChartPaneId ?? null,
    syncCrosshair: session.syncCrosshair ?? true,
    syncTimeRange: session.syncTimeRange ?? true,
    syncDrawings: session.syncDrawings ?? true,
    syncSymbol: session.syncSymbol ?? true,
    targetTimestamp: session.targetTimestamp ?? session.lastReplayTimestamp,
    dataState: {
      ...session.dataState,
      activeLoadKind: (session.data?.length === 0 && (session.lastReplayTimestamp || session.targetTimestamp))
        ? 'switch' as const
        : session.dataState?.activeLoadKind ?? null,
    },
  };
}

function migratePersistedSimulatorState(persistedState: unknown): Partial<SimulatorState> {
  if (!persistedState || typeof persistedState !== 'object') {
    return {};
  }

  const state = persistedState as Partial<SimulatorState> & {
    sessions?: any[];
  };

  const migratedSessions = Array.isArray(state.sessions)
    ? state.sessions.map((session) => migrateSessionDrawingState(session))
    : [];

  const archivedSessions = Array.isArray((state as { archivedSessions?: unknown }).archivedSessions)
    ? (state as { archivedSessions: ArchivedSession[] }).archivedSessions
    : [];

  const persistedColors = state.chartColors as ChartColors | undefined;
  const isWarmPalette = persistedColors?.background === '#fff8eb';
  const chartColors = isWarmPalette
    ? (state.theme === 'light' ? lightChartColors : defaultChartColors)
    : (persistedColors ?? defaultChartColors);

  const legacyGridLinesVisible = (state as { gridLinesVisible?: boolean }).gridLinesVisible;

  return {
    ...state,
    sessions: migratedSessions,
    archivedSessions,
    chartColors,
    colorsCustomized: isWarmPalette ? false : (state.colorsCustomized ?? false),
    gridVertLinesVisible: state.gridVertLinesVisible ?? legacyGridLinesVisible ?? true,
    gridHorzLinesVisible: state.gridHorzLinesVisible ?? legacyGridLinesVisible ?? true,
    mainActiveTab: state.mainActiveTab ?? 'dashboard',
    analyticsScope: state.analyticsScope ?? 'all',
    analyticsActiveTab: state.analyticsActiveTab ?? 'overview',
    analyticsTimePreset: state.analyticsTimePreset ?? 'all',
    journalViewMode: state.journalViewMode ?? 'all',
    journalViewSubMode: state.journalViewSubMode ?? 'grid',
    journalSelectedSessionId: state.journalSelectedSessionId ?? null,
    tradeLogActiveTab: state.tradeLogActiveTab ?? 'log',
    tradeLogViewMode: state.tradeLogViewMode ?? 'table',
  };
}

export const useSimulatorStore = create<SimulatorState>()(
  persist(
    (set, get) => ({
      sessions: [],
      archivedSessions: [],
      currentSessionId: null,
      chartColors: defaultChartColors,
      colorsCustomized: false,
      gridVertLinesVisible: true,
      gridHorzLinesVisible: true,
      chartTimezone: BROWSER_TIMEZONE,
      newsView: 'week',
      newsImpactFilter: 'all',
      newsLineOpacity: 1,
      isNewsPanelOpen: false,
      hasCompletedOnboarding: false,
      onboardingReplayCount: 0,
      theme: 'dark',
      soundEffectsEnabled: true,
      useSyntheticSeconds: false,

      // Persisted Tab & Navigation States
      mainActiveTab: 'dashboard',
      analyticsScope: 'all',
      analyticsActiveTab: 'overview',
      analyticsTimePreset: 'all',
      journalViewMode: 'all',
      journalViewSubMode: 'grid',
      journalSelectedSessionId: null,
      tradeLogActiveTab: 'log',
      tradeLogViewMode: 'table',

      autoScreenshotEnabled: true,
      autoScreenshotTimeframes: DEFAULT_AUTO_SCREENSHOT_TIMEFRAMES,
      autoScreenshotSaveToJournal: true,
      autoOpenLastTradeScreenshots: true,

      isFullScreen: false,
      orderDraft: null,
      strategies: DEFAULT_STRATEGIES,
      activeStrategyId: 'strategy-ict-smc',

      setMainActiveTab: (mainActiveTab) => set({ mainActiveTab }),
      setAnalyticsScope: (analyticsScope) => set({ analyticsScope }),
      setAnalyticsActiveTab: (analyticsActiveTab) => set({ analyticsActiveTab }),
      setAnalyticsTimePreset: (analyticsTimePreset) => set({ analyticsTimePreset }),
      setJournalViewMode: (journalViewMode) => set({ journalViewMode }),
      setJournalViewSubMode: (journalViewSubMode) => set({ journalViewSubMode }),
      setJournalSelectedSessionId: (journalSelectedSessionId) => set({ journalSelectedSessionId }),
      setTradeLogActiveTab: (tradeLogActiveTab) => set({ tradeLogActiveTab }),
      setTradeLogViewMode: (tradeLogViewMode) => set({ tradeLogViewMode }),

      setAutoScreenshotEnabled: (enabled) => set({ autoScreenshotEnabled: enabled }),
      setTimeframeAutoScreenshot: (timeframe, enabled) => set((state) => ({
        autoScreenshotTimeframes: {
          ...(state.autoScreenshotTimeframes || DEFAULT_AUTO_SCREENSHOT_TIMEFRAMES),
          [timeframe]: enabled,
        },
      })),
      setAllAutoScreenshotTimeframes: (enabled) => set((state) => {
        const updated: Record<string, boolean> = {};
        for (const key of Object.keys(state.autoScreenshotTimeframes || DEFAULT_AUTO_SCREENSHOT_TIMEFRAMES)) {
          updated[key] = enabled;
        }
        return { autoScreenshotTimeframes: updated };
      }),
      setAutoScreenshotSaveToJournal: (enabled) => set({ autoScreenshotSaveToJournal: enabled }),
      setAutoOpenLastTradeScreenshots: (enabled) => set({ autoOpenLastTradeScreenshots: enabled }),

      toggleSoundEffects: () => set((s) => {
        const next = !s.soundEffectsEnabled;
        audioFX.setMuted(!next);
        return { soundEffectsEnabled: next };
      }),

      moveToBreakEven: (tradeId: string) => {
        const state = get();
        if (!state.currentSessionId) return;
        set((currentState) => ({
          sessions: currentState.sessions.map((s) => {
            if (s.id !== currentState.currentSessionId) return s;
            return {
              ...s,
              trades: s.trades.map((t) => {
                if (t.id === tradeId && t.status === 'open' && t.entryPrice !== undefined) {
                  audioFX.playBreakEven();
                  return { ...t, sl: t.entryPrice };
                }
                return t;
              }),
            };
          }),
        }));
      },

      partialCloseTrade: (tradeId: string, percentage: number) => {
        const state = get();
        if (!state.currentSessionId) return;
        const session = state.sessions.find((s) => s.id === state.currentSessionId);
        if (!session || session.data.length === 0) return;

        const currentCandle = session.data[session.currentIndex];
        if (!currentCandle) return;
        const mult = getContractMultiplier(session.instrument);

        set((currentState) => ({
          sessions: currentState.sessions.map((s) => {
            if (s.id !== currentState.currentSessionId) return s;
            let newBalance = s.balance;
            const updatedTrades = s.trades.map((t) => {
              if (t.id === tradeId && t.status === 'open' && t.entryPrice !== undefined) {
                const currentRemaining = t.remainingSize ?? t.size;
                const closeLots = Number((currentRemaining * (percentage / 100)).toFixed(5));
                const actualCloseLots = Math.min(currentRemaining, Math.max(0.00001, closeLots));

                if (actualCloseLots <= 0) return t;

                const closePrice = currentCandle.close;
                const partialPnl = t.type === 'buy'
                  ? (closePrice - t.entryPrice) * actualCloseLots * mult
                  : (t.entryPrice - closePrice) * actualCloseLots * mult;

                newBalance += partialPnl;
                audioFX.playPartialClose();

                const newRemaining = Math.max(0, Number((currentRemaining - actualCloseLots).toFixed(5)));
                const scaleOutItem: ScaleOutTarget = {
                  id: crypto.randomUUID(),
                  price: closePrice,
                  sizePct: percentage,
                  executed: true,
                  executedPrice: closePrice,
                  executedTime: currentCandle.timestamp,
                  pnl: partialPnl,
                };

                const existingScaleOuts = t.scaleOuts ?? [];
                const updatedScaleOuts = [...existingScaleOuts, scaleOutItem];

                if (newRemaining <= 0.00001) {
                  const totalRealizedPnl = updatedScaleOuts.reduce((sum, so) => sum + (so.pnl ?? 0), 0);
                  const entryTs = t.entryTime ?? t.orderTime;
                  const exitTs = currentCandle.timestamp;
                  const replayCandles = sliceCandlesForReplay(s.data, entryTs, exitTs);
                  const excursion = computeTradeExcursion(s.data, entryTs, exitTs, t.type, t.entryPrice, t.size, s.instrument);

                  return {
                    ...t,
                    status: 'closed' as const,
                    remainingSize: 0,
                    scaleOuts: updatedScaleOuts,
                    exitPrice: closePrice,
                    exitTime: currentCandle.timestamp,
                    pnl: totalRealizedPnl,
                    mae: excursion?.mae,
                    mfe: excursion?.mfe,
                    candles: replayCandles,
                    timeframe: s.timeframe,
                  };
                }

                return {
                  ...t,
                  remainingSize: newRemaining,
                  scaleOuts: updatedScaleOuts,
                };
              }
              return t;
            });

            return {
              ...s,
              balance: newBalance,
              trades: updatedTrades,
            };
          }),
        }));

        const closedTrade = session.trades.find((t) => t.id === tradeId);
        if (closedTrade) {
          const freshSession = get().sessions.find((s) => s.id === state.currentSessionId);
          const freshTrade = freshSession?.trades.find((t) => t.id === tradeId);
          if (freshTrade && freshTrade.status === 'closed' && freshSession) {
            setTimeout(() => {
              captureTradeMultiTimeframeScreenshots(freshTrade, freshSession);
            }, 10);
          }
        }
      },

      setTrailingStop: (tradeId: string, distancePips: number) => {
        const state = get();
        if (!state.currentSessionId) return;
        set((currentState) => ({
          sessions: currentState.sessions.map((s) => {
            if (s.id !== currentState.currentSessionId) return s;
            return {
              ...s,
              trades: s.trades.map((t) => {
                if (t.id === tradeId && t.status === 'open') {
                  return {
                    ...t,
                    trailingStop: {
                      active: distancePips > 0,
                      distancePips,
                      peakPrice: t.entryPrice,
                    },
                  };
                }
                return t;
              }),
            };
          }),
        }));
      },

      updateTradeMetadata: (tradeId: string, updates) => {
        set((currentState) => ({
          sessions: currentState.sessions.map((s) => {
            const hasTrade = s.trades.some((t) => t.id === tradeId);
            if (!hasTrade) return s;
            return {
              ...s,
              trades: s.trades.map((t) => (t.id === tradeId ? { ...t, ...updates } : t)),
            };
          }),
          archivedSessions: (currentState.archivedSessions || []).map((s) => {
            const hasTrade = s.trades.some((t) => t.id === tradeId);
            if (!hasTrade) return s;
            return {
              ...s,
              trades: s.trades.map((t) => (t.id === tradeId ? { ...t, ...updates } : t)),
            };
          }),
        }));
      },

      addScaleOutTarget: (tradeId: string, target: { price: number; sizePct: number }) => {
        const state = get();
        if (!state.currentSessionId) return;
        set((currentState) => ({
          sessions: currentState.sessions.map((s) => {
            if (s.id !== currentState.currentSessionId) return s;
            return {
              ...s,
              trades: s.trades.map((t) => {
                if (t.id === tradeId) {
                  const newTarget: ScaleOutTarget = {
                    id: crypto.randomUUID(),
                    price: target.price,
                    sizePct: target.sizePct,
                    executed: false,
                  };
                  return {
                    ...t,
                    scaleOuts: [...(t.scaleOuts ?? []), newTarget],
                  };
                }
                return t;
              }),
            };
          }),
        }));
      },

      removeScaleOutTarget: (tradeId: string, scaleOutId: string) => {
        const state = get();
        if (!state.currentSessionId) return;
        set((currentState) => ({
          sessions: currentState.sessions.map((s) => {
            if (s.id !== currentState.currentSessionId) return s;
            return {
              ...s,
              trades: s.trades.map((t) => {
                if (t.id === tradeId && t.scaleOuts) {
                  return {
                    ...t,
                    scaleOuts: t.scaleOuts.filter((so) => so.id !== scaleOutId),
                  };
                }
                return t;
              }),
            };
          }),
        }));
      },

      addStrategy: (strategy) => set((state) => ({
        strategies: [...state.strategies, { ...strategy, id: crypto.randomUUID(), checklists: [] }]
      })),

      updateStrategy: (id, updates) => set((state) => ({
        strategies: state.strategies.map((s) => s.id === id ? { ...s, ...updates } : s)
      })),

      deleteStrategy: (id) => set((state) => ({
        strategies: state.strategies.filter((s) => s.id !== id),
        activeStrategyId: state.activeStrategyId === id ? null : state.activeStrategyId
      })),

      setActiveStrategy: (id) => set({ activeStrategyId: id }),

      addChecklistItem: (strategyId, item) => set((state) => ({
        strategies: state.strategies.map((s) => {
          if (s.id !== strategyId) return s;
          return { ...s, checklists: [...s.checklists, { ...item, id: crypto.randomUUID() }] };
        })
      })),

      updateChecklistItem: (strategyId, itemId, updates) => set((state) => ({
        strategies: state.strategies.map((s) => {
          if (s.id !== strategyId) return s;
          return {
            ...s,
            checklists: s.checklists.map((c) => c.id === itemId ? { ...c, ...updates } : c)
          };
        })
      })),

      deleteChecklistItem: (strategyId, itemId) => set((state) => ({
        strategies: state.strategies.map((s) => {
          if (s.id !== strategyId) return s;
          return { ...s, checklists: s.checklists.filter((c) => c.id !== itemId) };
        })
      })),
      
      toggleSessionChecklistItem: (itemId) => set((state) => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== state.currentSessionId) return s;
            const currentChecks = s.checklistCheckedItems || {};
            return {
              ...s,
              checklistCheckedItems: {
                ...currentChecks,
                [itemId]: !currentChecks[itemId]
              }
            };
          })
        };
      }),

      setSessionChecklistItem: (itemId, checked) => set((state) => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== state.currentSessionId) return s;
            const currentChecks = s.checklistCheckedItems || {};
            return {
              ...s,
              checklistCheckedItems: {
                ...currentChecks,
                [itemId]: checked
              }
            };
          })
        };
      }),

      checkAllSessionChecklistItems: (itemIds) => set((state) => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== state.currentSessionId) return s;
            const currentChecks = { ...(s.checklistCheckedItems || {}) };
            itemIds.forEach((id) => {
              currentChecks[id] = true;
            });
            return {
              ...s,
              checklistCheckedItems: currentChecks
            };
          })
        };
      }),

      clearSessionChecklistItems: () => set((state) => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== state.currentSessionId) return s;
            return {
              ...s,
              checklistCheckedItems: {}
            };
          })
        };
      }),

      startOrderDraft: (type, orderType, entryPrice) => {
        const state = get();
        const session = state.sessions.find((s) => s.id === state.currentSessionId);
        set({
          orderDraft: createOrderDraft(type, orderType, entryPrice, session?.instrument),
        });
      },

      updateOrderDraft: (updates) => set((state) => {
        if (!state.orderDraft) return state;
        const session = state.sessions.find((s) => s.id === state.currentSessionId);
        return { orderDraft: normalizeOrderDraft(state.orderDraft, updates, session?.instrument) };
      }),

      confirmOrderDraft: () => {
        const state = get();
        const draft = state.orderDraft;
        if (!draft || draft.phase !== 'ready') return;

        const session = state.sessions.find((s) => s.id === state.currentSessionId);
        if (!session) return;

        const currentPrice = getCurrentSessionPrice(session);
        if (currentPrice === undefined) return;

        const validation = validateOrderDraft(draft, currentPrice);
        if (!validation.canSubmit) return;

        state.placeOrder(buildOrderPayloadFromDraft(draft, session.balance, currentPrice, {
          strategyId: state.activeStrategyId || undefined,
          checklistHits: session.checklistCheckedItems
            ? Object.entries(session.checklistCheckedItems)
                .filter(([_, checked]) => checked)
                .map(([itemId]) => itemId)
            : undefined,
        }, session.instrument));

        set((currentState) => ({
          orderDraft: null,
          sessions: currentState.sessions.map((s) =>
            s.id === session.id ? { ...s, checklistCheckedItems: {} } : s
          ),
        }));
      },

      cancelOrderDraft: () => set({ orderDraft: null }),

      toggleFullScreen: () => set(state => ({ isFullScreen: !state.isFullScreen })),
      setFullScreen: (value) => set({ isFullScreen: value }),
      setGridVertLinesVisible: (visible) => set({ gridVertLinesVisible: visible }),
      setGridHorzLinesVisible: (visible) => set({ gridHorzLinesVisible: visible }),
      setChartColors: (colors) => set(state => ({ 
        chartColors: { ...state.chartColors, ...colors },
        colorsCustomized: true,
      })),
      resetChartColors: () => set(state => ({
        chartColors: state.theme === 'light' ? lightChartColors : defaultChartColors,
        colorsCustomized: false,
      })),
      setChartTimezone: (chartTimezone) => set({ chartTimezone }),
      setNewsView: (newsView) => set({ newsView }),
      setNewsImpactFilter: (newsImpactFilter) => set({ newsImpactFilter }),
      setNewsLineOpacity: (newsLineOpacity) => set({ newsLineOpacity }),
      setIsNewsPanelOpen: (isNewsPanelOpen) => set({ isNewsPanelOpen }),
      toggleNewsPanel: () => set((state) => ({ isNewsPanelOpen: !state.isNewsPanelOpen })),
      setTheme: (theme) => {
        set(state => ({
          theme,
          chartColors: state.colorsCustomized ? state.chartColors : (theme === 'light' ? lightChartColors : defaultChartColors),
        }));
        if (typeof document !== 'undefined') {
          if (theme === 'light') {
            document.documentElement.classList.add('light-mode');
          } else {
            document.documentElement.classList.remove('light-mode');
          }
        }
      },
      setUseSyntheticSeconds: (useSyntheticSeconds) => set((state) => {
        const session = state.sessions.find((s) => s.id === state.currentSessionId);
        const isSubMinuteSession = !!session &&
          (session.timeframe === 'tick' || session.timeframe === 's5' || session.timeframe === 's15' || session.timeframe === 's30');

        if (!isSubMinuteSession) {
          return { useSyntheticSeconds };
        }

        // Clear the current sub-minute session so the loader refetches it with
        // the newly selected data mode (real vs synthetic).
        return {
          useSyntheticSeconds,
          sessions: state.sessions.map((s) => {
            if (s.id !== state.currentSessionId) return s;
            return {
              ...s,
              data: [],
              currentIndex: 0,
              timeframeVersion: (s.timeframeVersion ?? 0) + 1,
              dataState: {
                ...s.dataState,
                isLoading: false,
                isHydrating: false,
                isViewportLoading: false,
                progress: 0,
                error: null,
                userMessage: null,
                dataWarning: null,
                activeLoadKind: null,
              },
            };
          }),
        };
      }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      replayOnboarding: () => set((state) => ({
        hasCompletedOnboarding: true,
        onboardingReplayCount: state.onboardingReplayCount + 1,
      })),

      createSession: (sessionData) => {
        const id = crypto.randomUUID();
        const sessionTimeframe = sessionData.timeframe || 'm5';

        // Defaults live in `??` expressions rather than as literals after the
        // spread. Previously every one of these keys was hardcoded *after*
        // `...sessionData`, so a caller that supplied e.g. `mtfLayout` or
        // `timeframePanes` had it silently thrown away — and all three call sites
        // dutifully passed fields that could never take effect.
        const defaultPanes: ChartPaneConfig[] = [
          {
            id: 'pane-0',
            timeframe: sessionTimeframe as Timeframe,
            isLinkedToSessionSymbol: true,
            indicatorsEnabled: true,
            drawingFilter: 'all',
          },
        ];
        const multiChartPanes = sessionData.multiChartPanes?.length ? sessionData.multiChartPanes : defaultPanes;

        const newSession: Session = {
          ...sessionData,
          id,
          balance: sessionData.initialBalance,
          trades: [],
          data: [],
          currentIndex: 0,
          isPlaying: false,
          playbackSpeed: 1,
          indicators: [],
          journalEntries: [],
          dataState: createEmptySessionDataState(),
          // The session is created with no candles; `sourceTimeframe` records
          // what the first load will fetch, so it tracks `timeframe` here.
          sourceTimeframe: sessionData.sourceTimeframe ?? sessionData.timeframe,
          checklistCheckedItems: sessionData.checklistCheckedItems ?? {},
          timeframePanes: sessionData.timeframePanes ?? [],
          mtfLayout: sessionData.mtfLayout ?? 'horizontal',
          multiChartLayout: sessionData.multiChartLayout ?? 'single',
          multiChartPanes,
          activeChartPaneId: sessionData.activeChartPaneId ?? multiChartPanes[0]?.id,
          maximizedChartPaneId: sessionData.maximizedChartPaneId ?? null,
          syncCrosshair: sessionData.syncCrosshair ?? true,
          syncTimeRange: sessionData.syncTimeRange ?? true,
          syncDrawings: sessionData.syncDrawings ?? true,
          syncSymbol: sessionData.syncSymbol ?? true,
          timeframeVersion: sessionData.timeframeVersion ?? 0,
        };

        set(state => ({
          sessions: [...state.sessions, newSession],
          currentSessionId: id
        }));

        return id;
      },
      
      setCurrentSession: (id) => set((state) => {
        const targetSession = state.sessions.find((s) => s.id === id);
        if (!targetSession) return state;

        const anchor = targetSession.targetTimestamp ?? (targetSession as any).lastReplayTimestamp;

        return {
          currentSessionId: id,
          sessions: state.sessions.map((s) => {
            if (s.id !== id) return s;
            if (s.data.length === 0 && anchor) {
              return {
                ...s,
                targetTimestamp: anchor,
                dataState: {
                  ...s.dataState,
                  isLoading: true,
                  activeLoadKind: 'switch' as const,
                },
              };
            }
            return s;
          }),
        };
      }),
      
      deleteSession: (id) => set((state) => {
        const target = state.sessions.find((s) => s.id === id);
        if (!target) return state;

        const nextArchived =
          target.trades.length > 0 || (target.journalEntries ?? []).length > 0
            ? [
                ...state.archivedSessions,
                {
                  id: target.id,
                  name: target.name,
                  instrument: target.instrument,
                  timeframe: target.timeframe,
                  startDate: target.startDate,
                  endDate: target.endDate,
                  initialBalance: target.initialBalance,
                  balance: target.balance,
                  trades: target.trades,
                  journalEntries: target.journalEntries ?? [],
                  deletedAt: Date.now(),
                },
              ]
            : state.archivedSessions;

        return {
          sessions: state.sessions.filter((s) => s.id !== id),
          archivedSessions: nextArchived,
          currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
        };
      }),

      restoreArchivedSession: (id) => set((state) => {
        const archived = state.archivedSessions.find((s) => s.id === id);
        if (!archived) return state;

        const restored: Session = {
          id: archived.id,
          name: archived.name,
          initialBalance: archived.initialBalance,
          balance: archived.balance,
          instrument: archived.instrument,
          timeframe: archived.timeframe,
          startDate: archived.startDate,
          endDate: archived.endDate,
          trades: archived.trades,
          data: [],
          currentIndex: 0,
          isPlaying: false,
          playbackSpeed: 1,
          indicators: [],
          journalEntries: archived.journalEntries,
          dataState: createEmptySessionDataState(),
          checklistCheckedItems: {},
          timeframePanes: [],
          mtfLayout: 'horizontal',
          timeframeVersion: 1,
        };

        return {
          archivedSessions: state.archivedSessions.filter((s) => s.id !== id),
          sessions: [...state.sessions, restored],
          currentSessionId: state.currentSessionId ?? id,
        };
      }),

      permanentlyDeleteArchivedSession: (id) => set((state) => ({
        archivedSessions: state.archivedSessions.filter((s) => s.id !== id),
      })),

      setTradeCandles: (sessionId, tradeId, candles) => set((state) => {
        let changed = false;
        const sessions = state.sessions.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                trades: s.trades.map((t) => {
                  if (t.id !== tradeId || t.candles === candles) return t;
                  changed = true;
                  return { ...t, candles };
                }),
              }
            : s,
        );
        const archivedSessions = state.archivedSessions.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                trades: s.trades.map((t) => {
                  if (t.id !== tradeId || t.candles === candles) return t;
                  changed = true;
                  return { ...t, candles };
                }),
              }
            : s,
        );
        return changed ? { sessions, archivedSessions } : state;
      }),

      setInstrument: (instrument) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId
              ? {
                  ...s,
                  instrument,
                  data: [],
                  currentIndex: 0,
                  sourceTimeframe: undefined,
                  targetTimestamp: undefined,
                  isPlaying: false,
                  dataState: createEmptySessionDataState(),
                  timeframeVersion: (s.timeframeVersion ?? 0) + 1,
                }
              : s
          )
        };
      }),
      
      setTimeframe: (newTimeframe) => set(state => {
        if (!state.currentSessionId) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== state.currentSessionId) return s;
            if (s.timeframe === newTimeframe) return s;

            const currentTimestamp = s.data[s.currentIndex]?.timestamp;
            // The *actual* TF of the candles currently in `s.data`. This is
            // `s.timeframe` (the view TF) when data was loaded at that TF or
            // already aggregated to it. `sourceTimeframe` records the
            // original fetch TF for telemetry but doesn't change the data TF.
            const actualDataTF = s.timeframe;

            // SYNCHRONOUS LOCAL DERIVATION
            // If the current loaded data (at its actual TF) can derive the new
            // timeframe, aggregate in-place. This is instant — no network, no
            // loading state, no blank chart. The user sees the new timeframe
            // immediately.
            //
            // We can only derive UP (to a higher TF) — going DOWN requires
            // more granular data than we currently have, so we must refetch.
            const isBase1m = actualDataTF === '1m' || actualDataTF === 'm1';
            const canDeriveLocally =
              s.data.length > 0 &&
              isBase1m &&
              canDeriveTimeframe(actualDataTF, newTimeframe) &&
              getTimeframeSortValue(actualDataTF) < getTimeframeSortValue(newTimeframe);

            if (canDeriveLocally) {
              const aggregated = aggregateCandles(s.data as Candle[], newTimeframe);
              const nextIndex = aggregated.length > 0
                ? findCandleIndexByTimestamp(aggregated, currentTimestamp)
                : 0;
              return patchSessionDataState({
                ...s,
                timeframe: newTimeframe,
                data: aggregated,
                currentIndex: nextIndex,
                lastReplayTimestamp: currentTimestamp,
                isPlaying: false,
                timeframePanes: normalizeTimeframePanes(s.timeframePanes, newTimeframe),
                timeframeVersion: (s.timeframeVersion ?? 0) + 1,
              }, {
                isLoading: false,
                isHydrating: false,
                isViewportLoading: false,
                progress: 100,
                error: null,
                dataWarning: null,
                activeLoadKind: null,
              });
            }

            // NEED FRESH DATA
            // Going to a smaller TF or no derivable match — clear data so the
            // loader's "data.length === 0" guard fires and fetches at the new
            // timeframe. Bump timeframeVersion so the loader's dependency array
            // fires unconditionally.
            return patchSessionDataState({
              ...s,
              timeframe: newTimeframe,
              sourceTimeframe: undefined,
              data: [],
              currentIndex: 0,
              targetTimestamp: currentTimestamp,
              lastReplayTimestamp: currentTimestamp,
              isPlaying: false,
              timeframePanes: normalizeTimeframePanes(s.timeframePanes, newTimeframe),
              timeframeVersion: (s.timeframeVersion ?? 0) + 1,
            }, {
              isLoading: false,
              isHydrating: false,
              isViewportLoading: false,
              progress: 0,
              error: null,
              dataWarning: null,
              activeLoadKind: 'switch',
              loadedFromTs: undefined,
              loadedToTs: undefined,
              coveredFromTs: undefined,
              coveredToTs: undefined,
              requestedFromTs: undefined,
              requestedToTs: undefined,
            });
          })
        };
      }),
      
      setData: (data, sessionId) => set(state => {
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return state;
        return {
          sessions: state.sessions.map(s =>
            s.id === targetSessionId
              ? {
                  ...applySessionData(s, data, 'replace', {
                    isLoading: false,
                    isViewportLoading: false,
                    error: null,
                  }),
                  // Fresh data via setData is always at the session's timeframe
                  // (either from network at that TF, or aggregated to it by
                  // DataFetcher.fetchWithDerivation). Update sourceTimeframe
                  // so future setTimeframe calls know the actual source TF.
                  sourceTimeframe: s.timeframe,
                }
              : s
          )
        };
      }),
      
      appendData: (newData, sessionId) => set(state => {
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === targetSessionId
              ? applySessionData(s, newData, 'append', {
                  isViewportLoading: false,
                  error: null,
                })
              : s
          )
        };
      }),

      prependData: (newData, sessionId) => set(state => {
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === targetSessionId
              ? applySessionData(s, newData, 'prepend', {
                  isViewportLoading: false,
                  error: null,
                })
              : s
          )
        };
      }),

      mergeData: (newData, sessionId) => set(state => {
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === targetSessionId
              ? applySessionData(s, newData, 'merge', {
                  isViewportLoading: false,
                  error: null,
                })
              : s
          )
        };
      }),

      patchDataState: (patch, sessionId) => set(state => {
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return state;

        let changed = false;
        const nextSessions = state.sessions.map(s => {
          if (s.id !== targetSessionId) return s;
          const nextSession = patchSessionDataState(s, patch);
          if (nextSession !== s) {
            changed = true;
          }
          return nextSession;
        });

        if (!changed) {
          return state;
        }

        return {
          sessions: nextSessions
        };
      }),

      reloadSessionData: (id) => set(state => ({
        sessions: state.sessions.map(s => {
          if (s.id !== id) return s;
          return {
            ...s,
            data: [],
            currentIndex: 0,
            timeframeVersion: (s.timeframeVersion ?? 0) + 1,
            dataState: {
              ...s.dataState,
              isLoading: false,
              isHydrating: false,
              isViewportLoading: false,
              progress: 0,
              error: null,
              userMessage: null,
              dataWarning: null,
              activeLoadKind: null,
            },
          };
        }),
      })),

      play: () => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId ? { ...s, isPlaying: true } : s
          )
        };
      }),
      
      pause: () => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId ? { ...s, isPlaying: false } : s
          )
        };
      }),
      
      setSpeed: (speed) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId ? { ...s, playbackSpeed: speed } : s
          )
        };
      }),
      
      tick: () => {
        const state = get();
        if (!state.currentSessionId) return;
        
        const sessionIndex = state.sessions.findIndex(s => s.id === state.currentSessionId);
        if (sessionIndex === -1) return;
        const session = state.sessions[sessionIndex];

        const result = advanceSessionPlayback(session);
        if (!result.advanced && result.reachedDataEnd && result.mayHaveMoreData) {
          return;
        }

        // Only create a new sessions array if the session actually changed
        if (result.session === session) return;

        const nextSessions = state.sessions.slice();
        nextSessions[sessionIndex] = result.session;
        set({ sessions: nextSessions });

        // Trigger auto screenshot for any newly closed trades (e.g. SL/TP/Trailing Stop hits)
        const newlyClosedTrades = result.session.trades.filter(
          (t) => t.status === 'closed' && session.trades.some((prev) => prev.id === t.id && prev.status !== 'closed')
        );
        if (newlyClosedTrades.length > 0) {
          setTimeout(() => {
            for (const ct of newlyClosedTrades) {
              captureTradeMultiTimeframeScreenshots(ct, result.session);
            }
          }, 10);
        }
      },
      
      placeOrder: (orderData) => {
        const state = get();
        if (!state.currentSessionId) return;

        const session = state.sessions.find((s) => s.id === state.currentSessionId);
        if (!session || session.data.length === 0) return;

        const currentCandle = session.data[session.currentIndex];
        const currentPrice = getCurrentSessionPrice(session);
        if (!currentCandle || currentPrice === undefined) return;

        const isMarket = orderData.orderType === 'market';
        const candidateTrade: Trade = {
          ...orderData,
          id: 'draft-trade',
          orderTime: currentCandle.timestamp,
          status: isMarket ? 'open' : 'pending',
          entryPrice: isMarket ? currentPrice : undefined,
          entryTime: isMarket ? currentCandle.timestamp : undefined,
        };

        const validation = validateTradeUpdate(candidateTrade, {}, currentPrice);
        if (!validation.isValid) return;

        const nextTrade = validation.nextTrade;
        let size = nextTrade.size;
        const sizeReferencePrice = nextTrade.entryPrice ?? nextTrade.limitPrice;

        if ((nextTrade.riskPercent || nextTrade.riskDollar) && nextTrade.sl && sizeReferencePrice) {
          size = calculatePositionSize(
            session.balance,
            nextTrade.riskPercent || 1,
            nextTrade.riskDollar,
            nextTrade.riskType,
            sizeReferencePrice,
            nextTrade.sl,
            session.instrument,
          );
        }

        const newTrade: Trade = {
          ...nextTrade,
          id: crypto.randomUUID(),
          size,
          orderTime: currentCandle.timestamp,
          status: isMarket ? 'open' : 'pending',
          entryPrice: isMarket ? currentPrice : undefined,
          entryTime: isMarket ? currentCandle.timestamp : undefined,
          timeframe: session.timeframe,
        };

        if (isMarket) {
          audioFX.playOrderFilled();
        } else {
          audioFX.playOrderPlaced();
        }

        set((currentState) => ({
          sessions: currentState.sessions.map((s) =>
            s.id === currentState.currentSessionId
              ? {
                  ...s,
                  trades: [...s.trades, newTrade],
                }
              : s
          ),
        }));
      },

      modifyOrder: (id, updates) => {
        const state = get();
        if (!state.currentSessionId) return;

        set((currentState) => ({
          sessions: currentState.sessions.map((s) => {
            if (s.id !== currentState.currentSessionId) return s;

            const currentPrice = getCurrentSessionPrice(s);

            return {
              ...s,
              trades: s.trades.map((trade) => {
                if (trade.id !== id) return trade;

                const validation = validateTradeUpdate(trade, updates, currentPrice);
                if (!validation.isValid) {
                  return trade;
                }

                const updatedTrade = validation.nextTrade;
                const sizeReferencePrice = updatedTrade.entryPrice ?? updatedTrade.limitPrice;

                if (updatedTrade.status === 'pending' && (updatedTrade.riskPercent || updatedTrade.riskDollar) && updatedTrade.sl && sizeReferencePrice) {
                  updatedTrade.size = calculatePositionSize(
                    s.balance,
                    updatedTrade.riskPercent || 1,
                    updatedTrade.riskDollar,
                    updatedTrade.riskType,
                    sizeReferencePrice,
                    updatedTrade.sl,
                    s.instrument,
                  );
                }

                return updatedTrade;
              }),
            };
          }),
        }));
      },

      cancelOrder: (id) => {
        const state = get();
        if (!state.currentSessionId) return;
        
        set(state => ({
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId ? { 
              ...s, 
              trades: s.trades.map(t => t.id === id && t.status === 'pending' ? { ...t, status: 'cancelled' } : t)
            } : s
          )
        }));
      },
      
      closeTrade: (id) => {
        const state = get();
        if (!state.currentSessionId) return;
        
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return;
        
        const { trades, data, currentIndex, balance } = session;
        const currentCandle = data[currentIndex];
        if (!currentCandle) return;
        
        let newBalance = balance;
        const updatedTrades = trades.map(trade => {
          if (trade.id === id && trade.status === 'open' && trade.entryPrice !== undefined) {
            const closePrice = currentCandle.close;
            const effectiveSize = trade.remainingSize ?? trade.size;
            const remainderPnl = computeTradePnL(
              trade.type,
              trade.entryPrice,
              closePrice,
              effectiveSize,
              session.instrument,
            );

            const partialsPnl = (trade.scaleOuts ?? [])
              .filter((s) => s.executed)
              .reduce((sum, s) => sum + (s.pnl ?? 0), 0);

            const totalPnl = remainderPnl + partialsPnl;
            newBalance += remainderPnl;
            audioFX.playOrderFilled();
            
            const entryTs = trade.entryTime ?? trade.orderTime;
            const exitTs = currentCandle.timestamp;
            const replayCandles = sliceCandlesForReplay(data, entryTs, exitTs);
            const excursion = computeTradeExcursion(data, entryTs, exitTs, trade.type, trade.entryPrice, trade.size, session.instrument);

            return {
              ...trade,
              status: 'closed' as const,
              remainingSize: 0,
              exitPrice: closePrice,
              exitTime: currentCandle.timestamp,
              pnl: totalPnl,
              mae: excursion?.mae,
              mfe: excursion?.mfe,
              candles: replayCandles,
              timeframe: session.timeframe,
            };
          }
          return trade;
        });
        
        set(state => ({
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId ? { 
              ...s, 
              trades: updatedTrades, 
              balance: newBalance 
            } : s
          )
        }));

        const closedTrade = updatedTrades.find(t => t.id === id);
        if (closedTrade && closedTrade.status === 'closed') {
          setTimeout(() => {
            captureTradeMultiTimeframeScreenshots(closedTrade, session);
          }, 10);
        }
      },
      
      reset: () => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId ? { 
              ...s, 
              currentIndex: 0,
              isPlaying: false,
              balance: s.initialBalance,
              trades: []
            } : s
          )
        };
      }),

      goToIndex: (targetIndex) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => {
            if (s.id !== state.currentSessionId) return s;
            const clampedIndex = Math.max(0, Math.min(targetIndex, s.data.length - 1));
            const targetTimestamp = s.data[clampedIndex]?.timestamp ?? 0;

            // Prune trades placed after the target timestamp
            const keptTrades = s.trades.filter(t => t.orderTime <= targetTimestamp);
            // Close any open trades that have entry after target
            const finalTrades = keptTrades.map(t => {
              if ((t.status === 'open' || t.status === 'pending') && (t.entryTime ?? t.orderTime) > targetTimestamp) {
                return { ...t, status: 'cancelled' as const };
              }
              return t;
            });
            // Recalculate balance from initial + realized PnL of kept trades (including executed partial scale-outs)
            const realizedPnl = finalTrades.reduce((acc, t) => {
              if (t.status === 'closed') {
                return acc + (t.pnl ?? 0);
              }
              const partialRealized = (t.scaleOuts ?? [])
                .filter((so) => so.executed && (so.executedTime ?? 0) <= targetTimestamp)
                .reduce((sum, so) => sum + (so.pnl ?? 0), 0);
              return acc + partialRealized;
            }, 0);

            return {
              ...s,
              currentIndex: clampedIndex,
              isPlaying: false,
              trades: finalTrades,
              balance: s.initialBalance + realizedPnl,
            };
          })
        };
      }),

      goToTimestamp: (targetTimestampMs) => {
        const state = get();
        if (!state.currentSessionId) return;
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session || session.data.length === 0) return;

        const targetIndex = findCandleIndexByTimestamp(session.data, targetTimestampMs);

        // If the requested timestamp falls outside the currently-loaded window,
        // stash it on the session as `targetTimestamp` so the loader's
        // `targetTimestamp` effect (`useSessionLoader`) re-anchors a fresh fetch
        // around the new target and `applySessionData` re-resolves `currentIndex`
        // against the freshly loaded candles. Without this, jumping to a date/time
        // outside the focused high-res window would just binary-search inside the
        // already-loaded bars and clamp to whatever nearest candle happens to be
        // present — landing on the wrong bar (the original "Go To" bug).
        const firstCandleTs = session.data[0].timestamp;
        const lastCandleTs = session.data[session.data.length - 1].timestamp;
        const isOutsideLoadedWindow =
          targetTimestampMs < firstCandleTs || targetTimestampMs > lastCandleTs;

        if (isOutsideLoadedWindow && session.targetTimestamp !== targetTimestampMs) {
          set(s => ({
            sessions: s.sessions.map(sx =>
              sx.id === s.currentSessionId
                ? { ...sx, targetTimestamp: targetTimestampMs }
                : sx
            ),
          }));
          // Fall through: also perform an immediate in-window move so the cursor
          // updates now; the reload effect will refine `currentIndex` once the
          // new candles arrive.
        }

        state.goToIndex(targetIndex);
      },

      addIndicator: (indicatorId, name, options) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId ? { 
              ...s, 
              indicators: [...s.indicators, { id: indicatorId, name, options }] 
            } : s
          )
        };
      }),

      removeIndicator: (indicatorId) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId ? { 
              ...s, 
              indicators: s.indicators.filter(i => i.id !== indicatorId) 
            } : s
          )
        };
      }),

      updateIndicator: (indicatorId, options) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => 
            s.id === state.currentSessionId ? { 
              ...s, 
              indicators: s.indicators.map(i => 
                i.id === indicatorId ? { ...i, options: { ...i.options, ...options } } : i
              )
            } : s
          )
        };
      }),

      addJournalEntry: (entry, sessionId) => set(state => {
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return state;

        const journalEntry: JournalEntry = {
          ...entry,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };

        const hasLiveSession = state.sessions.some((s) => s.id === targetSessionId);
        if (hasLiveSession) {
          return {
            sessions: state.sessions.map((s) =>
              s.id === targetSessionId
                ? { ...s, journalEntries: [journalEntry, ...(s.journalEntries ?? [])] }
                : s,
            ),
          };
        }

        return {
          archivedSessions: state.archivedSessions.map((s) =>
            s.id === targetSessionId
              ? { ...s, journalEntries: [journalEntry, ...(s.journalEntries ?? [])] }
              : s,
          ),
        };
      }),

      removeJournalEntry: (id, sessionId) => set(state => {
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return state;

        const hasLiveSession = state.sessions.some((s) => s.id === targetSessionId);
        if (hasLiveSession) {
          return {
            sessions: state.sessions.map((s) =>
              s.id === targetSessionId
                ? { ...s, journalEntries: (s.journalEntries ?? []).filter((entry) => entry.id !== id) }
                : s,
            ),
          };
        }

        return {
          archivedSessions: state.archivedSessions.map((s) =>
            s.id === targetSessionId
              ? { ...s, journalEntries: (s.journalEntries ?? []).filter((entry) => entry.id !== id) }
              : s,
          ),
        };
      }),

      updateJournalEntry: (id, sessionId, updates) => set(state => {
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return state;

        const hasLiveSession = state.sessions.some((s) => s.id === targetSessionId);
        if (hasLiveSession) {
          return {
            sessions: state.sessions.map((s) =>
              s.id === targetSessionId
                ? {
                    ...s,
                    journalEntries: (s.journalEntries ?? []).map((entry) =>
                      entry.id === id ? { ...entry, ...updates } : entry,
                    ),
                  }
                : s,
            ),
          };
        }

        return {
          archivedSessions: state.archivedSessions.map((s) =>
            s.id === targetSessionId
              ? {
                  ...s,
                  journalEntries: (s.journalEntries ?? []).map((entry) =>
                    entry.id === id ? { ...entry, ...updates } : entry,
                  ),
                }
              : s,
          ),
        };
      }),

      // Multi-timeframe pane management
      addTimeframePane: (tf) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => {
            if (s.id !== state.currentSessionId) return s;
            if (tf === s.timeframe) return s;
            const panes = normalizeTimeframePanes(s.timeframePanes, s.timeframe);
            const nextPanes = normalizeTimeframePanes([...panes, tf], s.timeframe);
            return nextPanes.length === panes.length ? s : { ...s, timeframePanes: nextPanes };
          })
        };
      }),

      removeTimeframePane: (target) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => {
            if (s.id !== state.currentSessionId) return s;
            const panes = normalizeTimeframePanes(s.timeframePanes, s.timeframe);
            const nextPanes = typeof target === 'number'
              ? panes.filter((_, index) => index !== target)
              : panes.filter((timeframe) => timeframe !== target);
            return nextPanes.length === panes.length ? s : { ...s, timeframePanes: nextPanes };
          })
        };
      }),

      setTimeframePaneAt: (index, tf) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s => {
            if (s.id !== state.currentSessionId) return s;
            const panes = normalizeTimeframePanes(s.timeframePanes, s.timeframe);
            if (index < 0 || index >= panes.length) return s;
            if (tf === s.timeframe) return s;
            if (!canDeriveTimeframe(s.timeframe, tf)) return s;
            if (panes[index] === tf) return s;
            if (panes.some((timeframe, paneIndex) => timeframe === tf && paneIndex !== index)) return s;
            const nextPanes = [...panes];
            nextPanes[index] = tf;
            return { ...s, timeframePanes: nextPanes };
          })
        };
      }),

      setMtfLayout: (layout) => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s =>
            s.id === state.currentSessionId ? { ...s, mtfLayout: layout } : s
          )
        };
      }),

      setMultiChartLayout: (layout, sessionId) => set(state => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== targetId) return s;

            // Determine required number of panes for layout
            const requiredCount =
              layout === 'single' ? 1 :
              (layout === 'dual-horiz' || layout === 'dual-vert') ? 2 :
              (layout === 'triple-left' || layout === 'triple-top' || layout === 'triple-col') ? 3 : 4;

            const existingPanes = s.multiChartPanes && s.multiChartPanes.length > 0
              ? [...s.multiChartPanes]
              : getDefaultMultiChartPanes(s.timeframe as Timeframe, layout);

            // Ensure first pane has id 'pane-0' and base timeframe
            if (existingPanes.length > 0) {
              existingPanes[0] = {
                ...existingPanes[0],
                id: 'pane-0',
                timeframe: existingPanes[0].timeframe || (s.timeframe as Timeframe) || 'm5',
              };
            }

            const fallbackTfs: Timeframe[] = ['m5', 'm15', 'h1', 'h4'];
            while (existingPanes.length < requiredCount) {
              const idx = existingPanes.length;
              existingPanes.push({
                id: `pane-${idx}`,
                timeframe: fallbackTfs[idx % fallbackTfs.length],
                isLinkedToSessionSymbol: true,
                indicatorsEnabled: true,
                drawingFilter: 'all',
              });
            }

            const finalPanes = existingPanes.slice(0, requiredCount);

            return {
              ...s,
              multiChartLayout: layout,
              multiChartPanes: finalPanes,
              maximizedChartPaneId: null,
            };
          })
        };
      }),

      setChartPaneTimeframe: (paneId, timeframe, sessionId) => set(state => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== targetId) return s;
            const panes = s.multiChartPanes ?? getDefaultMultiChartPanes(s.timeframe as Timeframe, s.multiChartLayout || 'single');
            const updatedPanes = panes.map(p => p.id === paneId ? { ...p, timeframe } : p);

            // If pane-0 is modified, also keep s.timeframe in sync if it's the primary pane
            const isPrimary = paneId === 'pane-0' || paneId === panes[0]?.id;
            return {
              ...s,
              multiChartPanes: updatedPanes,
              ...(isPrimary ? { timeframe } : {}),
            };
          })
        };
      }),

      setChartPaneInstrument: (paneId, instrument, sessionId) => set(state => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== targetId) return s;
            const panes = s.multiChartPanes ?? getDefaultMultiChartPanes(s.timeframe as Timeframe, s.multiChartLayout || 'single');
            const updatedPanes = panes.map(p => p.id === paneId ? { ...p, instrument, isLinkedToSessionSymbol: false } : p);
            return {
              ...s,
              multiChartPanes: updatedPanes,
            };
          })
        };
      }),

      toggleChartPaneLink: (paneId, sessionId) => set(state => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== targetId) return s;
            const panes = s.multiChartPanes ?? getDefaultMultiChartPanes(s.timeframe as Timeframe, s.multiChartLayout || 'single');
            const updatedPanes = panes.map(p => p.id === paneId ? { ...p, isLinkedToSessionSymbol: !p.isLinkedToSessionSymbol } : p);
            return {
              ...s,
              multiChartPanes: updatedPanes,
            };
          })
        };
      }),

      toggleChartPaneIndicators: (paneId, sessionId) => set(state => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== targetId) return s;
            const panes = s.multiChartPanes ?? getDefaultMultiChartPanes(s.timeframe as Timeframe, s.multiChartLayout || 'single');
            const updatedPanes = panes.map(p => p.id === paneId ? { ...p, indicatorsEnabled: !p.indicatorsEnabled } : p);
            return {
              ...s,
              multiChartPanes: updatedPanes,
            };
          })
        };
      }),

      setActiveChartPane: (paneId, sessionId) => set(state => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== targetId) return s;
            return {
              ...s,
              activeChartPaneId: paneId,
            };
          })
        };
      }),

      setMaximizedChartPane: (paneId, sessionId) => set(state => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== targetId) return s;
            return {
              ...s,
              maximizedChartPaneId: paneId,
            };
          })
        };
      }),

      toggleMultiChartSync: (key, sessionId) => set(state => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== targetId) return s;
            return {
              ...s,
              [key]: !s[key],
            };
          })
        };
      }),

      applyMultiChartPreset: (presetId, sessionId) => set(state => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;

        const preset = MULTICHART_PRESETS.find(p => p.id === presetId);
        if (!preset) return state;

        return {
          sessions: state.sessions.map(s => {
            if (s.id !== targetId) return s;

            const panes: ChartPaneConfig[] = preset.timeframes.map((tf, index) => ({
              id: `pane-${index}`,
              timeframe: tf,
              isLinkedToSessionSymbol: true,
              indicatorsEnabled: true,
              drawingFilter: 'all',
            }));

            return {
              ...s,
              multiChartLayout: preset.layout,
              multiChartPanes: panes,
              activeChartPaneId: 'pane-0',
              maximizedChartPaneId: null,
            };
          })
        };
      }),

      toggleCompressGaps: () => set(state => {
        if (!state.currentSessionId) return state;
        return {
          sessions: state.sessions.map(s =>
            s.id === state.currentSessionId ? { ...s, compressGaps: !s.compressGaps } : s
          )
        };
      }),

      activeDrawingTool: null,
      setActiveDrawingTool: (tool) => set({ activeDrawingTool: tool }),

      addDrawingObject: (object, sessionId) => set((state) => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== targetId) return s;
            const doc = s.drawingDocument ?? createDrawingDocument();
            return { ...s, drawingDocument: addDocObject(doc, object, true) };
          }),
        };
      }),

      updateDrawingObject: (id, updates, sessionId) => set((state) => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== targetId) return s;
            const doc = s.drawingDocument ?? createDrawingDocument();
            return { ...s, drawingDocument: updateDocObject(doc, id, updates) };
          }),
        };
      }),

      deleteDrawingObjects: (ids, sessionId) => set((state) => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== targetId) return s;
            const doc = s.drawingDocument ?? createDrawingDocument();
            return { ...s, drawingDocument: deleteDocObjects(doc, ids) };
          }),
        };
      }),

      selectDrawingObjects: (ids, mode = 'replace', sessionId) => set((state) => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== targetId) return s;
            const doc = s.drawingDocument ?? createDrawingDocument();
            return { ...s, drawingDocument: selectDocObjects(doc, ids, mode) };
          }),
        };
      }),

      duplicateSelectedDrawings: (sessionId) => set((state) => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== targetId) return s;
            const doc = s.drawingDocument ?? createDrawingDocument();
            return { ...s, drawingDocument: dupDocDrawings(doc) };
          }),
        };
      }),

      updateToolPreset: (tool, presetUpdates, sessionId) => set((state) => {
        const targetId = sessionId ?? state.currentSessionId;
        if (!targetId) return state;
        return {
          sessions: state.sessions.map((s) => {
            if (s.id !== targetId) return s;
            const doc = s.drawingDocument ?? createDrawingDocument();
            return { ...s, drawingDocument: updateDocPreset(doc, tool, presetUpdates) };
          }),
        };
      }),
    }),
    {
      name: 'fxreplay-simulator-ls-v1',
      version: 5,
      storage: createJSONStorage(() => createThrottledLocalStorage()),
      migrate: (persistedState) => {
        return migratePersistedSimulatorState(persistedState);
      },
      onRehydrateStorage: () => (state) => {
        if (!state || !Array.isArray(state.sessions)) return;
        const restoredSessions = state.sessions.map((s) => {
          const anchor = s.targetTimestamp ?? (s as any).lastReplayTimestamp;
          if (s.data.length === 0 && anchor) {
            return {
              ...s,
              targetTimestamp: anchor,
              dataState: {
                ...s.dataState,
                isLoading: true,
                activeLoadKind: 'switch' as const,
              },
            };
          }
          return s;
        });
        useSimulatorStore.setState({
          sessions: restoredSessions,
          archivedSessions: Array.isArray(state.archivedSessions) ? state.archivedSessions : [],
        });
      },
      partialize: (state) => ({
        ...state,
        sessions: state.sessions.map(s => ({
          ...s,
          data: [], // Do not persist data array to save space
          lastReplayTimestamp: s.data[s.currentIndex]?.timestamp ?? s.targetTimestamp ?? s.lastReplayTimestamp,
          sourceTimeframe: undefined, // Data is reset on reload; TF origin meaningless
          isPlaying: false, // Reset playing state on reload
          dataState: {
            ...s.dataState,
            loadedFromTs: undefined,
            loadedToTs: undefined,
            coveredFromTs: undefined,
            coveredToTs: undefined,
            isLoading: false,
            isHydrating: false,
            isViewportLoading: false,
            progress: 0,
            activeLoadKind: null,
            error: null,
          },
        }))
      })
    }
  )
);
