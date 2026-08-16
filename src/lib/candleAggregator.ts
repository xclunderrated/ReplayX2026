export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const WEEKLY_MONDAY_OFFSET_SEC = 259200;

export function aggregateCandlesByPeriod(sortedInput: OHLC[], periodSec: number, weekly = false): OHLC[] {
  const aggregated: OHLC[] = [];
  let currentBucketTime: number | null = null;
  let currentCandle: OHLC | null = null;

  for (let i = 0; i < sortedInput.length; i++) {
    const candle = sortedInput[i];
    let bucketTime: number;

    if (weekly) {
      bucketTime = Math.floor((candle.timestamp / 1000 - WEEKLY_MONDAY_OFFSET_SEC) / periodSec) * periodSec + WEEKLY_MONDAY_OFFSET_SEC;
    } else {
      bucketTime = Math.floor(candle.timestamp / 1000 / periodSec) * periodSec;
    }
    bucketTime *= 1000;

    if (currentBucketTime === null || bucketTime !== currentBucketTime) {
      if (currentCandle) {
        aggregated.push(currentCandle);
      }
      currentBucketTime = bucketTime;
      currentCandle = {
        timestamp: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };
    } else if (currentCandle) {
      currentCandle.high = Math.max(currentCandle.high, candle.high);
      currentCandle.low = Math.min(currentCandle.low, candle.low);
      currentCandle.close = candle.close;
      currentCandle.volume += candle.volume;
    }
  }

  if (currentCandle) {
    aggregated.push(currentCandle);
  }

  return aggregated;
}
