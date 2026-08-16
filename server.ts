import express from "express";
import path from "path";
import fs from "fs";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import { getHistoricalRates, Instrument } from "dukascopy-node";
import { filterEventsByCurrencies, scrapeDayRange } from "./forexfactoryScraper";
import { aggregateCandles, getMaxRangeDaysForTimeframe } from "./src/lib/timeframe";
import { registerDriveRoutes } from "./driveServerRoutes";

// Root fix for intermittent EADDRNOTAVAIL fetch failures: this machine has no
// usable IPv6 route, and Dukascopy's DNS sometimes returns AAAA first. Forcing
// IPv4-first ordering makes every connection use the working IPv4 path.
dns.setDefaultResultOrder("ipv4first");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "100mb" }));

// Register Google Drive OAuth & Backup API endpoints
registerDriveRoutes(app);

// Ensure cache directories exist
const cacheDir = path.join(process.cwd(), ".dukascopy-cache");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const newsCacheDir = path.join(process.cwd(), ".forexfactory-cache");
if (!fs.existsSync(newsCacheDir)) {
  fs.mkdirSync(newsCacheDir, { recursive: true });
}

// Instrument metadata (matching NewDukascopySystem)
export interface InstrumentMeta {
  id: string;
  symbol: string;
  name: string;
  category: "forex_major" | "forex_cross" | "forex_exotic" | "commodities" | "crypto" | "indices" | "stocks";
  pipSize: number;
  decimalPlaces: number;
}

// Dukascopy symbol alias mapping table to guarantee 100% exact match with dukascopy-node library
const DUKASCOPY_ALIAS_MAP: Record<string, string> = {
  // Indices
  "us30": "usa30idxusd",
  "usa30": "usa30idxusd",
  "usa30idxusd": "usa30idxusd",
  "us500": "usa500idxusd",
  "usa500": "usa500idxusd",
  "usa500idxusd": "usa500idxusd",
  "ustecusd": "usatechidxusd",
  "usatechidxusd": "usatechidxusd",
  "nas100": "usatechidxusd",
  "deidxeur": "deuidxeur",
  "deuidxeur": "deuidxeur",
  "ger40": "deuidxeur",
  "dax40": "deuidxeur",
  "ukidxgbp": "gbridxgbp",
  "gbridxgbp": "gbridxgbp",
  "uk100": "gbridxgbp",
  "fridxeur": "fraidxeur",
  "fraidxeur": "fraidxeur",
  "fra40": "fraidxeur",
  "jpidxjpy": "jpnidxjpy",
  "jpnidxjpy": "jpnidxjpy",
  "jpn225": "jpnidxjpy",
  "ausidxaud": "ausidxaud",
  "aus200": "ausidxaud",
  "euidxeur": "eusidxeur",
  "eusidxeur": "eusidxeur",
  "eu50": "eusidxeur",
  "hkidxhkd": "hkgidxhkd",
  "hkgidxhkd": "hkgidxhkd",
  "hk50": "hkgidxhkd",
  "chnidxcny": "chiidxusd",
  "chiidxusd": "chiidxusd",
  "chi50": "chiidxusd",

  // Commodities & Metals
  "xptusd": "xptcmdusd",
  "xptcmdusd": "xptcmdusd",
  "xpdusd": "xpdcmdusd",
  "xpdcmdusd": "xpdcmdusd",
  "brent": "brentcmdusd",
  "brentcmdusd": "brentcmdusd",
  "wti": "lightcmdusd",
  "lightcmdusd": "lightcmdusd",
  "ngas": "gascmdusd",
  "gascmdusd": "gascmdusd",
  "copper": "coppercmdusd",
  "coppercmdusd": "coppercmdusd",

  // Crypto
  "btc": "btcusd",
  "btcusd": "btcusd",
  "eth": "ethusd",
  "ethusd": "ethusd",
  "sol": "solusd",
  "solusd": "solusd",
  "ltc": "ltcusd",
  "ltcusd": "ltcusd",
  "bch": "bchusd",
  "bchusd": "bchusd",
  "xrp": "xrpusd",
  "xrpusd": "xrpusd",
  "ada": "adausd",
  "adausd": "adausd",
  "dot": "dotusd",
  "dotusd": "dotusd",
  "link": "linkusd",
  "linkusd": "linkusd",
  "doge": "dogeusd",
  "dogeusd": "dogeusd",
  "avax": "avaxusd",
  "avaxusd": "avaxusd",
};

const SUPPORTED_INSTRUMENTS: InstrumentMeta[] = [
  // Forex Majors
  { id: "eurusd", symbol: "EUR/USD", name: "Euro / US Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpusd", symbol: "GBP/USD", name: "British Pound / US Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdjpy", symbol: "USD/JPY", name: "US Dollar / Japanese Yen", category: "forex_major", pipSize: 0.01, decimalPlaces: 3 },
  { id: "audusd", symbol: "AUD/USD", name: "Australian Dollar / US Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdcad", symbol: "USD/CAD", name: "US Dollar / Canadian Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdchf", symbol: "USD/CHF", name: "US Dollar / Swiss Franc", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "nzdusd", symbol: "NZD/USD", name: "New Zealand Dollar / US Dollar", category: "forex_major", pipSize: 0.0001, decimalPlaces: 5 },
  
  // Forex Crosses & Minors
  { id: "eurgbp", symbol: "EUR/GBP", name: "Euro / British Pound", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurjpy", symbol: "EUR/JPY", name: "Euro / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "gbpjpy", symbol: "GBP/JPY", name: "British Pound / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "audjpy", symbol: "AUD/JPY", name: "Australian Dollar / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "euraud", symbol: "EUR/AUD", name: "Euro / Australian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpcad", symbol: "GBP/CAD", name: "British Pound / Canadian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "cadjpy", symbol: "CAD/JPY", name: "Canadian Dollar / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "eurchf", symbol: "EUR/CHF", name: "Euro / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurcad", symbol: "EUR/CAD", name: "Euro / Canadian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurnzd", symbol: "EUR/NZD", name: "Euro / New Zealand Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpchf", symbol: "GBP/CHF", name: "British Pound / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpaud", symbol: "GBP/AUD", name: "British Pound / Australian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "gbpnzd", symbol: "GBP/NZD", name: "British Pound / New Zealand Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "audcad", symbol: "AUD/CAD", name: "Australian Dollar / Canadian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "audchf", symbol: "AUD/CHF", name: "Australian Dollar / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "audnzd", symbol: "AUD/NZD", name: "Australian Dollar / New Zealand Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "cadchf", symbol: "CAD/CHF", name: "Canadian Dollar / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "nzdjpy", symbol: "NZD/JPY", name: "New Zealand Dollar / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  { id: "nzdcad", symbol: "NZD/CAD", name: "New Zealand Dollar / Canadian Dollar", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "nzdchf", symbol: "NZD/CHF", name: "New Zealand Dollar / Swiss Franc", category: "forex_cross", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "chfjpy", symbol: "CHF/JPY", name: "Swiss Franc / Japanese Yen", category: "forex_cross", pipSize: 0.01, decimalPlaces: 3 },
  
  // Forex Exotics
  { id: "usdsgd", symbol: "USD/SGD", name: "US Dollar / Singapore Dollar", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdhkd", symbol: "USD/HKD", name: "US Dollar / Hong Kong Dollar", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdsek", symbol: "USD/SEK", name: "US Dollar / Swedish Krona", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdnok", symbol: "USD/NOK", name: "US Dollar / Norwegian Krone", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdzar", symbol: "USD/ZAR", name: "US Dollar / South African Rand", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdtry", symbol: "USD/TRY", name: "US Dollar / Turkish Lira", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdmxn", symbol: "USD/MXN", name: "US Dollar / Mexican Peso", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "usdpln", symbol: "USD/PLN", name: "US Dollar / Polish Zloty", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eursgd", symbol: "EUR/SGD", name: "Euro / Singapore Dollar", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eursek", symbol: "EUR/SEK", name: "Euro / Swedish Krona", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurnok", symbol: "EUR/NOK", name: "Euro / Norwegian Krone", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  { id: "eurtry", symbol: "EUR/TRY", name: "Euro / Turkish Lira", category: "forex_exotic", pipSize: 0.0001, decimalPlaces: 5 },
  
  // Commodities & Metals
  { id: "xauusd", symbol: "XAU/USD", name: "Gold / US Dollar", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
  { id: "xagusd", symbol: "XAG/USD", name: "Silver / US Dollar", category: "commodities", pipSize: 0.01, decimalPlaces: 3 },
  { id: "xaueur", symbol: "XAU/EUR", name: "Gold / Euro", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
  { id: "xageur", symbol: "XAG/EUR", name: "Silver / Euro", category: "commodities", pipSize: 0.01, decimalPlaces: 3 },
  { id: "xptcmdusd", symbol: "XPT/USD", name: "Platinum / US Dollar", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
  { id: "xpdcmdusd", symbol: "XPD/USD", name: "Palladium / US Dollar", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
  { id: "brentcmdusd", symbol: "BRENT", name: "Brent Crude Oil", category: "commodities", pipSize: 0.01, decimalPlaces: 2 },
  { id: "lightcmdusd", symbol: "WTI", name: "WTI Crude Oil", category: "commodities", pipSize: 0.01, decimalPlaces: 2 },
  { id: "gascmdusd", symbol: "NGAS", name: "Natural Gas", category: "commodities", pipSize: 0.001, decimalPlaces: 3 },
  { id: "coppercmdusd", symbol: "COPPER", name: "High Grade Copper", category: "commodities", pipSize: 0.001, decimalPlaces: 3 },
  
  // Crypto
  { id: "btcusd", symbol: "BTC/USD", name: "Bitcoin / US Dollar", category: "crypto", pipSize: 1.0, decimalPlaces: 2 },
  { id: "ethusd", symbol: "ETH/USD", name: "Ethereum / US Dollar", category: "crypto", pipSize: 0.1, decimalPlaces: 2 },
  { id: "solusd", symbol: "SOL/USD", name: "Solana / US Dollar", category: "crypto", pipSize: 0.01, decimalPlaces: 2 },
  { id: "xrpusd", symbol: "XRP/USD", name: "Ripple / US Dollar", category: "crypto", pipSize: 0.0001, decimalPlaces: 4 },
  { id: "ltcusd", symbol: "LTC/USD", name: "Litecoin / US Dollar", category: "crypto", pipSize: 0.01, decimalPlaces: 2 },
  { id: "bchusd", symbol: "BCH/USD", name: "Bitcoin Cash / US Dollar", category: "crypto", pipSize: 0.01, decimalPlaces: 2 },
  { id: "adausd", symbol: "ADA/USD", name: "Cardano / US Dollar", category: "crypto", pipSize: 0.0001, decimalPlaces: 4 },
  { id: "dotusd", symbol: "DOT/USD", name: "Polkadot / US Dollar", category: "crypto", pipSize: 0.001, decimalPlaces: 3 },
  { id: "linkusd", symbol: "LINK/USD", name: "Chainlink / US Dollar", category: "crypto", pipSize: 0.001, decimalPlaces: 3 },
  { id: "dogeusd", symbol: "DOGE/USD", name: "Dogecoin / US Dollar", category: "crypto", pipSize: 0.00001, decimalPlaces: 5 },
  { id: "avaxusd", symbol: "AVAX/USD", name: "Avalanche / US Dollar", category: "crypto", pipSize: 0.01, decimalPlaces: 2 },
  
  // Indices
  { id: "usa500idxusd", symbol: "US500", name: "S&P 500 Index", category: "indices", pipSize: 0.1, decimalPlaces: 2 },
  { id: "usa30idxusd", symbol: "US30", name: "Dow Jones 30 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "usatechidxusd", symbol: "NAS100", name: "Nasdaq 100 Index", category: "indices", pipSize: 0.1, decimalPlaces: 2 },
  { id: "deuidxeur", symbol: "GER40", name: "DAX 40 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "gbridxgbp", symbol: "UK100", name: "FTSE 100 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "fraidxeur", symbol: "FRA40", name: "CAC 40 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "jpnidxjpy", symbol: "JPN225", name: "Nikkei 225 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "ausidxaud", symbol: "AUS200", name: "ASX 200 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "eusidxeur", symbol: "EU50", name: "Euro Stoxx 50 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "hkgidxhkd", symbol: "HK50", name: "Hang Seng Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "chiidxusd", symbol: "CHI50", name: "China A50 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  
  // Global Equities / Stocks
  { id: "aaplususd", symbol: "AAPL", name: "Apple Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "msftususd", symbol: "MSFT", name: "Microsoft Corporation", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "nvdaususd", symbol: "NVDA", name: "NVIDIA Corporation", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "amznususd", symbol: "AMZN", name: "Amazon.com Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "googususd", symbol: "GOOGL", name: "Alphabet Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "tslaususd", symbol: "TSLA", name: "Tesla Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
  { id: "metaususd", symbol: "META", name: "Meta Platforms Inc.", category: "stocks", pipSize: 0.01, decimalPlaces: 2 },
];

// Health endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Instruments metadata endpoint
app.get("/api/instruments", (_req, res) => {
  res.json({ instruments: SUPPORTED_INSTRUMENTS });
});

// Economic News Feed using the vendored ForexFactory scraper
app.get("/api/news", async (req, res) => {
  try {
    const instrument = String(req.query.instrument || 'EURUSD').trim().toUpperCase();
    const fromParam = String(req.query.from || '');
    const toParam = String(req.query.to || '');

    if (!fromParam || !toParam) {
      return res.status(400).json({ error: "Missing required query parameters: from, to" });
    }

    const fromTs = new Date(fromParam).getTime();
    const toTs = new Date(toParam).getTime();

    if (isNaN(fromTs) || isNaN(toTs)) {
      return res.status(400).json({ error: "Invalid from/to date parameters" });
    }

    const currencies = getInstrumentCurrenciesForServer(instrument);
    const rangeMs = toTs - fromTs;

    if (rangeMs > 21 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "Requested news range exceeds 21 days" });
    }

    console.log(`[News Backend] Scraping ForexFactory for ${instrument} (${fromParam} to ${toParam})...`);

    const result = await scrapeDayRange(fromParam, toParam);
    const events = filterEventsByCurrencies(result.events, currencies);

    const dayErrors = Object.entries(result.errors);
    if (dayErrors.length > 0) {
      for (const [dayKey, message] of dayErrors) {
        console.warn(`[News Backend] Scrape failed for ${dayKey}: ${message}`);
      }
    }

    console.log(`[News Backend] ForexFactory scraper returned ${events.length} matching events across ${result.daysScraped} day(s).`);

    return res.json({
      instrument,
      currencies,
      count: events.length,
      source: "ForexFactory Scraper",
      events: events
    });
  } catch (err: any) {
    console.error("[News API Error]", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

function getInstrumentCurrenciesForServer(instrument: string): string[] {
  const normalized = instrument.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const specialCases: Record<string, string[]> = {
    usa30idxusd: ['USD'],
    us30: ['USD'],
    usa500idxusd: ['USD'],
    us500: ['USD'],
    usatechidxusd: ['USD'],
    nas100: ['USD'],
    deuidxeur: ['EUR'],
    ger40: ['EUR'],
    dax40: ['EUR'],
    gbridxgbp: ['GBP'],
    uk100: ['GBP'],
    fraidxeur: ['EUR'],
    fra40: ['EUR'],
    jpnidxjpy: ['JPY'],
    jpn225: ['JPY'],
    ausidxaud: ['AUD'],
    aus200: ['AUD'],
    eusidxeur: ['EUR'],
    eu50: ['EUR'],
    hkgidxhkd: ['HKD'],
    hk50: ['HKD'],
    chiidxusd: ['CNY', 'USD'],
    chi50: ['CNY', 'USD'],
    xauusd: ['USD'],
    xagusd: ['USD'],
    xaueur: ['EUR'],
    xageur: ['EUR'],
    xptcmdusd: ['USD'],
    xpdcmdusd: ['USD'],
    brentcmdusd: ['USD'],
    brent: ['USD'],
    lightcmdusd: ['USD'],
    wti: ['USD'],
    gascmdusd: ['USD'],
    ngas: ['USD'],
    coppercmdusd: ['USD'],
    copper: ['USD'],
    btcusd: ['USD'],
    btc: ['USD'],
    ethusd: ['USD'],
    eth: ['USD'],
    solusd: ['USD'],
    sol: ['USD'],
    xrpusd: ['USD'],
    xrp: ['USD'],
    ltcusd: ['USD'],
    ltc: ['USD'],
    bchusd: ['USD'],
    bch: ['USD'],
    adausd: ['USD'],
    ada: ['USD'],
    dotusd: ['USD'],
    dot: ['USD'],
    linkusd: ['USD'],
    link: ['USD'],
    dogeusd: ['USD'],
    doge: ['USD'],
    avaxusd: ['USD'],
    avax: ['USD'],
    aaplususd: ['USD'],
    aapl: ['USD'],
    msftususd: ['USD'],
    msft: ['USD'],
    nvdaususd: ['USD'],
    nvda: ['USD'],
    amznususd: ['USD'],
    amzn: ['USD'],
    googususd: ['USD'],
    googl: ['USD'],
    tslaususd: ['USD'],
    tsla: ['USD'],
    metaususd: ['USD'],
    meta: ['USD'],
  };

  const first6LettersMatch = normalized.match(/^[a-z]{6}/);
  const base6 = first6LettersMatch ? first6LettersMatch[0] : normalized;

  if (specialCases[normalized]) {
    return specialCases[normalized];
  }
  if (specialCases[base6]) {
    return specialCases[base6];
  }

  if (base6.length === 6) {
    return [base6.slice(0, 3).toUpperCase(), base6.slice(3, 6).toUpperCase()];
  }

  const majors = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
  const found: string[] = [];
  for (const major of majors) {
    if (normalized.toUpperCase().includes(major)) {
      found.push(major);
    }
  }
  if (found.length > 0) {
    return found;
  }

  return ['USD'];
}

// In-Memory Fast Cache Map
const memoryCache = new Map<string, any>();

// Timeframes this API can serve.
// Native Dukascopy timeframes: s1, m1, m5, m15, m30, h1, h4, d1, mn1.
// Sub-minute timeframes (s5, s15, s30, tick) are built from real s1 tick data.
// 1W is aggregated from native d1 data.
const ALLOWED_TIMEFRAMES = new Set([
  "tick", "s1", "s5", "s15", "s30",
  "5s", "15s", "30s",
  "m1", "m5", "m15", "m30",
  "1m", "5m", "15m", "30m",
  "h1", "h4",
  "1h", "4h",
  "d1", "1d", "1D",
  "1w", "1W",
  "mn1",
]);

const SUB_MINUTE_TIMEFRAMES = new Set(["s1", "s5", "s15", "s30", "tick", "5s", "15s", "30s"]);
const DAY_MS = 24 * 60 * 60 * 1000;

interface NormalizedTimeframeInfo {
  canonical: string;
  isSubMinute: boolean;
  nativeDukascopyTimeframe: "s1" | "m1" | "m5" | "m15" | "m30" | "h1" | "h4" | "d1" | "mn1";
  aggregationTarget?: string;
}

function normalizeRequestedTimeframe(tf: string): NormalizedTimeframeInfo {
  const clean = tf.toLowerCase().trim();
  switch (clean) {
    case "tick":
      return { canonical: "tick", isSubMinute: true, nativeDukascopyTimeframe: "s1" };
    case "s1":
      return { canonical: "s1", isSubMinute: true, nativeDukascopyTimeframe: "s1" };
    case "s5":
    case "5s":
      return { canonical: "s5", isSubMinute: true, nativeDukascopyTimeframe: "s1", aggregationTarget: "s5" };
    case "s15":
    case "15s":
      return { canonical: "s15", isSubMinute: true, nativeDukascopyTimeframe: "s1", aggregationTarget: "s15" };
    case "s30":
    case "30s":
      return { canonical: "s30", isSubMinute: true, nativeDukascopyTimeframe: "s1", aggregationTarget: "s30" };
    case "m1":
    case "1m":
      return { canonical: "m1", isSubMinute: false, nativeDukascopyTimeframe: "m1" };
    case "m5":
    case "5m":
      return { canonical: "m5", isSubMinute: false, nativeDukascopyTimeframe: "m5" };
    case "m15":
    case "15m":
      return { canonical: "m15", isSubMinute: false, nativeDukascopyTimeframe: "m15" };
    case "m30":
    case "30m":
      return { canonical: "m30", isSubMinute: false, nativeDukascopyTimeframe: "m30" };
    case "h1":
    case "1h":
      return { canonical: "h1", isSubMinute: false, nativeDukascopyTimeframe: "h1" };
    case "h4":
    case "4h":
      return { canonical: "h4", isSubMinute: false, nativeDukascopyTimeframe: "h4" };
    case "d1":
    case "1d":
      return { canonical: "d1", isSubMinute: false, nativeDukascopyTimeframe: "d1" };
    case "1w":
    case "1w":
      return { canonical: "1W", isSubMinute: false, nativeDukascopyTimeframe: "d1", aggregationTarget: "1W" };
    case "mn1":
      return { canonical: "mn1", isSubMinute: false, nativeDukascopyTimeframe: "mn1" };
    default:
      return { canonical: "m1", isSubMinute: false, nativeDukascopyTimeframe: "m1" };
  }
}

// In-flight dedup maps: concurrent identical requests share one download.
const inflightRequests = new Map<string, Promise<{ payload: DownloadPayload }>>();
const s1BaseInflight = new Map<string, Promise<{ candles: SanitizedCandle[] }>>();

// Retry policy for transient network failures. Dukascopy's DNS intermittently
// resolves to an unreachable IPv6 address on this machine; IPv4 always works,
// so a simple retry recovers reliably.
const RETRY_ATTEMPTS = 3;

// s1 base disk-cache hygiene: keep the newest ~512MB of processed s1 files.
const S1_MAX_TOTAL_BYTES = 512 * 1024 * 1024;

const NETWORK_ERROR_CODES = new Set([
  "EADDRNOTAVAIL",
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
  "ECONNABORTED",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);

class DataNotFoundError extends Error {}

interface SanitizedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DownloadPayload {
  instrument: any;
  timeframe: string;
  count: number;
  startTime: string;
  endTime: string;
  candles: SanitizedCandle[];
}

// Node fetch failures wrap their real cause in AggregateError/cause chains
// (e.g. cause.errors[0].code === "EADDRNOTAVAIL"), so walk the whole tree.
function collectErrorCodes(err: any, out: Set<string> = new Set()): Set<string> {
  if (!err) return out;
  if (err.code) out.add(String(err.code));
  if (Array.isArray(err.errors)) {
    for (const child of err.errors) collectErrorCodes(child, out);
  }
  if (err.cause) collectErrorCodes(err.cause, out);
  return out;
}

function isNetworkError(err: any): boolean {
  const codes = collectErrorCodes(err);
  for (const code of codes) {
    if (NETWORK_ERROR_CODES.has(code)) return true;
  }
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("fetch failed") || msg.includes("network") || msg.includes("socket");
}

async function withNetworkRetry<T>(fn: () => Promise<T>, attempts = RETRY_ATTEMPTS, label = "fetch"): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (!isNetworkError(err)) throw err;
      if (attempt === attempts) break;
      const backoffMs = 800 * Math.pow(2, attempt - 1);
      console.warn(
        `[Dukascopy API] ${label} failed on attempt ${attempt}/${attempts} with network error (${err?.code || err?.message}); retrying in ${backoffMs}ms...`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastError;
}

function sanitizeCandles(rawData: any[]): SanitizedCandle[] {
  if (!Array.isArray(rawData)) return [];
  const timeMap = new Map<number, SanitizedCandle>();
  for (const item of rawData) {
    if (!item.timestamp) continue;
    const sec = Math.floor(item.timestamp / 1000);
    if (isNaN(sec) || !item.open || !item.high || !item.low || !item.close) continue;
    timeMap.set(sec, {
      time: sec,
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume || 0),
    });
  }
  return Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
}

// Load (or fetch once and cache) the real s1 base data for a range. The s1
// base is the shared source for s5/s15/s30/tick — like m1 is the shared base
// for 5m/15m/1h — so switching sub-minute timeframes reuses one tick download
// instead of re-downloading it per timeframe. Cached on disk only (a 30-day s1
// file is ~30-40MB, too big for the in-memory Map).
function loadS1Base(
  dukascopyInstrument: string,
  fromDate: string,
  toDate: string,
  priceType: string,
  instMeta: any
): Promise<{ candles: SanitizedCandle[] }> {
  const baseKey = `${dukascopyInstrument}_${fromDate}_${toDate}_${priceType}_s1`;

  if (s1BaseInflight.has(baseKey)) {
    console.log(`[Dukascopy API] s1 base request joined: ${baseKey}`);
    return s1BaseInflight.get(baseKey)!;
  }

  const promise = (async (): Promise<{ candles: SanitizedCandle[] }> => {
    const s1Path = path.join(cacheDir, `processed_${baseKey}.json`);

    if (fs.existsSync(s1Path)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(s1Path, "utf-8")) as DownloadPayload;
        console.log(`[Dukascopy API] s1 base cache hit: ${baseKey} (${parsed.candles.length} candles)`);
        return { candles: parsed.candles };
      } catch {
        console.warn(`[Dukascopy API] Stale s1 base cache read error for ${baseKey}, re-fetching...`);
      }
    }

    console.log(`[Dukascopy API] Fetching s1 base: ${dukascopyInstrument} from ${fromDate} to ${toDate}`);

    // Real 1-second tick data. Raw tick binaries are gigabytes of data, so
    // useCache stays false — only our aggregated JSON s1 base is persisted.
    // Gentle batching (20 files per batch + 100ms pause) keeps multi-day
    // downloads (~672 hourly files for 28 days) polite to Dukascopy.
    // Per-file retries (retryCount: 2) absorb rate-limit (429) blips; with
    // failAfterRetryCount: false a persistently-429'd or missing file is
    // skipped like today instead of failing the whole pull (weekends/holidays
    // have no file and must not abort the download).
    const rawData = await withNetworkRetry(
      () =>
        getHistoricalRates({
          instrument: dukascopyInstrument as any,
          dates: {
            from: fromDate,
            to: toDate,
          },
          timeframe: "s1",
          priceType: priceType === "ask" ? "ask" : "bid",
          format: "json",
          useCache: false,
          cacheFolderPath: cacheDir,
          ignoreFlats: true,
          batchSize: 20,
          pauseBetweenBatchesMs: 100,
          retryCount: 2,
          pauseBetweenRetriesMs: 1000,
          failAfterRetryCount: false,
        }),
      RETRY_ATTEMPTS,
      `s1 download for ${baseKey}`
    );

    const candles = sanitizeCandles(rawData);
    if (candles.length === 0) {
      throw new DataNotFoundError(
        `No historical Dukascopy data found for ${instMeta.symbol} between ${fromDate} and ${toDate}. Markets may be closed or dates are outside valid historical range.`
      );
    }

    const s1Payload: DownloadPayload = {
      instrument: instMeta,
      timeframe: "s1",
      count: candles.length,
      startTime: new Date(candles[0].time * 1000).toISOString(),
      endTime: new Date(candles[candles.length - 1].time * 1000).toISOString(),
      candles,
    };
    try {
      fs.writeFileSync(s1Path, JSON.stringify(s1Payload));
      enforceS1CacheLimit();
    } catch {
      console.warn(`[Dukascopy API] Could not write s1 base cache for ${baseKey}`);
    }

    return { candles };
  })().finally(() => {
    s1BaseInflight.delete(baseKey);
  });

  s1BaseInflight.set(baseKey, promise);
  return promise;
}

// Simple LRU: when total processed *s1.json size exceeds the cap, delete the
// oldest files until back under it.
function enforceS1CacheLimit(maxBytes = S1_MAX_TOTAL_BYTES): void {
  try {
    const files = fs
      .readdirSync(cacheDir)
      .filter((f) => f.startsWith("processed_") && f.endsWith("_s1.json"))
      .map((f) => {
        const p = path.join(cacheDir, f);
        const stat = fs.statSync(p);
        return { name: f, path: p, mtimeMs: stat.mtimeMs, size: stat.size };
      });
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes <= maxBytes) return;
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    let reclaimed = 0;
    for (const f of files) {
      if (totalBytes - reclaimed <= maxBytes) break;
      try {
        fs.unlinkSync(f.path);
        reclaimed += f.size;
        console.log(
          `[Dukascopy API] Removed oldest s1 cache file ${f.name} (total was ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`
        );
      } catch {
        // ignore files that disappear between listing and deletion
      }
    }
  } catch {
    // ignore listing errors
  }
}

// Download Dukascopy historical data endpoint
app.post("/api/download", async (req, res) => {
  const startTimeMs = Date.now();
  try {
    const { instrument, fromDate, toDate, priceType = "bid", timeframe = "m1" } = req.body;

    if (!instrument || !fromDate || !toDate) {
      return res.status(400).json({ error: "Missing required fields: instrument, fromDate, toDate" });
    }

    const requestedTimeframeRaw = String(timeframe || "m1").toLowerCase().trim();
    if (!ALLOWED_TIMEFRAMES.has(requestedTimeframeRaw)) {
      return res.status(400).json({
        error: `Unsupported timeframe "${requestedTimeframeRaw}". Allowed: tick, s1, s5, s15, s30, m1, m5, m15, m30, h1, h4, d1, 1w, mn1.`,
      });
    }

    const tfInfo = normalizeRequestedTimeframe(requestedTimeframeRaw);
    const requestedTimeframe = tfInfo.canonical;

    // Sub-minute data is real tick data — enormous to download, so cap ranges.
    const isSubMinute = tfInfo.isSubMinute;
    if (isSubMinute) {
      const fromTs = new Date(fromDate).getTime();
      const toTs = new Date(toDate).getTime();
      const maxDays = getMaxRangeDaysForTimeframe(requestedTimeframe);
      if (!Number.isNaN(fromTs) && !Number.isNaN(toTs) && toTs - fromTs > maxDays * DAY_MS) {
        return res.status(400).json({
          error: `Requested range exceeds the ${maxDays}-day limit for ${requestedTimeframe} data.`,
        });
      }
    }

    const cleanInstrument = String(instrument).toLowerCase().trim();
    const dukascopyInstrument = DUKASCOPY_ALIAS_MAP[cleanInstrument] || cleanInstrument;

    const instMeta = SUPPORTED_INSTRUMENTS.find(i => i.id === dukascopyInstrument || i.id === cleanInstrument) || {
      id: dukascopyInstrument,
      symbol: cleanInstrument.toUpperCase(),
      name: cleanInstrument.toUpperCase(),
      category: "forex_major" as const,
      pipSize: cleanInstrument.includes("jpy") ? 0.01 : 0.0001,
      decimalPlaces: cleanInstrument.includes("jpy") ? 3 : 5,
    };

    const cacheKey = `${dukascopyInstrument}_${fromDate}_${toDate}_${priceType}_${requestedTimeframe}`;
    const processedJsonPath = path.join(cacheDir, `processed_${cacheKey}.json`);

    // 1. Check in-memory cache first (0ms instant)
    if (memoryCache.has(cacheKey)) {
      const cachedData = memoryCache.get(cacheKey);
      const latencyMs = Date.now() - startTimeMs;
      console.log(`[Dukascopy API] In-Memory Cache Hit for ${cacheKey} (${latencyMs}ms)`);
      return res.json({ ...cachedData, cached: true, latencyMs });
    }

    // 2. Check disk JSON cache second (<5ms)
    if (fs.existsSync(processedJsonPath)) {
      try {
        const rawJson = fs.readFileSync(processedJsonPath, "utf-8");
        const parsedData = JSON.parse(rawJson);
        memoryCache.set(cacheKey, parsedData);
        const latencyMs = Date.now() - startTimeMs;
        console.log(`[Dukascopy API] Disk JSON Cache Hit for ${cacheKey} (${latencyMs}ms)`);
        return res.json({ ...parsedData, cached: true, latencyMs });
      } catch (err) {
        console.warn(`[Dukascopy API] Stale JSON cache read error for ${cacheKey}, re-fetching...`);
      }
    }

    // 3. Deduplicate concurrent identical requests (e.g. the session loader and
    //    the chart both ask for the same range): the second caller awaits the
    //    first one's in-flight download instead of starting a new one.
    if (inflightRequests.has(cacheKey)) {
      const shared = await inflightRequests.get(cacheKey)!;
      const latencyMs = Date.now() - startTimeMs;
      console.log(`[Dukascopy API] In-flight request joined for ${cacheKey} (${latencyMs}ms)`);
      return res.json({ ...shared.payload, cached: true, latencyMs });
    }

    const downloadPromise = (async (): Promise<{ payload: DownloadPayload }> => {
      let responseCandles: SanitizedCandle[];
      let actualTimeframe: string;

      if (isSubMinute) {
        // Sub-minute timeframes are built from the real s1 base (disk-cached,
        // shared across s1/s5/s15/s30/tick for the same range).
        const { candles: s1Candles } = await loadS1Base(dukascopyInstrument, fromDate, toDate, priceType, instMeta);
        actualTimeframe = requestedTimeframe === "tick" ? "s1" : requestedTimeframe;

        if (requestedTimeframe === "s1" || requestedTimeframe === "tick") {
          // "tick" is served as the real s1 bars themselves.
          responseCandles = s1Candles;
        } else {
          // Aggregate real s1 candles up to the requested sub-minute timeframe.
          const msCandles = s1Candles.map((c) => ({
            timestamp: c.time * 1000,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));
          responseCandles = aggregateCandles(msCandles, requestedTimeframe).map((c) => ({
            time: c.timestamp / 1000,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));
        }
      } else if (tfInfo.aggregationTarget === "1W") {
        console.log(`[Dukascopy API] Requesting ${dukascopyInstrument} (raw: ${cleanInstrument}) from ${fromDate} to ${toDate} (d1 for 1W)`);
        const rawData = await withNetworkRetry(
          () =>
            getHistoricalRates({
              instrument: dukascopyInstrument as any,
              dates: {
                from: fromDate,
                to: toDate,
              },
              timeframe: "d1",
              priceType: priceType === "ask" ? "ask" : "bid",
              format: "json",
              useCache: true,
              cacheFolderPath: cacheDir,
              ignoreFlats: true,
              batchSize: 30,
              pauseBetweenBatchesMs: 0,
              retryCount: 2,
              pauseBetweenRetriesMs: 1000,
              failAfterRetryCount: false,
            }),
          RETRY_ATTEMPTS,
          `d1 (for 1W) download for ${cacheKey}`
        );
        const d1Candles = sanitizeCandles(rawData);
        const msCandles = d1Candles.map((c) => ({
          timestamp: c.time * 1000,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
        const weekly = aggregateCandles(msCandles, "1W");
        responseCandles = weekly.map((c) => ({
          time: c.timestamp / 1000,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
        actualTimeframe = "1W";
      } else {
        const nativeTf = tfInfo.nativeDukascopyTimeframe;
        console.log(`[Dukascopy API] Requesting ${dukascopyInstrument} (raw: ${cleanInstrument}) from ${fromDate} to ${toDate} (native ${nativeTf})`);
        const rawData = await withNetworkRetry(
          () =>
            getHistoricalRates({
              instrument: dukascopyInstrument as any,
              dates: {
                from: fromDate,
                to: toDate,
              },
              timeframe: nativeTf as any,
              priceType: priceType === "ask" ? "ask" : "bid",
              format: "json",
              useCache: true,
              cacheFolderPath: cacheDir,
              ignoreFlats: true,
              batchSize: 30,
              pauseBetweenBatchesMs: 0,
              retryCount: 2,
              pauseBetweenRetriesMs: 1000,
              failAfterRetryCount: false,
            }),
          RETRY_ATTEMPTS,
          `${nativeTf} download for ${cacheKey}`
        );
        responseCandles = sanitizeCandles(rawData);
        actualTimeframe = tfInfo.canonical;
      }

      if (responseCandles.length === 0) {
        throw new DataNotFoundError(
          `No historical Dukascopy data found for ${instMeta.symbol} between ${fromDate} and ${toDate}. Markets may be closed or dates are outside valid historical range.`
        );
      }

      const startTimeISO = new Date(responseCandles[0].time * 1000).toISOString();
      const endTimeISO = new Date(responseCandles[responseCandles.length - 1].time * 1000).toISOString();
      const elapsedMs = Date.now() - startTimeMs;

      console.log(`[Dukascopy API] Processed ${responseCandles.length} ${actualTimeframe} candles for ${cleanInstrument} in ${elapsedMs}ms. Span: ${startTimeISO} to ${endTimeISO}`);

      const payload: DownloadPayload = {
        instrument: instMeta,
        timeframe: actualTimeframe,
        count: responseCandles.length,
        startTime: startTimeISO,
        endTime: endTimeISO,
        candles: responseCandles,
      };

      // Save to memory cache & disk JSON cache
      memoryCache.set(cacheKey, payload);
      try {
        fs.writeFileSync(processedJsonPath, JSON.stringify(payload));
      } catch {
        console.warn(`[Dukascopy API] Could not write disk cache for ${cacheKey}`);
      }

      return { payload };
    })().finally(() => {
      inflightRequests.delete(cacheKey);
    });

    inflightRequests.set(cacheKey, downloadPromise);

    const { payload } = await downloadPromise;
    return res.json({ ...payload, cached: false, latencyMs: Date.now() - startTimeMs });
  } catch (err: any) {
    if (err instanceof DataNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (isNetworkError(err)) {
      console.error("[Dukascopy API] Dukascopy data feed unreachable after retries:", err);
      return res.status(503).json({
        error: "Dukascopy data feed is currently unreachable. Please retry in a moment.",
      });
    }
    console.error("[Dukascopy API] Fetch Error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to download market data from Dukascopy.",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AuraEngine Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();