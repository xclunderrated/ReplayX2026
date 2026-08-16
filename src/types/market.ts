export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSymbol {
  symbol: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface TimeframeOption {
  label: string;
  value: string;
  seconds: number;
  category: 'minutes' | 'hours' | 'days';
}

export const TIMEFRAMES: TimeframeOption[] = [
  { label: '1m', value: '1m', seconds: 60, category: 'minutes' },
  { label: '5m', value: '5m', seconds: 300, category: 'minutes' },
  { label: '15m', value: '15m', seconds: 900, category: 'minutes' },
  { label: '1h', value: '1h', seconds: 3600, category: 'hours' },
  { label: '4h', value: '4h', seconds: 14400, category: 'hours' },
  { label: '1d', value: '1d', seconds: 86400, category: 'days' },
  { label: '1w', value: '1w', seconds: 604800, category: 'days' },
];

export const DEFAULT_SYMBOLS: MarketSymbol[] = [
  { symbol: 'BTCUSDT', name: 'Bitcoin / USDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  { symbol: 'ETHUSDT', name: 'Ethereum / USDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  { symbol: 'SOLUSDT', name: 'Solana / USDT', baseAsset: 'SOL', quoteAsset: 'USDT' },
  { symbol: 'BNBUSDT', name: 'BNB / USDT', baseAsset: 'BNB', quoteAsset: 'USDT' },
  { symbol: 'XRPUSDT', name: 'XRP / USDT', baseAsset: 'XRP', quoteAsset: 'USDT' },
];
