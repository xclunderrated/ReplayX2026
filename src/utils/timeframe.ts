import { OHLCCandle, TimeframeId } from "../types";

export const TIMEFRAMES: { id: TimeframeId; label: string; seconds: number }[] = [
  { id: "5s", label: "5s", seconds: 5 },
  { id: "15s", label: "15s", seconds: 15 },
  { id: "30s", label: "30s", seconds: 30 },
  { id: "1m", label: "1m", seconds: 60 },
  { id: "5m", label: "5m", seconds: 300 },
  { id: "15m", label: "15m", seconds: 900 },
  { id: "30m", label: "30m", seconds: 1800 },
  { id: "1h", label: "1h", seconds: 3600 },
  { id: "4h", label: "4h", seconds: 14400 },
  { id: "1D", label: "1D", seconds: 86400 },
  { id: "1W", label: "1W", seconds: 604800 },
];

export function getTimeframeSeconds(tf: TimeframeId): number {
  const found = TIMEFRAMES.find((item) => item.id === tf);
  return found ? found.seconds : 60;
}

/**
 * Interpolates a 1m OHLC candle into sub-minute candles (e.g. 5s, 15s, 30s)
 */
function expand1mCandleToSubSeconds(m1: OHLCCandle, periodSec: number): OHLCCandle[] {
  const numSub = Math.floor(60 / periodSec);
  if (numSub <= 1) return [m1];

  const subCandles: OHLCCandle[] = [];
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
      time: m1.time + j * periodSec,
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
 * Aggregates 1-minute base candles up to a given max 1m index into the target timeframe.
 * This simulates a realistic candle building in real time during replay.
 */
export function aggregateCandles(
  baseM1Candles: OHLCCandle[],
  maxM1Index: number,
  targetTimeframe: TimeframeId
): OHLCCandle[] {
  if (!baseM1Candles || baseM1Candles.length === 0 || maxM1Index < 0) {
    return [];
  }

  const periodSec = getTimeframeSeconds(targetTimeframe);
  const limitIndex = Math.min(maxM1Index, baseM1Candles.length - 1);

  // Sub-minute timeframes (5s, 15s, 30s)
  if (periodSec < 60) {
    const result: OHLCCandle[] = [];
    for (let i = 0; i <= limitIndex; i++) {
      const subs = expand1mCandleToSubSeconds(baseM1Candles[i], periodSec);
      result.push(...subs);
    }
    return result;
  }

  // 1-minute timeframe
  if (targetTimeframe === "1m" || periodSec === 60) {
    return baseM1Candles.slice(0, limitIndex + 1);
  }

  // Higher timeframes (5m, 15m, 30m, 1h, 4h, 1D, 1W)
  const aggregated: OHLCCandle[] = [];
  let currentBucketTime: number | null = null;
  let currentCandle: OHLCCandle | null = null;

  // Monday offset for weekly candles (259200 seconds = 3 days, Thursday Jan 1 1970 to Monday)
  const mondayOffset = 259200;

  for (let i = 0; i <= limitIndex; i++) {
    const m1 = baseM1Candles[i];
    let bucketTime: number;

    if (targetTimeframe === "1W") {
      bucketTime = Math.floor((m1.time - mondayOffset) / periodSec) * periodSec + mondayOffset;
    } else {
      bucketTime = Math.floor(m1.time / periodSec) * periodSec;
    }

    if (currentBucketTime === null || bucketTime !== currentBucketTime) {
      if (currentCandle) {
        aggregated.push(currentCandle);
      }
      currentBucketTime = bucketTime;
      currentCandle = {
        time: bucketTime,
        open: m1.open,
        high: m1.high,
        low: m1.low,
        close: m1.close,
        volume: m1.volume,
      };
    } else if (currentCandle) {
      currentCandle.high = Math.max(currentCandle.high, m1.high);
      currentCandle.low = Math.min(currentCandle.low, m1.low);
      currentCandle.close = m1.close;
      currentCandle.volume += m1.volume;
    }
  }

  if (currentCandle) {
    aggregated.push(currentCandle);
  }

  return aggregated;
}

/**
 * Finds the corresponding 1m index for a specific timestamp.
 */
export function findIndexForTimestamp(baseM1Candles: OHLCCandle[], targetTimeSec: number): number {
  if (!baseM1Candles || baseM1Candles.length === 0) return 0;
  
  let low = 0;
  let high = baseM1Candles.length - 1;
  let bestMatch = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (baseM1Candles[mid].time === targetTimeSec) {
      return mid;
    }
    if (baseM1Candles[mid].time < targetTimeSec) {
      bestMatch = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return bestMatch;
}

/**
 * Formats a Unix timestamp (seconds) into a readable UTC date string.
 */
export function formatUTCTimestamp(timestampSec: number): string {
  if (!timestampSec) return "";
  const date = new Date(timestampSec * 1000);
  return date.toISOString().replace("T", " ").substring(0, 19) + " UTC";
}
