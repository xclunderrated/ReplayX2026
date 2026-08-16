/**
 * On-demand replay data fetching.
 *
 * `extractTradeReplayData` only has access to the small slice of candles stored
 * on the trade at close time (or the live session's loaded data). When that
 * data is missing — the session was deleted, the session data was never loaded,
 * or the user switched to a timeframe finer than the stored candle
 * granularity — replay used to fail with "Replay Unavailable".
 *
 * `ensureTradeReplayData` mirrors the main backtest chart loader
 * (`useSessionLoader`): it downloads real 1m candles from Dukascopy for the
 * trade's full trading day(s), aggregates them to the requested timeframe
 * locally, and caches the 1m candles back onto the trade so every subsequent
 * replay/timeframe switch is instant and works offline.
 */

import type { Candle, Session } from '../store/useSimulatorStore';
import { useSimulatorStore } from '../store/useSimulatorStore';
import type { EnrichedTrade, TradeReplayData } from '../components/analytics/analyticsEngine';
import { extractTradeReplayData } from '../components/analytics/analyticsEngine';
import { downloadMarketData } from '../services/marketdata';
import { aggregateCandles } from './timeframe';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Module-level day cache so several trades on the same day share one download. */
const dayCache = new Map<string, Candle[]>();

function toUTCDateString(ts: number): string {
  return new Date(ts).toISOString().split('T')[0];
}

export function tradeReplayCacheKey(trade: EnrichedTrade): string {
  const entryTs = trade.entryTime ?? trade.orderTime ?? Date.now();
  const exitTs = trade.exitTime ?? trade.closedAt ?? entryTs;

  // 30 days before entry and 5 days after exit to ensure higher timeframes (4H, 1D) have rich context
  const fromTs = new Date(entryTs).setHours(0, 0, 0, 0) - (30 * DAY_MS);
  const toTs = new Date(exitTs).setHours(0, 0, 0, 0) + (5 * DAY_MS);

  const fromDate = toUTCDateString(fromTs);
  const toDate = toUTCDateString(toTs);

  return `${trade.instrument.toLowerCase()}_${fromDate}_${toDate}`;
}

/** Fetches (and caches) the full 1m candle range covering the trade's day(s).
 * Padding of one day before entry / after exit gives the replay chart
 * pre-entry and post-exit context just like the main chart loader.
 */
export async function fetchTradeM1Candles(trade: EnrichedTrade): Promise<Candle[]> {
  const cacheKey = tradeReplayCacheKey(trade);
  const cached = dayCache.get(cacheKey);
  if (cached) return cached;

  const [fromDate, toDate] = cacheKey.split('_').slice(1);
  const candles = await downloadMarketData(trade.instrument, fromDate, toDate, 'bid');
  dayCache.set(cacheKey, candles);
  return candles;
}

/**
 * Ensures replay data exists for `trade` at `timeframe`, fetching from the
 * market data server when it is unavailable. Returns null only when the fetch
 * genuinely fails (server unreachable or no data for the period) — the caller
 * shows an error + retry in that case.
 */
export async function ensureTradeReplayData(
  trade: EnrichedTrade,
  sessions: Session[],
  timeframe: string,
): Promise<TradeReplayData | null> {
  // Fast path: stored trade candles or live session data already cover it.
  const local = extractTradeReplayData(trade, sessions, timeframe, { fullDay: true });
  if (local) return local;

  // Second fast path: this day was already downloaded during a previous replay
  // (or an earlier timeframe switch) — reuse it instead of hitting the server
  // again and persisting identical candles.
  const cachedM1 = dayCache.get(tradeReplayCacheKey(trade));
  if (cachedM1) {
    return extractTradeReplayData({ ...trade, candles: cachedM1 }, sessions, timeframe, { fullDay: true });
  }

  try {
    const m1Candles = await fetchTradeM1Candles(trade);
    if (m1Candles.length === 0) return null;

    // Persist the fetched 1m candles on the trade so future replays (and all
    // other timeframes, which are derived locally from 1m) work instantly and
    // offline. Works for live sessions and archived (deleted) sessions.
    useSimulatorStore.getState().setTradeCandles(trade.sessionId, trade.id, m1Candles);

    return extractTradeReplayData(
      { ...trade, candles: m1Candles },
      sessions,
      timeframe,
      { fullDay: true },
    );
  } catch (error) {
    console.error('[replay] Failed to fetch market data for trade replay:', error);
    return null;
  }
}

/** Aggregates m1 candles to a target timeframe (used for TF caching). */
export function aggregateTradeM1(m1Candles: Candle[], timeframe: string): Candle[] {
  return aggregateCandles(m1Candles, timeframe);
}
