import { type ChartTimezone, timestampMsToChartTime } from './timezone';
import { type NewsEvent } from './news';

interface TimestampPoint {
  timestamp: number;
}

const timestampCache = new Map<number, number | null>();

export function clearTimestampCache() {
  timestampCache.clear();
}

interface NewsRenderStateOptions {
  eventTimestamp: number | undefined;
  currentTimestamp: number | undefined;
  visibleCandles: TimestampPoint[];
}

export function resolveVisibleTimestamp(
  timestamp: number | undefined,
  visibleTimePoints: TimestampPoint[],
  visibleLength?: number,
) {
  if (!timestamp || visibleTimePoints.length === 0) return null;

  const end = visibleLength === undefined
    ? visibleTimePoints.length
    : Math.min(visibleLength, visibleTimePoints.length);
  if (end <= 0) return null;

  const cached = timestampCache.get(timestamp);
  if (cached !== undefined) return cached;

  const firstVisibleTimestamp = visibleTimePoints[0]?.timestamp;
  const lastVisibleTimestamp = visibleTimePoints[end - 1]?.timestamp;

  if (!firstVisibleTimestamp || !lastVisibleTimestamp) {
    timestampCache.set(timestamp, null);
    return null;
  }
  if (timestamp < firstVisibleTimestamp || timestamp > lastVisibleTimestamp) {
    timestampCache.set(timestamp, null);
    return null;
  }

  let low = 0;
  let high = end - 1;
  let bestMatch: number | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candleTs = visibleTimePoints[mid]?.timestamp;

    if (candleTs === timestamp) {
      timestampCache.set(timestamp, candleTs);
      return candleTs;
    }

    if (candleTs < timestamp) {
      bestMatch = candleTs;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  timestampCache.set(timestamp, bestMatch);
  return bestMatch;
}

export function resolveMarkerTime(
  timestamp: number | undefined,
  visibleTimePoints: TimestampPoint[],
  chartTimezone: ChartTimezone,
  visibleLength?: number,
) {
  const resolvedTimestamp = resolveVisibleTimestamp(timestamp, visibleTimePoints, visibleLength);
  return resolvedTimestamp ? timestampMsToChartTime(resolvedTimestamp, chartTimezone) : null;
}

export function getNewsRenderState({
  eventTimestamp,
  currentTimestamp,
  visibleCandles,
  visibleLength,
}: NewsRenderStateOptions & { visibleLength?: number }) {
  if (!eventTimestamp || !currentTimestamp || visibleCandles.length === 0) return null;

  if (eventTimestamp > currentTimestamp + 24 * 60 * 60 * 1000) {
    return { kind: 'future-line' as const, eventTimestamp };
  }

  if (eventTimestamp > currentTimestamp) {
    return {
      kind: 'future-line' as const,
      eventTimestamp,
    };
  }

  const candleTimestamp = resolveVisibleTimestamp(eventTimestamp, visibleCandles, visibleLength);
  if (!candleTimestamp) return null;

  return {
    kind: 'reached-marker' as const,
    candleTimestamp,
  };
}

// Number of synthetic future bars fed to the hidden whitespace series, always
// present regardless of upcoming news (gives ample room to scroll and draw right).
export const WHITESPACE_FUTURE_BARS = 300;

export interface NewsWhitespaceInput {
  visibleNews: NewsEvent[];
  currentReplayTimestamp: number;
  lastVisibleTimestamp: number;
  intervalMs?: number;
  minFutureBars?: number;
  endTimestamp?: number;
  maxPoints?: number;
}

/**
 * Pure computation of the future timestamps (ms, floored to whole seconds)
 * that the hidden whitespace series must anchor on the shared time scale:
 * the last visible candle, a dense run of synthetic bars at the timeframe
 * interval extending all the way to the end of session date (+ safety buffer)
 * or a generous future horizon (so users can scroll and draw across the entire future),
 * plus every upcoming visible news event.
 * Shared by the whitespace series feed and the projected news VerticalLine drawings so
 * both stay in lockstep.
 */
export function getNewsWhitespaceTimestamps({
  visibleNews,
  currentReplayTimestamp,
  lastVisibleTimestamp,
  intervalMs,
  minFutureBars = WHITESPACE_FUTURE_BARS,
  endTimestamp,
  maxPoints = 2000,
}: NewsWhitespaceInput): number[] {
  if (!Number.isFinite(lastVisibleTimestamp)) return [];

  const seen = new Set<number>();
  const times: number[] = [];
  const addTime = (time: number) => {
    const t = Math.floor(time / 1000) * 1000;
    if (seen.has(t)) return;
    seen.add(t);
    times.push(t);
  };

  // Anchor at the last visible candle so the hidden series spans contiguously
  // from the candle series' right edge into the future.
  addTime(Math.floor(lastVisibleTimestamp / 1000) * 1000);

  // Dense synthetic bars at the timeframe interval give the time scale a
  // continuous drawable/scrollable region to the right of the last candle,
  // extending either to minFutureBars or to the end of session date (with buffer).
  if (Number.isFinite(intervalMs) && intervalMs! > 0) {
    let targetBars = minFutureBars !== undefined ? minFutureBars : WHITESPACE_FUTURE_BARS;
    if (endTimestamp && endTimestamp > lastVisibleTimestamp) {
      const barsToEnd = Math.ceil((endTimestamp - lastVisibleTimestamp) / intervalMs!);
      targetBars = Math.max(targetBars, barsToEnd + 120);
    }
    targetBars = Math.max(targetBars, 300);

    if (targetBars > 0) {
      const baseTs = Math.floor(lastVisibleTimestamp / 1000) * 1000;
      for (let i = 1; i <= targetBars; i += 1) {
        addTime(baseTs + i * intervalMs!);
      }
    }
  }

  // Every upcoming visible event gets an exact time-scale point — not just
  // High-impact ones. timeToCoordinate only resolves timestamps that exist
  // verbatim in the time scale, so without this, Medium/Low future news lines
  // would never render even when they sit inside the visible right padding.
  const upcoming = new Set<number>();
  for (const event of visibleNews) {
    if (event.timestamp <= currentReplayTimestamp) continue;
    if (event.timestamp <= lastVisibleTimestamp) continue;
    upcoming.add(event.timestamp);
  }

  if (upcoming.size > 0) {
    const sorted = Array.from(upcoming).sort((left, right) => left - right);
    const included = sorted.length <= maxPoints ? sorted : [
      ...sorted.slice(0, maxPoints - 1),
      sorted[sorted.length - 1],
    ];

    for (const timestamp of included) {
      addTime(timestamp);
    }
  }

  times.sort((left, right) => left - right);
  return times;
}

export interface NewsWhitespacePoint {
  time: number;
  value: number;
}

interface NewsWhitespaceOptions {
  visibleNews: NewsEvent[];
  currentReplayTimestamp: number;
  lastVisibleTimestamp: number;
  lastVisiblePrice: number;
  intervalMs?: number;
  minFutureBars?: number;
  endTimestamp?: number;
  maxPoints?: number;
}

export function buildNewsWhitespacePoints({
  visibleNews,
  currentReplayTimestamp,
  lastVisibleTimestamp,
  lastVisiblePrice,
  intervalMs,
  minFutureBars = WHITESPACE_FUTURE_BARS,
  endTimestamp,
  maxPoints = 2000,
}: NewsWhitespaceOptions): NewsWhitespacePoint[] {
  if (!Number.isFinite(lastVisibleTimestamp) || !Number.isFinite(lastVisiblePrice)) return [];

  const times = getNewsWhitespaceTimestamps({
    visibleNews,
    currentReplayTimestamp,
    lastVisibleTimestamp,
    intervalMs,
    minFutureBars,
    endTimestamp,
    maxPoints,
  });
  return times.map((time) => ({ time, value: lastVisiblePrice }));
}
