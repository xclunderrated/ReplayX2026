import type { DownloadResponse, InstrumentMeta, Candle } from './types';

const API_BASE = '/api';
const REQUEST_TIMEOUT_MS = 45_000;

interface InstrumentsResponse {
  instruments: InstrumentMeta[];
}

const clientMemoryCache = new Map<string, DownloadResponse>();

export interface MarketDataRequestOptions {
  /**
   * Caller-owned cancellation. The session loader creates one per load so that
   * switching sessions (or pressing Cancel) stops the work; previously its
   * AbortController was never handed to `fetch`, so the request ran to
   * completion regardless.
   */
  signal?: AbortSignal;
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Forward the caller's cancellation onto our timeout controller so a single
  // signal reaches fetch, and drop the listener once we are done.
  const forwardAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(`Market data request timed out after ${Math.round(timeoutMs / 1000)}s — the server may still be starting, or Dukascopy is unreachable. Click Retry.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort);
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

export async function fetchInstruments(signal?: AbortSignal): Promise<InstrumentMeta[]> {
  const res = await fetchWithTimeout(`${API_BASE}/instruments`, undefined, REQUEST_TIMEOUT_MS, signal);
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
  timeframe?: string,
  options?: MarketDataRequestOptions,
): Promise<Candle[]> {
  const { candles } = await downloadMarketDataWithMeta(
    instrument, fromDate, toDate, priceType, timeframe, options,
  );
  return candles;
}

export async function downloadMarketDataWithMeta(
  instrument: string,
  fromDate: string,
  toDate: string,
  priceType: 'bid' | 'ask' = 'bid',
  timeframe?: string,
  options?: MarketDataRequestOptions,
): Promise<{ candles: Candle[]; meta: DownloadResponse }> {
  const cacheKey = `${instrument}_${fromDate}_${toDate}_${priceType}_${timeframe ?? 'm1'}`;

  if (clientMemoryCache.has(cacheKey)) {
    const cached = clientMemoryCache.get(cacheKey)!;
    return { candles: cached.candles.map(toCandle), meta: cached };
  }

  const res = await fetchWithTimeout(
    `${API_BASE}/download`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instrument, fromDate, toDate, priceType, timeframe }),
    },
    REQUEST_TIMEOUT_MS,
    options?.signal,
  );

  const data: DownloadResponse = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to download market data from Dukascopy.');
  }

  // A `partial` payload is intentionally not cached client-side either: the
  // server already declined to persist it, and caching it here would restore the
  // exact "truncated data becomes permanent" problem the guard exists to stop.
  if (!data.partial) {
    const candles = data.candles.map(toCandle);
    clientMemoryCache.set(cacheKey, data);
    return { candles, meta: data };
  }

  return { candles: data.candles.map(toCandle), meta: data };
}

export function clearClientCache(): void {
  clientMemoryCache.clear();
}