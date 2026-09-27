/**
 * Legacy market-data entry point.
 *
 * `src/services/marketdata/api.ts` is the real client. This module used to hold
 * a second, independent implementation with its own memory cache and no request
 * timeout, so the same range could be downloaded and stored twice (once per
 * cache) and a stalled request would hang forever instead of failing after 45s.
 * It is now a thin adapter over the shared client, kept only because
 * `usePaneCandleData` consumes the raw `DownloadResponse` shape (candles in
 * seconds) rather than the converted `Candle[]` the rest of the app uses.
 */

import { downloadMarketDataWithMeta, clearClientCache, fetchInstruments } from './marketdata';
import type { DownloadResponse, InstrumentMeta } from './marketdata/types';

export { clearClientCache, fetchInstruments };
export type { DownloadResponse, InstrumentMeta };

export async function downloadMarketData(
  instrument: string,
  fromDate: string,
  toDate: string,
  priceType: "bid" | "ask" = "bid"
): Promise<DownloadResponse> {
  const { meta } = await downloadMarketDataWithMeta(instrument, fromDate, toDate, priceType);
  return meta;
}
