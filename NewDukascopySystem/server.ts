import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { getHistoricalRates, Instrument } from "dukascopy-node";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Ensure cache directory exists
const cacheDir = path.join(process.cwd(), ".dukascopy-cache");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Popular instruments list with metadata
export interface InstrumentMeta {
  id: string;
  symbol: string;
  name: string;
  category: "forex_major" | "forex_cross" | "forex_exotic" | "commodities" | "crypto" | "indices" | "stocks";
  pipSize: number;
  decimalPlaces: number;
}

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
  { id: "xptusd", symbol: "XPT/USD", name: "Platinum / US Dollar", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
  { id: "xpdusd", symbol: "XPD/USD", name: "Palladium / US Dollar", category: "commodities", pipSize: 0.1, decimalPlaces: 2 },
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
  { id: "us500", symbol: "US500", name: "S&P 500 Index", category: "indices", pipSize: 0.1, decimalPlaces: 2 },
  { id: "us30", symbol: "US30", name: "Dow Jones 30 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "ustecusd", symbol: "NAS100", name: "Nasdaq 100 Index", category: "indices", pipSize: 0.1, decimalPlaces: 2 },
  { id: "deidxeur", symbol: "GER40", name: "DAX 40 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "ukidxgbp", symbol: "UK100", name: "FTSE 100 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "fridxeur", symbol: "FRA40", name: "CAC 40 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "jpidxjpy", symbol: "JPN225", name: "Nikkei 225 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "ausidxaud", symbol: "AUS200", name: "ASX 200 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "euidxeur", symbol: "EU50", name: "Euro Stoxx 50 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "hkidxhkd", symbol: "HK50", name: "Hang Seng Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },
  { id: "chnidxcny", symbol: "CHI50", name: "China A50 Index", category: "indices", pipSize: 1.0, decimalPlaces: 1 },

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

// In-Memory Fast Cache Map
const memoryCache = new Map<string, any>();

// Download Dukascopy historical data endpoint
app.post("/api/download", async (req, res) => {
  const startTimeMs = Date.now();
  try {
    const { instrument, fromDate, toDate, priceType = "bid" } = req.body;

    if (!instrument || !fromDate || !toDate) {
      return res.status(400).json({ error: "Missing required fields: instrument, fromDate, toDate" });
    }

    const cleanInstrument = String(instrument).toLowerCase().trim();
    const instMeta = SUPPORTED_INSTRUMENTS.find(i => i.id === cleanInstrument) || {
      id: cleanInstrument,
      symbol: cleanInstrument.toUpperCase(),
      name: cleanInstrument.toUpperCase(),
      category: "forex_major" as const,
      pipSize: cleanInstrument.includes("jpy") ? 0.01 : 0.0001,
      decimalPlaces: cleanInstrument.includes("jpy") ? 3 : 5,
    };

    const cacheKey = `${cleanInstrument}_${fromDate}_${toDate}_${priceType}`;
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

    console.log(`[Dukascopy API] Requesting ${cleanInstrument} from ${fromDate} to ${toDate}`);

    // 3. Fetch 1-minute resolution data from Dukascopy with speed-optimized batching
    const rawData = await getHistoricalRates({
      instrument: cleanInstrument as any,
      dates: {
        from: fromDate,
        to: toDate,
      },
      timeframe: "m1",
      priceType: priceType === "ask" ? "ask" : "bid",
      format: "json",
      useCache: true,
      cacheFolderPath: cacheDir,
      ignoreFlats: true,
      batchSize: 30,
      pauseBetweenBatchesMs: 0,
    });

    if (!Array.isArray(rawData) || rawData.length === 0) {
      return res.status(404).json({
        error: `No historical Dukascopy data found for ${instMeta.symbol} between ${fromDate} and ${toDate}. Markets may be closed or dates are outside valid historical range.`
      });
    }

    // Process & sanitize candles sorted by timestamp
    const timeMap = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();

    for (const item of rawData) {
      if (!item.timestamp) continue;
      const sec = Math.floor(item.timestamp / 1000);
      
      // Filter out invalid items
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

    const candles = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);

    if (candles.length === 0) {
      return res.status(404).json({
        error: `Failed to extract valid OHLC candles for ${instMeta.symbol}.`
      });
    }

    const startTimeISO = new Date(candles[0].time * 1000).toISOString();
    const endTimeISO = new Date(candles[candles.length - 1].time * 1000).toISOString();
    const latencyMs = Date.now() - startTimeMs;

    console.log(`[Dukascopy API] Processed ${candles.length} m1 candles for ${cleanInstrument} in ${latencyMs}ms. Span: ${startTimeISO} to ${endTimeISO}`);

    const resultPayload = {
      instrument: instMeta,
      timeframe: "m1",
      count: candles.length,
      startTime: startTimeISO,
      endTime: endTimeISO,
      candles,
    };

    // Save to memory cache & disk JSON cache
    memoryCache.set(cacheKey, resultPayload);
    try {
      fs.writeFileSync(processedJsonPath, JSON.stringify(resultPayload));
    } catch (err) {
      console.warn(`[Dukascopy API] Could not write disk cache for ${cacheKey}`, err);
    }

    return res.json({
      ...resultPayload,
      cached: false,
      latencyMs,
    });
  } catch (err: any) {
    console.error("[Dukascopy API] Fetch Error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to download market data from Dukascopy."
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
    console.log(`[Dukascopy Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
