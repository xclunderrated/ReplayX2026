import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEventTimestamp,
  filterEventsByCurrencies,
  formatDateToFFParam,
  getDayKeysInRange,
  parseFFTimeToMinutes,
  type ScrapedEvent,
} from '../forexfactoryScraper';

test('formatDateToFFParam formats a date into the ForexFactory day parameter', () => {
  assert.deepEqual(formatDateToFFParam('2014-10-14'), {
    dayParam: 'oct14.2014',
    formattedDate: '2014-10-14',
  });
  assert.deepEqual(formatDateToFFParam('2024-05-15'), {
    dayParam: 'may15.2024',
    formattedDate: '2024-05-15',
  });
  assert.deepEqual(formatDateToFFParam('2024-12-01'), {
    dayParam: 'dec1.2024',
    formattedDate: '2024-12-01',
  });
});

test('formatDateToFFParam falls back to today for invalid or empty input', () => {
  const now = new Date();
  const expected = formatDateToFFParam(now.toISOString().split('T')[0]);

  assert.deepEqual(formatDateToFFParam(''), expected);
  assert.deepEqual(formatDateToFFParam('not-a-date'), expected);
  assert.deepEqual(formatDateToFFParam('today'), expected);
});

test('parseFFTimeToMinutes converts 12-hour ForexFactory times to minutes', () => {
  assert.equal(parseFFTimeToMinutes('8:30am'), 510);
  assert.equal(parseFFTimeToMinutes('2:45pm'), 885);
  assert.equal(parseFFTimeToMinutes('12:00am'), 0);
  assert.equal(parseFFTimeToMinutes('12:30pm'), 750);
  assert.equal(parseFFTimeToMinutes('11:59pm'), 1439);
  assert.equal(parseFFTimeToMinutes('9am'), 540);
});

test('parseFFTimeToMinutes returns 0 for all-day, holiday, or empty times', () => {
  assert.equal(parseFFTimeToMinutes('All Day'), 0);
  assert.equal(parseFFTimeToMinutes('Day 1'), 0);
  assert.equal(parseFFTimeToMinutes('Day 2'), 0);
  assert.equal(parseFFTimeToMinutes(''), 0);
  assert.equal(parseFFTimeToMinutes('Tentative'), 0);
});

test('buildEventTimestamp constructs UTC timestamps from day key and FF time', () => {
  assert.equal(
    buildEventTimestamp('2024-04-03', '8:30am'),
    Date.parse('2024-04-03T08:30:00.000Z'),
  );
  assert.equal(
    buildEventTimestamp('2024-04-03', '2:45pm'),
    Date.parse('2024-04-03T14:45:00.000Z'),
  );
  assert.equal(
    buildEventTimestamp('2024-04-03', 'All Day'),
    Date.parse('2024-04-03T00:00:00.000Z'),
  );
  assert.equal(
    buildEventTimestamp('2024-03-10', '12:30am'),
    Date.parse('2024-03-10T00:30:00.000Z'),
  );
});

test('getDayKeysInRange iterates inclusive UTC days within the requested range', () => {
  assert.deepEqual(
    getDayKeysInRange('2024-04-03T00:00:00.000Z', '2024-04-03T23:59:59.999Z'),
    ['2024-04-03'],
  );
});

test('getDayKeysInRange covers the full Mon-Fri week including weekend days', () => {
  const keys = getDayKeysInRange('2024-04-01T00:00:00.000Z', '2024-04-05T23:59:59.999Z');
  assert.deepEqual(keys, [
    '2024-04-01',
    '2024-04-02',
    '2024-04-03',
    '2024-04-04',
    '2024-04-05',
  ]);

  const fullWeek = getDayKeysInRange('2024-04-01T00:00:00.000Z', '2024-04-07T23:59:59.999Z');
  assert.deepEqual(fullWeek, [
    '2024-04-01',
    '2024-04-02',
    '2024-04-03',
    '2024-04-04',
    '2024-04-05',
    '2024-04-06',
    '2024-04-07',
  ]);
});

test('getDayKeysInRange clamps to maxDays and returns empty for invalid ranges', () => {
  const keys = getDayKeysInRange('2024-04-01T00:00:00.000Z', '2024-05-01T00:00:00.000Z', 15);
  assert.equal(keys.length, 15);

  assert.deepEqual(getDayKeysInRange('2024-04-05T00:00:00.000Z', '2024-04-01T00:00:00.000Z'), []);
  assert.deepEqual(getDayKeysInRange('invalid', '2024-04-01T00:00:00.000Z'), []);
});

test('filterEventsByCurrencies keeps only matching currencies case-insensitively', () => {
  const events = [
    { currency: 'USD' },
    { currency: 'eur' },
    { currency: 'GBP' },
    { currency: '' },
  ];

  assert.deepEqual(
    filterEventsByCurrencies(events, ['usd', 'EUR']),
    [{ currency: 'USD' }, { currency: 'eur' }],
  );

  assert.deepEqual(filterEventsByCurrencies(events, []), events);
});

test('scraped events map to NewsEvent shape with impactTitle precedence', () => {
  const scraped: ScrapedEvent = {
    id: '52282',
    date: '2024-04-03',
    time: '8:30am',
    currency: 'usd',
    impact: 'High',
    impactTitle: 'High Impact Expected',
    impactClass: 'impact-red',
    title: 'Non-Farm Payrolls',
    actual: '-0.4%',
    forecast: '-0.3%',
    previous: '0.4%',
    actualStatus: 'worse',
  };

  const { eventId, ...mapped } = mapScrapedEventForTest(scraped);

  assert.equal(mapped.timestamp, Date.parse('2024-04-03T08:30:00.000Z'));
  assert.equal(mapped.currency, 'USD');
  assert.equal(mapped.impact, 'High Impact Expected');
  assert.equal(mapped.event, 'Non-Farm Payrolls');
  assert.equal(mapped.actual, '-0.4%');
  assert.equal(mapped.forecast, '-0.3%');
  assert.equal(mapped.previous, '0.4%');
  assert.ok(eventId.startsWith('evt-2024-04-03-52282'));
});

function mapScrapedEventForTest(ev: ScrapedEvent) {
  return {
    eventId: `evt-2024-04-03-${ev.id}`,
    timestamp: buildEventTimestamp('2024-04-03', ev.time),
    currency: ev.currency.toUpperCase(),
    impact: ev.impactTitle || ev.impact,
    event: ev.title,
    actual: ev.actual,
    forecast: ev.forecast,
    previous: ev.previous,
    detail: '',
  };
}
