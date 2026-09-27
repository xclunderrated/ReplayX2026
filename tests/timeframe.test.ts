import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCandles,
  expandSubMinuteCandlesFromM1,
  canDeriveTimeframe,
  sortAndDeduplicateCandles,
  getBaseTimeframe,
  getAggregationSource,
  getMaxRangeDaysForTimeframe,
  getBucketStart,
  getTimeframeSeconds,
  auraTimeframeToDukascopy,
  dukascopyTimeframeToAura,
} from '../src/lib/timeframe';
import { getApproxIntervalMs, toDateBoundary } from '../src/lib/simulatorEngine';
import { WEEKLY_MONDAY_OFFSET_SEC } from '../src/lib/candleAggregator';

const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;

test('sortAndDeduplicateCandles drops corrupted candles and preserves identical overlap once', () => {
  const duplicate = { timestamp: 1_000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 10 };
  const result = sortAndDeduplicateCandles([
    { timestamp: 2_000, open: 1.2, high: 1.25, low: 1.18, close: 1.21, volume: 5 },
    duplicate,
    { timestamp: 3_000, open: 1.2, high: 1.1, low: 1.3, close: 1.2, volume: 1 },
    { timestamp: Number.NaN, open: 1.2, high: 1.3, low: 1.1, close: 1.2, volume: 1 },
    duplicate,
  ]);

  assert.deepEqual(result, [
    duplicate,
    { timestamp: 2_000, open: 1.2, high: 1.25, low: 1.18, close: 1.21, volume: 5 },
  ]);
});

test('aggregateCandles sorts input and keeps OHLC correct across gaps', () => {
  const result = aggregateCandles([
    { timestamp: Date.UTC(2024, 0, 1, 0, 2), open: 1.102, high: 1.106, low: 1.101, close: 1.105, volume: 3 },
    { timestamp: Date.UTC(2024, 0, 1, 0, 0), open: 1.100, high: 1.103, low: 1.099, close: 1.102, volume: 2 },
    { timestamp: Date.UTC(2024, 0, 1, 0, 10), open: 1.200, high: 1.201, low: 1.198, close: 1.199, volume: 1 },
  ], 'm5');

  assert.deepEqual(result, [
    {
      timestamp: Date.UTC(2024, 0, 1, 0, 0),
      open: 1.100,
      high: 1.106,
      low: 1.099,
      close: 1.105,
      volume: 5,
    },
    {
      timestamp: Date.UTC(2024, 0, 1, 0, 10),
      open: 1.200,
      high: 1.201,
      low: 1.198,
      close: 1.199,
      volume: 1,
    },
  ]);
});

test('canDeriveTimeframe blocks lower-resolution reconstruction from coarser data', () => {
  assert.equal(canDeriveTimeframe('m5', 'm1'), false);
  assert.equal(canDeriveTimeframe('m5', 'tick'), false);
  assert.equal(canDeriveTimeframe('m5', 'm15'), true);
  assert.equal(canDeriveTimeframe('tick', 's5'), true);
  assert.equal(canDeriveTimeframe('h1', 'mn1'), true);
});

test('getBaseTimeframe returns the Dukascopy-native base to aggregate from per the docs', () => {
  // tick → tick (natively supported)
  assert.equal(getBaseTimeframe('tick'), 'tick');
  // Seconds (s5/s15/s30) aggregate from real 1-second data (Dukascopy s1).
  assert.equal(getBaseTimeframe('s5'), 's1');
  assert.equal(getBaseTimeframe('s15'), 's1');
  assert.equal(getBaseTimeframe('s30'), 's1');
  assert.equal(getBaseTimeframe('s1'), 's1');
  // m1 is its own native base; m5/m15/m30 aggregate from m1.
  assert.equal(getBaseTimeframe('m1'), 'm1');
  assert.equal(getBaseTimeframe('m5'), 'm1');
  assert.equal(getBaseTimeframe('m15'), 'm1');
  assert.equal(getBaseTimeframe('m30'), 'm1');
  // Hours (h1/h4) aggregate from h1.
  assert.equal(getBaseTimeframe('h1'), 'h1');
  assert.equal(getBaseTimeframe('h4'), 'h1');
  // Days / months are fetched at their own native timeframe.
  assert.equal(getBaseTimeframe('d1'), 'd1');
  assert.equal(getBaseTimeframe('mn1'), 'mn1');
  // Weekly aggregates from daily; it is not a monthly feed.
  assert.equal(getBaseTimeframe('1W'), 'd1');
});

test('monthly is a distinct timeframe from weekly', () => {
  // 'mn1' is Dukascopy's *monthly* feed. It used to alias to '1W' in
  // TIMEFRAME_MAP, so every duration calculation treated monthly bars as 7-day
  // bars while the server returned real monthly data.
  assert.notEqual(auraTimeframeToDukascopy('mn1'), auraTimeframeToDukascopy('1W'));
  assert.equal(getTimeframeSeconds('mn1'), 30 * 86_400);
  assert.equal(getTimeframeSeconds('1W'), 7 * 86_400);
  assert.equal(auraTimeframeToDukascopy('mn1'), '1M');
  assert.equal(auraTimeframeToDukascopy('1M'), '1M');

  // Monthly is still the coarsest timeframe, so ordering holds.
  assert.ok(getTimeframeSeconds('1W') < getTimeframeSeconds('mn1'));
  assert.equal(canDeriveTimeframe('d1', '1W'), true);
  assert.equal(canDeriveTimeframe('1W', 'mn1'), true);
  assert.equal(canDeriveTimeframe('mn1', '1W'), false);
});

test('the wire format for monthly stays mn1, not 1M', () => {
  // The server lowercases timeframes before matching, so sending "1M" would
  // collapse onto "1m" (one minute). The reverse map must emit "mn1".
  assert.equal(dukascopyTimeframeToAura('1M'), 'mn1');
  assert.equal(dukascopyTimeframeToAura('1W'), '1W');
  assert.equal(dukascopyTimeframeToAura('1h'), 'h1');
  assert.equal(dukascopyTimeframeToAura('4h'), 'h4');
  assert.equal(dukascopyTimeframeToAura('15m'), 'm15');
});

test('getAggregationSource mirrors getBaseTimeframe', () => {
  assert.equal(getAggregationSource('tick'), 'tick');
  assert.equal(getAggregationSource('s5'), 's1');
  assert.equal(getAggregationSource('s30'), 's1');
  assert.equal(getAggregationSource('m5'), 'm1');
  assert.equal(getAggregationSource('m15'), 'm1');
  assert.equal(getAggregationSource('h4'), 'h1');
});

test('getMaxRangeDaysForTimeframe caps only sub-minute timeframes', () => {
  assert.equal(getMaxRangeDaysForTimeframe('tick'), 3);
  assert.equal(getMaxRangeDaysForTimeframe('s1'), 3);
  assert.equal(getMaxRangeDaysForTimeframe('s5'), 30);
  assert.equal(getMaxRangeDaysForTimeframe('15s'), 45);
  assert.equal(getMaxRangeDaysForTimeframe('s30'), 60);
  assert.equal(getMaxRangeDaysForTimeframe('m1'), Infinity);
  assert.equal(getMaxRangeDaysForTimeframe('h1'), Infinity);
  assert.equal(getMaxRangeDaysForTimeframe('1W'), Infinity);
});

test('weekly buckets are anchored on Monday', () => {
  // The offset used to be 259200s (3 days). Jan 1 1970 was a Thursday, so 3
  // days lands on Sunday and weekly candles were bucketed Sun-Sat despite the
  // constant being named WEEKLY_MONDAY_OFFSET_SEC.
  assert.equal(new Date(0).getUTCDay(), 4, 'epoch was a Thursday');
  assert.equal(new Date(WEEKLY_MONDAY_OFFSET_SEC * 1000).getUTCDay(), 1, 'anchor must be a Monday');
  assert.equal(WEEKLY_MONDAY_OFFSET_SEC, 4 * 86_400);

  // A Monday belongs to its own bucket; the Sunday before it belongs to the
  // previous week.
  const monday = Date.UTC(2024, 0, 1, 12, 0, 0);
  const sundayBefore = Date.UTC(2023, 11, 31, 12, 0, 0);
  assert.equal(new Date(getBucketStart(monday, '1W')).getUTCDay(), 1);
  assert.equal(new Date(getBucketStart(monday, '1W')).toISOString().slice(0, 10), '2024-01-01');
  assert.equal(new Date(getBucketStart(sundayBefore, '1W')).getUTCDay(), 1);
  assert.equal(new Date(getBucketStart(sundayBefore, '1W')).toISOString().slice(0, 10), '2023-12-25');

  // Every day of an ISO week maps to that week's Monday.
  for (let i = 0; i < 7; i++) {
    const ts = Date.UTC(2024, 0, 1 + i, 12, 0, 0);
    assert.equal(
      getBucketStart(ts, '1W'),
      Date.UTC(2024, 0, 1, 0, 0, 0),
      `2024-01-0${i + 1} must bucket to Monday 2024-01-01`,
    );
  }
});

test('weekly aggregation from daily produces complete Monday-anchored weeks', () => {
  // Three trading weeks of daily bars, Mon 2024-01-01 .. Fri 2024-01-19.
  // Weekends are omitted, as they are for a real FX feed.
  const d1 = [];
  let i = 0;
  for (let day = 1; day <= 19; day++) {
    const weekday = new Date(Date.UTC(2024, 0, day)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    d1.push({
      timestamp: Date.UTC(2024, 0, day, 0, 0, 0),
      open: 1.0 + i,
      high: 2.0 + i,
      low: 0.5 + i,
      close: 1.5 + i,
      volume: 10,
    });
    i++;
  }
  assert.equal(d1.length, 15, 'three five-day trading weeks');

  const weekly = aggregateCandles(d1, '1W');
  assert.equal(weekly.length, 3);
  for (let w = 0; w < weekly.length; w++) {
    assert.equal(
      new Date(weekly[w].timestamp).getUTCDay(),
      1,
      `weekly candle ${w} must be stamped on a Monday`,
    );
  }

  // First week: Jan 1 (Mon) .. Jan 5 (Fri) — 5 bars.
  assert.equal(weekly[0].timestamp, Date.UTC(2024, 0, 1, 0, 0, 0));
  assert.equal(weekly[0].open, 1.0, 'open is the first bar of the week');
  assert.equal(weekly[0].close, 1.5 + 4, 'close is the last bar of the week');
  assert.equal(weekly[0].high, Math.max(...d1.slice(0, 5).map((c) => c.high)));
  assert.equal(weekly[0].low, Math.min(...d1.slice(0, 5).map((c) => c.low)));
  assert.equal(weekly[0].volume, 50);

  // Second week: Jan 8 .. Jan 12 — the weekend is skipped, not zero-filled.
  // Five bars per week, so this bucket starts at index 5.
  assert.equal(weekly[1].timestamp, Date.UTC(2024, 0, 8, 0, 0, 0));
  assert.equal(weekly[1].open, d1[5].open);
  assert.equal(weekly[1].close, d1[9].close);
  assert.equal(weekly[1].volume, 50);

  // Third (partial) week: Jan 15 .. Jan 19, i.e. indices 10..14.
  assert.equal(weekly[2].timestamp, Date.UTC(2024, 0, 15, 0, 0, 0));
  assert.equal(weekly[2].open, d1[10].open);
  assert.equal(weekly[2].close, d1[14].close);
  assert.equal(weekly[2].volume, 50);
});

test('aggregateCandles aggregates real s1 candles into true sub-minute candles', () => {
  const start = Date.UTC(2024, 0, 1, 0, 0, 0);
  const s1Candles = [
    { timestamp: start, open: 1.0, high: 1.2, low: 0.9, close: 1.1, volume: 1 },
    { timestamp: start + 1000, open: 1.1, high: 1.3, low: 1.05, close: 1.25, volume: 1 },
    { timestamp: start + 2000, open: 1.25, high: 1.28, low: 1.1, close: 1.15, volume: 1 },
    { timestamp: start + 3000, open: 1.15, high: 1.4, low: 1.12, close: 1.35, volume: 1 },
    { timestamp: start + 4000, open: 1.35, high: 1.36, low: 1.2, close: 1.22, volume: 1 },
    { timestamp: start + 5000, open: 1.22, high: 1.5, low: 1.21, close: 1.45, volume: 1 },
  ];

  // 6 real 1-second candles, 5s buckets: [t0..t4] and [t5]
  const s5 = aggregateCandles(s1Candles, 's5');
  assert.equal(s5.length, 2);
  assert.deepEqual(s5[0], {
    timestamp: start,
    open: 1.0,
    high: 1.4,
    low: 0.9,
    close: 1.22,
    volume: 5,
  });
  assert.deepEqual(s5[1], {
    timestamp: start + 5000,
    open: 1.22,
    high: 1.5,
    low: 1.21,
    close: 1.45,
    volume: 1,
  });

  // 30s bucket of the same data: a single true candle with the real extremes
  const s30 = aggregateCandles(s1Candles, 's30');
  assert.equal(s30.length, 1);
  assert.deepEqual(s30[0], {
    timestamp: start,
    open: 1.0,
    high: 1.5,
    low: 0.9,
    close: 1.45,
    volume: 6,
  });

  // Sub-minute buckets aggregate up to 1m using the same real path (no slice)
  const m1 = aggregateCandles(s1Candles, '1m');
  assert.deepEqual(m1, [
    { timestamp: start, open: 1.0, high: 1.5, low: 0.9, close: 1.45, volume: 6 },
  ]);
});

test('aggregateCandles refuses to derive finer candles from coarser data', () => {
  const m1Candles = [
    { timestamp: Date.UTC(2024, 0, 1, 0, 0, 0), open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 10 },
    { timestamp: Date.UTC(2024, 0, 1, 0, 1, 0), open: 1.15, high: 1.25, low: 1.1, close: 1.2, volume: 10 },
  ];

  // m1 -> s5/s15/s30 is impossible without fabrication — no data, not guesses.
  assert.deepEqual(aggregateCandles(m1Candles, 's5'), []);
  assert.deepEqual(aggregateCandles(m1Candles, 's30'), []);
});

test('getApproxIntervalMs is exact for every real period and nominal only for monthly', () => {
  // This was duplicated in TradingViewChart with different logic, and both
  // copies returned a *month* for '1W' — harmless only while 'mn1' was
  // conflated with '1W'. Pin every id so an aliasing mistake fails loudly.
  const expected: Record<string, number> = {
    tick: 1000,
    s5: 5_000,
    s15: 15_000,
    s30: 30_000,
    m1: 60_000,
    '1m': 60_000,
    m5: 300_000,
    m15: 900_000,
    m30: 1_800_000,
    h1: 3_600_000,
    '1h': 3_600_000,
    h4: 14_400_000,
    '4h': 14_400_000,
    d1: DAY_MS,
    '1D': DAY_MS,
    '1d': DAY_MS,
    // A week is seven days. It used to report a month here.
    '1W': 7 * DAY_MS,
    '1w': 7 * DAY_MS,
    // Monthly has no fixed period, so it is nominal.
    mn1: MONTH_MS,
    '1M': MONTH_MS,
  };
  for (const [tf, ms] of Object.entries(expected)) {
    assert.equal(getApproxIntervalMs(tf), ms, `getApproxIntervalMs('${tf}')`);
  }
  assert.equal(getApproxIntervalMs('1W'), 7 * DAY_MS, 'weekly must not be a month');
  assert.notEqual(getApproxIntervalMs('1W'), getApproxIntervalMs('mn1'), 'week != month');
});

test('toDateBoundary treats the end of a bare day as exclusive', () => {
  const start = toDateBoundary('2026-08-27');
  const end = toDateBoundary('2026-08-27', true);
  assert.equal(new Date(start).toISOString(), '2026-08-27T00:00:00.000Z');
  assert.equal(new Date(end).toISOString(), '2026-08-28T00:00:00.000Z');
  assert.equal(end - start, DAY_MS);

  // A full ISO timestamp is already a point in time, so endOfDay must not shift it.
  const precise = toDateBoundary('2026-08-27T13:45:00Z', true);
  assert.equal(new Date(precise).toISOString(), '2026-08-27T13:45:00.000Z');

  // Unparseable input is loud, not silently reinterpreted as "now".
  assert.throws(() => toDateBoundary('not-a-date'), /Invalid session date/);
});

test('toDateBoundary resolves a bare day in the chart timezone, not UTC', () => {
  // A session's startDate is a calendar day, and the chart has a configurable
  // timezone (default browser-local). Resolving it at UTC midnight meant a New York
  // user's "the 27th" began at 20:00 on the 26th local.
  assert.equal(
    new Date(toDateBoundary('2026-08-27', false, 'America/New_York')).toISOString(),
    '2026-08-27T04:00:00.000Z',
  );
  assert.equal(
    new Date(toDateBoundary('2026-08-27', true, 'America/New_York')).toISOString(),
    '2026-08-28T04:00:00.000Z',
  );
  // A zone east of UTC starts its day on the previous UTC day.
  assert.equal(
    new Date(toDateBoundary('2026-08-27', false, 'Asia/Tokyo')).toISOString(),
    '2026-08-26T15:00:00.000Z',
  );
  // UTC, and an omitted timezone, are the same thing.
  assert.equal(toDateBoundary('2026-08-27', false, 'UTC'), toDateBoundary('2026-08-27'));
  // The end is the next local midnight, so a normal day is 24h and a
  // spring-forward day is 23h. Measured to the *next day's start*, since the
  // `endOfDay` flag is a fixed 24h step and cannot express a 23-hour local day.
  assert.equal(
    toDateBoundary('2026-08-27', true, 'America/New_York') - toDateBoundary('2026-08-27', false, 'America/New_York'),
    DAY_MS,
  );
  assert.equal(
    toDateBoundary('2026-03-09', false, 'America/New_York') - toDateBoundary('2026-03-08', false, 'America/New_York'),
    23 * 3_600_000,
  );

  // The loader and the cursor seed must agree, or the replay starts on the wrong
  // candle. Both go through this function, so pin that the zone is honoured on the
  // path `applySessionData` actually uses.
  assert.notEqual(
    toDateBoundary('2026-08-27', false, 'America/New_York'),
    toDateBoundary('2026-08-27', false, 'Asia/Tokyo'),
  );

  // A full ISO timestamp is a point in time, so a timezone must not shift it.
  assert.equal(
    toDateBoundary('2026-08-27T13:45:00Z', true, 'America/New_York'),
    toDateBoundary('2026-08-27T13:45:00Z', true),
  );
});

test('expandSubMinuteCandlesFromM1 synthesizes sub-minute candles from 1m (legacy mode)', () => {
  const minute = 60 * 1000;
  const start = Date.UTC(2024, 0, 1, 0, 0, 0);

  // A single m1 candle should be interpolated into 12 × 5s sub-candles
  const m1Candles = [{
    timestamp: start,
    open: 1.1000,
    high: 1.1050,
    low: 1.0950,
    close: 1.1020,
    volume: 120,
  }];

  const s5 = expandSubMinuteCandlesFromM1(m1Candles, 's5');
  assert.equal(s5.length, 12); // 60s / 5s = 12 sub-candles
  assert.equal(s5[0].timestamp, start);
  assert.equal(s5[1].timestamp, start + 5000);
  assert.equal(s5[11].timestamp, start + 55000);
  // First sub-candle opens at parent open
  assert.equal(s5[0].open, m1Candles[0].open);
  // Last sub-candle closes at parent close
  assert.equal(s5[11].close, m1Candles[0].close);
  // All sub-candles' highs ≤ parent high, lows ≥ parent low
  for (const c of s5) {
    assert.ok(c.high <= m1Candles[0].high, `sub-candle high ${c.high} > parent high ${m1Candles[0].high}`);
    assert.ok(c.low >= m1Candles[0].low, `sub-candle low ${c.low} < parent low ${m1Candles[0].low}`);
  }
  // Total volume is preserved
  const totalVol = s5.reduce((acc, c) => acc + c.volume, 0);
  assert.ok(Math.abs(totalVol - 120) < 0.01, `Total volume ${totalVol} should equal 120`);

  // s15: 60/15 = 4 sub-candles per m1
  const s15 = expandSubMinuteCandlesFromM1(m1Candles, 's15');
  assert.equal(s15.length, 4);

  // s30: 60/30 = 2 sub-candles per m1
  const s30 = expandSubMinuteCandlesFromM1(m1Candles, 's30');
  assert.equal(s30.length, 2);

  // Multiple m1 candles → proportional number of sub-candles
  const twoM1 = [
    { timestamp: start, open: 1.0, high: 1.1, low: 0.9, close: 1.05, volume: 60 },
    { timestamp: start + minute, open: 1.05, high: 1.15, low: 0.95, close: 1.10, volume: 60 },
  ];
  const s5Two = expandSubMinuteCandlesFromM1(twoM1, 's5');
  assert.equal(s5Two.length, 24); // 2 × 12
  assert.equal(s5Two[0].timestamp, start);
  assert.equal(s5Two[12].timestamp, start + minute);
});
