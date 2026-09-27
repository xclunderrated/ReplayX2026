import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BadRequestError,
  findCoverageProblem,
  findLargestInteriorGapSeconds,
  isSupportedTimeframe,
  maxLegitimateGapSeconds,
  maxLegitimateTailShortfallSeconds,
  normalizeDateParam,
  normalizePriceType,
  resolveTimeframe,
  shiftDate,
  validateDownloadRequest,
} from '../src/lib/dukascopyRequest';

/** Mirrors `dropFlatWeekendBars` in server.ts. */
function dropFlatWeekendBars(candles: Array<{ time: number; open: number; high: number; low: number; close: number }>) {
  return candles.filter((c) => {
    if (c.open !== c.high || c.high !== c.low || c.low !== c.close) return true;
    const weekday = new Date(c.time * 1000).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  });
}

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
  // Dukascopy's feeds emit a Sunday bar for the Sunday open, so the routine hole
  // in an intraday series between the Friday close and that Sunday bar is about
  // two days. That must never be reported as missing data.
  // 2024-08-23 is a Friday and 2024-08-25 the following Sunday.
  const friday = Date.UTC(2024, 7, 23, 22, 0, 0) / 1000;
  const sundayBar = Date.UTC(2024, 7, 25, 22, 0, 0) / 1000;
  assert.equal(new Date(friday * 1000).getUTCDay(), 5, 'fixture starts on a Friday');
  assert.equal(new Date(sundayBar * 1000).getUTCDay(), 0, 'fixture resumes with a Sunday bar');
  assert.equal(sundayBar - friday, 48 * 3600, 'fixture is a 48-hour weekend gap');

  const times = [friday, sundayBar, sundayBar + 3600];
  assert.equal(findCoverageProblem(times, 'm15'), null);
  assert.equal(findCoverageProblem(times, 'h1'), null);
  assert.equal(findCoverageProblem(times, 'd1'), null);
});

test('findCoverageProblem flags a series that stops before the end of the range', () => {
  // This is the shape the real bug produced. The September hourly file 429'd, so
  // September was never downloaded: the series simply ENDS at the last August
  // candle. There is no interior gap at all, so a gap-only check is blind to it.
  // August is dense here so the tail is the only anomaly.
  const denseAugust = (): number[] => {
    const out: number[] = [];
    for (let day = 1; day <= 31; day++) out.push(Date.UTC(2026, 7, day) / 1000);
    out.push(Date.UTC(2026, 7, 31, 23) / 1000);
    return out;
  };
  const times = denseAugust();

  // Interior gaps are 1 day, so with no requestedTo there is nothing to report.
  assert.equal(findCoverageProblem(times, 'h1'), null);

  // Request ran to 2026-09-27 but data stops 2026-08-31 23:00.
  const toSep27 = Date.UTC(2026, 8, 27) / 1000;
  const problem = findCoverageProblem(times, 'h1', toSep27, toSep27);
  assert.ok(problem, 'a series ending 27 days early must be reported');
  assert.equal(problem.kind, 'tail');
  assert.match(problem.message, /stops 27\.0 days before the end/);
  assert.match(problem.message, /Retry/);
});

test('findCoverageProblem flags an interior hole when the tail is present', () => {
  // The complementary shape: a month missing from the *middle* of the range.
  const aug1 = Date.UTC(2026, 7, 1) / 1000;
  const aug15 = Date.UTC(2026, 7, 15) / 1000;
  const sep25 = Date.UTC(2026, 8, 25) / 1000;
  const times = [aug1, aug15, sep25, sep25 + 3600];

  const problem = findCoverageProblem(times, 'h1');
  assert.ok(problem, 'a whole missing month must be reported');
  assert.equal(problem.kind, 'interior');
  // Aug 15 -> Sep 25 is 41 days.
  assert.equal(problem.largestGapSeconds, sep25 - aug15);
  assert.match(problem.message, /41\.0-day gap/);
});

test('the tail check tolerates weekends, holidays and unpublished data', () => {
  // Measured against real Dukascopy EUR/USD data: a range ending on a weekend
  // legitimately stops on the preceding Friday (2-3 days), and a range reaching
  // past the most recently published data can be ~7 days short.
  const toDate = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 1000;
  // Pinned after every range below, so none of them counts as future-reaching
  // and the tail check is always active.
  const now = Date.UTC(2026, 10, 1) / 1000;

  // Ends Monday 2026-09-28, data stops Friday 2026-09-25 -> 3 days.
  assert.equal(
    findCoverageProblem(
      [Date.UTC(2026, 8, 24) / 1000, Date.UTC(2026, 8, 25, 21) / 1000],
      'h1',
      toDate(2026, 8, 28),
      now,
    ),
    null,
  );

  // Ends in the FX holiday cluster, data stops the prior Friday -> 3 days.
  assert.equal(
    findCoverageProblem(
      [Date.UTC(2025, 11, 29) / 1000, Date.UTC(2025, 11, 31, 21) / 1000],
      'h1',
      toDate(2026, 0, 3),
      now,
    ),
    null,
  );

  // Reaches ~7 days past the last published bar -> still tolerated.
  assert.equal(
    findCoverageProblem(
      [Date.UTC(2026, 8, 24) / 1000, Date.UTC(2026, 8, 25, 21) / 1000],
      'h1',
      toDate(2026, 9, 2),
      now,
    ),
    null,
  );

  // But 30 days short is not.
  assert.equal(
    findCoverageProblem(
      [Date.UTC(2026, 7, 31, 21) / 1000],
      'h1',
      toDate(2026, 8, 30),
      now,
    )?.kind,
    'tail',
  );
});

test('a range reaching into the future is not treated as a failed download', () => {
  // Dukascopy cannot have data for dates that have not happened, so a session
  // whose end date is in the future legitimately stops at the last published bar.
  // Flagging that would tell the user an upstream download broke when they only
  // asked for future dates — and would stop the result being cached at all.
  const nowSeconds = Date.UTC(2026, 8, 27) / 1000;      // "today"
  const lastPublished = Date.UTC(2026, 8, 25, 21) / 1000; // latest available bar

  // toDate 2026-10-10, two weeks out: data correctly ends 2026-09-25.
  const futureTo = Date.UTC(2026, 9, 10) / 1000;
  assert.equal(findCoverageProblem([lastPublished], 'h1', futureTo, nowSeconds), null);

  // toDate 2026-11-27, two months out: still not a failure.
  const farFuture = Date.UTC(2026, 10, 27) / 1000;
  assert.equal(findCoverageProblem([lastPublished], 'h1', farFuture, nowSeconds), null);

  // But a genuinely missing month in the middle of a future-reaching range is
  // still caught by the interior check.
  const withHole = [
    Date.UTC(2026, 6, 1) / 1000,
    Date.UTC(2026, 7, 1) / 1000,
    lastPublished,
  ];
  assert.equal(findCoverageProblem(withHole, 'h1', farFuture, nowSeconds)?.kind, 'interior');

  // A real tail failure that is *not* in the future is still caught.
  const pastTo = Date.UTC(2026, 8, 27) / 1000;
  const stopsEarly = [Date.UTC(2026, 7, 31, 21) / 1000];
  assert.equal(findCoverageProblem(stopsEarly, 'h1', pastTo, nowSeconds)?.kind, 'tail');
});

test('monthly sessions ending mid-month are not flagged as short', () => {
  // A monthly series is stamped on the 1st, so a session ending on the 29th
  // legitimately stops ~28 days short. The tail tolerance has to allow that.
  const toDate = Date.UTC(2026, 8, 30) / 1000;
  const now = Date.UTC(2026, 8, 30) / 1000;
  const lastMonthly = Date.UTC(2026, 8, 1) / 1000;
  assert.equal(findCoverageProblem([lastMonthly], 'mn1', toDate, now), null);

  // A genuinely missing month is still caught.
  assert.equal(
    findCoverageProblem([Date.UTC(2026, 6, 1) / 1000], 'mn1', toDate, now)?.kind,
    'tail',
  );
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

test('the weekend filter drops placeholders but keeps real flat sessions', () => {
  // Dukascopy emits flat O=H=L=C bars for weekend closures. `ignoreFlats` was
  // removing those, but it also removed flat *weekday* sessions — for equities
  // that silently corrupted 9 of 91 weekly candles, because the discarded bar
  // was extending the week's high or low.
  const at = (iso: string) => {
    const t = Date.parse(iso) / 1000;
    return { time: t, open: 100, high: 100, low: 100, close: 100 };
  };
  const saturday = at('2026-08-01T00:00:00Z');   // Saturday, flat placeholder
  const sunday = at('2026-08-02T00:00:00Z');     // Sunday, flat placeholder (equities)
  const mondayFlat = at('2026-08-03T00:00:00Z'); // Monday, flat but REAL (halted/quiet)
  const tuesday = {
    time: Date.parse('2026-08-04T00:00:00Z') / 1000,
    open: 100, high: 105, low: 99, close: 104,
  };

  assert.equal(new Date(saturday.time * 1000).getUTCDay(), 6);
  assert.equal(new Date(sunday.time * 1000).getUTCDay(), 0);
  assert.equal(new Date(mondayFlat.time * 1000).getUTCDay(), 1);

  const kept = dropFlatWeekendBars([saturday, sunday, mondayFlat, tuesday]);
  const times = kept.map((c) => c.time);
  assert.equal(times.includes(saturday.time), false, 'Saturday placeholder dropped');
  assert.equal(times.includes(sunday.time), false, 'Sunday placeholder dropped');
  assert.equal(times.includes(mondayFlat.time), true, 'flat Monday session kept');
  assert.equal(times.includes(tuesday.time), true, 'normal session kept');
});

test('a weekend placeholder outside the week range is the case that mattered', () => {
  // Regression shape: a dropped bar whose price sits outside the surrounding
  // week's high/low. Keeping flat weekday bars means the weekly candle can no
  // longer lose its extreme to the filter.
  const mon = { time: Date.parse('2026-08-03T00:00:00Z') / 1000, open: 100, high: 104, low: 96, close: 103 };
  const tue = { time: Date.parse('2026-08-04T00:00:00Z') / 1000, open: 103, high: 108, low: 102, close: 107 };
  const wedFlatHigh = { time: Date.parse('2026-08-05T00:00:00Z') / 1000, open: 107, high: 107, low: 107, close: 107 };
  // Would have extended the weekly high from 108 to 112 if dropped.
  const thuFlatLow = { time: Date.parse('2026-08-06T00:00:00Z') / 1000, open: 90, high: 90, low: 90, close: 90 };

  const all = [mon, tue, wedFlatHigh, thuFlatLow];
  const kept = dropFlatWeekendBars(all);
  assert.equal(kept.length, 4, 'all four are weekdays, so all are kept');
  const high = Math.max(...kept.map((c) => c.high));
  const low = Math.min(...kept.map((c) => c.low));
  assert.equal(high, 108, 'flat weekday high is retained');
  assert.equal(low, 90, 'flat weekday low is retained');
});

test('tail tolerance is looser for coarse timeframes than for intraday', () => {
  assert.equal(maxLegitimateTailShortfallSeconds('m15'), 10 * DAY_SEC);
  assert.equal(maxLegitimateTailShortfallSeconds('h1'), 10 * DAY_SEC);
  assert.equal(maxLegitimateTailShortfallSeconds('1W'), 14 * DAY_SEC);
  // A monthly series is stamped on the 1st, so ending on the 29th is normal.
  assert.equal(maxLegitimateTailShortfallSeconds('mn1'), 45 * DAY_SEC);
});
