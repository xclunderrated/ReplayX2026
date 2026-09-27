export type CategoryType = 
  | 'forex_major' 
  | 'forex_cross' 
  | 'forex_exotic' 
  | 'commodities' 
  | 'crypto' 
  | 'indices' 
  | 'stocks';

export interface InstrumentMeta {
  id: string;
  symbol: string;
  name: string;
  category: CategoryType | string;
  pipSize: number;
  decimalPlaces: number;
}

export interface OHLCCandle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Candle {
  timestamp: number; // Unix timestamp in milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeframeId = '5s' | '15s' | '30s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W' | '1M';

export interface DownloadResponse {
  instrument: InstrumentMeta;
  timeframe: string;
  count: number;
  startTime: string;
  endTime: string;
  candles: OHLCCandle[];
  cached?: boolean;
  latencyMs?: number;
  error?: string;
  /** The canonical day range the request was normalized to. */
  requestedFrom?: string;
  requestedTo?: string;
  /**
   * Set when the server detected a gap in the returned series too large to be a
   * market closure, i.e. an upstream download failed part-way through. Such a
   * result is returned (it is better than nothing) but is never cached, so a
   * retry re-downloads instead of replaying the same truncated data.
   */
  partial?: boolean;
  /**
   * Precise explanation accompanying `partial`, phrased for a log. The UI builds
   * its own short message from the structured fields below rather than showing
   * this verbatim.
   */
  warning?: string;
  /** Which kind of incompleteness was detected. */
  partialKind?: 'interior' | 'tail';
  /** Size of the gap or shortfall, in days. */
  partialDays?: number;
}

export interface FetchOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}
