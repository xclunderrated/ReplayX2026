/**
 * Request shaping for the Dukascopy download endpoint.
 *
 * These helpers used to live inline in `server.ts`, which made them untestable:
 * the server module calls `startServer()` at import time and binds a port, so
 * nothing in it could be exercised from `node --test`. Everything here is pure
 * and side-effect free, so the parsing, validation, timeframe planning and
 * completeness checks can be unit tested directly.
 */

import { getMaxRangeDaysForTimeframe } from './timeframe';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Candle timestamps are handled in *seconds* throughout this module's gap
 * analysis, so tolerance thresholds must be expressed in seconds too. Mixing
 * these two up makes every threshold 1000x too permissive, which silently
 * disables the guard.
 */
const DAY_SEC = 86_400;

/** Timeframes Dukascopy can serve natively. */
export type DukascopyNativeTimeframe = 's1' | 'm1' | 'm5' | 'm15' | 'm30' | 'h1' | 'h4' | 'd1' | 'mn1';

/** Timeframes this server builds locally by aggregating a coarser native feed. */
export type AggregationTarget = 's5' | 's15' | 's30' | '1h' | '4h' | '1W';

export interface NormalizedTimeframeInfo {
  canonical: string;
  isSubMinute: boolean;
  /**
   * The native feed to download. Note that h1/h4 deliberately resolve to `m1`:
   * Dukascopy serves its hour feed as one file per month and that file is
   * rate-limited for the in-progress month, which used to make the current
   * month silently disappear from H1/H4 sessions. See `resolveTimeframe`.
   */
  nativeDukascopyTimeframe: DukascopyNativeTimeframe;
  /** When set, aggregate the native feed up to this timeframe before replying. */
  aggregationTarget?: AggregationTarget;
}

/**
 * Timeframes this API can serve.
 *
 * Native Dukascopy timeframes: s1, m1, m5, m15, m30, h1, h4, d1, mn1.
 * Sub-minute timeframes (s5, s15, s30, tick) are built from real s1 tick data.
 * h1/h4/1W are aggregated from m1/d1.
 *
 * All entries are lowercase: the timeframe query value is lowercased before it
 * reaches this set. That lowercasing is why the wire format for monthly is
 * `mn1` rather than `1M` — `1M` would collapse onto the `1m` (one minute) entry.
 */
export const ALLOWED_TIMEFRAMES = new Set([
  'tick', 's1', 's5', 's15', 's30',
  '5s', '15s', '30s',
  'm1', 'm5', 'm15', 'm30',
  '1m', '5m', '15m', '30m',
  'h1', 'h4',
  '1h', '4h',
  'd1', '1d',
  '1w',
  'mn1',
]);

/**
 * Dukascopy symbol alias mapping, guaranteeing an exact match with the
 * dukascopy-node instrument enum.
 */
export const DUKASCOPY_ALIAS_MAP: Record<string, string> = {
  // Indices
  us30: 'usa30idxusd',
  usa30: 'usa30idxusd',
  usa30idxusd: 'usa30idxusd',
  us500: 'usa500idxusd',
  usa500: 'usa500idxusd',
  usa500idxusd: 'usa500idxusd',
  ustecusd: 'usatechidxusd',
  usatechidxusd: 'usatechidxusd',
  nas100: 'usatechidxusd',
  deidxeur: 'deuidxeur',
  deuidxeur: 'deuidxeur',
  ger40: 'deuidxeur',
  dax40: 'deuidxeur',
  ukidxgbp: 'gbridxgbp',
  gbridxgbp: 'gbridxgbp',
  uk100: 'gbridxgbp',
  fridxeur: 'fraidxeur',
  fraidxeur: 'fraidxeur',
  fra40: 'fraidxeur',
  jpidxjpy: 'jpnidxjpy',
  jpnidxjpy: 'jpnidxjpy',
  jpn225: 'jpnidxjpy',
  ausidxaud: 'ausidxaud',
  aus200: 'ausidxaud',
  euidxeur: 'eusidxeur',
  eusidxeur: 'eusidxeur',
  eu50: 'eusidxeur',
  hkidxhkd: 'hkgidxhkd',
  hkgidxhkd: 'hkgidxhkd',
  hk50: 'hkgidxhkd',
  chnidxcny: 'chiidxusd',
  chiidxusd: 'chiidxusd',
  chi50: 'chiidxusd',

  // Commodities & Metals
  xptusd: 'xptcmdusd',
  xptcmdusd: 'xptcmdusd',
  xpdusd: 'xpdcmdusd',
  xpdcmdusd: 'xpdcmdusd',
  brent: 'brentcmdusd',
  brentcmdusd: 'brentcmdusd',
  wti: 'lightcmdusd',
  lightcmdusd: 'lightcmdusd',
  ngas: 'gascmdusd',
  gascmdusd: 'gascmdusd',
  copper: 'coppercmdusd',
  coppercmdusd: 'coppercmdusd',

  // Crypto
  btc: 'btcusd',
  btcusd: 'btcusd',
  eth: 'ethusd',
  ethusd: 'ethusd',
  sol: 'solusd',
  solusd: 'solusd',
  ltc: 'ltcusd',
  ltcusd: 'ltcusd',
  bch: 'bchusd',
  bchusd: 'bchusd',
  xrp: 'xrpusd',
  xrpusd: 'xrpusd',
  ada: 'adausd',
  adausd: 'adausd',
  dot: 'dotusd',
  dotusd: 'dotusd',
  link: 'linkusd',
  linkusd: 'linkusd',
  doge: 'dogeusd',
  dogeusd: 'dogeusd',
  avax: 'avaxusd',
  avaxusd: 'avaxusd',
};

/**
 * Maps a requested timeframe onto the native feed to download plus any local
 * aggregation to apply.
 *
 * h1 and h4 are aggregated from m1 on purpose. dukascopy-node fetches the hour
 * feed as a single file per month, and Dukascopy rate-limits that file while
 * the month is still in progress (HTTP 429). The download was configured with
 * `failAfterRetryCount: false`, so the failure was swallowed and an H1 request
 * spanning a month boundary returned data that simply stopped at the boundary
 * with no error — and that truncated result was then cached, making it sticky.
 * m1 is fetched per day, is therefore far more granular, and was verified
 * complete for the same ranges.
 */
export function resolveTimeframe(rawTimeframe: string): NormalizedTimeframeInfo {
  const clean = String(rawTimeframe ?? '').toLowerCase().trim();
  switch (clean) {
    case 'tick':
      return { canonical: 'tick', isSubMinute: true, nativeDukascopyTimeframe: 's1' };
    case 's1':
      return { canonical: 's1', isSubMinute: true, nativeDukascopyTimeframe: 's1' };
    case 's5':
    case '5s':
      return { canonical: 's5', isSubMinute: true, nativeDukascopyTimeframe: 's1', aggregationTarget: 's5' };
    case 's15':
    case '15s':
      return { canonical: 's15', isSubMinute: true, nativeDukascopyTimeframe: 's1', aggregationTarget: 's15' };
    case 's30':
    case '30s':
      return { canonical: 's30', isSubMinute: true, nativeDukascopyTimeframe: 's1', aggregationTarget: 's30' };

    case 'm1':
    case '1m':
      return { canonical: 'm1', isSubMinute: false, nativeDukascopyTimeframe: 'm1' };
    case 'm5':
    case '5m':
      return { canonical: 'm5', isSubMinute: false, nativeDukascopyTimeframe: 'm5' };
    case 'm15':
    case '15m':
      return { canonical: 'm15', isSubMinute: false, nativeDukascopyTimeframe: 'm15' };
    case 'm30':
    case '30m':
      return { canonical: 'm30', isSubMinute: false, nativeDukascopyTimeframe: 'm30' };

    // Aggregated from m1 — see resolveTimeframe's doc comment.
    case 'h1':
    case '1h':
      return { canonical: 'h1', isSubMinute: false, nativeDukascopyTimeframe: 'm1', aggregationTarget: '1h' };
    case 'h4':
    case '4h':
      return { canonical: 'h4', isSubMinute: false, nativeDukascopyTimeframe: 'm1', aggregationTarget: '4h' };

    case 'd1':
    case '1d':
      return { canonical: 'd1', isSubMinute: false, nativeDukascopyTimeframe: 'd1' };
    case '1w':
      return { canonical: '1W', isSubMinute: false, nativeDukascopyTimeframe: 'd1', aggregationTarget: '1W' };
    case 'mn1':
      return { canonical: 'mn1', isSubMinute: false, nativeDukascopyTimeframe: 'mn1' };

    default:
      return { canonical: 'm1', isSubMinute: false, nativeDukascopyTimeframe: 'm1' };
  }
}

export function isSupportedTimeframe(rawTimeframe: string): boolean {
  return ALLOWED_TIMEFRAMES.has(String(rawTimeframe ?? '').toLowerCase().trim());
}

/** Dukascopy only serves bid/ask; anything else (including "mid") means bid. */
export function normalizePriceType(rawPriceType: unknown): 'bid' | 'ask' {
  return String(rawPriceType ?? '').toLowerCase().trim() === 'ask' ? 'ask' : 'bid';
}

/**
 * Normalizes a date parameter to a `YYYY-MM-DD` UTC day string.
 *
 * Callers are inconsistent: the session loader sends `YYYY-MM-DD` while the
 * chart's viewport loader sends a full `Date#toISOString()` value. Both reached
 * the cache key and the on-disk filename verbatim, which meant the same day was
 * downloaded and stored twice, and the ISO form could never be cached at all
 * because `:` is not a legal character in a Windows filename. Normalizing once,
 * here, fixes both.
 *
 * Returns `null` for anything unparseable so the caller can answer 400.
 */
export function normalizeDateParam(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number') return null;
  const text = String(rawValue).trim();
  if (!text) return null;

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    // Validate the calendar date rather than trusting the shape.
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      return null;
    }
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsed = new Date(text);
  const ts = parsed.getTime();
  if (!Number.isFinite(ts)) return null;
  return parsed.toISOString().slice(0, 10);
}

export interface DownloadRequest {
  instrument: string;
  fromDate: string;
  toDate: string;
  priceType: 'bid' | 'ask';
  timeframe: string;
}

/**
 * A malformed request, as opposed to a failed or empty download.
 *
 * Thrown rather than returned as a union member because this project does not
 * enable `strict`, and without `strictNullChecks` TypeScript cannot narrow a
 * boolean-literal discriminant. Mirrors the `DataNotFoundError` pattern the
 * download handler already uses, so the caller's existing catch can map status
 * codes without special-casing.
 */
export class BadRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/**
 * Validates and canonicalises a `/api/download` body.
 *
 * Every failure mode used to escape as a 500 from inside dukascopy-node (an
 * unparseable date, an unknown instrument). They are 400s: the request itself is
 * malformed, and the client needs to be able to tell that apart from Dukascopy
 * being unreachable (503) or genuinely having no data for the period (404).
 *
 * @throws {BadRequestError} when the request cannot be served as written.
 */
export function validateDownloadRequest(
  body: Record<string, unknown>,
  isKnownInstrument: (dukascopyInstrument: string, rawInstrument: string) => boolean,
): { request: DownloadRequest; tfInfo: NormalizedTimeframeInfo } {
  const instrument = String(body?.instrument ?? '').toLowerCase().trim();
  if (!instrument) {
    throw new BadRequestError(400, 'Missing required field: instrument');
  }
  if (!/^[a-z0-9]+$/.test(instrument)) {
    throw new BadRequestError(400, `Invalid instrument "${String(body.instrument)}".`);
  }

  const dukascopyInstrument = DUKASCOPY_ALIAS_MAP[instrument] || instrument;
  if (!isKnownInstrument(dukascopyInstrument, instrument)) {
    throw new BadRequestError(400, `Unsupported instrument "${instrument}".`);
  }

  const fromDate = normalizeDateParam(body?.fromDate);
  if (!fromDate) {
    throw new BadRequestError(400, `Invalid or missing fromDate "${String(body?.fromDate ?? '')}". Use YYYY-MM-DD.`);
  }
  const toDate = normalizeDateParam(body?.toDate);
  if (!toDate) {
    throw new BadRequestError(400, `Invalid or missing toDate "${String(body?.toDate ?? '')}". Use YYYY-MM-DD.`);
  }
  if (toDate <= fromDate) {
    throw new BadRequestError(400, 'toDate must be after fromDate.');
  }

  const rawTimeframe = String(body?.timeframe ?? 'm1').toLowerCase().trim();
  if (!isSupportedTimeframe(rawTimeframe)) {
    throw new BadRequestError(
      400,
      `Unsupported timeframe "${rawTimeframe}". Allowed: tick, s1, s5, s15, s30, m1, m5, m15, m30, h1, h4, d1, 1w, mn1.`,
    );
  }

  const tfInfo = resolveTimeframe(rawTimeframe);
  const requestedTimeframe = tfInfo.canonical;

  if (tfInfo.isSubMinute) {
    const fromTs = new Date(fromDate).getTime();
    const toTs = new Date(toDate).getTime();
    const maxDays = getMaxRangeDaysForTimeframe(requestedTimeframe);
    if (Number.isFinite(maxDays) && toTs - fromTs > maxDays * DAY_MS) {
      throw new BadRequestError(
        400,
        `Requested range exceeds the ${maxDays}-day limit for ${requestedTimeframe} data.`,
      );
    }
  }

  return {
    request: {
      instrument,
      fromDate,
      toDate,
      priceType: normalizePriceType(body?.priceType),
      timeframe: requestedTimeframe,
    },
    tfInfo,
  };
}

/** Shifts a `YYYY-MM-DD` day string by whole days. */
export function shiftDate(dateText: string, deltaDays: number): string {
  const ts = new Date(`${dateText}T00:00:00Z`).getTime();
  return new Date(ts + deltaDays * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Largest interior gap between consecutive candles, in seconds.
 *
 * Returns 0 for fewer than two candles.
 */
export function findLargestInteriorGapSeconds(timesSeconds: number[]): number {
  let largest = 0;
  for (let i = 1; i < timesSeconds.length; i++) {
    const gap = timesSeconds[i] - timesSeconds[i - 1];
    if (gap > largest) largest = gap;
  }
  return largest;
}

/**
 * How large an interior gap can legitimately get before it means data is
 * missing rather than the market being closed.
 *
 * FX closes Friday ~22:00 UTC and reopens Sunday ~22:00 UTC, so a ~72 hour gap
 * is routine; index CFDs sit closed longer. The thresholds are deliberately
 * generous so this never fires on a real closure — it exists to catch the
 * failure mode where a whole download (typically a calendar month of a coarse
 * feed) never arrived and got silently accepted.
 */
export function maxLegitimateGapSeconds(canonicalTimeframe: string): number {
  switch (canonicalTimeframe) {
    case 'd1':
      return 21 * DAY_SEC;
    case '1W':
      return 90 * DAY_SEC;
    case 'mn1':
      return 400 * DAY_SEC;
    default:
      return 7 * DAY_SEC;
  }
}

export interface CoverageProblem {
  largestGapSeconds: number;
  allowedGapSeconds: number;
  message: string;
}

/**
 * Detects an interior gap too large to be a market closure.
 *
 * This is the guard the download path previously lacked: the only completeness
 * check it performed was `candles.length === 0`, so a partially-downloaded
 * range looked exactly like a successful one. A result that trips this check is
 * still returned to the caller (it is better than nothing, and the caller can
 * see how far the data reaches) but it is flagged and never cached, so the next
 * attempt re-downloads instead of being served the same truncated payload.
 */
export function findCoverageProblem(
  timesSeconds: number[],
  canonicalTimeframe: string,
): CoverageProblem | null {
  const largestGapSeconds = findLargestInteriorGapSeconds(timesSeconds);
  const allowedGapSeconds = maxLegitimateGapSeconds(canonicalTimeframe);
  if (largestGapSeconds <= allowedGapSeconds) return null;

  const gapDays = (largestGapSeconds / DAY_SEC).toFixed(1);
  const allowedDays = (allowedGapSeconds / DAY_SEC).toFixed(0);
  return {
    largestGapSeconds,
    allowedGapSeconds,
    message:
      `Market data may be incomplete: a ${gapDays}-day gap was found inside the ` +
      `returned series, which is larger than the ${allowedDays}-day maximum expected for ` +
      `${canonicalTimeframe} data. This usually means an upstream download failed. ` +
      `Click Retry to re-fetch.`,
  };
}
