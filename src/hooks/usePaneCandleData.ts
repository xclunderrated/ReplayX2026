import { useState, useEffect } from 'react';
import { downloadMarketData } from '../services/api';
import type { Candle } from '../store/useSimulatorStore';
import { aggregateCandles, canDeriveTimeframe } from '../lib/timeframe';

interface PaneDataResult {
  candles: Candle[];
  isLoading: boolean;
  error: string | null;
}

const customPaneInstrumentCache = new Map<string, Candle[]>();

export function usePaneCandleData(
  sessionData: Candle[],
  currentIndex: number,
  sessionTimeframe: string,
  sessionInstrument: string,
  paneTimeframe: string,
  paneInstrument?: string,
  isLinkedToSessionSymbol: boolean = true,
  sessionFromDate?: string,
  sessionToDate?: string
): PaneDataResult {
  const isCustomInstrument = !isLinkedToSessionSymbol && paneInstrument && paneInstrument.toLowerCase() !== sessionInstrument.toLowerCase();
  const effectiveInstrument = (isCustomInstrument ? paneInstrument : sessionInstrument) || 'eurusd';
  const needsDownload = isCustomInstrument || !canDeriveTimeframe(sessionTimeframe, paneTimeframe);

  const [downloadedData, setDownloadedData] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If custom instrument is chosen OR timeframe cannot be derived from base session (e.g. m1 when session is m5),
  // download 1m historical data for the instrument across the session window.
  useEffect(() => {
    if (!needsDownload) {
      setDownloadedData([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    const fromDate = sessionFromDate || (sessionData[0] ? new Date(sessionData[0].timestamp).toISOString().split('T')[0] : '2024-01-01');
    const toDate = sessionToDate || (sessionData[sessionData.length - 1] ? new Date(sessionData[sessionData.length - 1].timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const cacheKey = `${effectiveInstrument.toLowerCase()}_${fromDate}_${toDate}`;

    if (customPaneInstrumentCache.has(cacheKey)) {
      setDownloadedData(customPaneInstrumentCache.get(cacheKey)!);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    downloadMarketData(effectiveInstrument.toLowerCase(), fromDate, toDate, 'bid')
      .then((res) => {
        if (!isMounted) return;
        const formatted: Candle[] = (res.candles || []).map((c: any) => ({
          timestamp: typeof c.time === 'number' ? (c.time > 1e11 ? c.time : c.time * 1000) : c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 0,
        }));
        customPaneInstrumentCache.set(cacheKey, formatted);
        setDownloadedData(formatted);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || `Failed to load ${effectiveInstrument.toUpperCase()}`);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [needsDownload, effectiveInstrument, sessionFromDate, sessionToDate, sessionData]);

  if (needsDownload) {
    if (isLoading) {
      return { candles: [], isLoading: true, error: null };
    }
    if (error) {
      return { candles: [], isLoading: false, error };
    }
    if (!downloadedData.length) {
      return { candles: [], isLoading: false, error: null };
    }

    // Filter downloaded data up to the current session time
    const currentSessionTimestamp = sessionData[currentIndex]?.timestamp;
    let visibleData = downloadedData;
    if (currentSessionTimestamp !== undefined) {
      visibleData = downloadedData.filter((c) => c.timestamp <= currentSessionTimestamp);
    }

    // If target timeframe != 'm1', aggregate to target timeframe
    const aggregated = paneTimeframe === 'm1' ? visibleData : aggregateCandles(visibleData, paneTimeframe);
    return { candles: aggregated, isLoading: false, error: null };
  }

  // Otherwise, use derived candles from base session data
  if (!sessionData.length || currentIndex < 0) {
    return { candles: [], isLoading: false, error: null };
  }

  const isFullRange = currentIndex >= sessionData.length - 1;
  const visibleData = isFullRange ? sessionData : sessionData.slice(0, currentIndex + 1);

  if (paneTimeframe === sessionTimeframe) {
    return { candles: visibleData, isLoading: false, error: null };
  }

  const aggregated = aggregateCandles(visibleData, paneTimeframe);
  return { candles: aggregated, isLoading: false, error: null };
}
