import express from "express";
import path from "path";
import fs from "fs";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import { getHistoricalRates, Instrument } from "dukascopy-node";
import { filterEventsByCurrencies, scrapeDayRange } from "./forexfactoryScraper";
import { aggregateCandles } from "./src/lib/timeframe";
import {
  BadRequestError,
  DUKASCOPY_ALIAS_MAP,
  findCoverageProblem,
  shiftDate,
  validateDownloadRequest,
  type DukascopyNativeTimeframe,
} from "./src/lib/dukascopyRequest";
import { registerDriveRoutes } from "./driveServerRoutes";

export { DUKASCOPY_ALIAS_MAP };

// Root fix for intermittent EADDRNOTAVAIL fetch failures: this machine has no
// usable IPv6 route, and Dukascopy's DNS sometimes returns AAAA first. Forcing
// IPv4-first ordering makes every connection use the working IPv4 path.
dns.setDefaultResultOrder("ipv4first");

const app = express();
const PORT = 3000;

/**
 * Where the server listens.
 *
 * Defaults to loopback. It previously bound `0.0.0.0` unconditionally, which put
 * every route on the LAN with no authentication at all — including
 * `/api/auth/google/status`, which returns the connected Google account's email
 * address and Drive file id, and `/api/drive/restore`, which reads that Drive
 * file. `/api/auth/google/logout` is a POST with no CSRF defence, so any page a
 * browser on the network visited could disconnect the account.
 *
 * Defaulting to loopback keeps a working local setup working while making
 * exposure something you choose on purpose. Set `AURA_BIND=lan` to serve the LAN
 * deliberately; do that only on a network you trust, and prefer tunnelling.
 */
const BIND_HOST = process.env.AURA_BIND === "lan" ? "0.0.0.0" : "127.0.0.1";

/**
 * Body size cap.
 *
 * Was 100 MB on every route, which is a trivial memory-exhaustion vector: no
 * endpoint here needs a request body anywhere near that large — the largest is a
 * handful of small JSON fields. 2 MB is far above anything legitimate while
 * still bounding what a single request can allocate.
 */
const JSON_BODY_LIMIT = process.env.AURA_MAX_BODY ?? "2mb";

app.use(express.json({ limit: JSON_BODY_LIMIT }));

/**
 * Turns a body-parse or routing failure into a plain 4xx.
 *
 * Without this, Express's default error handler returns the full stack trace as
 * HTML, which leaks absolute filesystem paths and internal module layout to
 * whoever sent the malformed request. Observed in practice: a POST with a
 * malformed body returned a page containing `D:\ReplayX2027\node_modules\...`.
 * The real error is still logged server-side.
 */
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  // body-parser marks its own failures with `type` and a status.
  const isBodyParse = err?.type === "entity.parse.failed" || err?.status === 400 || err?.statusCode === 400;
  const isTooLarge = err?.type === "entity.too.large";
  if (isTooLarge) {
    return res.status(413).json({ error: `Request body too large (limit ${JSON_BODY_LIMIT}).` });
  }
  if (isBodyParse) {
    return res.status(400).json({ error: "Malformed JSON in request body." });
  }
  console.error("[Server] Unhandled request error:", err);
  return res.status(500).json({ error: "Internal server error." });
});

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

// Instrument metadata lives in src/lib/instruments.ts so it can be imported and
// tested â€” it was inline here, which made it unreachable from `node --test`
// because this module binds a port at import time.
export type { InstrumentMeta } from "./src/lib/instruments";
import { SUPPORTED_INSTRUMENTS, unavailableReason, type InstrumentMeta } from "./src/lib/instruments";
import { createBoundedCache, createRateLimiter, enforceCacheLimits, writeCacheFile } from "./src/lib/cacheStore";

/**
 * The set of instruments Dukascopy actually serves, taken from dukascopy-node's
 * own `Instrument` enum (1499 runtime values).
 *
 * This â€” not `SUPPORTED_INSTRUMENTS` â€” is the authority on whether a symbol can
 * be downloaded. The catalogue is hand-maintained and had drifted: seven of its
 * entries are not served upstream at all, and because the catalogue was the only
 * gate they passed validation and then threw inside dukascopy-node, surfacing as
 * a 500 with an `undefined` message. See `UNAVAILABLE_UPSTREAM`.
 */
const VALID_DUKASCOPY_INSTRUMENTS = new Set<string>(
  Object.values(Instrument as Record<string, string>).map((v) => String(v).toLowerCase())
);


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

/**
 * Upper bound on the in-process payload cache.
 *
 * Every download is retained for the lifetime of the process, and the same data
 * is then also held client-side as `Candle[]` in milliseconds — so a session's
 * candles exist twice at once, in two representations. With no bound, browsing
 * many instruments, ranges and timeframes grows this without limit for as long
 * as the server is up.
 *
 * Counted rather than byte-weighted because payloads vary by orders of magnitude
 * (a 3-day s1 window vs a 5-year d1 series) and a byte budget would need
 * per-entry size tracking to be meaningful. 48 entries comfortably covers a
 * working session's worth of pivots between instruments and timeframes.
 */
const MEMORY_CACHE_MAX_ENTRIES = 48;

// In-Memory Fast Cache Map. Bounded: an unbounded map here grew for the lifetime
// of the process, and the same candles are additionally held client-side in
// milliseconds, so a session's data exists twice at once in two representations.
const memoryCache = createBoundedCache<any>(MEMORY_CACHE_MAX_ENTRIES);

/**
 * Bumped whenever a change alters how a payload is produced, so cached entries
 * written by an older pipeline are not served after the fact.
 *
 * The processed files in `.dukascopy-cache` are derived data whose filenames are
 * part of the cache key. Without this, any change to the transformation â€” an
 * aggregation base, a Monday week anchor, the `ignoreFlats` policy â€” silently
 * keeps serving entries computed the old way, which is exactly how a truncated
 * or lossy result outlives the fix for it.
 */
const CACHE_PIPELINE_VERSION = 3;

// In-flight dedup maps: concurrent identical requests share one download.
const inflightRequests = new Map<string, Promise<{ payload: DownloadPayload }>>();
const s1BaseInflight = new Map<string, Promise<{ candles: SanitizedCandle[] }>>();

// Retry policy for transient network failures. Dukascopy's DNS intermittently
// resolves to an unreachable IPv6 address on this machine; IPv4 always works,
// so a simple retry recovers reliably.
const RETRY_ATTEMPTS = 3;

// Disk-cache hygiene. s1 (tick) payloads are far larger per file than everything
// else, so they get their own budget — otherwise a tick cache would evict every
// other payload. The non-s1 budget previously did not exist at all.
const S1_MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const PAYLOAD_MAX_TOTAL_BYTES = 768 * 1024 * 1024;

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
  /** Normalized day range this payload answers, echoed back to the client. */
  requestedFrom?: string;
  requestedTo?: string;
  /**
   * True when `findCoverageProblem` found an interior gap too large to be a
   * market closure â€” i.e. an upstream download failed part-way through. Partial
   * payloads are still returned but are never written to either cache, so the
   * next request re-downloads instead of replaying the same truncated data.
   */
  partial?: boolean;
  /** Human-readable explanation accompanying `partial`. */
  warning?: string;
  /**
   * Structured form of `warning`, so the client can render a short message
   * without parsing English. `warning` stays precise for the server log and for
   * any caller that wants the detail.
   */
  partialKind?: "interior" | "tail" | "head";
  /** Size of the gap or shortfall, in days. */
  partialDays?: number;
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
    if (!item || !item.timestamp) continue;
    const sec = Math.floor(Number(item.timestamp) / 1000);
    if (!Number.isFinite(sec)) continue;

    // Parse first, then validate. The previous form tested the raw values for
    // truthiness (`!item.open`) and only then called `Number()`, so a non-numeric
    // price such as the string "abc" passed the check — it is truthy — and was
    // stored as NaN, poisoning every downstream aggregate that touched it. A
    // zero price is still rejected, since it is not a plausible quote for any
    // instrument here, but on the parsed value rather than on truthiness.
    const open = Number(item.open);
    const high = Number(item.high);
    const low = Number(item.low);
    const close = Number(item.close);
    const volume = item.volume === undefined || item.volume === null ? 0 : Number(item.volume);
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    if (open === 0 || high === 0 || low === 0 || close === 0) continue;
    if (high < low) continue;

    timeMap.set(sec, {
      time: sec,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  return Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
}

function toMillisCandle(c: SanitizedCandle) {
  return {
    timestamp: c.time * 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

function toSecondsCandle(c: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }): SanitizedCandle {
  return {
    time: c.timestamp / 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

/**
 * Downloads one native Dukascopy timeframe.
 *
 * `failAfterRetryCount: false` means a file that 404s or is rate-limited is
 * skipped rather than aborting the whole pull â€” required, because weekends and
 * holidays legitimately have no file. The trade-off is that a *genuine* failure
 * looks identical to a market closure, which is why every caller runs the result
 * through `findCoverageProblem` before trusting or caching it.
 *
 * `ignoreFlats` is enabled only for the sub-second feeds. On the daily feed it
 * discards real flat weekday sessions for equities, which silently corrupts the
 * weekly candles built from them â€” see `dropFlatWeekendBars`.
 */
function downloadNative(
  nativeTf: DukascopyNativeTimeframe,
  dukascopyInstrument: string,
  fromDate: string,
  toDate: string,
  priceType: "bid" | "ask",
): Promise<any[]> {
  const isSubSecond = nativeTf === "s1";
  return getHistoricalRates({
    instrument: dukascopyInstrument as any,
    dates: { from: fromDate, to: toDate },
    timeframe: nativeTf as any,
    priceType,
    format: "json",
    useCache: true,
    cacheFolderPath: cacheDir,
    ignoreFlats: isSubSecond,
    batchSize: 30,
    pauseBetweenBatchesMs: 0,
    retryCount: 2,
    pauseBetweenRetriesMs: 1000,
    failAfterRetryCount: false,
  });
}

/**
 * Drops aggregated buckets that fall entirely outside `[fromDate, toDate)`.
 *
 * Only needed when the native range was padded to cover whole buckets: the
 * padding can pull in one extra bucket on each side, and those are not part of
 * what the caller asked for.
 */
function clipBucketsToRange<T extends { timestamp: number }>(
  candles: T[],
  fromDate: string,
  toDate: string,
  periodSec: number,
): T[] {
  const fromMs = new Date(`${fromDate}T00:00:00Z`).getTime();
  const toMs = new Date(`${toDate}T00:00:00Z`).getTime();
  const spanMs = periodSec * 1000;
  return candles.filter((c) => c.timestamp + spanMs > fromMs && c.timestamp < toMs);
}

/**
 * Drops Dukascopy's flat weekend placeholder bars.
 *
 * These exist for markets that are closed all weekend: a Saturday (and, for
 * equities, a Sunday) bar with O=H=L=C carrying the last close. They are noise
 * in a chart and contribute nothing to a weekly candle.
 *
 * This replaces `ignoreFlats` for the daily feed, which was doing the same job
 * far too aggressively. Measured over 2025-01-01..2026-09-27:
 *
 *   eurusd        90 dropped, all Saturday                      -> weekly OHLC unchanged
 *   btcusd         0 dropped (trades weekends)                  -> unchanged
 *   xauusd        92 dropped (90 Sat, 2 Fri)                    -> weekly OHLC unchanged
 *   usa500idxusd  92 dropped (90 Sat, 2 Fri)                    -> weekly OHLC unchanged
 *   aaplususd    199 dropped (90 Sat, 90 Sun, 19 weekdays)     -> 9 weekly candles WRONG
 *
 * For equities, `ignoreFlats` also discards flat *weekday* bars â€” a quiet or
 * halted session is real information â€” and in 3 cases the discarded bar sat
 * outside its week's range, so it was extending the weekly high or low. That
 * made the 1W candles wrong. Restricting the filter to flat bars that also fall
 * on a weekend keeps every real session and removes only the placeholders.
 */
function dropFlatWeekendBars(candles: SanitizedCandle[]): SanitizedCandle[] {
  return candles.filter((c) => {
    if (c.open !== c.high || c.high !== c.low || c.low !== c.close) return true;
    const weekday = new Date(c.time * 1000).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  });
}

// Load (or fetch once and cache) the real s1 base data for a range. The s1
// base is the shared source for s5/s15/s30/tick â€” like m1 is the shared base
// for 5m/15m/1h â€” so switching sub-minute timeframes reuses one tick download
// instead of re-downloading it per timeframe. Cached on disk only (a 30-day s1
// file is ~30-40MB, too big for the in-memory Map).
function loadS1Base(
  dukascopyInstrument: string,
  fromDate: string,
  toDate: string,
  priceType: string,
  instMeta: any
): Promise<{ candles: SanitizedCandle[] }> {
  const baseKey = `v${CACHE_PIPELINE_VERSION}_${dukascopyInstrument}_${fromDate}_${toDate}_${priceType}_s1`;

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
    // useCache stays false â€” only our aggregated JSON s1 base is persisted.
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
    // Written asynchronously and not awaited: a multi-megabyte `JSON.stringify`
    // plus a synchronous write is charged to the event loop, and this is on the
    // request path. A failed cache write costs a re-download later, never
    // correctness, so it must not delay the response.
    writeCacheFile(s1Path, s1Payload, `s1 base cache for ${baseKey}`);
    maybeEnforceCacheLimits();

    return { candles };
  })().finally(() => {
    s1BaseInflight.delete(baseKey);
  });

  s1BaseInflight.set(baseKey, promise);
  return promise;
}

/**
 * Throttles the cache sweep. It is a full `readdirSync` plus a `statSync` per
 * file, which is real work to do on every single download; once a minute is far
 * more often than the budgets need.
 */
let lastCacheSweepMs = 0;
function maybeEnforceCacheLimits(): void {
  const now = Date.now();
  if (now - lastCacheSweepMs < 60_000) return;
  lastCacheSweepMs = now;
  enforceCacheLimits({
    cacheDir,
    pipelineVersion: CACHE_PIPELINE_VERSION,
    s1MaxBytes: S1_MAX_TOTAL_BYTES,
    payloadMaxBytes: PAYLOAD_MAX_TOTAL_BYTES,
    log: (m) => console.log(`[Dukascopy API] ${m}`),
  });
}

/**
 * Detects a cached payload that was written by a download which silently lost
 * part of its range.
 * Freshly-built payloads are already checked before being cached, but files
 * written by earlier versions of this endpoint predate that check â€” so a
 * truncated H1/H4 series produced before the fix would otherwise be served
 * forever, leaving the original bug in place for anyone who upgrades without
 * clearing `.dukascopy-cache`.
 *
 * Returns a short reason to discard the entry, or null when it is usable.
 */
function isIncompleteCachedPayload(payload: any): string | null {
  if (!payload || !Array.isArray(payload.candles) || payload.candles.length === 0) {
    return 'no candles';
  }
  // `requestedTo` is absent on payloads written before it was recorded, in which
  // case only interior gaps can be checked.
  const requestedTo = payload.requestedTo
    ? new Date(`${payload.requestedTo}T00:00:00Z`).getTime() / 1000
    : undefined;
  const problem = findCoverageProblem(
    payload.candles.map((c: SanitizedCandle) => c.time),
    String(payload.timeframe ?? 'm1'),
    requestedTo,
    undefined,
    // Payloads record their instrument metadata, so the per-class gap tolerance
    // applies to cached entries too. Absent on payloads written before this
    // existed, which fall back to the loosest allowance.
    payload.instrument?.category,
    // Payloads record the range they were built for, so the head check applies to
    // cached entries too. Absent on payloads written before it was recorded.
    payload.requestedFrom
      ? new Date(`${payload.requestedFrom}T00:00:00Z`).getTime() / 1000
      : undefined,
  );
  if (!problem) return null;
  const days = (problem.largestGapSeconds / 86_400).toFixed(1);
  const noun = problem.kind === 'interior' ? 'gap' : 'shortfall';
  return `${problem.kind} ${days}-day ${noun}`;
}

// Bounds how much upstream work a single client can ask for.
//
// This is not only about protecting this process. Dukascopy rate-limits, and
// being rate-limited by it is the *original* bug: the hour feed's per-month file
// returns HTTP 429 while the month is in progress, `failAfterRetryCount: false`
// swallowed it, and the session silently lost a month of data. Uncontrolled
// client volume therefore feeds straight back into silent data loss, so the
// limiter is a data-correctness control as much as a resource one.
//
// Deliberately generous — 30/min sustained with a burst of 10 — so a person
// clicking between sessions, timeframes and instruments never notices.
const downloadRateLimiter = createRateLimiter({
  requestsPerMinute: Number(process.env.AURA_DOWNLOAD_RPM ?? 30),
  burst: Number(process.env.AURA_DOWNLOAD_BURST ?? 10),
});

// Download Dukascopy historical data endpoint
app.post("/api/download", async (req, res) => {
  const startTimeMs = Date.now();
  try {
    // `req.ip` needs the trust proxy set for x-forwarded-for to be honoured; with
    // the default it resolves to the socket address, which is the right thing for
    // a loopback-bound server.
    const clientKey = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (!downloadRateLimiter.take(clientKey)) {
      const retryAfter = downloadRateLimiter.retryAfterSeconds(clientKey);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: `Too many download requests. Try again in ${retryAfter}s.`,
        retryAfterSeconds: retryAfter,
      });
    }

    // Normalize and validate once, up front. Everything downstream â€” the cache
    // key, the on-disk filename, the sub-minute range cap â€” derives from these
    // canonical values rather than from whatever shape the caller sent.
    const { request, tfInfo } = validateDownloadRequest(
      (req.body ?? {}) as Record<string, unknown>,
      (dukascopyInstrument, rawInstrument) =>
        VALID_DUKASCOPY_INSTRUMENTS.has(dukascopyInstrument) ||
        VALID_DUKASCOPY_INSTRUMENTS.has(rawInstrument),
      (dukascopyInstrument) =>
        unavailableReason(dukascopyInstrument, (s) => VALID_DUKASCOPY_INSTRUMENTS.has(s)) ??
        "not in Dukascopy's instrument list",
    );

    const { fromDate, toDate, priceType, timeframe: requestedTimeframe } = request;
    const cleanInstrument = request.instrument;
    const isSubMinute = tfInfo.isSubMinute;

    const dukascopyInstrument = DUKASCOPY_ALIAS_MAP[cleanInstrument] || cleanInstrument;

    const instMeta = SUPPORTED_INSTRUMENTS.find(i => i.id === dukascopyInstrument || i.id === cleanInstrument) || {
      id: dukascopyInstrument,
      symbol: cleanInstrument.toUpperCase(),
      name: cleanInstrument.toUpperCase(),
      category: "forex_major" as const,
      pipSize: cleanInstrument.includes("jpy") ? 0.01 : 0.0001,
      decimalPlaces: cleanInstrument.includes("jpy") ? 3 : 5,
    };

    const cacheKey = `v${CACHE_PIPELINE_VERSION}_${dukascopyInstrument}_${fromDate}_${toDate}_${priceType}_${requestedTimeframe}`;
    const processedJsonPath = path.join(cacheDir, `processed_${cacheKey}.json`);

    // 1. Check in-memory cache first (0ms instant)
    if (memoryCache.has(cacheKey)) {
      const cachedData = memoryCache.get(cacheKey);
      // Validate on read as well as on write. Entries written before this
      // guard existed â€” including ones seeded from an on-disk file below â€” can
      // be a truncated series, and serving those forever would leave the bug in
      // place for anyone who upgrades without clearing their cache.
      const stale = isIncompleteCachedPayload(cachedData);
      if (stale) {
        console.warn(`[Dukascopy API] Discarding incomplete in-memory cache entry for ${cacheKey} (${stale})`);
        memoryCache.delete(cacheKey);
      } else {
        const latencyMs = Date.now() - startTimeMs;
        console.log(`[Dukascopy API] In-Memory Cache Hit for ${cacheKey} (${latencyMs}ms)`);
        return res.json({ ...cachedData, cached: true, latencyMs });
      }
    }

    // 2. Check disk JSON cache second (<5ms)
    if (fs.existsSync(processedJsonPath)) {
      try {
        const rawJson = fs.readFileSync(processedJsonPath, "utf-8");
        const parsedData = JSON.parse(rawJson);
        const stale = isIncompleteCachedPayload(parsedData);
        if (stale) {
          console.warn(`[Dukascopy API] Discarding incomplete disk cache file for ${cacheKey} (${stale}), re-fetching...`);
          try {
            fs.unlinkSync(processedJsonPath);
          } catch {
            // best effort: a leftover file is re-checked on the next request
          }
        } else {
          memoryCache.set(cacheKey, parsedData);
          const latencyMs = Date.now() - startTimeMs;
          console.log(`[Dukascopy API] Disk JSON Cache Hit for ${cacheKey} (${latencyMs}ms)`);
          return res.json({ ...parsedData, cached: true, latencyMs });
        }
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
          responseCandles = aggregateCandles(
            s1Candles.map(toMillisCandle),
            requestedTimeframe,
          ).map(toSecondsCandle);
        }
      } else if (tfInfo.aggregationTarget) {
        // Locally aggregated timeframes: h1/h4 from m1, 1W from d1.
        // h1/h4 deliberately use m1 â€” see resolveTimeframe() for why the native
        // hour feed cannot be trusted for the current month.
        const target = tfInfo.aggregationTarget;
        const sourceTf = tfInfo.nativeDukascopyTimeframe;

        // Weekly buckets are Monday-anchored, so the bucket containing `from`
        // normally begins before `from` and the bucket containing `to` ends
        // after it. Widen the native request by a week on each side so those
        // edge candles are built from their real days instead of silently
        // missing the days that fall outside the requested range.
        const padDays = target === "1W" ? 7 : 0;
        const sourceFrom = padDays ? shiftDate(fromDate, -padDays) : fromDate;
        const sourceTo = padDays ? shiftDate(toDate, padDays) : toDate;

        console.log(
          `[Dukascopy API] Requesting ${dukascopyInstrument} (raw: ${cleanInstrument}) ` +
          `from ${sourceFrom} to ${sourceTo} (${sourceTf} -> ${target})`
        );
        const rawData = await withNetworkRetry(
          () => downloadNative(sourceTf, dukascopyInstrument, sourceFrom, sourceTo, priceType),
          RETRY_ATTEMPTS,
          `${sourceTf} (for ${target}) download for ${cacheKey}`
        );

        const aggregated = aggregateCandles(
          dropFlatWeekendBars(sanitizeCandles(rawData)).map(toMillisCandle),
          target,
        );
        responseCandles = (padDays
          ? clipBucketsToRange(aggregated, fromDate, toDate, 604800)
          : aggregated
        ).map(toSecondsCandle);
        // Report the timeframe the caller asked for (h1/h4/1W), not the internal
        // aggregation target, so the payload matches its cache key and what the
        // client is holding in `session.timeframe`.
        actualTimeframe = tfInfo.canonical;
      } else {
        const nativeTf = tfInfo.nativeDukascopyTimeframe;
        console.log(`[Dukascopy API] Requesting ${dukascopyInstrument} (raw: ${cleanInstrument}) from ${fromDate} to ${toDate} (native ${nativeTf})`);
        const rawData = await withNetworkRetry(
          () => downloadNative(nativeTf, dukascopyInstrument, fromDate, toDate, priceType),
          RETRY_ATTEMPTS,
          `${nativeTf} download for ${cacheKey}`
        );
        const nativeCandles = sanitizeCandles(rawData);
        responseCandles = nativeTf === "d1" ? dropFlatWeekendBars(nativeCandles) : nativeCandles;
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

      // Completeness check. `candles.length > 0` is the only thing this endpoint
      // used to verify, which is why a download that silently lost a whole
      // calendar month (a 429 on one file, swallowed by failAfterRetryCount)
      // looked identical to a successful one â€” and was then cached, making the
      // truncated series permanent.
      //
      // The tail check is the one that matters here: when the missing file is
      // the most recent month, the data that never arrived is at the *end* of
      // the range, so the series just stops early. An interior-gap check cannot
      // see that, because there is no gap â€” the candles simply end.
      const coverageProblem = findCoverageProblem(
        responseCandles.map((c) => c.time),
        actualTimeframe,
        new Date(`${toDate}T00:00:00Z`).getTime() / 1000,
        undefined,
        instMeta.category,
        // The head check needs this: without it a range whose first days never
        // arrived is indistinguishable from a range that simply started late.
        new Date(`${fromDate}T00:00:00Z`).getTime() / 1000,
      );
      const isPartial = coverageProblem !== null;

      console.log(
        `[Dukascopy API] Processed ${responseCandles.length} ${actualTimeframe} candles for ` +
        `${cleanInstrument} in ${elapsedMs}ms. Span: ${startTimeISO} to ${endTimeISO}` +
        (isPartial ? ` [INCOMPLETE: ${coverageProblem!.message}]` : "")
      );

      const payload: DownloadPayload = {
        instrument: instMeta,
        timeframe: actualTimeframe,
        count: responseCandles.length,
        startTime: startTimeISO,
        endTime: endTimeISO,
        requestedFrom: fromDate,
        requestedTo: toDate,
        candles: responseCandles,
        ...(isPartial
          ? {
              partial: true,
              warning: coverageProblem!.message,
              partialKind: coverageProblem!.kind,
              partialDays: Number((coverageProblem!.largestGapSeconds / 86_400).toFixed(1)),
            }
          : {}),
      };

      // Never cache an incomplete result: doing so is what turned a transient
      // upstream failure into a permanently broken session. Skipping the write
      // means the next attempt (or the client's Retry) re-downloads instead.
      if (isPartial) {
        const where =
          coverageProblem!.kind === 'interior' ? 'interior gap'
          : coverageProblem!.kind === 'tail' ? 'shortfall from toDate'
          : 'shortfall from fromDate';
        console.warn(
          `[Dukascopy API] Not caching ${cacheKey} 
—
 ${coverageProblem!.kind} ` +
          `${(coverageProblem!.largestGapSeconds / 86400).toFixed(1)}-day ${where}.`
        );
      } else {
        memoryCache.set(cacheKey, payload);
        writeCacheFile(processedJsonPath, payload, `disk cache for ${cacheKey}`);
        // Sweeping on every write is a full directory listing, so it runs at most
        // once a minute; doing it inline added latency to the response for a
        // background housekeeping task.
        maybeEnforceCacheLimits();
      }

      return { payload };
    })().finally(() => {
      inflightRequests.delete(cacheKey);
    });

    inflightRequests.set(cacheKey, downloadPromise);

    const { payload } = await downloadPromise;
    return res.json({ ...payload, cached: false, latencyMs: Date.now() - startTimeMs });
  } catch (err: any) {
    if (err instanceof BadRequestError) {
      return res.status(err.status).json({ error: err.message });
    }
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

  app.listen(PORT, BIND_HOST, () => {
    if (BIND_HOST === "0.0.0.0") {
      console.log(
        `[AuraEngine Server] Running on http://0.0.0.0:${PORT} - EXPOSED TO THE NETWORK.\n` +
        `  AURA_BIND=lan is set. Routes have no authentication, and /api/auth/google/status\n` +
        `  discloses the connected Google account's email and Drive file id. Use this only on a\n` +
        `  network you trust, or tunnel instead.`
      );
    } else {
      console.log(`[AuraEngine Server] Running on http://127.0.0.1:${PORT} (loopback only)`);
    }
  });
}

startServer();


