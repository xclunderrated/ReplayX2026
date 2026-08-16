import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, createSeriesMarkers, ColorType, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, HistogramSeries, CrosshairMode, MouseEventParams } from 'lightweight-charts';
import { useSimulatorStore, Trade, Candle } from '../store/useSimulatorStore';
import { useShallow } from 'zustand/react/shallow';
import { downloadMarketData } from '../services/marketdata';
import { newsService } from '../services/newsService';
import { getTimeframeIntervalMs, aggregateCandles, auraTimeframeToDukascopy, expandSubMinuteCandlesFromM1 } from '../lib/timeframe';
import { type NewsEvent, filterNewsForCurrentView, getImpactColor, getImpactLabel, getImpactWeight, getWeekRangeKeys, matchesNewsImpactFilter } from '../lib/news';
import { buildNewsWhitespacePoints, clearTimestampCache, getNewsRenderState, resolveMarkerTime, resolveVisibleTimestamp, WHITESPACE_FUTURE_BARS } from '../lib/chartMarkers';
import { formatTimestampInTimeZone, rawTimeToChartTime, timestampMsToChartTime, chartTimeToRawTime } from '../lib/timezone';
import { buildContinuousTimeline, mapCandleTimestampsToOrdinal, ordinalToRealTimestamp } from '../lib/continuousTimeline';
import { registerChartForPlayback, unregisterChartForPlayback } from '../lib/PlaybackController';
import ChartNewsPanel from './ChartNewsPanel';
import { getSessionJumpTimestamp } from '../lib/goToSessions';
import { OrderTooltipCard, type OverlayTrade } from './OrderTooltipCard';
import type { Candle as MarketCandle } from '../types/market';
import * as Drawings from 'lightweight-charts-drawing';
import { getDefaultToolPreset } from '../lib/drawings/defaults';
import type { DrawingObject, DrawingToolId, DrawingFamily, DrawingPoint } from '../lib/drawings/types';
import { useTradeLinesSync } from '../hooks/useTradeLinesSync';
import { useNewsLinesSync } from '../hooks/useNewsLinesSync';
import { ChartOrderDraftOverlay } from './ChartOrderDraftOverlay';
import { bakeFillOpacity } from '../lib/drawings/render';
import { isTradeDrawing, tradeIdFromDrawing, tradeLineKind, tradeSlLineId, tradeTpLineId, DRAFT_TRADE_DRAWING_ID } from '../lib/trade-lines/ids';
import { isNewsDrawing } from '../lib/news/newsLineDrawings';
import { getReplayTime } from '../lib/trade-lines/chartTime';
import { setTradeLineDragging } from '../lib/trade-lines/dragGuard';
import { getPipSize } from '../lib/drawings/calculations';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const APPROX_MONTH_MS = 30 * DAY_MS;

const GRADIENT_BG_RE = /^linear-gradient\(\s*180deg\s*,\s*(.*?)\s*,\s*(.*?)\s*\)$/i;

function parseGradientBackground(value: string):
  | { type: ColorType.VerticalGradient; topColor: string; bottomColor: string }
  | { type: ColorType.Solid; color: string } {
  const m = (value || '').trim().match(GRADIENT_BG_RE);
  if (m) {
    return { type: ColorType.VerticalGradient, topColor: m[1].trim(), bottomColor: m[2].trim() };
  }
  return { type: ColorType.Solid, color: value };
}

const DEV_DIAGNOSTICS = process.env.NODE_ENV === 'development';

/** Minimum interval between React commits of the overlay (trade/news) DOM.
 * The overlays themselves are computed every frame; only the React state
 * that renders tooltips/labels is throttled to keep the big chart component
 * from re-rendering at 60fps during playback. */
const OVERLAY_COMMIT_INTERVAL_MS = 100;

interface ChartNewsOverlayItem {
  id: string;
  kind: 'future-line' | 'reached-marker';
  item: NewsEvent;
  x: number;
  y: number;
  r?: number;
  color: string;
}

type IndicatorSeries = ISeriesApi<any>;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function areRenderedNewsItemsEqual(left: ChartNewsOverlayItem[], right: ChartNewsOverlayItem[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id || a.kind !== b.kind || a.color !== b.color) return false;
    if (a.x !== b.x || a.y !== b.y || a.r !== b.r) return false;
    if (a.item.timestamp !== b.item.timestamp) return false;
  }

  return true;
}

function toDateBoundary(dateText: string, endOfDay = false): number {
  const ts = new Date(dateText).getTime();
  if (!Number.isFinite(ts)) {
    return Date.now();
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && endOfDay ? ts + DAY_MS : ts;
}

function getApproxIntervalMs(timeframe: string): number {
  if (timeframe === 'tick') return 1000;
  const parsed = auraTimeframeToDukascopy(timeframe);
  if (parsed === '1W') return APPROX_MONTH_MS;
  return getTimeframeIntervalMs(parsed);
}

function getViewportLoadWindowMs(timeframe: string): number {
  const parsed = auraTimeframeToDukascopy(timeframe);
  const fallbackWindow = getApproxIntervalMs(timeframe) * 240;

  if (timeframe === 'tick') return Math.max(12 * HOUR_MS, fallbackWindow);
  if (parsed === '5s' || parsed === '15s' || parsed === '30s') return Math.max(24 * HOUR_MS, fallbackWindow);
  if (parsed === '1m') return Math.max(2 * DAY_MS, fallbackWindow);
  if (['5m', '15m', '30m'].includes(parsed)) return Math.max(7 * DAY_MS, fallbackWindow);
  if (parsed === '1h' || parsed === '4h') return Math.max(45 * DAY_MS, fallbackWindow);
  if (parsed === '1D') return Math.max(365 * DAY_MS, fallbackWindow);
  return Math.max(24 * APPROX_MONTH_MS, fallbackWindow);
}

function getViewportPreloadHistoryMs(timeframe: string): number {
  const parsed = auraTimeframeToDukascopy(timeframe);
  if (timeframe === 'tick' || parsed === '5s' || parsed === '15s' || parsed === '30s') return DAY_MS;
  if (['1m', '5m', '15m', '30m'].includes(parsed)) return 10 * DAY_MS;
  return 90 * DAY_MS;
}

export interface TradingViewChartProps {
  onOpenSettings?: () => void;
  captureRequestId?: number;
  onCaptureReady?: (dataUrl: string) => void;
  externalChartRef?: React.MutableRefObject<IChartApi | null>;
  externalSeriesRef?: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
  externalContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
  onCrosshairMove?: (timestamp: number | null) => void;
  syncedCrosshairTimestamp?: number | null;
  /** When provided, the chart renders this data instead of session.data */
  overrideData?: import('../store/useSimulatorStore').Candle[];
  playbackOwner?: boolean;
  isNewsPanelOpen?: boolean;
  onCloseNewsPanel?: () => void;
  timeframe?: string;
  onOpenDrawingSettings?: (drawingId: string) => void;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  onOpenSettings,
  captureRequestId,
  onCaptureReady,
  externalChartRef,
  externalSeriesRef,
  externalContainerRef,
  onCrosshairMove,
  syncedCrosshairTimestamp,
  overrideData,
  playbackOwner = true,
  isNewsPanelOpen,
  onCloseNewsPanel,
  timeframe: propTimeframe,
  onOpenDrawingSettings,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [candlestickSeriesApi, setCandlestickSeriesApi] = useState<ISeriesApi<"Candlestick"> | null>(null);
  const tradeMarkersRef = useRef<ReturnType<typeof createSeriesMarkers> | null>(null);
  const newsMarkersRef = useRef<ReturnType<typeof createSeriesMarkers> | null>(null);
  const whitespaceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const overlayPrimitiveRef = useRef<any>(null);
  const drawingManagerRef = useRef<Drawings.DrawingManager | null>(null);
  const drawingMappingCacheRef = useRef<{
    key: string;
    byDrawingId: Map<string, { srcSig: string; points: DrawingPoint[] }>;
  }>({ key: '', byDrawingId: new Map() });
  const isDrawingRef = useRef(false);
  const isDraggingExistingDrawingRef = useRef(false);
  const activeDrawingIdRef = useRef<string | null>(null);
  const drawingPointsRef = useRef<DrawingPoint[]>([]);
  const isSyncingFromStoreRef = useRef(false);
  const displayToRawTimeRef = useRef<Map<number, number>>(new Map());
  const indicatorSeriesRefs = useRef<{ [id: string]: { [plotKey: string]: IndicatorSeries } }>({});
  const indicatorPaneMap = useRef<{ [id: string]: number }>({});
  const paneIndicatorCount = useRef<{ [paneIndex: number]: Set<string> }>({});
  const indicatorsModuleRef = useRef<unknown | null>(null);
  const indicatorsModulePromiseRef = useRef<Promise<unknown> | null>(null);
  const {
    currentSessionId,
    session,
    chartColors,
    gridVertLinesVisible,
    gridHorzLinesVisible,
    chartTimezone,
    newsView,
    setNewsView,
    newsImpactFilter,
    newsLineOpacity,
    storeIsNewsPanelOpen,
    setStoreIsNewsPanelOpen,
    orderDraft,
    updateOrderDraft,
    cancelOrderDraft,
    startOrderDraft,
    toggleCompressGaps,
    activeDrawingTool,
    addDrawingObject,
    updateDrawingObject,
    selectDrawingObjects,
  } = useSimulatorStore(useShallow((state) => ({
    currentSessionId: state.currentSessionId,
    session: state.sessions.find((s) => s.id === state.currentSessionId) || null,
    chartColors: state.chartColors,
    gridVertLinesVisible: state.gridVertLinesVisible,
    gridHorzLinesVisible: state.gridHorzLinesVisible,
    chartTimezone: state.chartTimezone,
    newsView: state.newsView,
    setNewsView: state.setNewsView,
    newsImpactFilter: state.newsImpactFilter,
    newsLineOpacity: state.newsLineOpacity,
    storeIsNewsPanelOpen: state.isNewsPanelOpen,
    setStoreIsNewsPanelOpen: state.setIsNewsPanelOpen,
    orderDraft: state.orderDraft,
    updateOrderDraft: state.updateOrderDraft,
    cancelOrderDraft: state.cancelOrderDraft,
    startOrderDraft: state.startOrderDraft,
    toggleCompressGaps: state.toggleCompressGaps,
    activeDrawingTool: state.activeDrawingTool,
    addDrawingObject: state.addDrawingObject,
    updateDrawingObject: state.updateDrawingObject,
    selectDrawingObjects: state.selectDrawingObjects,
  })));
  const data = session?.data || [];
  const currentIndex = session?.currentIndex || 0;
  // When overrideData is provided for secondary panes, use it instead
  const effectiveData = overrideData ?? data;
  const compressGaps = session?.compressGaps ?? false;
  const effectiveCurrentIndex = overrideData ? overrideData.length - 1 : currentIndex;
  const trades = session?.trades || [];
  const activeIndicators = session?.indicators || [];
  const lastRenderedIndexRef = useRef<number>(-1);
  const lastDataLengthRef = useRef<number>(0);
  const shouldResetViewportRef = useRef<boolean>(true);
  const priceScaleLockedRef = useRef<boolean>(false);
  const viewportLoadRequestsRef = useRef<Set<string>>(new Set());
  const lastCaptureRequestIdRef = useRef<number>(0);
  const pendingIndicatorDataRef = useRef<Set<string>>(new Set());
  const lastVisibleCandleSignatureRef = useRef<string>('');
  const renderedTradesRef = useRef<OverlayTrade[]>([]);
  const indicatorDebounceRef = useRef<number | null>(null);
  const indicatorCacheRef = useRef<{
    dataRef: any[] | null;
    baseLen: number;
    baseIndex: number;
    tz: string;
    visibleData: Array<{ time: any; open: number; high: number; low: number; close: number; volume: number }>;
  } | null>(null);
  const indicatorSignatureRef = useRef('');
  const renderedNewsItemsRef = useRef<ChartNewsOverlayItem[]>([]);
  const committedNewsItemsRef = useRef<ChartNewsOverlayItem[]>([]);
  const overlayCommitTimeRef = useRef(0);
  const newsIndexMapRef = useRef<Map<number, number> | null>(null);
  const newsIndexMapDataRef = useRef<any[] | null>(null);
  const newsIndexMapLenRef = useRef(-1);
  const lastTradeMarkersSigRef = useRef<string>('');
  const lastNewsMarkersSigRef = useRef<string>('');

  const activeDrawingToolRef = useRef(activeDrawingTool);
  useEffect(() => {
    activeDrawingToolRef.current = activeDrawingTool;
  }, [activeDrawingTool]);

  const [renderedTrades, setRenderedTrades] = useState<OverlayTrade[]>([]);
  const [renderedNewsItems, setRenderedNewsItems] = useState<ChartNewsOverlayItem[]>([]);
  const [indicatorSeriesVersion, setIndicatorSeriesVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number } | null>(null);
  const [smartLoadHint, setSmartLoadHint] = useState<string | null>(null);
  const [news, setNews] = useState<NewsEvent[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [hoveredNewsItem, setHoveredNewsItem] = useState<ChartNewsOverlayItem | null>(null);
  const [hoveredTradeItem, setHoveredTradeItem] = useState<{
    trade: OverlayTrade;
    x: number;
    y: number;
    lineType: 'entry' | 'sl' | 'tp' | 'limit';
  } | null>(null);
  const isMouseOverTradeTooltipRef = useRef(false);
  const interactionStateRef = useRef<any>(null);
  const lastPointerRef = useRef<{ time: number; price: number } | null>(null);
  const smartLoadHintTimeoutRef = useRef<number | null>(null);
  const sessionRef = useRef(session);
  const visibleCandlesRef = useRef<any[]>([]);
  const visibleNewsRef = useRef<NewsEvent[]>([]);
  const effectiveDataRef = useRef(effectiveData);
  const effectiveCurrentIndexRef = useRef(effectiveCurrentIndex);
  const replayTimestampRef = useRef<number | undefined>(undefined);
  const chartTimezoneRef = useRef(chartTimezone);
  const overlayRenderRafRef = useRef<number | null>(null);
  const updateOverlayRenderRef = useRef<() => void>(() => {});
  const orderDraftRef = useRef(orderDraft);
  const updateOrderDraftRef = useRef(updateOrderDraft);
  const startOrderDraftRef = useRef(startOrderDraft);
  const draggingLineRef = useRef<{
    tradeId: string;
    kind: 'sl' | 'tp';
    price: number;
    pinnedTime: number;
  } | null>(null);

  const resolveRawTime = useCallback((chartTime: number): number => {
    // 1. Try exact lookup in displayToRawTimeRef
    const mapped = displayToRawTimeRef.current.get(chartTime);
    if (mapped !== undefined) return mapped;

    // 2. If not found, and compressGaps is enabled, treat chartTime as an ordinal index
    const isCompressGaps = sessionRef.current?.compressGaps ?? false;
    const dataset = effectiveDataRef.current;
    
    if (isCompressGaps && dataset && dataset.length > 0) {
      // Find the closest ordinal in the dataset
      const index = Math.max(0, Math.min(dataset.length - 1, Math.round(chartTime)));
      const candle = dataset[index];
      if (candle) {
        return Math.floor(candle.timestamp / 1000);
      }
    }

    // 3. If compressGaps is false, chartTime is already a chart-specific timestamp (in seconds).
    // We need to convert it back to raw timestamp (in seconds) by reversing the timezone shift.
    return chartTimeToRawTime(chartTime, chartTimezoneRef.current);
  }, []);

  const resolveRawTimeRef = useRef(resolveRawTime);
  useEffect(() => {
    resolveRawTimeRef.current = resolveRawTime;
  }, [resolveRawTime]);

  const showSmartLoadHint = (message: string, durationMs = 1400) => {
    setSmartLoadHint(message);
    if (smartLoadHintTimeoutRef.current !== null) {
      window.clearTimeout(smartLoadHintTimeoutRef.current);
    }
    smartLoadHintTimeoutRef.current = window.setTimeout(() => {
      setSmartLoadHint(null);
      smartLoadHintTimeoutRef.current = null;
    }, durationMs);
  };

  const replayCandle = session?.data[session.currentIndex];
  const currentCandle = effectiveData[effectiveCurrentIndex];
  const currentReplayTimestamp = replayCandle?.timestamp ?? currentCandle?.timestamp;
  const currentWeekRange = useMemo(() => (
    currentReplayTimestamp ? getWeekRangeKeys(currentReplayTimestamp, chartTimezone) : null
  ), [currentReplayTimestamp, chartTimezone]);

  const visibleNews = useMemo(() => {
    if (!currentReplayTimestamp) return [];
    const filtered = filterNewsForCurrentView(news, currentReplayTimestamp, chartTimezone, newsView)
      .filter((item) => matchesNewsImpactFilter(item.impact, newsImpactFilter));
    if (DEV_DIAGNOSTICS && news.length > 0 && currentCandle) {
      console.log(`[News] Filtered ${news.length} -> ${filtered.length} items (view: ${newsView}, impact: ${newsImpactFilter}, candle: ${new Date(currentCandle.timestamp).toISOString()})`);
    }
    return filtered;
  }, [news, currentReplayTimestamp, chartTimezone, newsView, newsImpactFilter]);

  const rightPaddingBars = 20;

  const getCurrentIntervalMs = useCallback((): number => {
    const lastData = effectiveDataRef.current[effectiveCurrentIndexRef.current];
    if (!lastData) return getApproxIntervalMs(sessionRef.current?.timeframe ?? 'm5');
    const prevData = effectiveDataRef.current[Math.max(0, effectiveCurrentIndexRef.current - 1)];
    return prevData && prevData !== lastData
      ? Math.max(1000, lastData.timestamp - prevData.timestamp)
      : getApproxIntervalMs(sessionRef.current?.timeframe ?? 'm5');
  }, []);

  const targetRightBars = rightPaddingBars;

  // Synthetic future bars fed to the invisible whitespace series: a dense
  // `WHITESPACE_FUTURE_BARS`-bar run at the timeframe interval (so drawings
  // can be placed anywhere in the scrollable right whitespace) plus one point
  // per upcoming visible news event. Because all series share one time scale,
  // these future timestamps become coordinate-mappable, letting the projected
  // news VerticalLine drawings (see useNewsLinesSync) render at their true
  // future x (timeToCoordinate otherwise returns null beyond the last loaded
  // candle). The series lives on an overlay price scale (priceScaleId: '') so
  // it cannot perturb the candle autoscale during replay.
  const visibleWindowSignature = useMemo(() => {
    const firstTimestamp = effectiveData[0]?.timestamp ?? 0;
    const lastTimestamp = effectiveData[effectiveCurrentIndex]?.timestamp ?? 0;
    return `${effectiveCurrentIndex + 1}|${firstTimestamp}|${lastTimestamp}`;
  }, [effectiveData, effectiveCurrentIndex]);

  useEffect(() => {
    shouldResetViewportRef.current = true;
  }, [currentSessionId, session?.instrument, session?.timeframe]);

  useEffect(() => {
    lastRenderedIndexRef.current = -1;
    lastVisibleCandleSignatureRef.current = '';
    displayToRawTimeRef.current.clear();
  }, [chartTimezone]);

  useEffect(() => {
    clearTimestampCache();
  }, [currentSessionId, session?.instrument, session?.timeframe, chartTimezone]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    visibleNewsRef.current = visibleNews;
  }, [visibleNews]);

  useEffect(() => {
    effectiveDataRef.current = effectiveData;
    effectiveCurrentIndexRef.current = effectiveCurrentIndex;
    replayTimestampRef.current = currentReplayTimestamp;
  }, [effectiveData, effectiveCurrentIndex, currentReplayTimestamp]);

  const lastWhitespaceFeedRef = useRef<{
    lastIndex: number;
    lastTs: number;
    tz: string;
    tf: string;
    count: number;
    sessionId: string;
    newsCount: number;
  } | null>(null);

  // Feed the hidden whitespace series with an anchor at the last visible candle,
  // dense synthetic bars extending all the way to the end of the session date (so drawings,
  // forecast tools, and time scale spans cleanly to the session end), plus one
  // point per upcoming visible news event. Because all series share one time
  // scale, these future timestamps become coordinate-mappable, letting users
  // draw to the right of the last candlestick anywhere up to the end of session.
  // The series lives on an overlay price scale (priceScaleId: '') so it cannot
  // perturb the candle autoscale during replay.
  useEffect(() => {
    const whitespaceSeries = whitespaceSeriesRef.current;
    const chart = chartRef.current;
    if (!whitespaceSeries || !chart || !currentReplayTimestamp) return;
    const lastCandle = effectiveData[effectiveCurrentIndex];
    if (!lastCandle) {
      whitespaceSeries.setData([]);
      lastWhitespaceFeedRef.current = null;
      return;
    }

    const sessionEndDateTs = session?.endDate ? toDateBoundary(session.endDate, true) : undefined;
    const maxDataTs = session?.data && session.data.length > 0 ? session.data[session.data.length - 1].timestamp : 0;
    const effectiveEndTs = Math.max(sessionEndDateTs || 0, maxDataTs);

    const prevFeed = lastWhitespaceFeedRef.current;
    const tf = session?.timeframe ?? '';
    const sid = session?.id ?? '';
    const newsCount = visibleNews.length;

    // Skip unnecessary setData during high-frequency playback ticks if the existing
    // whitespace series already covers the future horizon from the current replay position.
    const isPlaybackAdvancing = prevFeed
      && prevFeed.sessionId === sid
      && prevFeed.tz === chartTimezone
      && prevFeed.tf === tf
      && prevFeed.newsCount === newsCount
      && effectiveCurrentIndex >= prevFeed.lastIndex
      && (effectiveCurrentIndex - prevFeed.lastIndex) < 75;

    if (isPlaybackAdvancing) {
      return;
    }

    const points = buildNewsWhitespacePoints({
      visibleNews,
      currentReplayTimestamp,
      lastVisibleTimestamp: lastCandle.timestamp,
      lastVisiblePrice: lastCandle.close,
      intervalMs: getCurrentIntervalMs(),
      minFutureBars: WHITESPACE_FUTURE_BARS,
      endTimestamp: effectiveEndTs,
    });
    const chartData = points.map((p) => ({
      time: timestampMsToChartTime(p.time, chartTimezone) as any,
      value: p.value,
    }));
    whitespaceSeries.setData(chartData as any);

    lastWhitespaceFeedRef.current = {
      lastIndex: effectiveCurrentIndex,
      lastTs: lastCandle.timestamp,
      tz: chartTimezone,
      tf,
      count: chartData.length,
      sessionId: sid,
      newsCount,
    };

    if (DEV_DIAGNOSTICS) {
      console.log(`[WS] fed ${chartData.length} pts`, chartData.map((p) => p.time).join(','));
    }
  }, [chartApi, visibleNews, currentReplayTimestamp, effectiveData, effectiveCurrentIndex, chartTimezone, compressGaps, getCurrentIntervalMs, session?.endDate, session?.data, session?.id, session?.timeframe]);

  useEffect(() => {
    chartTimezoneRef.current = chartTimezone;
  }, [chartTimezone]);

  useEffect(() => {
    orderDraftRef.current = orderDraft;
    updateOrderDraftRef.current = updateOrderDraft;
    startOrderDraftRef.current = startOrderDraft;
  }, [orderDraft, updateOrderDraft, startOrderDraft]);

  useEffect(() => {
    return () => {
      if (smartLoadHintTimeoutRef.current !== null) {
        window.clearTimeout(smartLoadHintTimeoutRef.current);
      }
      if (overlayRenderRafRef.current !== null) {
        window.cancelAnimationFrame(overlayRenderRafRef.current);
      }
    };
  }, []);

  const scheduleOverlayRender = useCallback(() => {
    if (overlayRenderRafRef.current !== null) {
      return;
    }

    overlayRenderRafRef.current = window.requestAnimationFrame(() => {
      overlayRenderRafRef.current = null;
      updateOverlayRenderRef.current();
    });
  }, []);

  useEffect(() => {
    if (!playbackOwner) return;

    registerChartForPlayback({
      renderCandle: (candle: Candle, candleIndex?: number) => {
        const series = seriesRef.current;
        if (!series) return;
        const chartTime = timestampMsToChartTime(candle.timestamp, chartTimezoneRef.current);
        displayToRawTimeRef.current.set(chartTime, Math.floor(candle.timestamp / 1000));
        try {
          series.update({
            time: chartTime as any,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          } as any);
        } catch {
          // ignore duplicate timestamp
        }

        if (candleIndex !== undefined) {
          lastRenderedIndexRef.current = candleIndex;
          effectiveCurrentIndexRef.current = candleIndex;
          replayTimestampRef.current = candle.timestamp;

          const chart = chartRef.current;
          if (chart) {
            const timeScale = chart.timeScale();
            const visibleRange = timeScale.getVisibleLogicalRange();
            if (visibleRange) {
              const desiredRight = candleIndex + rightPaddingBars;
              const tolerance = 5;
              const isAtTrackingEdge = Math.abs(visibleRange.to - desiredRight) <= tolerance;
              const isCursorLeavingRight = candleIndex >= visibleRange.to - 2;

              if (isAtTrackingEdge || isCursorLeavingRight) {
                const span = Math.max(20, visibleRange.to - visibleRange.from);
                const targetTo = candleIndex + rightPaddingBars;
                if (Math.abs(visibleRange.to - targetTo) >= 1) {
                  timeScale.setVisibleLogicalRange({
                    from: targetTo - span,
                    to: targetTo,
                  });
                }
              }
            }
          }
        }
      },
      scheduleOverlay: () => {
        scheduleOverlayRender();
      },
    });

    return () => {
      unregisterChartForPlayback();
    };
  }, [playbackOwner, scheduleOverlayRender]);

  const applyInteractionEvent = useCallback((event: any) => {}, []);

  const goToSession = useCallback((sessionId: 'asia-open' | 'london-open' | 'new-york-open' | 'equities-open' | 'pm-session') => {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    const candle = activeSession.data[activeSession.currentIndex];
    if (!candle) return;

    // FXreplay-style: jump the replay CURSOR forward to the next occurrence of
    // this session open (today if still ahead, else next trading day). This
    // prunes forward trades, recomputes balance, pauses playback, and — via
    // `goToTimestamp` setting `session.targetTimestamp` — triggers a re-anchored
    // data load when the target is outside the loaded window. The chart auto-
    // pans to `currentIndex` on update, so no explicit `setVisibleRange` here.
    const target = getSessionJumpTimestamp(candle.timestamp, sessionId, chartTimezone);
    useSimulatorStore.getState().goToTimestamp(target);
  }, [chartTimezone]);


  const ensureIndicatorsModule = async () => {
    if (indicatorsModuleRef.current) {
      return indicatorsModuleRef.current;
    }

    if (!indicatorsModulePromiseRef.current) {
      indicatorsModulePromiseRef.current = import('lightweight-charts-indicators').then((module) => {
        indicatorsModuleRef.current = module;
        return module;
      });
    }

    return indicatorsModulePromiseRef.current;
  };

  const getIndicatorFromModule = (indicatorsModule: any, indicatorId: string) => {
    if (indicatorsModule[indicatorId]) {
      return indicatorsModule[indicatorId];
    }
    
    if (indicatorsModule.indicatorRegistry) {
      const lowerId = indicatorId.toLowerCase();
      const registryEntry = indicatorsModule.indicatorRegistry.find(
        (entry: any) => entry.id?.toLowerCase() === lowerId || entry.shortName?.toLowerCase() === lowerId
      );
      if (registryEntry) {
        return {
          calculate: registryEntry.calculate,
          defaultInputs: registryEntry.defaultInputs,
          metadata: registryEntry.metadata,
          inputConfig: registryEntry.inputConfig,
          plotConfig: registryEntry.plotConfig,
          overlay: registryEntry.overlay,
        };
      }
    }
    
    return null;
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: parseGradientBackground(chartColors.background),
        textColor: chartColors.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: chartColors.gridVert, style: 1, visible: gridVertLinesVisible },
        horzLines: { color: chartColors.gridHorz, style: 1, visible: gridHorzLinesVisible },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: chartColors.timeScaleBorder,
      },
      rightPriceScale: {
        borderColor: chartColors.priceScaleBorder,
        autoScale: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: chartColors.crosshairVert,
          width: 1,
          style: 3,
          labelBackgroundColor: '#9a4f20',
        },
        horzLine: {
          color: chartColors.crosshairHorz,
          width: 1,
          style: 3,
          labelBackgroundColor: '#9a4f20',
        },
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: chartColors.upColor,
      downColor: chartColors.downColor,
      borderUpColor: chartColors.borderUpColor,
      borderDownColor: chartColors.borderDownColor,
      wickUpColor: chartColors.wickUpColor,
      wickDownColor: chartColors.wickDownColor,
      priceFormat: {
        type: 'price',
        precision: 5,
        minMove: 0.00001,
      },
      autoscaleInfoProvider: (original) => {
        const res = original();
        if (
          res &&
          res.priceRange &&
          Number.isFinite(res.priceRange.minValue) &&
          Number.isFinite(res.priceRange.maxValue) &&
          res.priceRange.minValue < res.priceRange.maxValue
        ) {
          return res;
        }
        // Fallback when no candles are visible inside the current viewport
        // (e.g. user scrolled far right into future whitespace)
        const activeSession = sessionRef.current;
        const data = effectiveDataRef.current?.length
          ? effectiveDataRef.current
          : (activeSession?.data ?? []);
        const curIdx = effectiveCurrentIndexRef.current ?? (activeSession?.currentIndex ?? 0);
        const lastCandle = data[curIdx] || data[data.length - 1];
        if (lastCandle && Number.isFinite(lastCandle.close)) {
          const high = Number.isFinite(lastCandle.high) ? lastCandle.high : lastCandle.close;
          const low = Number.isFinite(lastCandle.low) ? lastCandle.low : lastCandle.close;
          const candleSpread = Math.max(high - low, 0.0001);
          const spread = Math.max(candleSpread * 6, lastCandle.close * 0.008, 0.05);
          return {
            priceRange: {
              minValue: low - spread,
              maxValue: high + spread,
            },
            margins: res?.margins ?? { above: 10, below: 10 },
          };
        }
        return res;
      },
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;
    setChartApi(chart);
    setCandlestickSeriesApi(candlestickSeries);
    tradeMarkersRef.current = createSeriesMarkers(candlestickSeries, []);
    newsMarkersRef.current = createSeriesMarkers(candlestickSeries, []);

    // Hidden line series whose only job is to anchor future timestamps on the
    // time scale so timeToCoordinate() resolves for them. It lives on an
    // overlay price scale so it can never perturb the candle series'
    // autoscaled right price axis during replay.
    const whitespaceSeries = chart.addSeries(LineSeries, {
      color: 'rgba(0,0,0,0)',
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      priceScaleId: '',
      autoscaleInfoProvider: () => null,
    });
    whitespaceSeriesRef.current = whitespaceSeries;

    // Initialize DrawingManager
    const drawingManager = new Drawings.DrawingManager();
    drawingManagerRef.current = drawingManager;
    drawingManager.attach(chart, candlestickSeries, chartContainerRef.current);

    // Fresh session/chart: make sure no stale line drag survives the rebuild.
    draggingLineRef.current = null;
    setTradeLineDragging(false);

    // Set up drawing manager listeners
    // Trade drawings are projections of store trades: dragging writes the
    // price back to the trade (SL/TP only — the entry is fixed), and the
    // anchor times are re-pinned to the replay bar so drags only move the
    // lines vertically.
    const handleTradeDrawingUpdated = (drawingId: string, drawing: Drawings.IDrawing) => {
      const anchors = drawing?.anchors ?? [];
      const { chartTime } = getReplayTime({
        effectiveData: effectiveDataRef.current,
        effectiveCurrentIndex: effectiveCurrentIndexRef.current,
        compressGaps: sessionRef.current?.compressGaps ?? false,
        chartTimezone: chartTimezoneRef.current,
      });
      const pinnedTime = chartTime as any;
      const pinAnchors = (next: Drawings.Anchor[]) => {
        (drawing as Drawings.Drawing).setAnchors(
          next.map((a) => ({ ...a, time: pinnedTime })),
        );
      };

      const kind = tradeLineKind(drawingId);
      if (kind) {
        const tradeId = tradeIdFromDrawing(drawingId);
        const trade = useSimulatorStore.getState().sessions
          .find((s) => s.id === currentSessionId)?.trades
          .find((t) => t.id === tradeId);
        // Only SL/TP drags write back to the trade — the entry line and the
        // PnL label are fixed projections.
        if (kind === 'sl' || kind === 'tp') {
          const price = anchors[0]?.price;
          if (trade && typeof price === 'number' && Number.isFinite(price)) {
            const updates = kind === 'sl' ? { sl: price } : { tp: price };
            useSimulatorStore.getState().modifyOrder(tradeId, updates);
          }
        }
        pinAnchors(anchors);
        return;
      }

      const stopLoss = anchors[1];
      const takeProfit = anchors[2];
      if (drawingId === DRAFT_TRADE_DRAWING_ID) {
        const draft = useSimulatorStore.getState().orderDraft;
        if (draft) {
          const updates: Partial<NonNullable<typeof draft>> = {};
          if (stopLoss && typeof stopLoss.price === 'number') updates.sl = stopLoss.price;
          if (takeProfit && typeof takeProfit.price === 'number') updates.tp = takeProfit.price;
          if (Object.keys(updates).length > 0) {
            useSimulatorStore.getState().updateOrderDraft(updates);
          }
        }
        pinAnchors(anchors);
        return;
      }
      const tradeId = tradeIdFromDrawing(drawingId);
      const trade = useSimulatorStore.getState().sessions
        .find((s) => s.id === currentSessionId)?.trades
        .find((t) => t.id === tradeId);
      if (!trade) return;
      const updates: Partial<Trade> = {};
      if (stopLoss && typeof stopLoss.price === 'number' && stopLoss.price !== trade.sl) updates.sl = stopLoss.price;
      if (takeProfit && typeof takeProfit.price === 'number' && takeProfit.price !== trade.tp) updates.tp = takeProfit.price;
      if (Object.keys(updates).length > 0) {
        useSimulatorStore.getState().modifyOrder(tradeId, updates);
      }
      pinAnchors(anchors);
    };

    drawingManager.on('drawing:updated', ({ drawingId, drawing }) => {
      if (isSyncingFromStoreRef.current) return;
      if (isNewsDrawing(drawingId)) return;
      if (isTradeDrawing(drawingId)) {
        handleTradeDrawingUpdated(drawingId, drawing);
        return;
      }
      useSimulatorStore.getState().updateDrawingObject(drawingId, {
        points: drawing.anchors.map((anchor: any) => {
          const t = typeof anchor.time === 'number' ? anchor.time : Number(anchor.time) || 0;
          return {
            time: t,
            price: Number(anchor.price) || 0,
            rawTime: resolveRawTimeRef.current(t),
          };
        }),
      });
    });

    drawingManager.on('drawing:selected', ({ drawingId }) => {
      if (isSyncingFromStoreRef.current) return;
      if (isNewsDrawing(drawingId)) return;
      if (isTradeDrawing(drawingId)) return;
      useSimulatorStore.getState().selectDrawingObjects([drawingId]);
    });

    drawingManager.on('drawing:deselected', () => {
      if (isSyncingFromStoreRef.current) return;
      if (drawingManagerRef.current?.getSelectedDrawing() && isTradeDrawing(drawingManagerRef.current.getSelectedDrawing()!.id)) return;
      if (drawingManagerRef.current?.getSelectedDrawing() && isNewsDrawing(drawingManagerRef.current.getSelectedDrawing()!.id)) return;
      useSimulatorStore.getState().selectDrawingObjects([]);
    });

    if (externalChartRef) externalChartRef.current = chart;
    if (externalSeriesRef) externalSeriesRef.current = candlestickSeries;
    if (externalContainerRef) externalContainerRef.current = chartContainerRef.current;

    lastRenderedIndexRef.current = -1;
    lastDataLengthRef.current = 0;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
        scheduleOverlayRender();
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    const container = chartContainerRef.current;

    const resolveRawTime = (chartTime: number) =>
      resolveRawTimeRef.current(chartTime);


    
    const handleMouseDown = (e: MouseEvent) => {
      if (!seriesRef.current || !chartRef.current) return;

      // Handle custom drawings
      if (activeDrawingToolRef.current && activeDrawingToolRef.current !== 'select') {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const price = seriesRef.current.coordinateToPrice(y);
        let cTime = chartRef.current.timeScale().coordinateToTime(x);

        if (cTime === null && seriesRef.current && chartRef.current) {
          const logical = chartRef.current.timeScale().coordinateToLogical(x);
          if (logical !== null && Number.isFinite(logical)) {
            const dataSet = effectiveDataRef.current;
            const curIdx = effectiveCurrentIndexRef.current;
            const lastCandle = dataSet[curIdx] || dataSet[dataSet.length - 1];
            if (lastCandle) {
              const deltaBars = logical - curIdx;
              const derivedTs = lastCandle.timestamp + Math.round(deltaBars) * getCurrentIntervalMs();
              cTime = timestampMsToChartTime(derivedTs, chartTimezoneRef.current) as any;
            }
          }
        }

        if (price !== null && cTime !== null) {
          e.stopPropagation();
          e.preventDefault();

          const tool = activeDrawingToolRef.current;
          const newId = 'drawing_' + Math.random().toString(36).substring(2, 9);
          
          const preset = getDefaultToolPreset(tool);
          const initialStyle = preset.style;
          
          const family: DrawingFamily = (['trendline', 'ray', 'extendedLine', 'arrow', 'verticalLine', 'horizontalLine', 'parallelChannel'].includes(tool)
            ? 'line'
            : ['rectangle', 'measure', 'polyline', 'brush'].includes(tool)
            ? 'path'
            : ['longPosition', 'shortPosition', 'fibRetracement'].includes(tool)
            ? 'ratio'
            : ['text', 'callout', 'anchoredNote'].includes(tool)
            ? 'annotation'
            : 'line');

          const rawT = resolveRawTime(cTime as any as number);
          const singlePointTools: DrawingToolId[] = [
            'horizontalLine',
            'verticalLine',
            'horizontalRay',
            'text',
            'callout',
            'anchoredNote',
            'comment',
            'priceLabel',
            'priceNote',
            'arrowMarker',
            'flagMark',
            'signpost',
            'marker',
            'gannSquareFixed',
          ];

          const isSinglePoint = singlePointTools.includes(tool);
          const isPosition = tool === 'longPosition' || tool === 'shortPosition';
          const isThreePoint = [
            'parallelChannel',
            'rotatedRectangle',
            'ellipse',
            'triangle',
            'fibExtension',
            'fibChannel',
            'fibTimeExtension',
            'fibWedge',
            'andrewsPitchfork',
            'schiffPitchfork',
            'modifiedSchiffPitchfork',
            'insidePitchfork',
            'curve',
            'doubleCurve',
            'flatTopBottom',
          ].includes(tool);
          const isFourPoint = tool === 'disjointChannel';

          const instrument = sessionRef.current?.instrument || 'EURUSD';
          const pipSize = getPipSize(instrument);

          let points: DrawingPoint[] = [];
          if (isSinglePoint) {
            points = [{ time: cTime as any as number, price, rawTime: rawT }];
          } else if (isPosition) {
            const isLong = tool === 'longPosition';
            const slPips = 20;
            const tpPips = 40;
            const slDistance = slPips * pipSize;
            const tpDistance = tpPips * pipSize;
            points = [
              { time: cTime as any as number, price, rawTime: rawT }, // Entry
              { time: cTime as any as number, price: isLong ? price - slDistance : price + slDistance, rawTime: rawT }, // SL
              { time: cTime as any as number, price: isLong ? price + tpDistance : price - tpDistance, rawTime: rawT }, // TP
            ];
          } else if (isThreePoint) {
            points = [
              { time: cTime as any as number, price, rawTime: rawT },
              { time: cTime as any as number, price, rawTime: rawT },
              { time: cTime as any as number, price: price + 25 * pipSize, rawTime: rawT },
            ];
          } else if (isFourPoint) {
            points = [
              { time: cTime as any as number, price, rawTime: rawT },
              { time: cTime as any as number, price, rawTime: rawT },
              { time: cTime as any as number, price: price + 25 * pipSize, rawTime: rawT },
              { time: cTime as any as number, price: price + 50 * pipSize, rawTime: rawT },
            ];
          } else {
            points = [
              { time: cTime as any as number, price, rawTime: rawT },
              { time: cTime as any as number, price, rawTime: rawT },
            ];
          }

          const newObj: DrawingObject = {
            id: newId,
            tool,
            family,
            points,
            style: initialStyle,
            locked: false,
            hidden: false,
            zIndex: 0,
            meta: { version: 1, source: 'manual' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          isDrawingRef.current = true;
          activeDrawingIdRef.current = newId;
          drawingPointsRef.current = points;

          useSimulatorStore.getState().addDrawingObject(newObj);
          chartRef.current.applyOptions({ handleScroll: false, handleScale: false });

          if (isSinglePoint || isPosition) {
            isDrawingRef.current = false;
            activeDrawingIdRef.current = null;
            chartRef.current.applyOptions({ handleScroll: true, handleScale: true });
            useSimulatorStore.getState().setActiveDrawingTool('select');
            useSimulatorStore.getState().selectDrawingObjects([newId]);
          }
          return;
        }
      }

      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;

      // Editing an existing drawing (Select tool): detect a grab on a
      // non-trade drawing and suppress chart pan/zoom for the duration of
      // the plugin-managed drag so the chart doesn't move together with the
      // drawing. Trade-line drawings are intentionally skipped here so the
      // custom SL/TP drag path below keeps handling them.
      const tool = activeDrawingToolRef.current;
      if ((!tool || tool === 'select') && drawingManagerRef.current && chartRef.current) {
        const rect2 = container.getBoundingClientRect();
        const px = e.clientX - rect2.left;
        const py = e.clientY - rect2.top;
        const hit = drawingManagerRef.current.hitTest({ x: px, y: py } as Drawings.Point);
        if (hit && !isTradeDrawing(hit.id) && !isNewsDrawing(hit.id)) {
          isDraggingExistingDrawingRef.current = true;
          chartRef.current.applyOptions({ handleScroll: false, handleScale: false });
          return;
        }
      }

      // Full-width drag of a trade's SL/TP line: hit-test the line price so
      // clicking anywhere on the line lets the user drag it vertically.
      const hitTradeLine = (trade: Trade, price: number | null | undefined, threshold = 8) => {
        if (price == null) return false;
        const lineY = seriesRef.current.priceToCoordinate(price);
        return lineY !== null && Math.abs(y - lineY) <= threshold;
      };
      const session = sessionRef.current;
      const lineTrades = session?.trades.filter((t) => t.status === 'open' || t.status === 'pending') ?? [];
      for (const t of lineTrades) {
        if (hitTradeLine(t, t.sl)) {
          draggingLineRef.current = {
            tradeId: t.id,
            kind: 'sl' as const,
            price: t.sl!,
            pinnedTime: getReplayTime({
              effectiveData: effectiveDataRef.current,
              effectiveCurrentIndex: effectiveCurrentIndexRef.current,
              compressGaps: sessionRef.current?.compressGaps ?? false,
              chartTimezone: chartTimezoneRef.current,
            }).chartTime,
          };
          setTradeLineDragging(true);
          chart.applyOptions({ handleScroll: false, handleScale: false });
          return;
        }
        if (hitTradeLine(t, t.tp)) {
          draggingLineRef.current = {
            tradeId: t.id,
            kind: 'tp' as const,
            price: t.tp!,
            pinnedTime: getReplayTime({
              effectiveData: effectiveDataRef.current,
              effectiveCurrentIndex: effectiveCurrentIndexRef.current,
              compressGaps: sessionRef.current?.compressGaps ?? false,
              chartTimezone: chartTimezoneRef.current,
            }).chartTime,
          };
          setTradeLineDragging(true);
          chart.applyOptions({ handleScroll: false, handleScale: false });
          return;
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDrawingRef.current && activeDrawingIdRef.current && seriesRef.current && chartRef.current) {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const price = seriesRef.current.coordinateToPrice(y);
        let cTime = chartRef.current.timeScale().coordinateToTime(x);

        if (cTime === null && seriesRef.current && chartRef.current) {
          const logical = chartRef.current.timeScale().coordinateToLogical(x);
          if (logical !== null && Number.isFinite(logical)) {
            const dataSet = effectiveDataRef.current;
            const curIdx = effectiveCurrentIndexRef.current;
            const lastCandle = dataSet[curIdx] || dataSet[dataSet.length - 1];
            if (lastCandle) {
              const deltaBars = logical - curIdx;
              const derivedTs = lastCandle.timestamp + Math.round(deltaBars) * getCurrentIntervalMs();
              cTime = timestampMsToChartTime(derivedTs, chartTimezoneRef.current) as any;
            }
          }
        }

        if (price !== null && cTime !== null) {
          const tool = activeDrawingToolRef.current;
          const startPoint = drawingPointsRef.current[0];

          if (startPoint) {
            let finalPrice: any = price;
            let finalTime: any = cTime;

            if (e.shiftKey && ['trendline', 'ray', 'extendedLine', 'arrow'].includes(tool || '')) {
              const startY = seriesRef.current.priceToCoordinate(startPoint.price);
              const currentY = seriesRef.current.priceToCoordinate(price);
              const startX = chartRef.current.timeScale().timeToCoordinate(startPoint.time as any);
              const currentX = chartRef.current.timeScale().timeToCoordinate(cTime as any);

              if (startY !== null && currentY !== null && startX !== null && currentX !== null) {
                const dx = Math.abs(currentX - startX);
                const dy = Math.abs(currentY - startY);

                if (dy < dx * 0.4) {
                  finalPrice = startPoint.price;
                } else if (dx < dy * 0.4) {
                  finalTime = startPoint.time;
                } else {
                  const snapY = startY + Math.sign(currentY - startY) * dx;
                  const snapPrice = seriesRef.current.coordinateToPrice(snapY);
                  if (snapPrice !== null) {
                    finalPrice = snapPrice;
                  }
                }
              }
            }

            if (tool === 'brush') {
              const rawT = resolveRawTime(cTime as any as number);
              drawingPointsRef.current = [...drawingPointsRef.current, { time: cTime as any as number, price, rawTime: rawT }];
              useSimulatorStore.getState().updateDrawingObject(activeDrawingIdRef.current, {
                points: drawingPointsRef.current,
              });
            } else if (tool === 'parallelChannel') {
              const rawT = resolveRawTime(finalTime as any as number);
              drawingPointsRef.current = [
                startPoint,
                { time: finalTime as any as number, price: finalPrice, rawTime: rawT },
                { time: finalTime as any as number, price: finalPrice * 1.002, rawTime: rawT },
              ];
              useSimulatorStore.getState().updateDrawingObject(activeDrawingIdRef.current, {
                points: drawingPointsRef.current,
              });
            } else {
              const rawT = resolveRawTime(finalTime as any as number);
              drawingPointsRef.current = [
                startPoint,
                { time: finalTime as any as number, price: finalPrice, rawTime: rawT },
              ];
              useSimulatorStore.getState().updateDrawingObject(activeDrawingIdRef.current, {
                points: drawingPointsRef.current,
              });
            }
          }
        }
        return;
      }

      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;

      if (draggingLineRef.current && seriesRef.current) {
        const price = seriesRef.current.coordinateToPrice(y);
        if (price !== null && Number.isFinite(price)) {
          draggingLineRef.current.price = price;
          // Move the line visually right away (pinned to the replay bar's
          // time so it only follows the cursor vertically).
          const lineId = draggingLineRef.current.kind === 'sl'
            ? tradeSlLineId(draggingLineRef.current.tradeId)
            : tradeTpLineId(draggingLineRef.current.tradeId);
          drawingManagerRef.current?.getDrawing(lineId)
            ?.setAnchors([{ time: draggingLineRef.current.pinnedTime as any, price }]);
        }
        setHoveredNewsItem(null);
        container.style.cursor = 'ns-resize';
        return;
      }

      if (e.buttons === 1 || e.buttons === 4) {
        scheduleOverlayRender();
      }

      const x = e.clientX - rect.left;
      const hoveredNews = renderedNewsItemsRef.current.find((item) => {
        if (item.kind === 'future-line') {
          return Math.abs(x - item.x) <= 6;
        }
        return Math.hypot(x - item.x, y - item.y) <= item.r + 6;
      }) || null;
      setHoveredNewsItem(hoveredNews);
      if (hoveredNews) {
        container.style.cursor = 'pointer';
        return;
      }

      if (!seriesRef.current || !chartRef.current) return;

      const threshold = 10;
      
      let isHovering = false;

      const activeDraft = orderDraftRef.current;
      if (activeDraft && seriesRef.current) {
        if (activeDraft.sl) {
          const slY = seriesRef.current.priceToCoordinate(activeDraft.sl);
          if (slY !== null && Math.abs(y - slY) < threshold) {
            isHovering = true;
          }
        }
        if (activeDraft.tp) {
          const tpY = seriesRef.current.priceToCoordinate(activeDraft.tp);
          if (tpY !== null && Math.abs(y - tpY) < threshold) {
            isHovering = true;
          }
        }
      }
      
      let foundHoveredTrade: {
        trade: OverlayTrade;
        x: number;
        y: number;
        lineType: 'entry' | 'sl' | 'tp' | 'limit';
      } | null = null;

      for (const t of renderedTradesRef.current) {
        if (t.slY !== null && t.slY !== undefined && Math.abs(y - t.slY) < threshold) {
          foundHoveredTrade = { trade: t, x, y: t.slY, lineType: 'sl' };
          isHovering = true;
          break;
        }
        if (t.tpY !== null && t.tpY !== undefined && Math.abs(y - t.tpY) < threshold) {
          foundHoveredTrade = { trade: t, x, y: t.tpY, lineType: 'tp' };
          isHovering = true;
          break;
        }
        if (t.entryY !== null && t.entryY !== undefined && Math.abs(y - t.entryY) < threshold) {
          foundHoveredTrade = { trade: t, x, y: t.entryY, lineType: 'entry' };
          isHovering = true;
          break;
        }
        if (t.limitY !== null && t.limitY !== undefined && Math.abs(y - t.limitY) < threshold) {
          foundHoveredTrade = { trade: t, x, y: t.limitY, lineType: 'limit' };
          isHovering = true;
          break;
        }
      }

      if (foundHoveredTrade) {
        setHoveredTradeItem(foundHoveredTrade);
      } else if (!isMouseOverTradeTooltipRef.current) {
        setHoveredTradeItem(null);
      }

      container.style.cursor = isHovering ? 'ns-resize' : 'crosshair';
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDraggingExistingDrawingRef.current) {
        isDraggingExistingDrawingRef.current = false;
        if (chartRef.current) {
          chartRef.current.applyOptions({ handleScroll: true, handleScale: true });
        }
        return;
      }

      if (isDrawingRef.current && activeDrawingIdRef.current) {
        const completedId = activeDrawingIdRef.current;
        isDrawingRef.current = false;
        activeDrawingIdRef.current = null;
        if (chartRef.current) {
          chartRef.current.applyOptions({ handleScroll: true, handleScale: true });
        }
        useSimulatorStore.getState().setActiveDrawingTool('select');
        useSimulatorStore.getState().selectDrawingObjects([completedId]);
        return;
      }

      if (draggingLineRef.current) {
        const { tradeId, kind, price } = draggingLineRef.current;
        draggingLineRef.current = null;
        setTradeLineDragging(false);
        if (chartRef.current) {
          chartRef.current.applyOptions({ handleScroll: true, handleScale: true });
        }
        if (kind === 'sl') useSimulatorStore.getState().modifyOrder(tradeId, { sl: price });
        else useSimulatorStore.getState().modifyOrder(tradeId, { tp: price });
        scheduleOverlayRender();
        return;
      }

      // Safety: a missed mouseup (e.g. window blur) must never leave the
      // drag guard stuck.
      setTradeLineDragging(false);
      lastPointerRef.current = null;
    };

    const handleDoubleClick = (e: MouseEvent) => {
      if (!drawingManagerRef.current || !seriesRef.current) return;
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const hit = drawingManagerRef.current.hitTest({ x: px, y: py } as any);
      if (hit && !isTradeDrawing(hit.id) && !isNewsDrawing(hit.id)) {
        useSimulatorStore.getState().selectDrawingObjects([hit.id]);
        onOpenDrawingSettings?.(hit.id);
        return;
      }

      // Double-click on empty canvas / whitespace: reset scale and center on replay candle
      const chart = chartRef.current;
      if (chart) {
        const activeSession = sessionRef.current;
        const curIdx = activeSession?.currentIndex ?? effectiveCurrentIndexRef.current ?? 0;
        const barsBefore = Math.max(60, Math.min(curIdx, 180));
        chart.timeScale().resetTimeScale();
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, curIdx - barsBefore),
          to: Math.max(curIdx + rightPaddingBars, 60),
        });
        chart.applyOptions({
          handleScroll: true,
          handleScale: true,
          rightPriceScale: { autoScale: true },
        });
        try {
          chart.priceScale('right').applyOptions({ autoScale: true });
        } catch {}
        priceScaleLockedRef.current = false;
        shouldResetViewportRef.current = false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!seriesRef.current) return;  // no series yet
      
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      let price: number | null = seriesRef.current.coordinateToPrice(y) as number | null;
      
      if (price === null || !Number.isFinite(price)) {
        const activeSession = sessionRef.current;
        const data = effectiveDataRef.current?.length
          ? effectiveDataRef.current
          : (activeSession?.data ?? []);
        const curIdx = effectiveCurrentIndexRef.current ?? (activeSession?.currentIndex ?? 0);
        const lastCandle = data[curIdx] || data[data.length - 1];
        if (lastCandle && Number.isFinite(lastCandle.close)) {
          price = lastCandle.close;
        } else {
          price = 0;
        }
      }
      
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, price: price ?? 0 });
    };

    const handleGlobalClick = () => {
      setContextMenu(null);
    };

    const handleWheel = () => {
      scheduleOverlayRender();
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('dblclick', handleDoubleClick);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('click', handleGlobalClick);

    return () => {
      if (drawingManagerRef.current) {
        drawingManagerRef.current.detach();
        drawingManagerRef.current = null;
      }
      resizeObserver.disconnect();
      tradeMarkersRef.current = null;
      newsMarkersRef.current = null;
      whitespaceSeriesRef.current = null;

      chart.remove();
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('dblclick', handleDoubleClick);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('contextmenu', handleContextMenu);
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('click', handleGlobalClick);
    };
  }, [session?.instrument, currentSessionId, scheduleOverlayRender, applyInteractionEvent]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      chart.applyOptions({
        layout: {
          background: parseGradientBackground(chartColors.background),
          textColor: chartColors.text,
        },
        grid: {
          vertLines: { color: chartColors.gridVert, style: 1, visible: gridVertLinesVisible },
          horzLines: { color: chartColors.gridHorz, style: 1, visible: gridHorzLinesVisible },
        },
        timeScale: { borderColor: chartColors.timeScaleBorder },
        rightPriceScale: { borderColor: chartColors.priceScaleBorder },
        crosshair: {
          vertLine: { color: chartColors.crosshairVert, width: 1 },
          horzLine: { color: chartColors.crosshairHorz, width: 1 },
        },
      });
    }
    const series = seriesRef.current;
    if (series) {
      series.applyOptions({
        upColor: chartColors.upColor,
        downColor: chartColors.downColor,
        borderUpColor: chartColors.borderUpColor,
        borderDownColor: chartColors.borderDownColor,
        wickUpColor: chartColors.wickUpColor,
        wickDownColor: chartColors.wickDownColor,
      });
    }
  }, [chartColors, gridVertLinesVisible, gridHorzLinesVisible]);

  const drawingDocument = useSimulatorStore((state) => {
    const s = state.sessions.find((sess) => sess.id === currentSessionId);
    return s?.drawingDocument;
  });

  useTradeLinesSync({
    managerRef: drawingManagerRef,
    seriesRef,
    chartApi,
    currentSessionId,
    trades,
    orderDraft,
    effectiveData,
    effectiveCurrentIndex,
    instrument: session?.instrument,
    chartTimezone,
    compressGaps,
    renderedTradesRef,
    setRenderedTrades,
  });

  useNewsLinesSync({
    managerRef: drawingManagerRef,
    visibleNews,
    currentReplayTimestamp,
    lastVisibleTimestamp: effectiveData[effectiveCurrentIndex]?.timestamp,
    lastVisiblePrice: effectiveData[effectiveCurrentIndex]?.close,
    intervalMs: getCurrentIntervalMs(),
    chartTimezone,
    opacity: newsLineOpacity,
    endTimestamp: session?.endDate ? toDateBoundary(session.endDate, true) : undefined,
  });

  useEffect(() => {
    const drawingManager = drawingManagerRef.current;
    if (!drawingManager || !drawingDocument) return;

    // Build the ordinal timeline ONCE per sync run instead of inside the
    // point mapper (which previously rebuilt it for every drawing point).
    const activeTimeline = compressGaps && effectiveData.length > 0
      ? buildContinuousTimeline(
          effectiveData[0].timestamp,
          effectiveData[effectiveData.length - 1].timestamp,
        )
      : null;

    // Cheap O(anchors * fields) signature for comparing point sets — avoids
    // JSON.stringify of the full anchor arrays on every store change while
    // still capturing every primitive field (time, price, rawTime, ...).
    const pointsSignature = (points: any[]): string => {
      let sig = '';
      for (const p of points) {
        if (!p) { sig += 'null;'; continue; }
        sig += '{';
        for (const k of Object.keys(p)) {
          const v = (p as any)[k];
          sig += `${k}:${typeof v === 'number' && Number.isFinite(v) ? v.toPrecision(12) : String(v)};`;
        }
        sig += '}';
      }
      return sig;
    };

    // Helper to map original points to the current timeframe on the fly
    const mapPointsToCurrentTimeframe = (points: DrawingPoint[]): DrawingPoint[] => {
      if (effectiveData.length === 0) return points;

      return points.map((p) => {
        const rawSeconds = p.rawTime !== undefined
          ? p.rawTime
          : resolveRawTime(p.time);

        const targetTimeMs = rawSeconds * 1000;
        const lastCandleTs = effectiveData[effectiveData.length - 1]?.timestamp ?? 0;

        // If the point is in the future beyond loaded candles, map directly to future chart time
        if (targetTimeMs > lastCandleTs) {
          const mappedTime = timestampMsToChartTime(targetTimeMs, chartTimezone);
          return {
            ...p,
            time: mappedTime,
            rawTime: rawSeconds,
          };
        }

        // Binary search for nearest candle in effectiveData
        let low = 0;
        let high = effectiveData.length - 1;
        let bestIndex = 0;
        let minDiff = Infinity;

        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const candleTs = effectiveData[mid].timestamp;
          const diff = Math.abs(candleTs - targetTimeMs);

          if (diff < minDiff) {
            minDiff = diff;
            bestIndex = mid;
          }

          if (candleTs === targetTimeMs) {
            bestIndex = mid;
            break;
          }

          if (candleTs < targetTimeMs) {
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }

        const nearestCandle = effectiveData[bestIndex];
        if (!nearestCandle) {
          return p;
        }

        let mappedTime = p.time;
        if (activeTimeline) {
          const ordinal = activeTimeline.realToOrdinal.get(nearestCandle.timestamp);
          if (ordinal !== undefined) {
            mappedTime = ordinal;
          }
        } else {
          mappedTime = timestampMsToChartTime(nearestCandle.timestamp, chartTimezone);
        }

        return {
          ...p,
          time: mappedTime,
          rawTime: rawSeconds,
        };
      });
    };

    // Cache mapped points per drawing id, invalidated when the mapping
    // inputs (data window / compression / timezone) change. The cache is
    // keyed by the SOURCE points signature so the mapping only re-runs
    // when the drawing's points actually changed.
    const mappingKey = `${effectiveData.length}|${effectiveData[0]?.timestamp ?? 0}|${effectiveData[effectiveData.length - 1]?.timestamp ?? 0}|${compressGaps}|${chartTimezone}`;
    const mappingCache = drawingMappingCacheRef.current;
    if (mappingCache.key !== mappingKey) {
      mappingCache.key = mappingKey;
      mappingCache.byDrawingId.clear();
    }

    isSyncingFromStoreRef.current = true;
    try {
      const currentDrawings = drawingManager.getAllDrawings();
      const docObjects = drawingDocument.objects ?? [];

      const managerDrawingMap = new Map(currentDrawings.map((d) => [d.id, d]));
      const syncedIds = new Set<string>();

      for (const obj of docObjects) {
        if (obj.hidden) continue;

        const srcSig = pointsSignature(obj.points);
        let cachedEntry = mappingCache.byDrawingId.get(obj.id);
        let mappedPoints: DrawingPoint[];
        if (cachedEntry && cachedEntry.srcSig === srcSig) {
          mappedPoints = cachedEntry.points;
        } else {
          mappedPoints = mapPointsToCurrentTimeframe(obj.points);
          mappingCache.byDrawingId.set(obj.id, { srcSig, points: mappedPoints });
        }

        const existing = managerDrawingMap.get(obj.id);
        if (existing) {
          const pointsChanged = pointsSignature((existing as any).anchors ?? []) !== pointsSignature(mappedPoints);
          if (pointsChanged) {
            existing.setAnchors(mappedPoints as any);
          }

          applyDrawingStylesAndOptions(existing, obj);
          syncedIds.add(obj.id);
        } else {
          const inst = createDrawingInstance(obj, mappedPoints);
          if (inst) {
            drawingManager.addDrawing(inst);
            syncedIds.add(obj.id);
          }
        }
      }

      for (const d of currentDrawings) {
        if (isTradeDrawing(d.id)) continue;
        if (isNewsDrawing(d.id)) continue;
        if (!syncedIds.has(d.id)) {
          drawingManager.removeDrawing(d.id);
        }
      }

      const selectedIds = drawingDocument.selectedIds ?? [];
      const currentSelection = drawingManager.getSelectedDrawing();
      if (currentSelection && isTradeDrawing(currentSelection.id)) {
        // Trade drawings are projections, not part of the store document —
        // keep their selection intact (e.g. mid-drag on playback ticks).
      } else if (selectedIds.length > 0) {
        drawingManager.selectDrawing(selectedIds[0]);
      } else {
        drawingManager.deselectAll();
      }
    } catch (e) {
      console.error('Error syncing drawings from store to manager:', e);
    } finally {
      isSyncingFromStoreRef.current = false;
    }
  }, [drawingDocument, currentSessionId, effectiveData, compressGaps, chartTimezone, resolveRawTime]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    chart.applyOptions({
      layout: {
        background: parseGradientBackground(chartColors.background),
        textColor: chartColors.text,
      },
      grid: {
        vertLines: { color: chartColors.gridVert, style: 1, visible: gridVertLinesVisible },
        horzLines: { color: chartColors.gridHorz, style: 1, visible: gridHorzLinesVisible },
      },
      timeScale: {
        borderColor: chartColors.timeScaleBorder,
      },
      rightPriceScale: {
        borderColor: chartColors.priceScaleBorder,
      },
      crosshair: {
        vertLine: {
          color: chartColors.crosshairVert,
          labelBackgroundColor: '#9a4f20',
        },
        horzLine: {
          color: chartColors.crosshairHorz,
          labelBackgroundColor: '#9a4f20',
        },
      },
    });

    series.applyOptions({
      upColor: chartColors.upColor,
      downColor: chartColors.downColor,
      borderUpColor: chartColors.borderUpColor,
      borderDownColor: chartColors.borderDownColor,
      wickUpColor: chartColors.wickUpColor,
      wickDownColor: chartColors.wickDownColor,
    });
  }, [chartColors, gridVertLinesVisible, gridHorzLinesVisible]);

  // Forward crosshair events to parent (for MTF sync)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onCrosshairMove) return;

    const handler = (param: any) => {
      // Prevent infinite loop from programmatic crosshair setting
      if (!param.sourceEvent) return;

      if (!param.time) {
        onCrosshairMove(null);
        return;
      }
      
      if (param.logical !== undefined && param.logical !== null) {
        const idx = Math.round(param.logical);
        // When overrideData is provided, timestamps come from it directly
        if (overrideData && overrideData[idx]) {
          onCrosshairMove(overrideData[idx].timestamp);
          return;
        }
        const latestSession = useSimulatorStore.getState().sessions.find(s => s.id === currentSessionId);
        if (latestSession && latestSession.data && latestSession.data[idx]) {
           onCrosshairMove(latestSession.data[idx].timestamp);
           return;
        }
      }
      
      let rawMs = null;
      if (typeof param.time === 'object') {
        rawMs = Date.UTC(param.time.year, param.time.month - 1, param.time.day);
      } else if (typeof param.time === 'string') {
        rawMs = new Date(param.time).getTime();
      } else if (typeof param.time === 'number') {
        rawMs = param.time * 1000;
      }
      
      if (rawMs != null && !isNaN(rawMs)) {
        onCrosshairMove(rawMs);
      } else {
        onCrosshairMove(null);
      }
    };

    chart.subscribeCrosshairMove(handler);
    return () => {
      try { chart.unsubscribeCrosshairMove(handler); } catch {}
    };
  }, [onCrosshairMove, currentSessionId]);

  // Receive synced crosshair from another pane
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    if (syncedCrosshairTimestamp == null) {
      chart.clearCrosshairPosition();
      return;
    }

    const tz = chartTimezoneRef.current;
    const chartTime = timestampMsToChartTime(syncedCrosshairTimestamp, tz) as any;

    // Use overrideData if available (secondary pane), otherwise use session data
    const lookupData = overrideData ?? ((() => {
      const latestSession = useSimulatorStore.getState().sessions.find((s) => s.id === currentSessionId);
      return latestSession?.data ?? [];
    })());

    if (!lookupData.length) return;

    // Binary search for closest timestamp
    let lo = 0, hi = lookupData.length - 1;
    let closestPrice = lookupData[hi]?.close ?? 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (lookupData[mid].timestamp < syncedCrosshairTimestamp) lo = mid + 1;
      else hi = mid - 1;
    }
    const nearIdx = Math.max(0, Math.min(lo, lookupData.length - 1));
    closestPrice = lookupData[nearIdx]?.close ?? closestPrice;

    if (chartTime == null || Number.isNaN(chartTime)) return;

    try {
      chart.setCrosshairPosition(closestPrice, chartTime, series);
    } catch (e) {
      // Lightweight charts can throw if trying to set crosshair before internal structures
      // (like priceScale's firstValue or timeScale's indices) are fully initialized.
      // Ignoring this here is safe as it will be updated successfully on subsequent renders/mouse moves.
    }
  }, [syncedCrosshairTimestamp, currentSessionId, overrideData]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !session) return;

    const timeScale = chart.timeScale();

    const maybeLoadVisibleGap = (range: { from: number; to: number } | null) => {
      if (!range) return;
      const latestState = useSimulatorStore.getState();
      const latestSession = latestState.sessions.find((s) => s.id === session.id);
      if (!latestSession || latestSession.data.length === 0) return;

      const latestEffectiveData = effectiveDataRef.current;
      const latestEffectiveCurrentIndex = effectiveCurrentIndexRef.current;
      const visibleBars = latestEffectiveCurrentIndex + 1;
      const futureBlankBars = range.from - (visibleBars - 1);
      const viewWidth = range.to - range.from;
      // Only re-center if the user has scrolled beyond any reasonable future horizon (past 20000 bars)
      // so users are free to scroll and draw across the entire future session horizon without getting snapped back.
      if (futureBlankBars > 20000 && viewWidth >= 30) {
        const barsBefore = Math.max(60, Math.min(latestEffectiveCurrentIndex, 180));
        timeScale.setVisibleLogicalRange({
          from: Math.max(0, latestEffectiveCurrentIndex - barsBefore),
          to: Math.max(latestEffectiveCurrentIndex + rightPaddingBars, 60),
        });
        showSmartLoadHint('Re-centered on live replay', 1200);
        return;
      }

      const blankLeft = range.from < 60;

      if (!blankLeft) return;

      const firstLoaded = latestSession.data[0]?.timestamp;
      const absoluteFrom = toDateBoundary(latestSession.startDate) - getViewportPreloadHistoryMs(latestSession.timeframe);

      if (firstLoaded && firstLoaded <= absoluteFrom) {
        return; // reached beginning
      }

      const baseWindowMs = getViewportLoadWindowMs(latestSession.timeframe);
      const toTs = firstLoaded!;
      const fromTs = Math.max(absoluteFrom, firstLoaded! - baseWindowMs * 2);

      if (toTs <= fromTs) return;

      const requestKey = `${latestSession.id}|${latestSession.instrument}|${latestSession.timeframe}|viewport|${fromTs}|${toTs}`;
      if (viewportLoadRequestsRef.current.has(requestKey)) {
        return; // already fetching this chunk
      }

      viewportLoadRequestsRef.current.add(requestKey);

      const store = useSimulatorStore.getState();
      const tf = latestSession.timeframe;
      const isSubMinute = tf === 'tick' || tf === 's5' || tf === 's15' || tf === 's30';
      const useSynthetic = isSubMinute && store.useSyntheticSeconds;
      // Sub-minute sessions fetch at their own timeframe (real 1s-tick-backed
      // data) or m1 (synthetic mode). All standard timeframes fetch at their
      // own native timeframe directly from Dukascopy.
      const fetchTimeframe = isSubMinute
        ? (!useSynthetic ? (tf === 'tick' ? 's1' : tf) : 'm1')
        : tf;

      store.patchDataState({
        isViewportLoading: true,
        activeLoadKind: 'viewport',
        requestedFromTs: fromTs,
        requestedToTs: toTs,
        absoluteFromTs: absoluteFrom,
      }, latestSession.id);

      showSmartLoadHint('Loading older candles...', 1800);

      void downloadMarketData(
        latestSession.instrument,
        new Date(fromTs).toISOString(),
        new Date(toTs).toISOString(),
        'bid',
        fetchTimeframe
      ).then((chunk) => {
        const currentSession = useSimulatorStore.getState().sessions.find((s) => s.id === latestSession.id);
        if (!currentSession) return;

        if (chunk.length === 0) {
          useSimulatorStore.getState().patchDataState({
            coveredFromTs: fromTs,
          }, latestSession.id);
          showSmartLoadHint('No market data available for this period', 1800);
          return;
        }

        let candles = chunk;
        if (isSubMinute && useSynthetic && tf !== 'tick') {
          candles = expandSubMinuteCandlesFromM1(chunk, auraTimeframeToDukascopy(tf));
        }

        useSimulatorStore.getState().prependData(candles, latestSession.id);

        showSmartLoadHint(`Loaded ${candles.length} more candles`, 1200);
        
        setTimeout(() => {
          const newRange = chartRef.current?.timeScale().getVisibleLogicalRange() || null;
          if (newRange) maybeLoadVisibleGap(newRange);
        }, 100);

      }).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn('Viewport loading failed:', error);
          showSmartLoadHint('Could not load more history', 1800);
        }
      }).finally(() => {
        useSimulatorStore.getState().patchDataState({
          isViewportLoading: false,
          activeLoadKind: null,
        }, latestSession.id);
        viewportLoadRequestsRef.current.delete(requestKey);
      });
    };

    let lastRange: { from: number; to: number } | null = null;

    const handleVisibleRangeChange = (range: { from: number; to: number } | null) => {
      maybeLoadVisibleGap(range);
      scheduleOverlayRender();
      lastRange = range;
    };

    timeScale.subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    handleVisibleRangeChange(timeScale.getVisibleLogicalRange());

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    };
  }, [currentSessionId, session?.id, session?.instrument, session?.timeframe, rightPaddingBars, scheduleOverlayRender]);



  const updateOverlayRender = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const activeSession = sessionRef.current;
    if (!chart || !series || !activeSession) return;
    const activeEffectiveCurrentIndex = activeSession?.currentIndex ?? effectiveCurrentIndexRef.current;
    // No per-frame slice: the whole array is kept by reference and the
    // visible prefix is expressed as a length, so lookups stay O(1) on a
    // timestamp index map instead of copying up to ~350k candles per frame.
    const activeEffectiveData = effectiveDataRef.current;
    const activeVisibleLength = playbackOwner
      ? Math.min(activeEffectiveCurrentIndex + 1, activeEffectiveData.length)
      : activeEffectiveData.length;
    const activeTimezone = chartTimezoneRef.current;
    const activeVisibleNews = visibleNewsRef.current;


    const currentCandle = activeEffectiveData[activeEffectiveCurrentIndex] ?? activeSession.data[activeSession.currentIndex];
    const currentPrice = currentCandle?.close || 0;
    const currentTimestamp = replayTimestampRef.current ?? currentCandle?.timestamp ?? 0;

    // Rebuild the timestamp -> index map only when the data array changes
    // (same reference during playback ticks, so this is a one-time cost).
    if (newsIndexMapDataRef.current !== activeEffectiveData || newsIndexMapLenRef.current !== activeEffectiveData.length) {
      const map = new Map<number, number>();
      for (let i = 0; i < activeEffectiveData.length; i++) {
        const ts = activeEffectiveData[i]?.timestamp;
        if (ts !== undefined && !map.has(ts)) map.set(ts, i);
      }
      newsIndexMapRef.current = map;
      newsIndexMapDataRef.current = activeEffectiveData;
      newsIndexMapLenRef.current = activeEffectiveData.length;
    }
    const newsIndexMap = newsIndexMapRef.current;

    const nextRenderedNewsItems: ChartNewsOverlayItem[] = [];

    if (activeVisibleNews.length > 0) {
      for (const item of activeVisibleNews) {
        const renderState = getNewsRenderState({
          eventTimestamp: item.timestamp,
          currentTimestamp,
          visibleCandles: activeEffectiveData,
          visibleLength: activeVisibleLength,
        });
        if (!renderState) continue;

        const color = getImpactColor(item.impact);

        if (renderState.kind === 'future-line') {
          const timeKey = timestampMsToChartTime(renderState.eventTimestamp, activeTimezone);
          const x = chart.timeScale().timeToCoordinate(timeKey as any);
          if (DEV_DIAGNOSTICS) {
            console.log(`[WS] future-line ${getImpactLabel(item.impact)} ${new Date(item.timestamp).toISOString()} t=${timeKey} x=${x}`);
          }
          if (x !== null) {
            nextRenderedNewsItems.push({
              id: item.id,
              item,
              kind: 'future-line',
              x,
              y: 0,
              color,
            });
          }
          continue;
        }

        const candleIndex = newsIndexMap?.get(renderState.candleTimestamp);
        if (candleIndex === undefined || candleIndex > activeEffectiveCurrentIndex) continue;
        const candle = activeEffectiveData[candleIndex];

        const timeKey = timestampMsToChartTime(renderState.candleTimestamp, activeTimezone);
        const x = chart.timeScale().timeToCoordinate(timeKey as any);
        const candleHighY = series.priceToCoordinate(candle.high);
        if (x === null || candleHighY === null) continue;

        nextRenderedNewsItems.push({
          id: item.id,
          item,
          kind: 'reached-marker',
          x,
          y: candleHighY,
          r: 4,
          color,
        });
      }
    }

    // Keep the latest computed overlays in refs every frame — these are used
    // for hit-testing (hover tooltips), so they must stay fresh at 60fps.
    renderedNewsItemsRef.current = nextRenderedNewsItems;

    // Throttle React commits: the chart component re-renders at ~10Hz during
    // playback instead of on every frame (avoids 60fps re-render churn of the
    // large component tree that renders these overlay labels).
    const commitNow = performance.now();
    if (commitNow - overlayCommitTimeRef.current >= OVERLAY_COMMIT_INTERVAL_MS) {
      overlayCommitTimeRef.current = commitNow;
      if (!areRenderedNewsItemsEqual(committedNewsItemsRef.current, nextRenderedNewsItems)) {
        committedNewsItemsRef.current = nextRenderedNewsItems;
        setRenderedNewsItems(nextRenderedNewsItems);
      }
    }
  }, []);

  useEffect(() => {
    updateOverlayRenderRef.current = updateOverlayRender;
  }, [updateOverlayRender]);

  useEffect(() => {
    scheduleOverlayRender();
  }, [session, visibleNews, chartTimezone, overrideData, effectiveData, scheduleOverlayRender]);

  // Handle indicator series creation/removal
  useEffect(() => {
    if (!chartRef.current) return;

    const currentIds = new Set(activeIndicators.map(i => i.id));
    
    // Remove deleted indicators
    Object.keys(indicatorSeriesRefs.current).forEach(id => {
      if (!currentIds.has(id)) {
        const seriesMap = indicatorSeriesRefs.current[id];
        const paneIndex = indicatorPaneMap.current[id];
        
        if (seriesMap && typeof seriesMap === 'object') {
          Object.values(seriesMap).forEach((series: any) => {
            if (series && typeof series.removeSeries === 'function') {
              chartRef.current?.removeSeries(series);
            } else if (series) {
              try { chartRef.current?.removeSeries(series); } catch (e) {}
            }
          });
        }
        
        // Update pane indicator count and potentially remove empty pane
        if (paneIndex !== undefined && paneIndex > 0) {
          if (paneIndicatorCount.current[paneIndex]) {
            paneIndicatorCount.current[paneIndex].delete(id);
            
            // If pane is now empty, remove it
            if (paneIndicatorCount.current[paneIndex].size === 0) {
              try {
                chartRef.current?.removePane(paneIndex);
                delete paneIndicatorCount.current[paneIndex];
              } catch (e) {
                console.warn('Failed to remove pane:', e);
              }
            }
          }
        }
        
        delete indicatorSeriesRefs.current[id];
        delete indicatorPaneMap.current[id];
      }
    });

    // Add new indicators
    activeIndicators.forEach((ind, index) => {
      if (!indicatorSeriesRefs.current[ind.id]) {
        indicatorSeriesRefs.current[ind.id] = {};
        pendingIndicatorDataRef.current.add(ind.id);
        
        void ensureIndicatorsModule().then((indicatorsModule) => {
          const indicatorClass = getIndicatorFromModule(indicatorsModule, ind.id);
          const colors = [
            chartColors.indicatorLine1,
            chartColors.indicatorLine2,
            chartColors.indicatorLine3,
            chartColors.indicatorLine4,
            chartColors.indicatorLine5,
          ];
          
          // Determine overlay property (default to true if not specified)
          // Check both indicatorClass.overlay (for registry entries) and metadata.overlay (for direct exports)
          const isOverlay = indicatorClass?.overlay !== false && indicatorClass?.metadata?.overlay !== false;
          
          // Determine pane index
          let paneIndex = 0;
          if (!isOverlay) {
            // Find an existing empty pane or create a new one
            const existingPaneIndex = Object.keys(paneIndicatorCount.current).find(pIdx => {
              const count = paneIndicatorCount.current[parseInt(pIdx)];
              return count && count.size === 0 && parseInt(pIdx) > 0;
            });
            
            if (existingPaneIndex) {
              paneIndex = parseInt(existingPaneIndex);
            } else {
              // Create a new pane
              const chart = chartRef.current;
              if (chart) {
                const panes = chart.panes();
                paneIndex = panes.length;
                chart.addPane();
                // Set the height of the newly created pane
                const newPanes = chart.panes();
                if (newPanes[paneIndex]) {
                  newPanes[paneIndex].setHeight(150);
                }
              }
            }
            
            // Track indicator in pane
            if (!paneIndicatorCount.current[paneIndex]) {
              paneIndicatorCount.current[paneIndex] = new Set();
            }
            paneIndicatorCount.current[paneIndex].add(ind.id);
            indicatorPaneMap.current[ind.id] = paneIndex;
          }
          
          // Determine number of plots to create
          let plotCount = 1;
          let plotConfigs: any[] = [];
          
          if (indicatorClass?.plotConfig && Array.isArray(indicatorClass.plotConfig)) {
            plotCount = indicatorClass.plotConfig.length;
            plotConfigs = indicatorClass.plotConfig;
          }

          const hlineConfigs = indicatorClass?.hlineConfig || [];
          
          for (let i = 0; i < plotCount; i++) {
            const plotKey = `plot${i}`;
            const color = plotConfigs[i]?.color || colors[index % colors.length];
            const lineWidth = (plotConfigs[i]?.lineWidth || 2) as any;
            const plotStyle = plotConfigs[i]?.style;
            
            // Determine series type based on plotConfig style
            const SeriesConstructor = plotStyle === 'columns' ? HistogramSeries : LineSeries;
            
            const seriesOptions = plotStyle === 'columns' ? {
              color,
              priceFormat: {
                type: 'price',
                precision: 5,
                minMove: 0.00001,
              },
            } : {
              color,
              lineWidth,
              priceFormat: {
                type: 'price',
                precision: 5,
                minMove: 0.00001,
              },
            };
            
            indicatorSeriesRefs.current[ind.id][plotKey] = chartRef.current!.addSeries(SeriesConstructor as any, seriesOptions as any, paneIndex);
            
            // Add horizontal lines for this series if hlineConfig exists
            if (hlineConfigs.length > 0 && Array.isArray(hlineConfigs[i])) {
              hlineConfigs[i].forEach((hline: { color: string; lineWidth: number; price: number; lineStyle?: number }) => {
                indicatorSeriesRefs.current[ind.id][plotKey].createPriceLine({
                  color: hline.color || color,
                  lineWidth: hline.lineWidth || 1,
                  lineStyle: hline.lineStyle || 2, // Dashed by default
                  price: hline.price,
                  axisLabelVisible: true,
                  title: '',
                } as any);
              });
            }
          }
          
          // Trigger data update after series are created
          if (pendingIndicatorDataRef.current.has(ind.id)) {
            pendingIndicatorDataRef.current.delete(ind.id);
            setIndicatorSeriesVersion(v => v + 1);
          }
        }).catch(err => {
          console.error('Error creating indicator series:', err);
          pendingIndicatorDataRef.current.delete(ind.id);
          delete indicatorSeriesRefs.current[ind.id];
          delete indicatorPaneMap.current[ind.id];
        });
      }
    });
  }, [activeIndicators, chartColors]);

  // Helper: recalculate all indicator series data
  const recalculateIndicators = useCallback((forceImmediate = false) => {
    if (activeIndicators.length === 0) return;
    if (!seriesRef.current) return;

    const runUpdate = () => {
      const latestData = effectiveDataRef.current;
      const latestIndex = effectiveCurrentIndexRef.current;
      if (!latestData || latestData.length === 0 || latestIndex < 0) return;

      const tz = chartTimezoneRef.current;
      const visibleLen = latestIndex + 1;

      // Skip entirely when nothing meaningful changed (playback ticks, repeated
      // React syncs, etc.) — the signature covers data identity, visible prefix,
      // timezone and the active indicator configs.
      const configSig = activeIndicators
        .map((ind) => `${ind.id}:${ind.options ? JSON.stringify(ind.options) : ''}`)
        .join('|');
      const lastCandle = latestData[latestIndex];
      const lastCandleSig = lastCandle
        ? `${lastCandle.timestamp}|${lastCandle.open}|${lastCandle.high}|${lastCandle.low}|${lastCandle.close}|${lastCandle.volume}`
        : '';
      const sig = `${latestData === indicatorCacheRef.current?.dataRef ? 'same' : 'new'}|${visibleLen}|${latestData.length}|${lastCandleSig}|${tz}|${configSig}`;
      if (sig === indicatorSignatureRef.current) return;
      indicatorSignatureRef.current = sig;

      // Reuse the transformed visible-data array across indicator recomputes:
      // rebuild only when the source array identity changes or the visible
      // prefix shrinks; otherwise extend incrementally with the new tail.
      const cache = indicatorCacheRef.current;
      let visibleData: Array<{ time: any; open: number; high: number; low: number; close: number; volume: number }>;
      if (
        cache
        && cache.dataRef === latestData
        && cache.baseIndex === 0
        && cache.tz === tz
        && cache.baseLen <= visibleLen
      ) {
        if (cache.visibleData.length < visibleLen) {
          for (let i = cache.visibleData.length; i < visibleLen; i++) {
            const d = latestData[i];
            cache.visibleData.push({
              time: timestampMsToChartTime(d.timestamp, tz) as any,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
              volume: d.volume,
            });
          }
        }
        visibleData = cache.visibleData;
      } else {
        visibleData = latestData.slice(0, visibleLen).map(d => ({
          time: timestampMsToChartTime(d.timestamp, tz) as any,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume,
        }));
        indicatorCacheRef.current = {
          dataRef: latestData,
          baseLen: visibleLen,
          baseIndex: 0,
          tz,
          visibleData,
        };
      }

      if (visibleData.length === 0) return;

      void ensureIndicatorsModule().then((indicatorsModule) => {
        activeIndicators.forEach(ind => {
          const seriesMap = indicatorSeriesRefs.current[ind.id];
          if (!seriesMap || Object.keys(seriesMap).length === 0) return;

          const indicatorClass = getIndicatorFromModule(indicatorsModule, ind.id);
          if (!indicatorClass?.calculate) return;

          try {
            const options = ind.options || indicatorClass.defaultInputs || {};
            const result = indicatorClass.calculate(visibleData, options);
            if (!result?.plots) return;

            const plotKeys = Object.keys(result.plots).sort();
            plotKeys.forEach((plotKey) => {
              const series = seriesMap[plotKey];
              if (!series) return;
              const plotData = result.plots[plotKey];
              const cleanData = plotData.filter(
                (item: any) => typeof item.value === 'number' && !isNaN(item.value) && isFinite(item.value)
              );
              series.setData(cleanData);
            });
          } catch (e) {
            console.error(`Error calculating indicator ${ind.id}:`, e);
          }
        });
      });
    };

    if (forceImmediate) {
      if (indicatorDebounceRef.current !== null) {
        window.clearTimeout(indicatorDebounceRef.current);
        indicatorDebounceRef.current = null;
      }
      runUpdate();
      return;
    }

    // Debounce indicator recalculation during rapid ticking
    if (indicatorDebounceRef.current !== null) return;
    indicatorDebounceRef.current = window.setTimeout(() => {
      indicatorDebounceRef.current = null;
      runUpdate();
    }, 120);
  }, [activeIndicators]);

  // Cleanup indicator debounce on unmount
  useEffect(() => {
    return () => {
      if (indicatorDebounceRef.current !== null) {
        window.clearTimeout(indicatorDebounceRef.current);
      }
    };
  }, []);

  // Update data - split into fast tick path vs full reset path
  useEffect(() => {
    if (!seriesRef.current) return;
    const data = effectiveData;
    const currentIndex = effectiveCurrentIndex;
    
    if (data.length === 0) {
      clearTimestampCache();
      displayToRawTimeRef.current.clear();
      renderedTradesRef.current = [];
      renderedNewsItemsRef.current = [];
      committedNewsItemsRef.current = [];
      newsIndexMapRef.current = null;
      newsIndexMapDataRef.current = null;
      newsIndexMapLenRef.current = -1;
      setRenderedTrades([]);
      setRenderedNewsItems([]);
      seriesRef.current.setData([]);
      whitespaceSeriesRef.current?.setData([]);
      activeIndicators.forEach(ind => {
        const seriesMap = indicatorSeriesRefs.current[ind.id];
        if (seriesMap) {
          (Object.values(seriesMap) as ISeriesApi<"Line">[]).forEach(series => series.setData([]));
        }
      });
      lastRenderedIndexRef.current = -1;
      lastDataLengthRef.current = 0;
      lastVisibleCandleSignatureRef.current = '';
      return;
    }

    const currentVisibleCandle = data[currentIndex];
    const currentVisibleCandleSignature = currentVisibleCandle
      ? [
          currentVisibleCandle.timestamp,
          currentVisibleCandle.open,
          currentVisibleCandle.high,
          currentVisibleCandle.low,
          currentVisibleCandle.close,
          currentVisibleCandle.volume,
        ].join('|')
        : '';

    const shouldResetSeriesData =
      data.length !== lastDataLengthRef.current
      || currentIndex < lastRenderedIndexRef.current
      || lastRenderedIndexRef.current === -1;

    const shouldUpdateVisibleCandle =
      !shouldResetSeriesData
      && currentIndex === lastRenderedIndexRef.current
      && data.length === lastDataLengthRef.current
      && currentVisibleCandleSignature !== lastVisibleCandleSignatureRef.current;

    // FORWARD JUMP PATH — cursor moved forward (e.g., Go To session/date,
    // day navigation, or a control-panel step) without the loaded data changing.
    // The normal reset path (`shouldResetSeriesData`) only fires when data
    // length changes or the cursor moves backward; the single-candle path
    // (`shouldUpdateVisibleCandle`) only fires when the same bar's OHLC mutated.
    // Without this branch, forward jumps within already-loaded data would leave
    // the chart frozen at the old viewport position — exactly the "@@nothing
    // happens when i jump to session" symptom — because no condition matched.
    // For large leaps (more than HALF_FULL_RESET_THRESHOLD bars), fall back to
    // the full setData path; calling series.update() per candle costs ~O(newBars)
    // and gets undesirable past a few thousand new bars.
    const HALF_FULL_RESET_THRESHOLD = 5000;
    const shouldShowForwardJump =
      !shouldResetSeriesData
      && !shouldUpdateVisibleCandle
      && currentIndex > lastRenderedIndexRef.current
      && data.length === lastDataLengthRef.current
      && (currentIndex - lastRenderedIndexRef.current) <= HALF_FULL_RESET_THRESHOLD;

    // If the leap is too big for incremental updates, replace the reset flag's
    // last clause so the legacy full-reset path picks it up instead.
    const shouldResetSeriesDataWithBigLeap =
      shouldResetSeriesData
      || (!shouldResetSeriesData
          && !shouldUpdateVisibleCandle
          && !shouldShowForwardJump
          && currentIndex > lastRenderedIndexRef.current
          && data.length === lastDataLengthRef.current
          && (currentIndex - lastRenderedIndexRef.current) > HALF_FULL_RESET_THRESHOLD);


if (shouldResetSeriesDataWithBigLeap) {
      // FULL RESET PATH
      // Data structure changed, jumped backwards, or first paint.

      const visibleDataSlice = data.slice(0, currentIndex + 1);
      const mapLen = visibleDataSlice.length;
      const CHUNK_SIZE = 5000;

      // Build ordinal timeline if gap compression is enabled
      const ordinalTimeline = compressGaps && visibleDataSlice.length > 0
        ? buildContinuousTimeline(
            visibleDataSlice[0].timestamp,
            visibleDataSlice[visibleDataSlice.length - 1].timestamp,
          )
        : null;

      const getChartTime = (d: { timestamp: number }, index: number): any => {
        if (ordinalTimeline) {
          const ordinal = ordinalTimeline.realToOrdinal.get(d.timestamp);
          if (ordinal !== undefined) {
            return ordinal;
          }
        }
        return timestampMsToChartTime(d.timestamp, chartTimezone) as any;
      };

      const buildDisplaySeriesDataChunked = async (): Promise<{ seriesData: any[]; rawMap: Map<number, number> }> => {
        if (mapLen <= CHUNK_SIZE) {
          const seriesData = visibleDataSlice.map((d, i) => ({
            time: getChartTime(d, i),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume,
          }));
          const rawMap = new Map<number, number>();
          visibleDataSlice.forEach((d, i) => {
            rawMap.set(getChartTime(d, i), Math.floor(d.timestamp / 1000));
          });
          return { seriesData, rawMap };
        }

        // Large array — chunk across frames to avoid main-thread freeze
        const result: any[] = new Array(mapLen);
        const rawMap = new Map<number, number>();
        const rawData = visibleDataSlice;

        for (let start = 0; start < mapLen; start += CHUNK_SIZE) {
          const end = Math.min(start + CHUNK_SIZE, mapLen);
          await new Promise<void>((resolve) => {
            if (typeof requestAnimationFrame !== 'undefined') {
              requestAnimationFrame(() => resolve());
            } else {
              setTimeout(resolve, 0);
            }
          });

          for (let i = start; i < end; i++) {
            const d = rawData[i];
            const cTime = getChartTime(d, i);
            result[i] = {
              time: cTime,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
              volume: d.volume,
            };
            rawMap.set(cTime, Math.floor(d.timestamp / 1000));
          }
        }

        return { seriesData: result, rawMap };
      };

buildDisplaySeriesDataChunked().then(({ seriesData, rawMap }) => {
        displayToRawTimeRef.current = rawMap;
        seriesRef.current!.setData(seriesData as any);

        lastRenderedIndexRef.current = currentIndex;
        lastDataLengthRef.current = data.length;
        lastVisibleCandleSignatureRef.current = currentVisibleCandleSignature;

        if (shouldResetViewportRef.current && chartRef.current && seriesData.length > 0) {
          const timeScale = chartRef.current.timeScale();
          const existingRange = timeScale.getVisibleLogicalRange();

          if (existingRange && (existingRange.to - existingRange.from) > 5) {
            const span = existingRange.to - existingRange.from;
            timeScale.setVisibleLogicalRange({
              from: Math.max(0, currentIndex + rightPaddingBars - span),
              to: currentIndex + rightPaddingBars,
            });
          } else {
            const barsBefore = Math.max(60, Math.min(currentIndex, 180));
            timeScale.setVisibleLogicalRange({
              from: Math.max(0, currentIndex - barsBefore),
              to: Math.max(currentIndex + rightPaddingBars, 60),
            });
          }
          shouldResetViewportRef.current = false;
        }

        recalculateIndicators(true);
        scheduleOverlayRender();
      });
return;
    }

    const ordinalTimelineForUpdates = compressGaps && data.length > 1
      ? buildContinuousTimeline(
          data[0].timestamp,
          data[data.length - 1].timestamp,
        )
      : null;

    const getUpdateChartTime = (d: { timestamp: number }, index: number): any => {
      if (ordinalTimelineForUpdates) {
        const ordinal = ordinalTimelineForUpdates.realToOrdinal.get(d.timestamp);
        if (ordinal !== undefined) {
          return ordinal;
        }
      }
      return timestampMsToChartTime(d.timestamp, chartTimezone) as any;
    };

    if (shouldUpdateVisibleCandle && currentVisibleCandle) {
      const chartTime = getUpdateChartTime(currentVisibleCandle, currentIndex);
      displayToRawTimeRef.current.set(chartTime, Math.floor(currentVisibleCandle.timestamp / 1000));
      try {
        seriesRef.current.update({
          time: chartTime,
          open: currentVisibleCandle.open,
          high: currentVisibleCandle.high,
          low: currentVisibleCandle.low,
          close: currentVisibleCandle.close,
          volume: currentVisibleCandle.volume,
        } as any);
      } catch {
        // Stale or duplicate timestamp — ignore; next full reset will reconcile.
      }

      recalculateIndicators(false);
    }

    if (shouldShowForwardJump) {
      // FORWARD JUMP — cursor advanced past the previously rendered bar with
      // unchanged data length. Stream the new candles into the series via
      // `series.update(...)` (cheap, incremental) and scroll the chart so that
      // the cursor sits at the right edge with `rightPaddingBars` of padding.
      // Using `scrollToPosition` preserves the user's existing zoom level — only
      // the horizontal scroll moves, matching the FXreplay "@@just jump forward
      // to data, keep the zoom like it was" expectation.
      const startIndex = lastRenderedIndexRef.current + 1;
      const endIndex = currentIndex;
      for (let i = startIndex; i <= endIndex; i++) {
        const d = data[i];
        if (!d) continue;
        const chartTime = getUpdateChartTime(d, i);
        displayToRawTimeRef.current.set(chartTime, Math.floor(d.timestamp / 1000));
        try {
          seriesRef.current.update({
            time: chartTime,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume,
          } as any);
        } catch {
          // Stale or duplicate timestamp — skip this candle; the next full
          // setData reset will reconcile the series.
        }
      }

      // Pan so the cursor bar sits at the right edge with `rightPaddingBars`
      // of whitespace to its right. `false` => no animation. This keeps the
      // user's zoom level untouched, only the horizontal scroll changes.
      if (chartRef.current) {
        const timeScale = chartRef.current.timeScale();
        const visibleRange = timeScale.getVisibleLogicalRange();

        let shouldScroll = true;
        // Only restrict scrolling during active playback.
        // If playback is paused (manual step or jump), we always want to scroll/center.
        if (session?.isPlaying && visibleRange) {
          // If the user has scrolled away (either back in time OR ahead into future whitespace),
          // do not forcibly reset or snap their viewport/scale on playback ticks.
          const desiredRight = currentIndex + rightPaddingBars;
          const tolerance = 5;
          const isAtTrackingEdge = Math.abs(visibleRange.to - desiredRight) <= tolerance;
          const isCursorLeavingRight = currentIndex >= visibleRange.to - 2;

          if (!isAtTrackingEdge && !isCursorLeavingRight) {
            shouldScroll = false;
          }
        }

        if (shouldScroll && visibleRange) {
          // Recenter or follow the cursor with `rightPaddingBars` of whitespace to its
          // right, preserving the user's zoom (bar span) via setVisibleLogicalRange.
          const span = Math.max(20, visibleRange.to - visibleRange.from);
          const targetTo = currentIndex + rightPaddingBars;
          if (Math.abs(visibleRange.to - targetTo) >= 1) {
            timeScale.setVisibleLogicalRange({
              from: targetTo - span,
              to: targetTo,
            });
          }
        }
      }

      recalculateIndicators(false);
    }

    if (!shouldResetSeriesDataWithBigLeap) {
      lastRenderedIndexRef.current = currentIndex;
      lastDataLengthRef.current = data.length;
      lastVisibleCandleSignatureRef.current = currentVisibleCandleSignature;
      scheduleOverlayRender();
    }

  }, [effectiveData, effectiveCurrentIndex, activeIndicators, indicatorSeriesVersion, chartTimezone, rightPaddingBars, scheduleOverlayRender, recalculateIndicators, session]);


  useEffect(() => {
    if (!tradeMarkersRef.current) return;

    const visibleLength = effectiveCurrentIndex + 1;
    const markers = trades.flatMap((trade) => {
      const result: Array<Record<string, unknown>> = [];

      if (trade.status === 'pending' && trade.orderTime) {
        const markerTime = resolveMarkerTime(trade.orderTime, effectiveData, chartTimezone, visibleLength);
        if (markerTime !== null) {
          result.push({
            id: `${trade.id}-pending`,
            time: markerTime,
            position: trade.type === 'buy' ? 'belowBar' : 'aboveBar',
            color: trade.type === 'buy' ? '#3f8f62' : '#b75a4b',
            shape: 'square',
            text: `${trade.type === 'buy' ? 'Buy' : 'Sell'} Pending`,
          });
        }
      }

      if (trade.entryTime) {
        const markerTime = resolveMarkerTime(trade.entryTime, effectiveData, chartTimezone, visibleLength);
        if (markerTime !== null) {
          result.push({
            id: `${trade.id}-entry`,
            time: markerTime,
            position: trade.type === 'buy' ? 'belowBar' : 'aboveBar',
            color: trade.type === 'buy' ? '#3f8f62' : '#b75a4b',
            shape: trade.type === 'buy' ? 'arrowUp' : 'arrowDown',
            text: `${trade.type === 'buy' ? 'Buy' : 'Sell'} ${trade.size}`,
          });
        }
      }

      if (trade.status === 'closed' && trade.exitTime) {
        const markerTime = resolveMarkerTime(trade.exitTime, effectiveData, chartTimezone, visibleLength);
        if (markerTime !== null) {
          result.push({
            id: `${trade.id}-exit`,
            time: markerTime,
            position: trade.type === 'buy' ? 'aboveBar' : 'belowBar',
            color: (trade.pnl ?? 0) >= 0 ? '#3f8f62' : '#b75a4b',
            shape: 'circle',
            text: `Exit ${(trade.pnl ?? 0) >= 0 ? '+' : ''}${(trade.pnl ?? 0).toFixed(0)}`,
          });
        }
      }

      return result;
    });

    const sortedMarkers = markers.sort((a, b) => Number(a.time) - Number(b.time));
    const sig = `${sortedMarkers.map((m) => `${m.id}-${m.time}`).join(';')}|${chartTimezone}`;
    if (sig === lastTradeMarkersSigRef.current) return;
    lastTradeMarkersSigRef.current = sig;

    tradeMarkersRef.current.setMarkers(sortedMarkers as any);
  }, [trades, effectiveData, effectiveCurrentIndex, chartTimezone]);

  useEffect(() => {
    if (!session?.instrument || !currentWeekRange) {
      setNews([]);
      setNewsError(null);
      setNewsLoading(false);
      return;
    }

    // Use stable week range start & end with some padding (e.g., 3 days before and after)
    const from = new Date(currentWeekRange.startTs - 3 * DAY_MS).toISOString();
    const to = new Date(currentWeekRange.endTs + 3 * DAY_MS).toISOString();
    let cancelled = false;

    setNewsLoading(true);
    setNewsError(null);

    newsService.fetch(session.instrument, from, to)
      .then((items) => {
        if (!cancelled) {
          if (DEV_DIAGNOSTICS) {
            console.log(`[News] Fetched ${items.length} items for ${session.instrument}`);
          }
          setNews(items);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNewsError(getErrorMessage(error, 'Failed to load news'));
          setNews([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setNewsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.instrument, currentWeekRange?.startKey, currentWeekRange?.endKey]);

  useEffect(() => {
    if (!newsMarkersRef.current || !chartTimezone) return;
    const markers: any[] = [];
    const currentTs = replayTimestampRef.current ?? 0;
    for (const event of visibleNews) {
      if (!event.timestamp || event.timestamp > currentTs) continue;
      const resolvedTs = resolveVisibleTimestamp(event.timestamp, effectiveData);
      if (resolvedTs === null) continue;
      const time = timestampMsToChartTime(resolvedTs, chartTimezone);
      const color = getImpactColor(event.impact);
      const eventName = event.event.slice(0, 18);
      markers.push({
        time,
        position: 'aboveBar',
        color,
        shape: 'circle',
        text: eventName,
        size: 1,
      });
    }
    const sig = `${markers.map((m) => `${m.time}-${m.text}`).join(';')}|${chartTimezone}`;
    if (sig === lastNewsMarkersSigRef.current) return;
    lastNewsMarkersSigRef.current = sig;

    newsMarkersRef.current.setMarkers(markers);
  }, [visibleNews, effectiveData, chartTimezone, currentReplayTimestamp]);

  useEffect(() => {
    if (!captureRequestId || !chartRef.current || !onCaptureReady) return;
    if (captureRequestId === lastCaptureRequestIdRef.current) return;
    lastCaptureRequestIdRef.current = captureRequestId;

    const capture = async () => {
      try {
        const baseCanvas = chartRef.current!.takeScreenshot(true, false);
        const composite = document.createElement('canvas');
        composite.width = baseCanvas.width;
        composite.height = baseCanvas.height;
        const ctx = composite.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(baseCanvas, 0, 0);

        onCaptureReady(composite.toDataURL('image/jpeg', 0.95));
      } catch (error) {
        console.error('Failed to capture chart screenshot:', error);
      }
    };

    void capture();
  }, [captureRequestId, onCaptureReady, renderedTrades, renderedNewsItems]);

  const sessionDataState = session?.dataState;
  const emptyDataMessage = !overrideData
    && session
    && effectiveData.length === 0
    && !sessionDataState?.isLoading
    && !sessionDataState?.isHydrating
    && !sessionDataState?.isViewportLoading
      ? sessionDataState?.error || 'No market data available for this period'
      : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-transparent">
      <div
        ref={chartContainerRef}
        className="absolute inset-0 z-0"
        style={{
          // Opaque base under the (possibly transparent) chart canvas. A
          // transparent canvas forces the browser to composite every chart
          // repaint through the fixed decorative layers behind it (body
          // gradients, the #root grid/sweep, film-grain). Firefox does this
          // blending on the CPU and it shows up as chart lag, while Chromium
          // GPU-composites it for free. An opaque backing box occludes those
          // layers so only the chart itself repaints.
          backgroundColor: chartColors.background !== 'transparent'
            ? chartColors.background
            : 'var(--app-bg)',
          backgroundImage: chartColors.background.startsWith('linear-gradient(')
            ? chartColors.background
            : undefined,
        }}
      />
      
      {session && (
        <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
          <span className="select-none text-5xl font-semibold uppercase tracking-[0.35em] text-[rgba(29,20,8,0.06)] blur-[0.2px]">
            {session.instrument} {session.timeframe}
          </span>
        </div>
      )}

      {emptyDataMessage && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6 pointer-events-none">
          <div className="max-w-md rounded-lg border border-[var(--border-soft)] bg-[var(--surface-overlay)] px-4 py-3 text-center text-sm font-medium text-[var(--text-primary)] shadow-md ">
            {emptyDataMessage}
          </div>
        </div>
      )}

      {hoveredNewsItem && (
        <div
          className="pointer-events-none absolute z-30 w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] shadow-lg "
          style={{
            left: Math.max(8, Math.min((chartContainerRef.current?.clientWidth ?? 0) - 292, hoveredNewsItem.x + 14)),
            top: Math.max(10, (hoveredNewsItem.kind === 'future-line' ? 18 : hoveredNewsItem.y) + 14),
          }}
        >
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-3 py-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                {hoveredNewsItem.item.currency} | {getImpactLabel(hoveredNewsItem.item.impact)} Impact
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                {formatTimestampInTimeZone(hoveredNewsItem.item.timestamp, chartTimezone, {
                  weekday: 'short',
                  month: 'short',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
              </div>
            </div>
            <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${getImpactColor(hoveredNewsItem.item.impact)}22`, color: getImpactColor(hoveredNewsItem.item.impact) }}>
              {getImpactLabel(hoveredNewsItem.item.impact)}
            </span>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-sm font-medium text-[var(--text-primary)]">{hoveredNewsItem.item.event}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-[var(--text-secondary)]">
              <div>
                <div className="uppercase tracking-[0.14em] text-[var(--text-muted)]">Actual</div>
                <div className="mt-0.5 text-[var(--text-primary)]">{hoveredNewsItem.item.actual || '-'}</div>
              </div>
              <div>
                <div className="uppercase tracking-[0.14em] text-[var(--text-muted)]">Forecast</div>
                <div className="mt-0.5 text-[var(--text-primary)]">{hoveredNewsItem.item.forecast || '-'}</div>
              </div>
              <div>
                <div className="uppercase tracking-[0.14em] text-[var(--text-muted)]">Previous</div>
                <div className="mt-0.5 text-[var(--text-primary)]">{hoveredNewsItem.item.previous || '-'}</div>
              </div>
            </div>
            {hoveredNewsItem.item.detail && (
              <div className="mt-2 line-clamp-4 text-[10px] leading-4 text-[var(--text-secondary)]">{hoveredNewsItem.item.detail}</div>
            )}
          </div>
        </div>
      )}

      {/* Interactive Order Tooltip Card */}
      {hoveredTradeItem && (
        <div
          onMouseEnter={() => {
            isMouseOverTradeTooltipRef.current = true;
          }}
          onMouseLeave={() => {
            isMouseOverTradeTooltipRef.current = false;
            setHoveredTradeItem(null);
          }}
        >
          <OrderTooltipCard
            trade={hoveredTradeItem.trade}
            instrument={session?.instrument ?? 'eurusd'}
            currentPrice={effectiveData[effectiveCurrentIndex]?.close ?? 0}
            x={hoveredTradeItem.x}
            y={hoveredTradeItem.y}
            containerWidth={chartContainerRef.current?.clientWidth ?? 800}
            containerHeight={chartContainerRef.current?.clientHeight ?? 600}
            onCloseTooltip={() => setHoveredTradeItem(null)}
            onModifyTrade={(tradeId, updates) => {
              useSimulatorStore.getState().modifyOrder(tradeId, updates);
              scheduleOverlayRender();
            }}
            onCancelOrder={(tradeId) => {
              useSimulatorStore.getState().cancelOrder(tradeId);
              scheduleOverlayRender();
            }}
            onCloseTrade={(tradeId) => {
              useSimulatorStore.getState().closeTrade(tradeId);
              scheduleOverlayRender();
            }}
          />
        </div>
      )}

      {/* Real-time Interactive Order Draft Preview & Drag-to-Adjust Lines */}
      <ChartOrderDraftOverlay
        chartApi={chartRef.current}
        seriesRef={seriesRef}
        containerRef={chartContainerRef}
      />

      {(isNewsPanelOpen ?? storeIsNewsPanelOpen) && (
        <ChartNewsPanel
          news={visibleNews}
          newsView={newsView}
          chartTimezone={chartTimezone}
          isLoading={newsLoading}
          error={newsError}
          onChangeView={setNewsView}
          onClose={() => {
            if (onCloseNewsPanel) {
              onCloseNewsPanel();
            } else {
              setStoreIsNewsPanelOpen(false);
            }
          }}
        />
      )}

      {smartLoadHint && (
        <div className="absolute left-16 top-20 z-20 pointer-events-none">
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] px-3 py-1.5 text-[11px] text-[var(--text-primary)] shadow-md ">
            {smartLoadHint}
          </div>
        </div>
      )}

      {contextMenu && (
        <div 
          className="absolute z-50 w-44 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-overlay)] py-1 shadow-lg "
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button 
            className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)] font-medium" 
            onClick={() => {
              const chart = chartRef.current;
              if (!chart) return;
              
              const activeSession = sessionRef.current;
              const curIdx = activeSession?.currentIndex ?? effectiveCurrentIndexRef.current ?? 0;
              const barsBefore = Math.max(60, Math.min(curIdx, 180));
              
              chart.timeScale().fitContent();
              chart.timeScale().resetTimeScale();
              chart.timeScale().setVisibleLogicalRange({
                from: Math.max(0, curIdx - barsBefore),
                to: Math.max(curIdx + rightPaddingBars, 60),
              });
              
              chart.applyOptions({
                handleScroll: true, 
                handleScale: true,
                rightPriceScale: { 
                  autoScale: true,
                  scaleMargins: { top: 0.1, bottom: 0.1 },
                },
              });
              
              try {
                chart.priceScale('right').applyOptions({ autoScale: true });
              } catch {}
              
              if (seriesRef.current) {
                seriesRef.current.applyOptions({});
              }
              
              priceScaleLockedRef.current = false;
              shouldResetViewportRef.current = false;
              setContextMenu(null);
            }}
          >
            Reset Scale
          </button>
          <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Go To
          </div>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            goToSession('asia-open');
            setContextMenu(null);
          }}>Asia Open</button>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            goToSession('london-open');
            setContextMenu(null);
          }}>London Open</button>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            goToSession('new-york-open');
            setContextMenu(null);
          }}>New York Open</button>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            goToSession('equities-open');
            setContextMenu(null);
          }}>Equities Open</button>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            goToSession('pm-session');
            setContextMenu(null);
          }}>PM Session</button>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            startOrderDraftRef.current('buy', 'limit', contextMenu.price);
            setContextMenu(null);
          }}>Limit Buy</button>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            startOrderDraftRef.current('sell', 'limit', contextMenu.price);
            setContextMenu(null);
          }}>Limit Sell</button>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            startOrderDraftRef.current('buy', 'stop', contextMenu.price);
            setContextMenu(null);
          }}>Stop Buy</button>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            startOrderDraftRef.current('sell', 'stop', contextMenu.price);
            setContextMenu(null);
          }}>Stop Sell</button>
          <button className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]" onClick={() => {
            onOpenSettings?.();
            setContextMenu(null);
          }}>Settings</button>
        </div>
      )}
    </div>
  );
};

function createDrawingInstance(obj: DrawingObject, mappedPoints?: DrawingPoint[]): Drawings.Drawing | null {
  const points = (mappedPoints || obj.points) as any[];
  let inst: Drawings.Drawing | null = null;

  try {
    switch (obj.tool) {
      case 'trendline':
        inst = new Drawings.TrendLine(obj.id, points);
        break;
      case 'ray':
        inst = new Drawings.Ray(obj.id, points);
        break;
      case 'extendedLine':
        inst = new Drawings.ExtendedLine(obj.id, points);
        break;
      case 'arrow':
        inst = new Drawings.Arrow(obj.id, points);
        break;
      case 'horizontalLine':
        inst = new Drawings.HorizontalLine(obj.id, points);
        break;
      case 'verticalLine':
        inst = new Drawings.VerticalLine(obj.id, points);
        break;
      case 'rectangle':
        inst = new Drawings.Rectangle(obj.id, points);
        break;
      case 'fibRetracement':
        inst = new Drawings.FibRetracement(obj.id, points);
        break;
      case 'brush':
        inst = new Drawings.Brush(obj.id, points);
        break;
      case 'longPosition':
        inst = new Drawings.LongPosition(obj.id, points);
        break;
      case 'shortPosition':
        inst = new Drawings.ShortPosition(obj.id, points);
        break;
      case 'parallelChannel':
        inst = new Drawings.ParallelChannel(obj.id, points);
        break;
      case 'callout':
        inst = new Drawings.Callout(obj.id, points);
        break;
      case 'text':
        inst = new Drawings.TextAnnotation(obj.id, points);
        break;
      case 'anchoredNote':
        inst = new Drawings.AnchoredText(obj.id, points);
        break;
      case 'marker':
        inst = new Drawings.ArrowMarker(obj.id, points);
        break;
      case 'horizontalRay':
        inst = new Drawings.HorizontalRay(obj.id, points);
        break;
      case 'trendAngle':
        inst = new Drawings.TrendAngle(obj.id, points);
        break;
      case 'infoLine':
        inst = new Drawings.InfoLine(obj.id, points);
        break;
      case 'rotatedRectangle':
        inst = new Drawings.RotatedRectangle(obj.id, points);
        break;
      case 'ellipse':
        inst = new Drawings.Ellipse(obj.id, points);
        break;
      case 'circle':
        inst = new Drawings.Circle(obj.id, points);
        break;
      case 'triangle':
        inst = new Drawings.Triangle(obj.id, points);
        break;
      case 'disjointChannel':
        inst = new Drawings.DisjointChannel(obj.id, points);
        break;
      case 'flatTopBottom':
        inst = new Drawings.FlatTopBottom(obj.id, points);
        break;
      case 'highlighter':
        inst = new Drawings.Highlighter(obj.id, points);
        break;
      case 'polyline':
        inst = new Drawings.Polyline(obj.id, points);
        break;
      case 'path':
        inst = new Drawings.Path(obj.id, points);
        break;
      case 'curve':
        inst = new Drawings.Curve(obj.id, points);
        break;
      case 'doubleCurve':
        inst = new Drawings.DoubleCurve(obj.id, points);
        break;
      case 'fibExtension':
        inst = new Drawings.FibExtension(obj.id, points);
        break;
      case 'fibChannel':
        inst = new Drawings.FibChannel(obj.id, points);
        break;
      case 'fibSpeedFan':
        inst = new Drawings.FibSpeedFan(obj.id, points);
        break;
      case 'fibTimeExtension':
        inst = new Drawings.FibTimeExtension(obj.id, points);
        break;
      case 'fibTimeZone':
        inst = new Drawings.FibTimeZone(obj.id, points);
        break;
      case 'fibCircles':
        inst = new Drawings.FibCircles(obj.id, points);
        break;
      case 'fibArcs':
        inst = new Drawings.FibArcs(obj.id, points);
        break;
      case 'fibWedge':
        inst = new Drawings.FibWedge(obj.id, points);
        break;
      case 'fibSpiral':
        inst = new Drawings.FibSpiral(obj.id, points);
        break;
      case 'gannBox':
        inst = new Drawings.GannBox(obj.id, points);
        break;
      case 'gannFan':
        inst = new Drawings.GannFan(obj.id, points);
        break;
      case 'gannSquare':
        inst = new Drawings.GannSquare(obj.id, points);
        break;
      case 'gannSquareFixed':
        inst = new Drawings.GannSquareFixed(obj.id, points);
        break;
      case 'andrewsPitchfork':
        inst = new Drawings.AndrewsPitchfork(obj.id, points);
        break;
      case 'schiffPitchfork':
        inst = new Drawings.SchiffPitchfork(obj.id, points);
        break;
      case 'modifiedSchiffPitchfork':
        inst = new Drawings.ModifiedSchiffPitchfork(obj.id, points);
        break;
      case 'insidePitchfork':
        inst = new Drawings.InsidePitchfork(obj.id, points);
        break;
      case 'measure':
        inst = new Drawings.DatePriceRange(obj.id, points);
        break;
      case 'dateRange':
        inst = new Drawings.DateRange(obj.id, points);
        break;
      case 'priceRange':
        inst = new Drawings.PriceRange(obj.id, points);
        break;
      case 'forecast':
        inst = new Drawings.Forecast(obj.id, points);
        break;
      case 'projection':
        inst = new Drawings.Projection(obj.id, points);
        break;
      case 'regressionTrend':
        inst = new Drawings.RegressionTrend(obj.id, points);
        break;
      case 'comment':
        inst = new Drawings.Comment(obj.id, points);
        break;
      case 'priceLabel':
        inst = new Drawings.PriceLabel(obj.id, points);
        break;
      case 'priceNote':
        inst = new Drawings.PriceNote(obj.id, points);
        break;
      case 'arrowMarker':
        inst = new Drawings.ArrowMarker(obj.id, points);
        break;
      case 'flagMark':
        inst = new Drawings.FlagMark(obj.id, points);
        break;
      case 'signpost':
        inst = new Drawings.Signpost(obj.id, points);
        break;
      default:
        inst = new Drawings.TrendLine(obj.id, points);
        break;
    }

    if (inst) {
      applyDrawingStylesAndOptions(inst, obj);
    }
  } catch (err) {
    console.error(`Failed to instantiate drawing for tool: ${obj.tool}`, err);
  }

  return inst;
}

export function applyDrawingStylesAndOptions(inst: any, obj: DrawingObject) {
  if (!inst) return;
  try {
    let lineDash: number[] = [];
    if (obj.style.strokeStyle === 'dashed') lineDash = [6, 6];
    else if (obj.style.strokeStyle === 'dotted') lineDash = [2, 2];

    const newStyle = {
      lineColor: obj.style.strokeColor || '#3b82f6',
      lineWidth: obj.style.strokeWidth || 2,
      lineDash,
      fillColor: bakeFillOpacity(obj.style.fillColor || obj.style.strokeColor, obj.style.fillOpacity),
      fillOpacity: obj.style.fillOpacity ?? 0.2,
      showLabels: obj.style.showLabels ?? true,
      labelColor: obj.style.textColor || obj.style.strokeColor || '#3b82f6',
      fontSize: obj.style.fontSize || 12,
    };

    if (inst.updateStyle) {
      inst.updateStyle(newStyle);
    }
    if (inst.setTrendLineOptions) {
      inst.setTrendLineOptions({
        extendLeft: obj.style.extendLeft ?? false,
        extendRight: obj.style.extendRight ?? false,
        showPriceLabels: obj.style.showPrices ?? false,
        showPriceChange: obj.style.showStats ?? true,
        showPercentChange: obj.style.showStats ?? true,
      });
    }
    if (inst.setRectangleOptions) {
      inst.setRectangleOptions({
        extendLeft: obj.style.extendLeft ?? false,
        extendRight: obj.style.extendRight ?? false,
        filled: (obj.style.fillOpacity ?? 0.2) > 0,
        showDimensions: obj.style.showStats ?? true,
      });
    }
    if (inst.setFibOptions && obj.style.fibLevels) {
      inst.setFibOptions({
        levels: obj.style.fibLevels,
        showPrices: obj.style.showPrices ?? true,
        showPercentages: obj.style.showLabels ?? true,
        extendLines: obj.style.extendRight ?? false,
      });
    }
    if (inst.setPositionOptions) {
      inst.setPositionOptions({
        showPrices: obj.style.showPrices ?? true,
        showPercentage: obj.style.showLabels ?? true,
        showRiskReward: obj.style.showStats ?? true,
        showPnL: true,
      });
    }
    if (inst.setText && obj.text) {
      inst.setText(obj.text);
    }
    if (inst.updateOptions) {
      inst.updateOptions({
        visible: !obj.hidden,
        locked: obj.locked,
        zIndex: obj.zIndex || 0,
        extendLeft: obj.style.extendLeft ?? false,
        extendRight: obj.style.extendRight ?? false,
      });
    }
  } catch (err) {
    console.warn(`Error applying drawing styles for ${obj.id}:`, err);
  }
}

export default TradingViewChart;

