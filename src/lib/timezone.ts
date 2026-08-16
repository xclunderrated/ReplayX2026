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

export function getTimeZoneLabel(timeZone: ChartTimezone): string {
  if (timeZone === BROWSER_TIMEZONE) {
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
