export interface TimelineEntry {
  ordinalIndex: number;
  realTimestamp: number;
  dateStr: string;
  isTradingDay: boolean;
}

export interface ContinuousTimeline {
  entries: TimelineEntry[];
  ordinalToReal: Map<number, number>;
  realToOrdinal: Map<number, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKEND_DAYS = new Set([0, 6]); // Sunday=0, Saturday=6

const MARKET_HOLIDAYS_2024: Set<string> = new Set([
  '2024-01-01', // New Year
  '2024-01-15', // MLK Day
  '2024-03-29', // Good Friday
  '2024-05-27', // Memorial Day
  '2024-06-19', // Juneteenth
  '2024-07-04', // Independence Day
  '2024-09-02', // Labor Day
  '2024-11-28', // Thanksgiving
  '2024-12-25', // Christmas
]);

const MARKET_HOLIDAYS_2025: Set<string> = new Set([
  '2025-01-01',
  '2025-01-20',
  '2025-04-18',
  '2025-05-26',
  '2025-06-19',
  '2025-07-04',
  '2025-09-01',
  '2025-11-27',
  '2025-12-25',
]);

const MARKET_HOLIDAYS_2026: Set<string> = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',
]);

function getHolidaysForYear(year: number): Set<string> {
  if (year === 2024) return MARKET_HOLIDAYS_2024;
  if (year === 2025) return MARKET_HOLIDAYS_2025;
  if (year === 2026) return MARKET_HOLIDAYS_2026;
  return new Set();
}

function isWeekend(ts: number): boolean {
  const d = new Date(ts);
  return WEEKEND_DAYS.has(d.getUTCDay());
}

function isHoliday(ts: number): boolean {
  const d = new Date(ts);
  const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const holidays = getHolidaysForYear(d.getUTCFullYear());
  return holidays.has(dateStr);
}

function isForexWeekendClose(ts: number): boolean {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const hours = d.getUTCHours();
  if (day === 6) return true;
  if (day === 5 && hours >= 22) return true;
  if (day === 0 && hours < 22) return true;
  return false;
}

function isTradingDay(ts: number): boolean {
  if (isHoliday(ts)) return false;
  if (isForexWeekendClose(ts)) return false;
  return true;
}

export function buildContinuousTimeline(fromTs: number, toTs: number): ContinuousTimeline {
  const entries: TimelineEntry[] = [];
  const ordinalToReal = new Map<number, number>();
  const realToOrdinal = new Map<number, number>();

  let ordinalIndex = 0;
  let cursor = new Date(fromTs);
  const end = new Date(toTs);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const ts = cursor.getTime();
    const isTrading = isTradingDay(ts);

    const entry: TimelineEntry = {
      ordinalIndex: isTrading ? ordinalIndex : -1,
      realTimestamp: ts,
      dateStr: cursor.toISOString().slice(0, 10),
      isTradingDay: isTrading,
    };

    entries.push(entry);

    if (isTrading) {
      ordinalToReal.set(ordinalIndex, ts);
      realToOrdinal.set(ts, ordinalIndex);
      ordinalIndex++;
    }

    cursor = new Date(ts + DAY_MS);
  }

  return { entries, ordinalToReal, realToOrdinal };
}

export function findNearestTradingDay(ts: number, direction: 'forward' | 'backward' = 'forward'): number {
  let cursor = ts;
  const maxDays = 30;
  for (let i = 0; i < maxDays; i++) {
    cursor = direction === 'forward' ? cursor : cursor;
    if (isTradingDay(cursor)) return cursor;
    cursor += direction === 'forward' ? DAY_MS : -DAY_MS;
  }
  return ts;
}

export function getNextMarketOpen(ts: number): number {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const hours = d.getUTCHours();

  if (day === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(22, 0, 0, 0);
    return d.getTime();
  }
  if (day === 5 && hours >= 22) {
    d.setUTCDate(d.getUTCDate() + 3);
    d.setUTCHours(22, 0, 0, 0);
    return d.getTime();
  }
  if (day === 0 && hours < 22) {
    d.setUTCHours(22, 0, 0, 0);
    return d.getTime();
  }

  let cursor = ts + DAY_MS;
  for (let i = 0; i < 10; i++) {
    if (isTradingDay(cursor)) return cursor;
    cursor += DAY_MS;
  }
  return cursor;
}

export function ordinalToRealTimestamp(timeline: ContinuousTimeline, ordinalIndex: number): number | undefined {
  return timeline.ordinalToReal.get(ordinalIndex);
}

export function realToOrdinalIndex(timeline: ContinuousTimeline, realTimestamp: number): number | undefined {
  return timeline.realToOrdinal.get(realTimestamp);
}

export function mapCandleTimestampsToOrdinal(candles: Array<{ timestamp: number }>, timeline: ContinuousTimeline): Array<{ ordinalIndex: number; realTimestamp: number }> {
  const result: Array<{ ordinalIndex: number; realTimestamp: number }> = [];
  for (const candle of candles) {
    const ordinal = realToOrdinalIndex(timeline, candle.timestamp);
    if (ordinal !== undefined) {
      result.push({ ordinalIndex: ordinal, realTimestamp: candle.timestamp });
    }
  }
  return result;
}
