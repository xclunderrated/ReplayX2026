import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNewsWhitespacePoints,
  getNewsRenderState,
  getNewsWhitespaceTimestamps,
  resolveMarkerTime,
  resolveVisibleTimestamp,
} from '../src/lib/chartMarkers';
import { timestampMsToChartTime } from '../src/lib/timezone';
import type { NewsEvent } from '../src/lib/news';
import { hexToAlphaHex } from '../src/lib/news/newsLineDrawings';

const candles = [
  { timestamp: Date.parse('2024-04-03T09:00:00.000Z') },
  { timestamp: Date.parse('2024-04-03T09:01:00.000Z') },
  { timestamp: Date.parse('2024-04-03T09:02:00.000Z') },
];

test('resolveVisibleTimestamp snaps in-range timestamps to the nearest previous visible candle', () => {
  const resolvedTimestamp = resolveVisibleTimestamp(Date.parse('2024-04-03T09:01:30.000Z'), candles);

  assert.equal(resolvedTimestamp, Date.parse('2024-04-03T09:01:00.000Z'));
});

test('resolveVisibleTimestamp hides future markers until their candle is visible', () => {
  const resolvedTimestamp = resolveVisibleTimestamp(Date.parse('2024-04-03T09:05:00.000Z'), candles);

  assert.equal(resolvedTimestamp, null);
});

test('resolveVisibleTimestamp hides markers that are older than the first visible candle', () => {
  const resolvedTimestamp = resolveVisibleTimestamp(Date.parse('2024-04-03T08:59:00.000Z'), candles);

  assert.equal(resolvedTimestamp, null);
});

test('resolveMarkerTime converts resolved visible timestamps into chart time', () => {
  const markerTime = resolveMarkerTime(Date.parse('2024-04-03T09:01:30.000Z'), candles, 'UTC');

  assert.equal(markerTime, timestampMsToChartTime(Date.parse('2024-04-03T09:01:00.000Z'), 'UTC'));
});

test('getNewsRenderState keeps future news at its exact future timestamp for vertical guides', () => {
  const renderState = getNewsRenderState({
    eventTimestamp: Date.parse('2024-04-03T09:07:30.000Z'),
    currentTimestamp: Date.parse('2024-04-03T09:02:00.000Z'),
    visibleCandles: candles,
  });

  assert.deepEqual(renderState, {
    kind: 'future-line',
    eventTimestamp: Date.parse('2024-04-03T09:07:30.000Z'),
  });
});

test('getNewsRenderState places reached news on the resolved visible candle', () => {
  const renderState = getNewsRenderState({
    eventTimestamp: Date.parse('2024-04-03T09:01:30.000Z'),
    currentTimestamp: Date.parse('2024-04-03T09:02:00.000Z'),
    visibleCandles: candles,
  });

  assert.deepEqual(renderState, {
    kind: 'reached-marker',
    candleTimestamp: Date.parse('2024-04-03T09:01:00.000Z'),
  });
});

const MINUTE = 60 * 1000;

const baseNews: NewsEvent = {
  id: 'n1',
  timestamp: 0,
  currency: 'USD',
  impact: 'High Impact Expected',
  event: 'Test Event',
  actual: '',
  forecast: '',
  previous: '',
  detail: '',
};

function newsItem(overrides: Partial<NewsEvent>): NewsEvent {
  return { ...baseNews, ...overrides };
}

test('hexToAlphaHex appends the alpha byte to a 6-digit hex color', () => {
  assert.equal(hexToAlphaHex('#ef4444', 0.5), '#ef444480');
  assert.equal(hexToAlphaHex('#f59e0b', 1), '#f59e0bff');
  assert.equal(hexToAlphaHex('#3b82f6', 0), '#3b82f600');
  assert.equal(hexToAlphaHex('rgba(0,0,0,0.5)', 0.5), 'rgba(0,0,0,0.5)');
});

test('buildNewsWhitespacePoints always extends at least minFutureBars past the last visible candle', () => {
  const points = buildNewsWhitespacePoints({
    visibleNews: [],
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    lastVisiblePrice: 1.2345,
    intervalMs: MINUTE,
    minFutureBars: 60,
  });

  // anchor + 60 synthetic future bars at the timeframe interval
  assert.equal(points.length, 61);
  assert.equal(points[0].time, 10 * MINUTE);
  assert.equal(points[points.length - 1].time, 70 * MINUTE);
  assert.ok(points.every((p) => p.value === 1.2345));
});

test('buildNewsWhitespacePoints anchors upcoming events of any impact, not just High', () => {
  const points = buildNewsWhitespacePoints({
    visibleNews: [
      newsItem({ id: 'a', timestamp: 5 * MINUTE, impact: 'High Impact Expected' }), // passed cursor
      newsItem({ id: 'b', timestamp: 90 * MINUTE, impact: 'Medium Impact Expected' }),
      newsItem({ id: 'c', timestamp: 95 * MINUTE, impact: 'Low Impact Expected' }),
    ],
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    lastVisiblePrice: 1.2345,
    intervalMs: MINUTE,
  });

  const times = points.map((p) => p.time);
  assert.equal(times.length, 63); // anchor + 60 dense bars + 90-min + 95-min events
  assert.equal(times[0], 10 * MINUTE);
  assert.equal(times[times.length - 1], 95 * MINUTE);
  assert.ok(times.includes(90 * MINUTE));
  assert.ok(!times.includes(5 * MINUTE)); // passed event stays excluded
});

test('buildNewsWhitespacePoints emits a point per upcoming High event beyond the dense run plus the anchor', () => {
  const points = buildNewsWhitespacePoints({
    visibleNews: [
      newsItem({ id: 'a', timestamp: 30 * MINUTE, impact: 'High Impact Expected' }),
      newsItem({ id: 'b', timestamp: 45 * MINUTE, impact: 'High Impact Expected' }),
      newsItem({ id: 'c', timestamp: 90 * MINUTE, impact: 'High Impact Expected' }),
      newsItem({ id: 'd', timestamp: 35 * MINUTE, impact: 'Medium Impact Expected' }),
    ],
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    lastVisiblePrice: 100,
    intervalMs: MINUTE,
  });

  const times = points.map((p) => p.time);
  assert.equal(times.length, 62); // anchor + 60 dense bars + 90-min High event
  assert.equal(times[0], 10 * MINUTE);
  assert.equal(times[times.length - 1], 90 * MINUTE);
  assert.equal(times[40], 50 * MINUTE); // dense bars are present and ordered
  assert.ok(times.includes(90 * MINUTE));
});

test('buildNewsWhitespacePoints ignores High events that already passed the replay cursor', () => {
  const points = buildNewsWhitespacePoints({
    visibleNews: [newsItem({ id: 'a', timestamp: 5 * MINUTE, impact: 'High Impact Expected' })],
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    lastVisiblePrice: 50,
    intervalMs: MINUTE,
  });

  assert.equal(points.length, 61);
  assert.equal(points[0].time, 10 * MINUTE);
  assert.equal(points[points.length - 1].time, 70 * MINUTE);
});

test('buildNewsWhitespacePoints ignores High events at or before the last visible candle', () => {
  const points = buildNewsWhitespacePoints({
    visibleNews: [newsItem({ id: 'a', timestamp: 10 * MINUTE, impact: 'High Impact Expected' })],
    currentReplayTimestamp: 5 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    lastVisiblePrice: 50,
    intervalMs: MINUTE,
  });

  assert.equal(points.length, 61);
  assert.equal(points[0].time, 10 * MINUTE);
  assert.equal(points[points.length - 1].time, 70 * MINUTE);
});

test('buildNewsWhitespacePoints de-duplicates events sharing a timestamp', () => {
  const points = buildNewsWhitespacePoints({
    visibleNews: [
      newsItem({ id: 'a', timestamp: 80 * MINUTE, impact: 'High Impact Expected' }),
      newsItem({ id: 'b', timestamp: 80 * MINUTE, impact: 'High Impact Expected' }),
    ],
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    lastVisiblePrice: 1,
    intervalMs: MINUTE,
  });

  assert.equal(points.length, 62); // anchor + 60 dense bars + one 80-min point
  assert.equal(points[0].time, 10 * MINUTE);
  assert.equal(points[points.length - 1].time, 80 * MINUTE);
});

test('buildNewsWhitespacePoints caps excess High events while keeping earliest and furthest', () => {
  const many = Array.from({ length: 40 }, (_, i) => newsItem({ id: `h${i}`, timestamp: (80 + i) * MINUTE, impact: 'High Impact Expected' }));
  const points = buildNewsWhitespacePoints({
    visibleNews: many,
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    lastVisiblePrice: 1,
    intervalMs: MINUTE,
    maxPoints: 5,
  });

  // anchor + 60 dense bars + (maxPoints-1) earliest + furthest preserved
  assert.equal(points.length, 61 + 5);
  assert.equal(points[0].time, 10 * MINUTE);
  assert.equal(points[60].time, 70 * MINUTE);
  assert.equal(points[61].time, 80 * MINUTE);
  assert.equal(points[points.length - 1].time, 119 * MINUTE);
});

test('buildNewsWhitespacePoints falls back to news-only points for an invalid interval', () => {
  const points = buildNewsWhitespacePoints({
    visibleNews: [newsItem({ id: 'a', timestamp: 30 * MINUTE, impact: 'High Impact Expected' })],
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    lastVisiblePrice: 1,
    intervalMs: 0,
  });

  assert.deepEqual(points, [
    { time: 10 * MINUTE, value: 1 },
    { time: 30 * MINUTE, value: 1 },
  ]);
});

test('buildNewsWhitespacePoints returns empty array for invalid inputs', () => {
  assert.deepEqual(buildNewsWhitespacePoints({
    visibleNews: [],
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: Number.NaN,
    lastVisiblePrice: 1,
  }), []);
});

test('getNewsWhitespaceTimestamps covers events of any impact at exact second precision', () => {
  const eventTs = 10 * MINUTE + 37 * 1000; // 10:37, not a 1-min grid point
  const times = getNewsWhitespaceTimestamps({
    visibleNews: [newsItem({ id: 'a', timestamp: eventTs, impact: 'Medium Impact Expected' })],
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    intervalMs: MINUTE,
    minFutureBars: 0,
  });

  assert.deepEqual(times, [10 * MINUTE, eventTs]);
});

test('getNewsWhitespaceTimestamps caps excess events while keeping earliest and furthest', () => {
  const many = Array.from({ length: 40 }, (_, i) => newsItem({ id: `h${i}`, timestamp: (80 + i) * MINUTE, impact: 'High Impact Expected' }));
  const times = getNewsWhitespaceTimestamps({
    visibleNews: many,
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: 10 * MINUTE,
    intervalMs: MINUTE,
    minFutureBars: 0,
    maxPoints: 5,
  });

  // anchor + (maxPoints-1) earliest + furthest preserved
  assert.equal(times.length, 6);
  assert.equal(times[0], 10 * MINUTE);
  assert.equal(times[1], 80 * MINUTE);
  assert.equal(times[times.length - 1], 119 * MINUTE);
});

test('getNewsWhitespaceTimestamps returns empty for invalid timestamps', () => {
  assert.deepEqual(getNewsWhitespaceTimestamps({
    visibleNews: [],
    currentReplayTimestamp: 10 * MINUTE,
    lastVisibleTimestamp: Number.NaN,
  }), []);
});