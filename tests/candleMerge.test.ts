import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCandles, aggregateCandles } from '../src/lib/timeframe';
import type { Candle } from '../src/store/useSimulatorStore';

const DAY = 86_400_000;
const MIN = 60_000;

function c(timestamp: number, close = 1): Candle {
  return { timestamp, open: close, high: close, low: close, close, volume: 1 };
}

test('mergeCandles merges overlapping sorted ranges correctly', () => {
  const existing = [c(0), c(MIN), c(2 * MIN)];
  const incoming = [c(2 * MIN), c(3 * MIN), c(4 * MIN)];
  const merged = mergeCandles(existing, incoming);
  assert.deepEqual(merged.map((x) => x.timestamp), [0, MIN, 2 * MIN, 3 * MIN, 4 * MIN]);
});

test('mergeCandles self-heals an unsorted incoming series instead of corrupting it', () => {
  // The regression this guards. `mergeCandles` is a linear merge that is only
  // correct for sorted input. Given unsorted input it does not error - it emits a
  // silently corrupt series, and this is the path feeding replay order entry,
  // exits and realised P&L. The old code simply documented an unverified
  // assumption that callers sorted first.
  const existing = [c(0), c(MIN), c(2 * MIN)];
  const incoming = [c(4 * MIN), c(3 * MIN), c(2 * MIN)]; // reversed
  const merged = mergeCandles(existing, incoming);
  const timestamps = merged.map((x) => x.timestamp);
  assert.deepEqual(
    timestamps,
    [...timestamps].sort((a, b) => a - b),
    'merged output must be sorted',
  );
  assert.deepEqual(timestamps, [0, MIN, 2 * MIN, 3 * MIN, 4 * MIN]);
});

test('mergeCandles self-heals an unsorted existing series', () => {
  const existing = [c(2 * MIN), c(0), c(MIN)]; // shuffled
  const incoming = [c(3 * MIN)];
  const merged = mergeCandles(existing, incoming);
  const timestamps = merged.map((x) => x.timestamp);
  assert.deepEqual(timestamps, [...timestamps].sort((a, b) => a - b));
  assert.deepEqual(timestamps, [0, MIN, 2 * MIN, 3 * MIN]);
});

test('mergeCandles dedupes duplicate timestamps by merging OHLCV', () => {
  const a = { timestamp: MIN, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 };
  const b = { timestamp: MIN, open: 1, high: 3, low: 0.25, close: 2.5, volume: 5 };
  const merged = mergeCandles([a], [b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].high, 3, 'keeps the highest high');
  assert.equal(merged[0].low, 0.25, 'keeps the lowest low');
  assert.equal(merged[0].close, 2.5, 'prefers the incoming close');
  assert.equal(merged[0].volume, 15, 'sums volume');
});

test('aggregateCandles refuses to derive sub-minute bars from coarser data', () => {
  // Base data is 1 minute. Asking for 5s must produce nothing rather than
  // fabricating buckets.
  const m1: Candle[] = Array.from({ length: 120 }, (_, i) => c(i * MIN, 100 + i));
  assert.deepEqual(aggregateCandles(m1, '5s'), []);
  // 1m from 1m is a pass-through.
  assert.equal(aggregateCandles(m1, 'm1').length, 120);
});

test('aggregateCandles infers granularity from the common gap, not the smallest', () => {
  // The regression this guards: base granularity was inferred from the *minimum*
  // gap, so one anomalous tight pair made it believe sub-second data existed and
  // permitted deriving 5s bars from 1m data - buckets that correspond to no real
  // bar. A single duplicated/mis-timestamped bar is enough to trigger it.
  const m1: Candle[] = Array.from({ length: 200 }, (_, i) => c(i * MIN, 100 + i));
  // Inject one tight pair: candle 100 sits 1 second after candle 99.
  m1[100] = c(m1[99].timestamp + 1000, 999);

  assert.deepEqual(
    aggregateCandles(m1, '5s'),
    [],
    'a lone sub-minute gap must not license deriving 5s bars from 1m data',
  );
  // And the anomaly must not corrupt the legitimate derivations either.
  const hourly = aggregateCandles(m1, 'h1');
  const stamps = hourly.map((x) => x.timestamp);
  assert.deepEqual(stamps, [...stamps].sort((a, b) => a - b), 'h1 output stays sorted');
  assert.ok(hourly.length >= 3, `expected several hourly bars, got ${hourly.length}`);
  for (const bar of hourly) {
    assert.ok(
      Number.isFinite(bar.open) && Number.isFinite(bar.close),
      'no NaN may reach the output',
    );
  }
});

test('aggregateCandles still derives sub-minute bars from a genuine s1 base', () => {
  // The mode-based estimator must not break the legitimate sub-minute path.
  const s1: Candle[] = Array.from({ length: 3000 }, (_, i) => c(i * 1000, 100 + (i % 50)));
  const s5 = aggregateCandles(s1, 's5');
  assert.ok(s5.length > 0, '5s bars must be derivable from real s1 data');
  const stamps = s5.map((x) => x.timestamp);
  assert.deepEqual(stamps, [...stamps].sort((a, b) => a - b));
});

test('aggregateCandles handles a sparse series where most gaps are large', () => {
  // Weekday-only data: 1-day gaps dominate, 3-day weekend gaps are the minority.
  // The mode must pick 1 day, so a 1d target is allowed and finer is not.
  const daily: Candle[] = [];
  for (let day = 0; day < 40; day++) {
    const ts = Date.UTC(2026, 0, 5) + day * DAY;
    const dow = new Date(ts).getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    daily.push(c(ts, 100 + day));
  }
  assert.equal(aggregateCandles(daily, 'd1').length, daily.length);
  assert.deepEqual(aggregateCandles(daily, 'h1'), [], 'cannot derive hourly from daily');
});
