import type { Candle } from '../store/useSimulatorStore';
import { aggregateCandlesByPeriod, WEEKLY_MONDAY_OFFSET_SEC } from './candleAggregator';

export type TimeframeId = 
  | '5s' | '15s' | '30s' 
  | '1m' | '5m' | '15m' | '30m' 
  | '1h' | '4h' 
  | '1D' | '1W';

export const TIMEFRAMES: { id: TimeframeId; label: string; seconds: number }[] = [
  { id: '5s', label: '5s', seconds: 5 },
  { id: '15s', label: '15s', seconds: 15 },
  { id: '30s', label: '30s', seconds: 30 },
  { id: '1m', label: '1m', seconds: 60 },
  { id: '5m', label: '5m', seconds: 300 },
  { id: '15m', label: '15m', seconds: 900 },
  { id: '30m', label: '30m', seconds: 1800 },
  { id: '1h', label: '1h', seconds: 3600 },
  { id: '4h', label: '4h', seconds: 14400 },
  { id: '1D', label: '1D', seconds: 86400 },
  { id: '1W', label: '1W', seconds: 604800 },
];

export const TIMEFRAME_MAP: Record<string, TimeframeId> = {
  tick: '1m',
  s1: '1m',
  s5: '5s',
  s15: '15s',
  s30: '30s',
  m1: '1m',
  m5: '5m',
  m15: '15m',
  m30: '30m',
  h1: '1h',
  h4: '4h',
  d1: '1D',
  mn1: '1W',

  // Standard TimeframeId representations
  '5s': '5s',
  '15s': '15s',
  '30s': '30s',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1D',
  '1D': '1D',
  '1w': '1W',
  '1W': '1W',
};

export const REVERSE_TIMEFRAME_MAP: Record<TimeframeId, string> = {
  '5s': 's5',
  '15s': 's15',
  '30s': 's30',
  '1m': 'm1',
  '5m': 'm5',
  '15m': 'm15',
  '30m': 'm30',
  '1h': 'h1',
  '4h': 'h4',
  '1D': 'd1',
  '1W': 'mn1',
};

export function auraTimeframeToDukascopy(tf: string): TimeframeId {
  if (!tf) return '1m';
  if (TIMEFRAME_MAP[tf]) return TIMEFRAME_MAP[tf];
  const lower = tf.toLowerCase();
  if (TIMEFRAME_MAP[lower]) return TIMEFRAME_MAP[lower];
  return '1m';
}

export function getTimeframeSeconds(tf: TimeframeId | string): number {
  const parsed = auraTimeframeToDukascopy(tf);
  const found = TIMEFRAMES.find((item) => item.id === parsed);
  return found ? found.seconds : 60;
}

export function getTimeframeIntervalMs(tf: string): number {
  const seconds = getTimeframeSeconds(tf);
  return seconds * 1000;
}

export function dukascopyTimeframeToAura(tf: TimeframeId): string {
  return REVERSE_TIMEFRAME_MAP[tf] || 'm1';
}

export function getBaseTimeframe(tf: string): string {
  if (tf === 'tick') return 'tick';
  if (tf === 'mn1' || tf === '1W') return 'mn1';
  if (tf.startsWith('s') || tf === '5s' || tf === '15s' || tf === '30s') return 's1';
  if (tf.startsWith('m') || tf === '1m' || tf === '5m' || tf === '15m' || tf === '30m') return 'm1';
  if (tf === 'h1' || tf === 'h4' || tf === '1h' || tf === '4h') return 'h1';
  if (tf === 'd1' || tf === '1D') return 'd1';
  return 'm1';
}

/**
 * Maximum requestable date range (in days) for a timeframe. Sub-minute
 * timeframes are backed by real Dukascopy tick data which is extremely large,
 * so downloads are capped. Non-sub-minute timeframes are unlimited (Infinity).
 */
export function getMaxRangeDaysForTimeframe(timeframe: string): number {
  const tf = timeframe.toLowerCase();
  if (tf === 'tick' || tf === 's1') return 3;
  if (tf === 's5' || tf === '5s') return 30;
  if (tf === 's15' || tf === '15s') return 45;
  if (tf === 's30' || tf === '30s') return 60;
  return Infinity;
}

export function getAggregationSource(tf: string): string {
  return getBaseTimeframe(tf);
}

export function canDeriveTimeframe(baseTimeframe: string, targetTimeframe: string): boolean {
  if (baseTimeframe === 'tick') return true;
  if (targetTimeframe === 'tick') return baseTimeframe === 'tick';
  const baseSec = getTimeframeSeconds(auraTimeframeToDukascopy(baseTimeframe));
  const targetSec = getTimeframeSeconds(auraTimeframeToDukascopy(targetTimeframe));
  return targetSec >= baseSec;
}

export function getTimeframeSortValue(timeframe: string): number {
  return getTimeframeSeconds(auraTimeframeToDukascopy(timeframe));
}

/**
 * Synthetic sub-minute candles (legacy interpolation mode).
 *
 * Reconstructs 5s/15s/30s candles from real 1-minute candles using piecewise
 * linear interpolation between the parent's open/high/low/close. The price path
 * inside each minute is an ESTIMATE — it is not market-recorded. Each
 * sub-candle is clamped to the parent 1m high/low so re-aggregating the result
 * always reproduces the real 1m candle exactly.
 *
 * Prefer real sub-minute data (see /api/download timeframe s1/s5/s15/s30),
 * which aggregates actual 1-second tick data from Dukascopy.
 */
function expand1mCandleToSubSeconds(m1: Candle, periodSec: number): Candle[] {
  const numSub = Math.floor(60 / periodSec);
  if (numSub <= 1) return [m1];

  const subCandles: Candle[] = [];
  const O = m1.open;
  const H = m1.high;
  const L = m1.low;
  const C = m1.close;
  const volPerSub = m1.volume / numSub;

  const isBullish = C >= O;
  const pivot1 = isBullish ? L : H;
  const pivot2 = isBullish ? H : L;

  function getInterpolatedPrice(t: number): number {
    if (t <= 0) return O;
    if (t >= 1) return C;
    if (t <= 0.25) {
      const p = t / 0.25;
      return O + (pivot1 - O) * p;
    } else if (t <= 0.75) {
      const p = (t - 0.25) / 0.5;
      return pivot1 + (pivot2 - pivot1) * p;
    } else {
      const p = (t - 0.75) / 0.25;
      return pivot2 + (C - pivot2) * p;
    }
  }

  for (let j = 0; j < numSub; j++) {
    const tStart = j / numSub;
    const tEnd = (j + 1) / numSub;

    const subOpen = getInterpolatedPrice(tStart);
    const subClose = getInterpolatedPrice(tEnd);

    const mid1 = getInterpolatedPrice(tStart + (tEnd - tStart) * 0.33);
    const mid2 = getInterpolatedPrice(tStart + (tEnd - tStart) * 0.66);

    let subHigh = Math.max(subOpen, subClose, mid1, mid2);
    let subLow = Math.min(subOpen, subClose, mid1, mid2);

    subHigh = Math.min(H, subHigh);
    subLow = Math.max(L, subLow);

    subCandles.push({
      timestamp: m1.timestamp + j * periodSec * 1000,
      open: Number(subOpen.toFixed(5)),
      high: Number(subHigh.toFixed(5)),
      low: Number(subLow.toFixed(5)),
      close: Number(subClose.toFixed(5)),
      volume: Number(volPerSub.toFixed(2)),
    });
  }

  return subCandles;
}

/**
 * Synthetic sub-minute candles from real 1m candles (legacy interpolation mode).
 *
 * Mirrors `aggregateCandles`' signature: pass either a timeframe string or a
 * max base-candle index + target timeframe. Every input candle is expanded into
 * `60 / periodSec` interpolated sub-candles. The intra-minute path is an
 * estimate, NOT market-recorded data.
 */
export function expandSubMinuteCandlesFromM1(
  baseM1Candles: Candle[],
  maxM1IndexOrTimeframe: number | string,
  targetTimeframe?: string
): Candle[] {
  if (!baseM1Candles || baseM1Candles.length === 0) {
    return [];
  }

  let limitIndex: number;
  let targetTfStr: string;

  if (typeof maxM1IndexOrTimeframe === 'string') {
    targetTfStr = maxM1IndexOrTimeframe;
    limitIndex = baseM1Candles.length - 1;
  } else {
    limitIndex = Math.min(maxM1IndexOrTimeframe, baseM1Candles.length - 1);
    targetTfStr = targetTimeframe || '1m';
  }

  if (limitIndex < 0) return [];

  const sortedInput = sortAndDeduplicateCandles(baseM1Candles);
  const targetTf = auraTimeframeToDukascopy(targetTfStr);
  const periodSec = getTimeframeSeconds(targetTf);
  const effectiveLimit = Math.min(limitIndex, sortedInput.length - 1);

  if (periodSec >= 60) {
    return sortedInput.slice(0, effectiveLimit + 1);
  }

  const result: Candle[] = [];
  for (let i = 0; i <= effectiveLimit; i++) {
    const subs = expand1mCandleToSubSeconds(sortedInput[i], periodSec);
    result.push(...subs);
  }
  return result;
}

/**
 * Aggregates base candles up to the target timeframe by wall-clock bucketing.
 * Input candles must be at a granularity finer than (or equal to) the target —
 * otherwise `[]` is returned (lower-resolution data cannot be re-derived).
 * Works for real sub-minute bases (s1 -> s5/s15/s30) exactly like 1m -> 5m+.
 */
export function aggregateCandles(
  baseM1Candles: Candle[],
  maxM1IndexOrTimeframe: number | string,
  targetTimeframe?: string
): Candle[] {
  if (!baseM1Candles || baseM1Candles.length === 0) {
    return [];
  }

  let limitIndex: number;
  let targetTfStr: string;

  if (typeof maxM1IndexOrTimeframe === 'string') {
    targetTfStr = maxM1IndexOrTimeframe;
    limitIndex = baseM1Candles.length - 1;
  } else {
    limitIndex = Math.min(maxM1IndexOrTimeframe, baseM1Candles.length - 1);
    targetTfStr = targetTimeframe || '1m';
  }

  if (limitIndex < 0) return [];

  const sortedInput = sortAndDeduplicateCandles(baseM1Candles);
  const targetTf = auraTimeframeToDukascopy(targetTfStr);
  const periodSec = getTimeframeSeconds(targetTf);
  const effectiveLimit = Math.min(limitIndex, sortedInput.length - 1);

  // Derive the input granularity from the smallest gap between consecutive
  // candles. Targeting a finer period than the base data is impossible — the
  // caller must use real sub-minute base data (e.g. s1) for those targets.
  let baseSec = 0;
  for (let i = 1; i <= effectiveLimit; i++) {
    const gapSec = Math.round((sortedInput[i].timestamp - sortedInput[i - 1].timestamp) / 1000);
    if (gapSec > 0) {
      baseSec = baseSec === 0 ? gapSec : Math.min(baseSec, gapSec);
    }
  }
  if (baseSec > 0 && periodSec < baseSec) {
    return [];
  }

  // 1-minute timeframe (fast path — only valid when the base is 1m or coarser)
  if (targetTf === '1m' || periodSec === 60) {
    if (baseSec === 0 || baseSec >= 60) {
      return sortedInput.slice(0, effectiveLimit + 1);
    }
  }

  // Higher timeframes (or sub-minute from a real s1 base): bucket by period
  return aggregateCandlesByPeriod(sortedInput.slice(0, effectiveLimit + 1), periodSec, targetTf === '1W');
}

export function findIndexForTimestamp(baseM1Candles: Candle[], targetTimeMs: number): number {
  if (!baseM1Candles || baseM1Candles.length === 0) return 0;
  
  const targetTimeSec = targetTimeMs / 1000;
  
  let low = 0;
  let high = baseM1Candles.length - 1;
  let bestMatch = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midTimeSec = baseM1Candles[mid].timestamp / 1000;
    
    if (midTimeSec === targetTimeSec) {
      return mid;
    }
    
    if (midTimeSec < targetTimeSec) {
      bestMatch = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return bestMatch;
}

export function findCandleIndexByTimestamp(baseM1Candles: Candle[], targetTimeMs: number): number {
  return findIndexForTimestamp(baseM1Candles, targetTimeMs);
}

export function formatUTCTimestamp(timestampMs: number): string {
  if (!timestampMs) return '';
  const date = new Date(timestampMs);
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

// ─── Legacy compatibility functions ──────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeCandle(candle: Candle): Candle | null {
  if (
    !isFiniteNumber(candle.timestamp)
    || !isFiniteNumber(candle.open)
    || !isFiniteNumber(candle.high)
    || !isFiniteNumber(candle.low)
    || !isFiniteNumber(candle.close)
  ) {
    return null;
  }
  if (candle.timestamp < 0 || candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
    return null;
  }
  if (candle.high < candle.low || candle.high < candle.open || candle.high < candle.close || candle.low > candle.open || candle.low > candle.close) {
    return null;
  }
  const volume = isFiniteNumber(candle.volume) && candle.volume > 0 ? candle.volume : 0;
  return volume === candle.volume ? candle : { ...candle, volume };
}

export function normalizeCandles(data: Candle[]): Candle[] {
  if (data.length === 0) return data;
  const normalized = data.flatMap((candle) => {
    const next = normalizeCandle(candle);
    return next ? [next] : [];
  });
  if (normalized.length <= 1) return normalized;
  const sorted = [...normalized].sort((a, b) => a.timestamp - b.timestamp);
  const deduped: Candle[] = [];
  for (const candle of sorted) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.timestamp === candle.timestamp) {
      if (
        previous.open === candle.open &&
        previous.high === candle.high &&
        previous.low === candle.low &&
        previous.close === candle.close &&
        previous.volume === candle.volume
      ) {
        continue;
      }
      // Keep merged: max H, min L, last C, sum V
      deduped[deduped.length - 1] = {
        ...previous,
        high: Math.max(previous.high, candle.high),
        low: Math.min(previous.low, candle.low),
        close: candle.close,
        volume: previous.volume + candle.volume,
      };
      continue;
    }
    deduped.push(candle);
  }
  return deduped;
}

export function sortAndDeduplicateCandles(data: Candle[]): Candle[] {
  return normalizeCandles(data);
}

export function mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
  if (incoming.length === 0) return existing;
  if (existing.length === 0) return normalizeCandles(incoming);
  const result: Candle[] = new Array(existing.length + incoming.length);
  let i = 0, j = 0, k = 0;
  while (i < existing.length && j < incoming.length) {
    const a = existing[i], b = incoming[j];
    if (a.timestamp < b.timestamp) {
      result[k++] = a;
      i++;
    } else if (a.timestamp > b.timestamp) {
      result[k++] = b;
      j++;
    } else {
      // Same timestamp - merge
      if (
        a.open === b.open &&
        a.high === b.high &&
        a.low === b.low &&
        a.close === b.close &&
        a.volume === b.volume
      ) {
        result[k++] = a;
      } else {
        result[k++] = {
          timestamp: a.timestamp,
          open: a.open,
          high: Math.max(a.high, b.high),
          low: Math.min(a.low, b.low),
          close: b.close,
          volume: a.volume + b.volume,
        };
      }
      i++;
      j++;
    }
  }
  while (i < existing.length) result[k++] = existing[i++];
  while (j < incoming.length) result[k++] = incoming[j++];
  result.length = k;
  return result;
}

export function getBucketStart(timestamp: number, timeframe: string): number {
  const tf = auraTimeframeToDukascopy(timeframe);
  const periodSec = getTimeframeSeconds(tf);
  
  if (tf === '1W') {
    return Math.floor((timestamp / 1000 - WEEKLY_MONDAY_OFFSET_SEC) / periodSec) * periodSec + WEEKLY_MONDAY_OFFSET_SEC;
  }
  
  return Math.floor(timestamp / 1000 / periodSec) * periodSec * 1000;
}