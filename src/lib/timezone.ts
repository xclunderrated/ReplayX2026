export const BROWSER_TIMEZONE = 'browser';

export type ChartTimezone = typeof BROWSER_TIMEZONE | 'UTC' | string;

export const CHART_TIMEZONE_OPTIONS: Array<{ value: ChartTimezone; label: string }> = [
  { value: BROWSER_TIMEZONE, label: 'Browser Local' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Chicago', label: 'Chicago' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Asia/Tehran', label: 'Tehran' },
];

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

// Memoized timestamp -> chart-time conversions. Rendering a fixed instant in a
// given IANA timezone is deterministic (DST already applied by Intl), so
// repeated conversions — news overlay positions every frame during playback,
// candle pushes, indicator mapping — hit this cache instead of running
// Intl.DateTimeFormat.formatToParts, which is one of the slowest V8 operations.
const chartTimeCache = new Map<string, Map<number, number>>();
const CHART_TIME_CACHE_MAX = 50_000;

function resolveTimeZone(timeZone: ChartTimezone): string | null {
  if (!timeZone || timeZone === 'UTC') return null;
  if (timeZone === BROWSER_TIMEZONE) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
  return timeZone;
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  formatterCache.set(timeZone, formatter);
  return formatter;
}

function getDateTimeParts(timestampMs: number, timeZone: ChartTimezone): DateTimeParts {
  const resolved = resolveTimeZone(timeZone);
  const date = new Date(timestampMs);

  if (!resolved) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }

  const parts = getFormatter(resolved).formatToParts(date);
  const values: Partial<DateTimeParts> = {};

  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day' || part.type === 'hour' || part.type === 'minute' || part.type === 'second') {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year ?? date.getUTCFullYear(),
    month: values.month ?? date.getUTCMonth() + 1,
    day: values.day ?? date.getUTCDate(),
    hour: values.hour ?? date.getUTCHours(),
    minute: values.minute ?? date.getUTCMinutes(),
    second: values.second ?? date.getUTCSeconds(),
  };
}

export function rawTimeToChartTime(originalTimeSeconds: number, timeZone: ChartTimezone): number {
  const resolved = resolveTimeZone(timeZone);
  if (!resolved) return originalTimeSeconds;

  let cache = chartTimeCache.get(timeZone);
  if (!cache) {
    cache = new Map<number, number>();
    chartTimeCache.set(timeZone, cache);
  }
  const cached = cache.get(originalTimeSeconds);
  if (cached !== undefined) return cached;

  const parts = getDateTimeParts(originalTimeSeconds * 1000, resolved);
  const chartTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) / 1000;

  if (cache.size >= CHART_TIME_CACHE_MAX) {
    cache.clear();
  }
  cache.set(originalTimeSeconds, chartTime);
  return chartTime;
}

export function timestampMsToChartTime(timestampMs: number, timeZone: ChartTimezone): number {
  return rawTimeToChartTime(Math.floor(timestampMs / 1000), timeZone);
}

export function chartTimeToRawTime(chartTimeSeconds: number, timeZone: ChartTimezone): number {
  const resolved = resolveTimeZone(timeZone);
  if (!resolved) return chartTimeSeconds;

  const local = new Date(chartTimeSeconds * 1000);
  const utcGuess = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
  );

  const offsetMs = utcGuess - Date.parse(new Date(utcGuess).toLocaleString('en-US', { timeZone: resolved }));
  return Math.floor((utcGuess + offsetMs) / 1000);
}

export function getLocalDateKey(timestampMs: number, timeZone: ChartTimezone): string {
  const parts = getDateTimeParts(timestampMs, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Offset of `timeZone` from UTC at a given instant, in milliseconds.
 *
 * Positive east of Greenwich. The zone's wall clock is read as if it were UTC and
 * compared against the true instant; the difference is the offset.
 *
 * Built on `getDateTimeParts` rather than `Date.parse(toLocaleString(...))`
 * because the latter reinterprets the wall-clock string in the *system* timezone,
 * silently folding the machine's own offset into the answer. That produced a
 * three-hour error for New York on a UTC-3 host, and would have been a different
 * wrong answer on every machine.
 */
function timeZoneOffsetMs(instantMs: number, timeZone: ChartTimezone): number {
  const resolved = resolveTimeZone(timeZone);
  if (!resolved) return 0;
  const p = getDateTimeParts(instantMs, timeZone);
  // `hour12: false` yields hour 24 for midnight in some ICU versions; normalize
  // it so the arithmetic below cannot overflow into the next day.
  const hour = p.hour === 24 ? 0 : p.hour;
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second);
  return asIfUtc - instantMs;
}

/**
 * Resolves a `YYYY-MM-DD` day to the UTC instant of its start (or end) in a
 * given timezone.
 *
 * The inverse of `getLocalDateKey`. A session's `startDate` is a *calendar day*,
 * and which instant that day begins at depends on the timezone it is being
 * judged in. Treating it as UTC midnight — which is what every date boundary in
 * this codebase used to do — means a user in New York asking for "the 27th" gets
 * a window starting 20:00 on the 26th local, and silently sees four hours of the
 * previous day.
 *
 * The chart already had a configurable timezone (`chartTimezone`, defaulting to
 * the browser's), so a session day is resolved in the same zone the chart draws
 * in, rather than in a second, different one.
 *
 * Two correction passes, because a single pass is wrong across a DST boundary:
 * the offset at the naive UTC guess is not always the offset at the true local
 * midnight. On a spring-forward day the first pass lands an hour off and the
 * second corrects it.
 */
export function dayBoundaryMs(
  dateKey: string,
  timeZone: ChartTimezone,
  endOfDay = false,
): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid date: "${dateKey}". Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0);

  let instant = naiveUtc;
  for (let pass = 0; pass < 2; pass++) {
    instant = naiveUtc - timeZoneOffsetMs(instant, timeZone);
  }
  return endOfDay ? instant + 86_400_000 : instant;
}

/**
 * Formats a Unix timestamp in **seconds** as a readable UTC string.
 *
 * Takes seconds, not milliseconds — candle timestamps reach this function from
 * two different units in this codebase, which is exactly how the
 * `getBucketStart` bug happened. The unit is in the parameter name for that
 * reason.
 */
export function formatUTCTimestamp(timestampSec: number): string {
  // Not a truthiness check: 0 is a valid instant (1970-01-01) and must render,
  // and a NaN timestamp must not render as "NaN".
  if (!Number.isFinite(timestampSec)) return '';
  return new Date(timestampSec * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

export function getTimeZoneLabel(timeZone: ChartTimezone): string {  if (timeZone === BROWSER_TIMEZONE) {
    return `Browser (${resolveTimeZone(BROWSER_TIMEZONE)})`;
  }
  return timeZone || 'UTC';
}

export function formatTimestampInTimeZone(
  timestampMs: number,
  timeZone: ChartTimezone,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const resolved = resolveTimeZone(timeZone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolved ?? 'UTC',
    ...options,
  }).format(new Date(timestampMs));
}
