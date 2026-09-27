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
import type { InstrumentCategory } from './instruments';

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
  //
  // Only symbols Dukascopy actually serves appear here. Removed after diffing
  // this map against dukascopy-node's `Instrument` enum (1499 values) and
  // finding the targets did not exist: solusd, xrpusd, dotusd, linkusd,
  // dogeusd, avaxusd. Dukascopy carries none of those assets in any form;
  // Solana appears only as `solbbeeur`. Each of those catalogue entries now gets
  // an explicit 400 explaining the absence, rather than a bare 500 thrown from
  // inside the library. See `UNAVAILABLE_UPSTREAM` in src/lib/instruments.ts.
  btc: 'btcusd',
  btcusd: 'btcusd',
  eth: 'ethusd',
  ethusd: 'ethusd',
  ltc: 'ltcusd',
  ltcusd: 'ltcusd',
  bch: 'bchusd',
  bchusd: 'bchusd',
  ada: 'adausd',
  adausd: 'adausd',
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
  describeUnknownInstrument?: (dukascopyInstrument: string, rawInstrument: string) => string,
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
    // Prefer a specific reason over a generic "unsupported": several catalogue
    // entries look supported but are not carried upstream at all, and telling the
    // user which is the difference between a fixable mistake and a dead end.
    const reason = describeUnknownInstrument?.(dukascopyInstrument, instrument);
    throw new BadRequestError(
      400,
      reason
        ? `Unsupported instrument "${instrument}": ${reason}.`
        : `Unsupported instrument "${instrument}".`,
    );
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
 * This is per *market class*, not global, and the measurements are the reason.
 * Sampling the `m1` feed across Chinese New Year, China Golden Week, the
 * Japan/HK new year and Easter 2025 gave these largest legitimate gaps:
 *
 *   crypto (24/7)     1.00 d   BTC/USD never closed
 *   FX majors         1.13 d   EUR/USD; 2.00 d for AUD/CAD over Christmas+NYE
 *   commodities       2.13 d   gold, WTI
 *   indices (EU)      2.16 d   DAX
 *   indices (US)      3.16 d   US 500, Good Friday -> Easter Monday
 *   stocks            4.17 d   AAPL
 *   indices (HK)      5.83 d   Hang Seng, Chinese New Year
 *   indices (AU)      5.00 d   ASX 200
 *
 * A single global threshold cannot serve that spread. Catching a *single missing
 * day* — the residual failure mode left by aggregating h1/h4 from m1 — needs a
 * threshold under 1.04 days (Mon 23:00 -> Wed 00:00). Tolerating Hang Seng's
 * real Chinese New Year closure needs 5.83. Those contradict by 5.6x, so the
 * guard must know the instrument's trading calendar class, and no single number
 * can catch a one-day hole. That is recorded rather than papered over: a genuine
 * one-day loss is indistinguishable from a legitimate closure by gap size alone,
 * and detecting it would need a real trading-calendar reference, not a constant.
 *
 * Each threshold below is the measured maximum plus headroom. The false-positive
 * cost is real — a valid payload is never cached and the user sees a false
 * "data may be incomplete" warning — so the headroom is deliberate.
 *
 * The `d1`/`1W`/`mn1` overrides are not per class because they are already far
 * looser than any class needs; `d1` in particular sees gaps from `d1` in days,
 * and after `dropFlatWeekendBars` strips Dukascopy's flat-filled weekend bars the
 * widest real closure observed is Hang Seng's 5.83 days.
 */
export function maxLegitimateGapSeconds(
  canonicalTimeframe: string,
  marketClass?: InstrumentCategory,
): number {
  switch (canonicalTimeframe) {
    case 'd1':
      return 21 * DAY_SEC;
    case '1W':
      return 90 * DAY_SEC;
    case 'mn1':
      return 400 * DAY_SEC;
    default:
      return classGapSeconds(marketClass);
  }
}

/** Intraday interior-gap allowance, from measured maxima plus headroom. */
function classGapSeconds(marketClass?: InstrumentCategory): number {
  switch (marketClass) {
    // Measured 1.00 d. 24/7 market, so anything beyond ~3 d is a real hole.
    case 'crypto':
      return 3 * DAY_SEC;
    // Measured 1.13 d (majors) / 2.00 d (AUD/CAD over Christmas + NYE).
    case 'forex_major':
    case 'forex_cross':
      return 4 * DAY_SEC;
    // Measured 2.13 d (gold, WTI over Good Friday + Easter).
    case 'commodities':
      return 4 * DAY_SEC;
    // Measured 3.16 d (US 500, Good Friday -> Easter Monday).
    case 'stocks':
      return 7 * DAY_SEC;
    // Measured 5.83 d (Hang Seng, Chinese New Year) and 5.00 d (ASX 200).
    case 'indices':
      return 9 * DAY_SEC;
    // Not measured — no exotic pair in the catalogue was sampled. Held at the
    // loosest intraday value so an unmeasured market cannot produce a false
    // positive; tighten only with a measurement behind it.
    case 'forex_exotic':
    default:
      return 9 * DAY_SEC;
  }
}

/**
 * How far the last returned candle may legitimately fall short of the requested
 * end of range.
 *
 * This is a separate question from the interior-gap tolerance, and the failure
 * it exists to catch is the *common* one: when an upstream file is missing, the
 * data that never arrived is at the end of the range, so the series simply stops
 * early. An interior-gap check cannot see that at all — there is no gap, the
 * candles just end.
 *
 * Measured against real EUR/USD data (see `toDate - lastCandle` over weekend and
 * FX-holiday boundaries), the routine shortfall is 1-3 days: `toDate` is
 * exclusive, so a range ending on a weekend legitimately stops on the preceding
 * Friday. The 10-day allowance also covers ranges that reach past the most
 * recently published data, which Dukascopy serves with roughly a day of lag.
 */
export function maxLegitimateTailShortfallSeconds(canonicalTimeframe: string): number {
  switch (canonicalTimeframe) {
    // A monthly session ending mid-month legitimately stops at the 1st.
    case 'mn1':
      return 45 * DAY_SEC;
    case '1W':
      return 14 * DAY_SEC;
    default:
      return 10 * DAY_SEC;
  }
}

export interface CoverageProblem {
  kind: 'interior' | 'tail';
  largestGapSeconds: number;
  allowedSeconds: number;
  shortfallDays?: number;
  message: string;
}

/**
 * How far ahead of the current time a range may reach and still be checked for
 * a missing tail.
 *
 * Dukascopy publishes with roughly a day of lag (on 2026-09-27 its latest
 * EUR/USD bar was 2026-09-25), so a range ending today or tomorrow legitimately
 * has nothing to show for the last day or two.
 */
const PUBLICATION_LAG_DAYS = 2;

/**
 * Detects a returned series that is missing data, either in the middle or at
 * the end.
 *
 * `requestedToSeconds` is the end of the requested range as a Unix timestamp.
 * Supplying it enables the tail check, which is the one that matters in
 * practice; omit it (e.g. for a cache entry written before this existed) and
 * only interior gaps are considered.
 *
 * A range reaching into the future is exempt from the tail check: no data can
 * exist for it yet, so a shortfall there is the expected result rather than a
 * failed download. Interior gaps are still checked in that case, since a month
 * missing from the middle of a range is a real problem wherever the range ends.
 *
 * A result that trips this is still returned to the caller — it is better than
 * nothing, and the caller can see how far the data reaches — but it is flagged
 * and never cached, so the next attempt re-downloads instead of being served
 * the same truncated payload.
 */
export function findCoverageProblem(
  timesSeconds: number[],
  canonicalTimeframe: string,
  requestedToSeconds?: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  marketClass?: InstrumentCategory,
): CoverageProblem | null {
  const allowedGapSeconds = maxLegitimateGapSeconds(canonicalTimeframe, marketClass);
  const largestGapSeconds = findLargestInteriorGapSeconds(timesSeconds);
  if (largestGapSeconds > allowedGapSeconds) {
    const gapDays = (largestGapSeconds / DAY_SEC).toFixed(1);
    const allowedDays = (allowedGapSeconds / DAY_SEC).toFixed(0);
    return {
      kind: 'interior',
      largestGapSeconds,
      allowedSeconds: allowedGapSeconds,
      message:
        `Market data may be incomplete: a ${gapDays}-day gap was found inside the ` +
        `returned series, which is larger than the ${allowedDays}-day maximum expected for ` +
        `${canonicalTimeframe} data. This usually means an upstream download failed. ` +
        `Click Retry to re-fetch.`,
    };
  }

  if (requestedToSeconds !== undefined && timesSeconds.length > 0) {
    // A range that reaches into the future cannot have data yet, so a shortfall
    // there is expected rather than a failure — flagging it would tell the user
    // an upstream download broke when they simply asked for future dates.
    const reachesFuture = requestedToSeconds > nowSeconds + PUBLICATION_LAG_DAYS * DAY_SEC;
    // Compare against the end of the requested end day, since `toDate` is
    // exclusive in dukascopy-node.
    const lastCandle = timesSeconds[timesSeconds.length - 1];
    const shortfallSeconds = requestedToSeconds + DAY_SEC - lastCandle;
    const allowedTailSeconds = maxLegitimateTailShortfallSeconds(canonicalTimeframe);
    if (!reachesFuture && shortfallSeconds > allowedTailSeconds) {
      const shortfallDays = (shortfallSeconds / DAY_SEC).toFixed(1);
      const allowedDays = (allowedTailSeconds / DAY_SEC).toFixed(0);
      return {
        kind: 'tail',
        largestGapSeconds: shortfallSeconds,
        allowedSeconds: allowedTailSeconds,
        shortfallDays: Number(shortfallDays),
        message:
          `Market data may be incomplete: the series stops ` +
          `${shortfallDays} days before the end of the requested range, which is more than the ` +
          `${allowedDays}-day maximum expected for ${canonicalTimeframe} data. This usually means ` +
          `an upstream download failed. Click Retry to re-fetch.`,
      };
    }
  }

  return null;
}
