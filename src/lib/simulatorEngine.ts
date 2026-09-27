import { findCandleIndexByTimestamp, getTimeframeIntervalMs, mergeCandles, sortAndDeduplicateCandles, auraTimeframeToDukascopy } from './timeframe';
import { dayBoundaryMs, type ChartTimezone } from './timezone';
import { computeTradePnL, computeTradeExcursion, getPipSize } from './orders';
import { audioFX } from './audioFX';

export interface ScaleOutTarget {
  id: string;
  price: number;
  sizePct: number;
  executed: boolean;
  executedPrice?: number;
  executedTime?: number;
  pnl?: number;
}

export interface TrailingStopConfig {
  active: boolean;
  distancePips: number;
  peakPrice?: number;
}

export interface EngineCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EngineTrade {
  id: string;
  type: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop';
  limitPrice?: number;
  entryPrice?: number;
  exitPrice?: number;
  size: number;
  remainingSize?: number;
  riskPercent?: number;
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
  timeframe?: string;
  candles?: EngineCandle[];
}

export function sliceCandlesForReplay(
  data: EngineCandle[],
  entryTs: number,
  exitTs: number,
): EngineCandle[] {
  if (data.length === 0) return [];
  
  let entryRawIdx = findCandleIndexByTimestamp(data as any, entryTs);
  let exitRawIdx = findCandleIndexByTimestamp(data as any, exitTs);

  if (entryRawIdx > exitRawIdx) {
    [entryRawIdx, exitRawIdx] = [exitRawIdx, entryRawIdx];
  }

  const sliceStart = Math.max(0, entryRawIdx - 60);
  const sliceEnd = Math.min(data.length - 1, exitRawIdx + 30);
  return data.slice(sliceStart, sliceEnd + 1);
}

export type SessionLoadKind =
  | 'initial'
  | 'switch'
  | 'hydrate'
  | 'edge-before'
  | 'edge-after'
  | 'viewport'
  | 'manual'
  | null;

export interface SessionDataState {
  sourceTimeframe?: string;
  loadedFromTs?: number;
  loadedToTs?: number;
  coveredFromTs?: number;
  coveredToTs?: number;
  requestedFromTs?: number;
  requestedToTs?: number;
  absoluteFromTs?: number;
  absoluteToTs?: number;
  isLoading: boolean;
  isHydrating: boolean;
  isViewportLoading: boolean;
  progress: number;
  error: string | null;
  /**
   * Informational message surfaced to the user after a load (e.g., "No market
   * data exists on weekends. Displaying the next available trading session...").
   * Surfaces the engine's auto-recovery actions — never used for errors, which
   * are handled by `error`.
   */
  userMessage: string | null;
  /**
   * A non-fatal problem noticed *after* a successful load, e.g. "only the last
   * 3 days of this 30-day session could be loaded" or "the upstream download
   * looks incomplete". Unlike `error` this does not block the chart: there is
   * usable data, but the user should know it is not what they asked for.
   */
  dataWarning: string | null;
  activeLoadKind: SessionLoadKind;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface EngineSession<TCandle extends EngineCandle = EngineCandle, TTrade extends EngineTrade = EngineTrade> {
  instrument?: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  data: TCandle[];
  currentIndex: number;
  targetTimestamp?: number;
  isPlaying: boolean;
  balance: number;
  initialBalance: number;
  trades: TTrade[];
  dataState?: SessionDataState;
}

export interface DataStatePatch extends Partial<SessionDataState> {}

export type DataMergeMode = 'replace' | 'append' | 'prepend' | 'merge';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const APPROX_MONTH_MS = 30 * DAY_MS;

/**
 * Resolves a session date field to a millisecond boundary.
 *
 * A session's `startDate` is a *calendar day*, and which instant that day begins
 * at depends on the timezone it is being judged in. Passing `timeZone` resolves
 * it the way the chart does — the same zone the user sees the candles in — rather
 * than at UTC midnight.
 *
 * The asymmetry matters: the session loader builds the data window from this
 * function and `applySessionData` seeds the replay cursor from it, so if the two
 * disagree about the zone the cursor lands on the wrong candle. Both therefore
 * take the timezone from the same source.
 *
 * Omitting `timeZone` keeps the old UTC-midnight behaviour, which is what a bare
 * `YYYY-MM-DD` means to `new Date()`.
 */
export function toDateBoundary(dateText: string, endOfDay = false, timeZone?: ChartTimezone): number {
  if (timeZone !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return dayBoundaryMs(dateText, timeZone, endOfDay);
  }

  const ts = new Date(dateText).getTime();
  if (!Number.isFinite(ts)) {
    throw new Error(`Invalid session date: ${dateText}`);
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && endOfDay ? ts + DAY_MS : ts;
}

/**
 * Approximate wall-clock spacing of one candle, in milliseconds.
 *
 * Monthly has no fixed period, so it uses a nominal 30 days. Every other
 * timeframe uses its real period, including '1W'.
 *
 * This was previously duplicated with subtly different logic in
 * `TradingViewChart`, and both copies returned a *month* for '1W' — correct
 * only while 'mn1' was conflated with '1W', which it no longer is. One
 * definition now lives here and the chart imports it.
 */
export function getApproxIntervalMs(timeframe: string): number {
  if (timeframe === 'tick') return 1000;
  if (timeframe.startsWith('mn') || auraTimeframeToDukascopy(timeframe) === '1M') {
    return APPROX_MONTH_MS;
  }
  return getTimeframeIntervalMs(timeframe);
}

export function createEmptySessionDataState(): SessionDataState {
  return {
    isLoading: false,
    isHydrating: false,
    isViewportLoading: false,
    progress: 0,
    error: null,
    userMessage: null,
    dataWarning: null,
    activeLoadKind: null,
    hasMoreBefore: false,
    hasMoreAfter: false,
  };
}

export function deriveSessionDataState(base?: Partial<SessionDataState>): SessionDataState {
  const state: SessionDataState = {
    ...createEmptySessionDataState(),
    ...base,
  };

  const coveredFromTs = state.coveredFromTs ?? state.loadedFromTs;
  const coveredToTs = state.coveredToTs ?? state.loadedToTs;

  if (coveredFromTs !== undefined && state.absoluteFromTs !== undefined) {
    state.hasMoreBefore = coveredFromTs > state.absoluteFromTs;
  }

  if (coveredToTs !== undefined && state.absoluteToTs !== undefined) {
    state.hasMoreAfter = coveredToTs < state.absoluteToTs;
  }

  return state;
}

function areDataStatesEqual(left?: SessionDataState, right?: SessionDataState): boolean {
  if (left === right) return true;
  if (!left || !right) return false;

  return left.loadedFromTs === right.loadedFromTs
    && left.loadedToTs === right.loadedToTs
    && left.coveredFromTs === right.coveredFromTs
    && left.coveredToTs === right.coveredToTs
    && left.requestedFromTs === right.requestedFromTs
    && left.requestedToTs === right.requestedToTs
    && left.absoluteFromTs === right.absoluteFromTs
    && left.absoluteToTs === right.absoluteToTs
    && left.isLoading === right.isLoading
    && left.isHydrating === right.isHydrating
    && left.isViewportLoading === right.isViewportLoading
    && left.progress === right.progress
    && left.error === right.error
    && left.userMessage === right.userMessage
    && left.dataWarning === right.dataWarning
    && left.activeLoadKind === right.activeLoadKind
    && left.hasMoreBefore === right.hasMoreBefore
    && left.hasMoreAfter === right.hasMoreAfter;
}

function areCandlesEqual<T extends EngineCandle>(left: T[], right: T[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || !b) return false;
    if (
      a.timestamp !== b.timestamp
      || a.open !== b.open
      || a.high !== b.high
      || a.low !== b.low
      || a.close !== b.close
      || a.volume !== b.volume
    ) {
      return false;
    }
  }

  return true;
}

export function patchSessionDataState<T extends { dataState?: SessionDataState }>(
  session: T,
  patch: DataStatePatch,
): T {
  const nextDataState = deriveSessionDataState({
    ...session.dataState,
    ...patch,
  });

  if (areDataStatesEqual(session.dataState, nextDataState)) {
    return session;
  }

  return {
    ...session,
    dataState: nextDataState,
  };
}

export function applySessionData<T extends { data: TCandle[]; currentIndex: number; targetTimestamp?: number; lastReplayTimestamp?: number; startDate?: string; dataState?: SessionDataState }, TCandle extends EngineCandle>(
  session: T,
  incomingData: TCandle[],
  mode: DataMergeMode,
  patch: DataStatePatch = {},
  /**
   * Timezone the session's calendar days are judged in. Must be the same one the
   * loader used to build the data window, or the initial cursor lands on the
   * wrong candle.
   */
  timeZone?: ChartTimezone,
): T {
  const minDefined = (...values: Array<number | undefined>): number | undefined => {
    const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return finite.length ? Math.min(...finite) : undefined;
  };
  const maxDefined = (...values: Array<number | undefined>): number | undefined => {
    const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return finite.length ? Math.max(...finite) : undefined;
  };

  // DataFetcher already sorts, validates, and dedupes incoming data — no need
  // to re-process here. For 'replace' we use it as-is; for append/prepend
  // the ordered merge below handles overlap deduplication.
  const normalizedIncoming = incomingData;
  const combinedData = mode === 'replace'
    ? normalizedIncoming
    : mergeCandles(session.data, normalizedIncoming);

  const defaultStartTs = session.startDate ? toDateBoundary(session.startDate, false, timeZone) : undefined;
  const preserveTimestamp = mode === 'replace'
    ? session.targetTimestamp ?? session.lastReplayTimestamp ?? session.data[session.currentIndex]?.timestamp ?? defaultStartTs
    : session.data[session.currentIndex]?.timestamp ?? session.targetTimestamp;
  const nextIndex = combinedData.length > 0 && preserveTimestamp !== undefined
    ? findCandleIndexByTimestamp(combinedData, preserveTimestamp)
    : 0;
  const previousState = session.dataState;
  const loadedFromTs = combinedData[0]?.timestamp;
  const loadedToTs = combinedData[combinedData.length - 1]?.timestamp;
  const requestedFromTs = patch.requestedFromTs ?? previousState?.requestedFromTs;
  const requestedToTs = patch.requestedToTs ?? previousState?.requestedToTs;
  const previousCoveredFromTs = previousState?.coveredFromTs;
  const previousCoveredToTs = previousState?.coveredToTs;

  let coveredFromTs = patch.coveredFromTs;
  let coveredToTs = patch.coveredToTs;
  const hasCoverageSignal = coveredFromTs !== undefined
    || coveredToTs !== undefined
    || previousCoveredFromTs !== undefined
    || previousCoveredToTs !== undefined
    || requestedFromTs !== undefined
    || requestedToTs !== undefined;

  if (coveredFromTs === undefined || coveredToTs === undefined) {
    if (mode === 'replace') {
      coveredFromTs = coveredFromTs ?? requestedFromTs ?? loadedFromTs;
      coveredToTs = coveredToTs ?? requestedToTs ?? loadedToTs;
    } else if (mode === 'append') {
      coveredFromTs = coveredFromTs ?? previousCoveredFromTs ?? (hasCoverageSignal ? loadedFromTs : undefined);
      coveredToTs = coveredToTs ?? maxDefined(previousCoveredToTs, requestedToTs, hasCoverageSignal ? loadedToTs : undefined);
    } else if (mode === 'prepend') {
      coveredFromTs = coveredFromTs ?? minDefined(previousCoveredFromTs, requestedFromTs, hasCoverageSignal ? loadedFromTs : undefined);
      coveredToTs = coveredToTs ?? previousCoveredToTs ?? (hasCoverageSignal ? loadedToTs : undefined);
    } else {
      coveredFromTs = coveredFromTs ?? minDefined(previousCoveredFromTs, requestedFromTs, hasCoverageSignal ? loadedFromTs : undefined);
      coveredToTs = coveredToTs ?? maxDefined(previousCoveredToTs, requestedToTs, hasCoverageSignal ? loadedToTs : undefined);
    }
  }

  const nextDataState = deriveSessionDataState({
    ...session.dataState,
    ...patch,
    loadedFromTs,
    loadedToTs,
    coveredFromTs,
    coveredToTs,
  });

const nextTargetTimestamp = mode === 'replace' ? undefined : session.targetTimestamp;
      if (
        (mode === 'replace'
          ? false
          : areCandlesEqual(session.data, combinedData))
        && nextIndex === session.currentIndex
        && nextTargetTimestamp === session.targetTimestamp
        && areDataStatesEqual(session.dataState, nextDataState)
      ) {
        return session;
      }

  return {
    ...session,
    data: combinedData,
    currentIndex: nextIndex,
    targetTimestamp: nextTargetTimestamp,
    dataState: nextDataState,
  };
}

export interface AdvanceSessionResult<T> {
  session: T;
  advanced: boolean;
  reachedDataEnd: boolean;
  mayHaveMoreData: boolean;
}

export function advanceSessionPlayback<T extends EngineSession>(session: T): AdvanceSessionResult<T> {
  const { currentIndex, data, trades, balance } = session;
  const instrument = session.instrument;

  if (currentIndex >= data.length - 1) {
    const lastTimestamp = data[data.length - 1]?.timestamp;
    const sessionEndTs = toDateBoundary(session.endDate, true);
    const intervalMs = getApproxIntervalMs(session.timeframe);
    const dataState = deriveSessionDataState(session.dataState);
    const coveredToTs = dataState.coveredToTs ?? dataState.loadedToTs ?? lastTimestamp;
    const mayHaveMoreData = Boolean(
      dataState.isLoading
      || dataState.isHydrating
      || dataState.isViewportLoading
      || dataState.hasMoreAfter
      || (
        dataState.absoluteToTs === undefined
        && typeof lastTimestamp === 'number'
        && lastTimestamp < (sessionEndTs - intervalMs)
      )
      || (
        dataState.absoluteToTs !== undefined
        && typeof coveredToTs === 'number'
        && coveredToTs < dataState.absoluteToTs
      )
    );

    return {
      session: mayHaveMoreData ? session : { ...session, isPlaying: false },
      advanced: false,
      reachedDataEnd: true,
      mayHaveMoreData,
    };
  }

  const nextIndex = currentIndex + 1;
  const currentCandle = data[nextIndex];

  if (trades.length === 0) {
    return {
      session: {
        ...session,
        currentIndex: nextIndex,
      },
      advanced: true,
      reachedDataEnd: false,
      mayHaveMoreData: false,
    };
  }

  const hasActiveTrades = trades.some((trade) => trade.status === 'open' || trade.status === 'pending');
  if (!hasActiveTrades) {
    return {
      session: {
        ...session,
        currentIndex: nextIndex,
      },
      advanced: true,
      reachedDataEnd: false,
      mayHaveMoreData: false,
    };
  }

  let newBalance = balance;
  const updatedTrades = trades.map((trade) => {
    if (trade.status === 'closed' || trade.status === 'cancelled') return trade;

    let closePrice = 0;
    let shouldClose = false;
    let shouldExecute = false;
    let executePrice = 0;

    if (trade.status === 'pending' && trade.limitPrice) {
      if (trade.orderType === 'limit') {
        if (trade.type === 'buy' && currentCandle.low <= trade.limitPrice) {
          shouldExecute = true;
          executePrice = currentCandle.open < trade.limitPrice ? currentCandle.open : trade.limitPrice;
        } else if (trade.type === 'sell' && currentCandle.high >= trade.limitPrice) {
          shouldExecute = true;
          executePrice = currentCandle.open > trade.limitPrice ? currentCandle.open : trade.limitPrice;
        }
      } else if (trade.orderType === 'stop') {
        if (trade.type === 'buy' && currentCandle.high >= trade.limitPrice) {
          shouldExecute = true;
          executePrice = currentCandle.open > trade.limitPrice ? currentCandle.open : trade.limitPrice;
        } else if (trade.type === 'sell' && currentCandle.low <= trade.limitPrice) {
          shouldExecute = true;
          executePrice = currentCandle.open < trade.limitPrice ? currentCandle.open : trade.limitPrice;
        }
      }
    }

    if (shouldExecute) {
      audioFX.playOrderFilled();
      // Same-candle: check if SL or TP would also be hit on this candle
      const entryTrade: EngineTrade = {
        ...trade,
        status: 'open' as const,
        entryPrice: executePrice,
        entryTime: currentCandle.timestamp,
        timeframe: session.timeframe,
      };

      let sameBarClose = false;
      let sameBarClosePrice = 0;
      let hitTp = false;

      if (entryTrade.entryPrice !== undefined) {
        if (entryTrade.type === 'buy') {
          if (entryTrade.sl && currentCandle.low <= entryTrade.sl) {
            sameBarClose = true;
            sameBarClosePrice = currentCandle.open < entryTrade.sl ? currentCandle.open : entryTrade.sl;
          } else if (entryTrade.tp && currentCandle.high >= entryTrade.tp) {
            sameBarClose = true;
            hitTp = true;
            sameBarClosePrice = currentCandle.open > entryTrade.tp ? currentCandle.open : entryTrade.tp;
          }
        } else {
          if (entryTrade.sl && currentCandle.high >= entryTrade.sl) {
            sameBarClose = true;
            sameBarClosePrice = currentCandle.open > entryTrade.sl ? currentCandle.open : entryTrade.sl;
          } else if (entryTrade.tp && currentCandle.low <= entryTrade.tp) {
            sameBarClose = true;
            hitTp = true;
            sameBarClosePrice = currentCandle.open < entryTrade.tp ? currentCandle.open : entryTrade.tp;
          }
        }
      }

      if (sameBarClose) {
        if (hitTp) audioFX.playTakeProfitHit();
        else audioFX.playStopLossHit();

        const pnl = computeTradePnL(
          entryTrade.type,
          entryTrade.entryPrice!,
          sameBarClosePrice,
          entryTrade.size,
          instrument,
        );
        newBalance += pnl;
        const entryTs = entryTrade.entryTime ?? entryTrade.orderTime;
        const exitTs = currentCandle.timestamp;
        const replayCandles = sliceCandlesForReplay(data, entryTs, exitTs);
        const excursion = computeTradeExcursion(data, entryTs, exitTs, entryTrade.type, entryTrade.entryPrice!, entryTrade.size, instrument);
        return {
          ...entryTrade,
          status: 'closed' as const,
          exitPrice: sameBarClosePrice,
          exitTime: currentCandle.timestamp,
          pnl,
          mae: excursion?.mae,
          mfe: excursion?.mfe,
          candles: replayCandles,
          timeframe: session.timeframe,
        };
      }

      return entryTrade;
    }

    if (trade.status === 'open' && trade.entryPrice !== undefined) {
      let currentTrade = trade;

      // 1. Check & adjust Trailing Stop if active
      if (currentTrade.trailingStop?.active && currentTrade.trailingStop.distancePips > 0) {
        const pip = getPipSize(instrument);
        const dist = currentTrade.trailingStop.distancePips * pip;

        if (currentTrade.type === 'buy') {
          const peak = Math.max(currentTrade.trailingStop.peakPrice ?? currentTrade.entryPrice, currentCandle.high);
          const trailingSl = Number((peak - dist).toFixed(5));
          if (!currentTrade.sl || trailingSl > currentTrade.sl) {
            currentTrade = {
              ...currentTrade,
              sl: trailingSl,
              trailingStop: { ...currentTrade.trailingStop, peakPrice: peak },
            };
          }
        } else {
          const trough = Math.min(currentTrade.trailingStop.peakPrice ?? currentTrade.entryPrice, currentCandle.low);
          const trailingSl = Number((trough + dist).toFixed(5));
          if (!currentTrade.sl || trailingSl < currentTrade.sl) {
            currentTrade = {
              ...currentTrade,
              sl: trailingSl,
              trailingStop: { ...currentTrade.trailingStop, peakPrice: trough },
            };
          }
        }
      }

      // 2. Check partial scale-outs (Take Profits)
      if (currentTrade.scaleOuts && currentTrade.scaleOuts.length > 0) {
        let hasScaleOutExecuted = false;
        const nextScaleOuts = currentTrade.scaleOuts.map((so) => {
          if (so.executed) return so;
          const isHit = currentTrade.type === 'buy' ? currentCandle.high >= so.price : currentCandle.low <= so.price;
          if (isHit) {
            hasScaleOutExecuted = true;
            const partialLots = Number((currentTrade.size * (so.sizePct / 100)).toFixed(5));
            const partialPnl = computeTradePnL(currentTrade.type, currentTrade.entryPrice!, so.price, partialLots, instrument);
            newBalance += partialPnl;
            audioFX.playPartialClose();
            return {
              ...so,
              executed: true,
              executedPrice: so.price,
              executedTime: currentCandle.timestamp,
              pnl: partialPnl,
            };
          }
          return so;
        });

        if (hasScaleOutExecuted) {
          const executedPct = nextScaleOuts.filter((s) => s.executed).reduce((sum, s) => sum + s.sizePct, 0);
          const remainingPct = Math.max(0, 100 - executedPct);
          const remainingLots = Number((currentTrade.size * (remainingPct / 100)).toFixed(5));
          currentTrade = {
            ...currentTrade,
            scaleOuts: nextScaleOuts,
            remainingSize: remainingLots,
          };

          if (remainingLots <= 0) {
            // All partials closed the trade completely
            const realizedPnl = nextScaleOuts.reduce((sum, s) => sum + (s.pnl ?? 0), 0);
            const entryTs = currentTrade.entryTime ?? currentTrade.orderTime;
            const exitTs = currentCandle.timestamp;
            const replayCandles = sliceCandlesForReplay(data, entryTs, exitTs);
            const excursion = computeTradeExcursion(data, entryTs, exitTs, currentTrade.type, currentTrade.entryPrice, currentTrade.size, instrument);
            return {
              ...currentTrade,
              status: 'closed' as const,
              exitPrice: nextScaleOuts[nextScaleOuts.length - 1]?.price ?? currentTrade.entryPrice,
              exitTime: currentCandle.timestamp,
              pnl: realizedPnl,
              mae: excursion?.mae,
              mfe: excursion?.mfe,
              candles: replayCandles,
              timeframe: session.timeframe,
            };
          }
        }
      }

      // 3. Check Stop Loss and Take Profit
      let hitFinalTp = false;
      const effectiveSize = currentTrade.remainingSize ?? currentTrade.size;

      if (currentTrade.type === 'buy') {
        if (currentTrade.sl && currentCandle.low <= currentTrade.sl) {
          shouldClose = true;
          closePrice = currentCandle.open < currentTrade.sl ? currentCandle.open : currentTrade.sl;
        } else if (currentTrade.tp && currentCandle.high >= currentTrade.tp) {
          shouldClose = true;
          hitFinalTp = true;
          closePrice = currentCandle.open > currentTrade.tp ? currentCandle.open : currentTrade.tp;
        }
      } else {
        if (currentTrade.sl && currentCandle.high >= currentTrade.sl) {
          shouldClose = true;
          closePrice = currentCandle.open > currentTrade.sl ? currentCandle.open : currentTrade.sl;
        } else if (currentTrade.tp && currentCandle.low <= currentTrade.tp) {
          shouldClose = true;
          hitFinalTp = true;
          closePrice = currentCandle.open < currentTrade.tp ? currentCandle.open : currentTrade.tp;
        }
      }

      if (shouldClose) {
        if (hitFinalTp) audioFX.playTakeProfitHit();
        else audioFX.playStopLossHit();

        const pnl = computeTradePnL(
          currentTrade.type,
          currentTrade.entryPrice,
          closePrice,
          effectiveSize,
          instrument,
        );

        const partialsPnl = (currentTrade.scaleOuts ?? [])
          .filter((s) => s.executed)
          .reduce((sum, s) => sum + (s.pnl ?? 0), 0);

        const totalPnl = pnl + partialsPnl;
        newBalance += pnl;

        const entryTs = currentTrade.entryTime ?? currentTrade.orderTime;
        const exitTs = currentCandle.timestamp;
        const replayCandles = sliceCandlesForReplay(data, entryTs, exitTs);
        const excursion = computeTradeExcursion(data, entryTs, exitTs, currentTrade.type, currentTrade.entryPrice, currentTrade.size, instrument);

        return {
          ...currentTrade,
          status: 'closed' as const,
          exitPrice: closePrice,
          exitTime: currentCandle.timestamp,
          pnl: totalPnl,
          mae: excursion?.mae,
          mfe: excursion?.mfe,
          candles: replayCandles,
          timeframe: session.timeframe,
        };
      }

      return currentTrade;
    }

    return trade;
  });

  // Avoid creating a new trades array reference when nothing changed (common case with no open trades)
  const finalTrades = updatedTrades.every((t, i) => t === trades[i]) ? trades : updatedTrades;

  return {
    session: {
      ...session,
      currentIndex: nextIndex,
      trades: finalTrades,
      balance: newBalance,
    },
    advanced: true,
    reachedDataEnd: false,
    mayHaveMoreData: false,
  };
}
