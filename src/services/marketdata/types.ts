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

export type TimeframeId = '5s' | '15s' | '30s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W';

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
}

export interface FetchOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}
