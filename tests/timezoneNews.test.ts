import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rawTimeToChartTime,
  formatTimestampInTimeZone,
  getLocalDateKey,
} from '../src/lib/timezone';
import {
  getInstrumentCurrencies,
  filterNewsForCurrentView,
  matchesNewsImpactFilter,
  type NewsEvent,
} from '../src/lib/news';

test('rawTimeToChartTime shifts UTC timestamps into target timezone wall-clock time', () => {
  const originalUtcSeconds = Date.parse('2021-01-01T10:00:00.000Z') / 1000;
  const chartTime = rawTimeToChartTime(originalUtcSeconds, 'Europe/Moscow');

  assert.equal(chartTime, Date.parse('2021-01-01T13:00:00.000Z') / 1000);
});

test('formatTimestampInTimeZone formats timestamps in the selected timezone', () => {
  const timestamp = Date.parse('2021-01-01T10:00:00.000Z');
  const formatted = formatTimestampInTimeZone(timestamp, 'America/New_York', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  assert.match(formatted, /01\/01\/2021/);
  assert.match(formatted, /05:00/);
});

test('getLocalDateKey returns local calendar date in selected timezone', () => {
  const timestamp = Date.parse('2024-01-01T01:00:00.000Z');
  assert.equal(getLocalDateKey(timestamp, 'America/New_York'), '2023-12-31');
  assert.equal(getLocalDateKey(timestamp, 'UTC'), '2024-01-01');
});

test('getInstrumentCurrencies maps FX pairs and USD-denominated non-FX symbols', () => {
  assert.deepEqual(getInstrumentCurrencies('eurusd'), ['EUR', 'USD']);
  assert.deepEqual(getInstrumentCurrencies('gbpjpy'), ['GBP', 'JPY']);
  assert.deepEqual(getInstrumentCurrencies('xauusd'), ['USD']);
  assert.deepEqual(getInstrumentCurrencies('usa500idxusd'), ['USD']);
});

test('filterNewsForCurrentView returns only the current replay day in selected timezone', () => {
  const currentTimestamp = Date.parse('2024-04-03T12:00:00.000Z');
  const news: NewsEvent[] = [
    {
      id: '1',
      timestamp: Date.parse('2024-04-03T09:00:00.000Z'),
      currency: 'USD',
      impact: 'High Impact Expected',
      event: 'ADP',
      actual: '',
      forecast: '',
      previous: '',
      detail: '',
    },
    {
      id: '2',
      timestamp: Date.parse('2024-04-04T09:00:00.000Z'),
      currency: 'USD',
      impact: 'High Impact Expected',
      event: 'NFP',
      actual: '',
      forecast: '',
      previous: '',
      detail: '',
    },
  ];

  const visible = filterNewsForCurrentView(news, currentTimestamp, 'UTC', 'day');
  assert.deepEqual(visible.map((item) => item.id), ['1']);
});

test('filterNewsForCurrentView returns Monday-Friday of the current replay week', () => {
  const currentTimestamp = Date.parse('2024-04-03T12:00:00.000Z'); // Wednesday
  const news: NewsEvent[] = [
    { id: 'mon', timestamp: Date.parse('2024-04-01T09:00:00.000Z'), currency: 'USD', impact: 'Medium Impact Expected', event: 'Mon', actual: '', forecast: '', previous: '', detail: '' },
    { id: 'wed', timestamp: Date.parse('2024-04-03T09:00:00.000Z'), currency: 'USD', impact: 'High Impact Expected', event: 'Wed', actual: '', forecast: '', previous: '', detail: '' },
    { id: 'fri', timestamp: Date.parse('2024-04-05T09:00:00.000Z'), currency: 'USD', impact: 'Low Impact Expected', event: 'Fri', actual: '', forecast: '', previous: '', detail: '' },
    { id: 'sun', timestamp: Date.parse('2024-04-07T09:00:00.000Z'), currency: 'USD', impact: 'Low Impact Expected', event: 'Sun', actual: '', forecast: '', previous: '', detail: '' },
  ];

  const visible = filterNewsForCurrentView(news, currentTimestamp, 'UTC', 'week');
  assert.deepEqual(visible.map((item) => item.id), ['mon', 'wed', 'fri']);
});

test('matchesNewsImpactFilter matches scraped impact-title strings per level', () => {
  assert.equal(matchesNewsImpactFilter('High Impact Expected', 'all'), true);
  assert.equal(matchesNewsImpactFilter('High Impact Expected', 'high'), true);
  assert.equal(matchesNewsImpactFilter('High Impact Expected', 'medium'), false);
  assert.equal(matchesNewsImpactFilter('High Impact Expected', 'low'), false);
  assert.equal(matchesNewsImpactFilter('High Impact Expected', 'none'), false);

  assert.equal(matchesNewsImpactFilter('Medium Impact Expected', 'medium'), true);
  assert.equal(matchesNewsImpactFilter('Medium Impact Expected', 'high'), false);

  assert.equal(matchesNewsImpactFilter('Low Impact Expected', 'low'), true);
  assert.equal(matchesNewsImpactFilter('Low Impact Expected', 'medium'), false);

  assert.equal(matchesNewsImpactFilter('Non-Economic / Holiday', 'none'), true);
  assert.equal(matchesNewsImpactFilter('Non-Economic / Holiday', 'high'), false);
  assert.equal(matchesNewsImpactFilter('', 'none'), true);
  assert.equal(matchesNewsImpactFilter('', 'all'), true);
});
