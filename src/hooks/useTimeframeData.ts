import { useMemo, useRef } from 'react';
import type { Candle } from '../store/useSimulatorStore';
import { 
  aggregateCandles, 
  canDeriveTimeframe
} from '../lib/timeframe';

export function useTimeframeData(
  data: Candle[],
  currentIndex: number,
  targetTimeframe: string,
  baseTimeframe: string,
): Candle[] {
  const cacheRef = useRef<{
    baseDataLength: number;
    currentIndex: number;
    targetTimeframe: string;
    baseTimeframe: string;
    aggregated: Candle[];
    firstBaseCandleTimestamp: number;
    lastBaseCandleTimestamp: number;
  } | null>(null);

  return useMemo(() => {
    if (!data.length || currentIndex < 0) {
      cacheRef.current = null;
      return [];
    }

    // Check if we can derive target from base
    if (!canDeriveTimeframe(baseTimeframe, targetTimeframe)) {
      cacheRef.current = null;
      return [];
    }

    // Avoid slice when data covers the full requested range
    const isFullRange = currentIndex >= data.length - 1;
    const visibleData = isFullRange ? data : data.slice(0, currentIndex + 1);
    const firstVisibleTimestamp = visibleData[0]?.timestamp;
    const lastVisibleTimestamp = visibleData[visibleData.length - 1]?.timestamp;

    if (firstVisibleTimestamp === undefined || lastVisibleTimestamp === undefined) {
      cacheRef.current = null;
      return [];
    }

    // If target equals base, return visible data directly
    if (targetTimeframe === baseTimeframe) {
      cacheRef.current = null;
      return visibleData;
    }

    const cache = cacheRef.current;
    const canUseCache =
      cache &&
      cache.targetTimeframe === targetTimeframe &&
      cache.baseTimeframe === baseTimeframe &&
      cache.baseDataLength === data.length &&
      cache.firstBaseCandleTimestamp === firstVisibleTimestamp &&
      currentIndex >= cache.currentIndex &&
      cache.aggregated.length > 0;

    if (canUseCache) {
      if (currentIndex === cache.currentIndex && cache.lastBaseCandleTimestamp === lastVisibleTimestamp) {
        return cache.aggregated;
      }

      if (currentIndex > cache.currentIndex) {
        const newCandles = data.slice(cache.currentIndex + 1, currentIndex + 1);
        const lastAggregated = cache.aggregated[cache.aggregated.length - 1];
        const itemsToAggregate = [lastAggregated, ...newCandles];
        const newAggregated = aggregateCandles(itemsToAggregate, targetTimeframe);
        const nextAggregated = [
          ...cache.aggregated.slice(0, -1),
          ...newAggregated,
        ];

        cacheRef.current = {
          baseDataLength: data.length,
          currentIndex,
          targetTimeframe,
          baseTimeframe,
          aggregated: nextAggregated,
          firstBaseCandleTimestamp: firstVisibleTimestamp,
          lastBaseCandleTimestamp: lastVisibleTimestamp,
        };

        return nextAggregated;
      }
    }

    const fullyAggregated = aggregateCandles(visibleData, targetTimeframe);

    cacheRef.current = {
      baseDataLength: data.length,
      currentIndex,
      targetTimeframe,
      baseTimeframe,
      aggregated: fullyAggregated,
      firstBaseCandleTimestamp: firstVisibleTimestamp,
      lastBaseCandleTimestamp: lastVisibleTimestamp,
    };

    return fullyAggregated;
  }, [data, currentIndex, targetTimeframe, baseTimeframe]);
}