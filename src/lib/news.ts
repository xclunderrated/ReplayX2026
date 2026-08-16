import { ChartTimezone, getLocalDateKey } from './timezone';

const DAY_MS = 24 * 60 * 60 * 1000;

export type NewsView = 'day' | 'week';

export type NewsImpactFilter = 'all' | 'high' | 'medium' | 'low' | 'none';

export function matchesNewsImpactFilter(impact: string, filter: NewsImpactFilter): boolean {
  if (filter === 'all') return true;
  const weight = getImpactWeight(impact);
  if (filter === 'high') return weight === 3;
  if (filter === 'medium') return weight === 2;
  if (filter === 'low') return weight === 1;
  return weight === 0;
}

export interface NewsEvent {
  id: string;
  timestamp: number;
  currency: string;
  impact: string;
  event: string;
  actual: string;
  forecast: string;
  previous: string;
  detail: string;
}

export function getInstrumentCurrencies(instrument: string): string[] {
  const cleaned = instrument.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Extract first 6 letters if they exist
  const first6LettersMatch = cleaned.match(/^[A-Z]{6}/);
  const base6 = first6LettersMatch ? first6LettersMatch[0] : cleaned;

  const specialCases: Record<string, string[]> = {
    XAUUSD: ['USD'],
    XAGUSD: ['USD'],
    BTCUSD: ['USD'],
    ETHUSD: ['USD'],
    USA30IDXUSD: ['USD'],
    USATECHIDXUSD: ['USD'],
    USA500IDXUSD: ['USD'],
    US30: ['USD'],
    US500: ['USD'],
    NAS100: ['USD'],
    GER40: ['EUR'],
    DE30: ['EUR'],
    UK100: ['GBP'],
  };

  if (specialCases[cleaned]) {
    return specialCases[cleaned];
  }
  if (specialCases[base6]) {
    return specialCases[base6];
  }

  if (base6.length === 6) {
    return [base6.slice(0, 3), base6.slice(3, 6)];
  }

  const majors = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
  const found: string[] = [];
  for (const major of majors) {
    if (cleaned.includes(major)) {
      found.push(major);
    }
  }
  if (found.length > 0) {
    return found;
  }

  return ['USD'];
}

export function getWeekRangeKeys(timestampMs: number, timeZone: ChartTimezone): { startKey: string; endKey: string; startTs: number; endTs: number } {
  const dateKey = getLocalDateKey(timestampMs, timeZone);
  const [year, month, day] = dateKey.split('-').map(Number);
  const localDateAsUtc = Date.UTC(year, month - 1, day);
  const weekday = new Date(localDateAsUtc).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;

  const monday = localDateAsUtc + mondayOffset * DAY_MS;
  const friday = monday + 4 * DAY_MS;

  const toKey = (ms: number) => {
    const date = new Date(ms);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  };

  return {
    startKey: toKey(monday),
    endKey: toKey(friday),
    startTs: monday,
    endTs: friday + DAY_MS,
  };
}

export function filterNewsForCurrentView(
  events: NewsEvent[],
  currentTimestampMs: number,
  timeZone: ChartTimezone,
  newsView: NewsView,
): NewsEvent[] {
  if (!Number.isFinite(currentTimestampMs)) return [];

  const currentDateKey = getLocalDateKey(currentTimestampMs, timeZone);

  const filtered = events.filter((event) => {
    if (newsView === 'day') {
      const eventDateKey = getLocalDateKey(event.timestamp, timeZone);
      return eventDateKey === currentDateKey;
    }

    const { startTs, endTs } = getWeekRangeKeys(currentTimestampMs, timeZone);
    return event.timestamp >= startTs && event.timestamp < endTs;
  });

  return filtered.sort((left, right) => left.timestamp - right.timestamp);
}

export function getImpactWeight(impact: string): number {
  const normalized = impact.toLowerCase();
  if (normalized.includes('high')) return 3;
  if (normalized.includes('medium')) return 2;
  if (normalized.includes('low')) return 1;
  return 0;
}

export function getImpactColor(impact: string): string {
  const weight = getImpactWeight(impact);
  if (weight === 3) return '#ef4444';
  if (weight === 2) return '#f59e0b';
  if (weight === 1) return '#94a3b8';
  return '#94a3b8';
}

export function getImpactLabel(impact: string): string {
  const weight = getImpactWeight(impact);
  if (weight === 3) return 'High';
  if (weight === 2) return 'Medium';
  if (weight === 1) return 'Low';
  return 'Other';
}
