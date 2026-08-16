import type { DownloadResponse, InstrumentMeta, Candle } from './types';

const API_BASE = '/api';
const REQUEST_TIMEOUT_MS = 45_000;

interface InstrumentsResponse {
  instruments: InstrumentMeta[];
}

const clientMemoryCache = new Map<string, DownloadResponse>();

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(`Market data request timed out after ${Math.round(timeoutMs / 1000)}s — the server may still be starting, or Dukascopy is unreachable. Click Retry.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toCandle(item: DownloadResponse['candles'][0]): Candle {
  return {
    timestamp: item.time * 1000,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
  };
}

export async function fetchInstruments(): Promise<InstrumentMeta[]> {
  const res = await fetchWithTimeout(`${API_BASE}/instruments`);
  if (!res.ok) {
    throw new Error('Failed to load supported instruments from server.');
  }
  const data: InstrumentsResponse = await res.json();
  return data.instruments || [];
}

export async function downloadMarketData(
  instrument: string,
  fromDate: string,
  toDate: string,
  priceType: 'bid' | 'ask' = 'bid',
  timeframe?: string
): Promise<Candle[]> {
  const cacheKey = `${instrument}_${fromDate}_${toDate}_${priceType}_${timeframe ?? 'm1'}`;

  if (clientMemoryCache.has(cacheKey)) {
    const cached = clientMemoryCache.get(cacheKey)!;
    return cached.candles.map(toCandle);
  }

  const res = await fetchWithTimeout(`${API_BASE}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instrument, fromDate, toDate, priceType, timeframe }),
  });

  const data: DownloadResponse = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to download market data from Dukascopy.');
  }

  const candles = data.candles.map(toCandle);
  clientMemoryCache.set(cacheKey, data);
  return candles;
}

export async function downloadMarketDataWithMeta(
  instrument: string,
  fromDate: string,
  toDate: string,
  priceType: 'bid' | 'ask' = 'bid',
  timeframe?: string
): Promise<{ candles: Candle[]; meta: DownloadResponse }> {
  const cacheKey = `${instrument}_${fromDate}_${toDate}_${priceType}_${timeframe ?? 'm1'}`;

  if (clientMemoryCache.has(cacheKey)) {
    const cached = clientMemoryCache.get(cacheKey)!;
    return { candles: cached.candles.map(toCandle), meta: cached };
  }

  const res = await fetchWithTimeout(`${API_BASE}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instrument, fromDate, toDate, priceType, timeframe }),
  });

  const data: DownloadResponse = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to download market data from Dukascopy.');
  }

  const candles = data.candles.map(toCandle);
  clientMemoryCache.set(cacheKey, data);
  return { candles, meta: data };
}

export function clearClientCache(): void {
  clientMemoryCache.clear();
}