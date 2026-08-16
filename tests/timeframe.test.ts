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
} from '../src/lib/timeframe';

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
