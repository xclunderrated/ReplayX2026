import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BadRequestError,
  findCoverageProblem,
  findLargestInteriorGapSeconds,
  isSupportedTimeframe,
  maxLegitimateGapSeconds,
  normalizeDateParam,
  normalizePriceType,
  resolveTimeframe,
  shiftDate,
  validateDownloadRequest,
} from '../src/lib/dukascopyRequest';

const DAY_SEC = 86_400;

// Only ids the server actually lists. Note the predicate must NOT accept
// `raw === mapped`, or every unknown symbol would validate as itself.
const KNOWN = new Set(['eurusd', 'usdjpy', 'usa30idxusd', 'usatechidxusd', 'btcusd', 'xauusd']);
const knownInstrument = (dukascopyInstrument: string) => KNOWN.has(dukascopyInstrument);

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    instrument: 'eurusd',
    fromDate: '2026-08-01',
    toDate: '2026-08-20',
    priceType: 'bid',
    timeframe: 'm15',
    ...overrides,
  };
}

test('normalizeDateParam accepts the day form the session loader sends', () => {
  assert.equal(normalizeDateParam('2026-08-01'), '2026-08-01');
  assert.equal(normalizeDateParam('  2026-08-01  '), '2026-08-01');
  assert.equal(normalizeDateParam('2024-02-29'), '2024-02-29');
});

test('normalizeDateParam collapses the ISO datetimes the chart viewport loader sends', () => {
  // TradingViewChart.tsx sends Date#toISOString() while useSessionLoader sends
  // YYYY-MM-DD. These reached the cache key and the on-disk filename verbatim, so
  // the same day was downloaded twice and the ISO variant could never be cached
  // at all (`:` is illegal in a Windows filename).
  assert.equal(normalizeDateParam('2026-08-01T00:00:00.000Z'), '2026-08-01');
  assert.equal(normalizeDateParam('2026-08-01T23:59:59.999Z'), '2026-08-01');
  assert.equal(
    normalizeDateParam('2026-08-01'),
    normalizeDateParam('2026-08-01T00:00:00.000Z'),
    'both caller formats must normalize to one cache key',
  );
});

test('normalizeDateParam rejects unparseable and impossible dates', () => {
  assert.equal(normalizeDateParam('not-a-date'), null);
  assert.equal(normalizeDateParam(''), null);
  assert.equal(normalizeDateParam(undefined), null);
  assert.equal(normalizeDateParam(null), null);
  assert.equal(normalizeDateParam({}), null);
  // Feb 30 / month 13 do not exist and must not be silently rolled over.
  assert.equal(normalizeDateParam('2026-02-30'), null);
  assert.equal(normalizeDateParam('2026-13-01'), null);
  assert.equal(normalizeDateParam('2025-02-29'), null);
});

test('normalizePriceType collapses every spelling of bid onto one value', () => {
  // The raw value used to go into the cache key while the fetch always
  // normalized, so "BID" and "bid" were separate entries for identical data.
  assert.equal(normalizePriceType('bid'), 'bid');
  assert.equal(normalizePriceType('BID'), 'bid');
  assert.equal(normalizePriceType(' Bid '), 'bid');
  assert.equal(normalizePriceType('ask'), 'ask');
  assert.equal(normalizePriceType('ASK'), 'ask');
  assert.equal(normalizePriceType('mid'), 'bid');
  assert.equal(normalizePriceType(undefined), 'bid');
});

test('resolveTimeframe builds h1 and h4 from m1, not the native hour feed', () => {
  // Dukascopy serves hours as one file per month and rate-limits it while the
  // month is in progress. A native h1/h4 request silently lost the current month.
  const h1 = resolveTimeframe('h1');
  const h4 = resolveTimeframe('h4');
  assert.equal(h1.nativeDukascopyTimeframe, 'm1');
  assert.equal(h1.aggregationTarget, '1h');
  assert.equal(h4.nativeDukascopyTimeframe, 'm1');
  assert.equal(h4.aggregationTarget, '4h');
  // The reported timeframe stays what the caller asked for.
  assert.equal(h1.canonical, 'h1');
  assert.equal(h4.canonical, 'h4');
});

test('resolveTimeframe keeps monthly native and weekly aggregated from daily', () => {
  const mn1 = resolveTimeframe('mn1');
  assert.equal(mn1.canonical, 'mn1');
  assert.equal(mn1.nativeDukascopyTimeframe, 'mn1');
  assert.equal(mn1.aggregationTarget, undefined);

  const weekly = resolveTimeframe('1w');
  assert.equal(weekly.canonical, '1W');
  assert.equal(weekly.nativeDukascopyTimeframe, 'd1');
  assert.equal(weekly.aggregationTarget, '1W');
});

test('resolveTimeframe builds sub-minute timeframes from the s1 base', () => {
  for (const [input, target] of [['s5', 's5'], ['15s', 's15'], ['s30', 's30']] as const) {
    const info = resolveTimeframe(input);
    assert.equal(info.isSubMinute, true);
    assert.equal(info.nativeDukascopyTimeframe, 's1');
    assert.equal(info.aggregationTarget, target);
  }
  // "tick" is served as the real s1 bars, not aggregated.
  const tick = resolveTimeframe('tick');
  assert.equal(tick.nativeDukascopyTimeframe, 's1');
  assert.equal(tick.aggregationTarget, undefined);
});

test('timeframe matching is case-insensitive and defaults to m1', () => {
  assert.equal(resolveTimeframe('H1').canonical, 'h1');
  assert.equal(resolveTimeframe(' M15 ').canonical, 'm15');
  assert.equal(resolveTimeframe('1D').canonical, 'd1');
  assert.equal(resolveTimeframe('nonsense').canonical, 'm1');
  assert.equal(isSupportedTimeframe('H1'), true);
  assert.equal(isSupportedTimeframe('mn1'), true);
  assert.equal(isSupportedTimeframe('nonsense'), false);
});

test('validateDownloadRequest returns canonical values for a good request', () => {
  const { request, tfInfo } = validateDownloadRequest(
    validBody({ instrument: 'EURUSD', priceType: 'BID' }),
    knownInstrument,
  );
  assert.equal(request.instrument, 'eurusd');
  assert.equal(request.fromDate, '2026-08-01');
  assert.equal(request.toDate, '2026-08-20');
  assert.equal(request.priceType, 'bid');
  assert.equal(request.timeframe, 'm15');
  assert.equal(tfInfo.canonical, 'm15');
});

test('validateDownloadRequest rejects malformed requests as 400, not 500', () => {
  // Each of these used to escape from inside dukascopy-node as a 500, which the
  // client could not distinguish from Dukascopy being unreachable.
  const cases: Array<[string, Record<string, unknown>]> = [
    ['missing instrument', validBody({ instrument: '' })],
    ['non-alphanumeric instrument', validBody({ instrument: 'eur/usd' })],
    ['unknown instrument', validBody({ instrument: 'notarealinstrument' })],
    ['unparseable fromDate', validBody({ fromDate: 'not-a-date' })],
    ['missing fromDate', validBody({ fromDate: undefined })],
    ['unparseable toDate', validBody({ toDate: 'whenever' })],
    ['reversed range', validBody({ fromDate: '2026-08-20', toDate: '2026-08-01' })],
    ['equal range', validBody({ fromDate: '2026-08-01', toDate: '2026-08-01' })],
    ['unsupported timeframe', validBody({ timeframe: 'm7' })],
  ];

  for (const [label, body] of cases) {
    assert.throws(
      () => validateDownloadRequest(body, knownInstrument),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestError, `${label}: expected BadRequestError`);
        assert.equal((err as BadRequestError).status, 400, `${label}: expected status 400`);
        return true;
      },
      label,
    );
  }
});

test('validateDownloadRequest accepts an alias that maps onto a known instrument', () => {
  const { request } = validateDownloadRequest(validBody({ instrument: 'us30' }), knownInstrument);
  assert.equal(request.instrument, 'us30');
});

test('validateDownloadRequest enforces the sub-minute range cap', () => {
  // s1 is capped at 3 days; a 36-day tick session must be refused by the server
  // rather than silently returning a partial range.
  assert.throws(
    () => validateDownloadRequest(
      validBody({ timeframe: 's1', fromDate: '2026-08-01', toDate: '2026-09-27' }),
      knownInstrument,
    ),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestError);
      assert.match((err as Error).message, /3-day limit/);
      return true;
    },
  );

  // Exactly at the cap is allowed.
  const { request } = validateDownloadRequest(
    validBody({ timeframe: 's5', fromDate: '2026-08-01', toDate: '2026-08-31' }),
    knownInstrument,
  );
  assert.equal(request.timeframe, 's5');
});

test('shiftDate moves whole days and crosses month and year boundaries', () => {
  assert.equal(shiftDate('2026-08-22', -7), '2026-08-15');
  assert.equal(shiftDate('2026-08-22', 7), '2026-08-29');
  assert.equal(shiftDate('2026-01-01', -7), '2025-12-25');
  assert.equal(shiftDate('2026-12-25', 7), '2027-01-01');
  // Used to pad the d1 range for 1W so the edge weeks are complete.
  assert.equal(shiftDate('2024-01-01', -7), '2023-12-25');
});

test('findLargestInteriorGapSeconds measures the hole in a series', () => {
  const day = (n: number) => n * DAY_SEC;
  assert.equal(findLargestInteriorGapSeconds([]), 0);
  assert.equal(findLargestInteriorGapSeconds([day(1)]), 0);
  assert.equal(
    findLargestInteriorGapSeconds([day(1), day(2), day(10)]),
    day(8),
  );
});

test('findCoverageProblem tolerates a normal weekend closure', () => {
  // Dukascopy's FX feed closes Friday ~22:00 UTC and reopens Sunday ~22:00 UTC,
  // so the routine hole in an intraday series is 48 hours. That must never be
  // reported as missing data.
  // 2024-08-23 is a Friday and 2024-08-25 the following Sunday.
  const friday = Date.UTC(2024, 7, 23, 22, 0, 0) / 1000;
  const sunday = Date.UTC(2024, 7, 25, 22, 0, 0) / 1000;
  assert.equal(new Date(friday * 1000).getUTCDay(), 5, 'fixture starts on a Friday');
  assert.equal(new Date(sunday * 1000).getUTCDay(), 0, 'fixture resumes on a Sunday');
  assert.equal(sunday - friday, 48 * 3600, 'fixture is a 48-hour weekend gap');

  const times = [friday, sunday, sunday + 3600];
  assert.equal(findCoverageProblem(times, 'm15'), null);
  assert.equal(findCoverageProblem(times, 'h1'), null);
  assert.equal(findCoverageProblem(times, 'd1'), null);
});

test('findCoverageProblem flags a missing calendar month', () => {
  // The exact failure this guard exists for: a 429 on one monthly file was
  // swallowed by failAfterRetryCount: false, so an H1 request spanning a month
  // boundary returned data that simply stopped there and was then cached.
  // August is present throughout; the whole of September is absent.
  const aug1 = Date.UTC(2026, 7, 1) / 1000;
  const aug15 = Date.UTC(2026, 7, 15) / 1000;
  const aug31Last = Date.UTC(2026, 7, 31, 23, 0, 0) / 1000;
  const sep25 = Date.UTC(2026, 8, 25) / 1000;
  const times = [aug1, aug15, aug31Last, sep25, sep25 + 3600];

  const problem = findCoverageProblem(times, 'h1');
  assert.ok(problem, 'a whole missing month must be reported');
  // Aug 31 23:00 -> Sep 25 00:00 is 24 days and 1 hour, and it is the largest
  // gap in the series (the intra-August gaps are 14 and ~17 days).
  assert.equal(problem.largestGapSeconds, sep25 - aug31Last);
  assert.ok(problem.largestGapSeconds > 7 * DAY_SEC, 'gap must exceed the 7-day bar');
  assert.match(problem.message, /incomplete/i);
  assert.match(problem.message, /24\.0-day gap/);
  assert.match(problem.message, /Retry/);
});

test('findCoverageProblem gives coarser timeframes more headroom', () => {
  // Thresholds are expressed in seconds and compared against second-based gaps;
  // getting this wrong (e.g. comparing seconds to milliseconds) makes every
  // threshold 1000x too permissive and silently disables the guard.
  assert.equal(maxLegitimateGapSeconds('m15'), 7 * DAY_SEC);
  assert.equal(maxLegitimateGapSeconds('h4'), 7 * DAY_SEC);
  assert.equal(maxLegitimateGapSeconds('d1'), 21 * DAY_SEC);
  assert.equal(maxLegitimateGapSeconds('1W'), 90 * DAY_SEC);
  assert.equal(maxLegitimateGapSeconds('mn1'), 400 * DAY_SEC);

  const mon = Date.UTC(2026, 0, 5) / 1000;
  const tenDaysLater = mon + 10 * DAY_SEC;
  // Under the 21-day daily bar, but far over the 7-day intraday bar.
  assert.equal(findCoverageProblem([mon, tenDaysLater], 'd1'), null);
  assert.ok(findCoverageProblem([mon, tenDaysLater], 'm15'));
});

test('a healthy dense series never trips the guard', () => {
  const times: number[] = [];
  for (let i = 0; i < 500; i++) times.push(Date.UTC(2026, 7, 1) / 1000 + i * 900);
  assert.equal(findCoverageProblem(times, 'm15'), null);
});
