import test from 'node:test';
import assert from 'node:assert/strict';
import { dayBoundaryMs, formatUTCTimestamp, getLocalDateKey } from '../src/lib/timezone';

const iso = (ms: number) => new Date(ms).toISOString();

test('dayBoundaryMs resolves a calendar day in the given timezone, not UTC', () => {
  // The bug this replaces: every date boundary in the app was UTC midnight, so a
  // New York user asking for "the 27th" got a window starting 20:00 on the 26th
  // local and silently saw four hours of the previous day.
  assert.equal(dayBoundaryMs('2026-08-27', 'UTC'), Date.UTC(2026, 7, 27));
  // August: New York is UTC-4.
  assert.equal(iso(dayBoundaryMs('2026-08-27', 'America/New_York')), '2026-08-27T04:00:00.000Z');
  // Tokyo is UTC+9, so its day starts on the *previous* UTC day.
  assert.equal(iso(dayBoundaryMs('2026-08-27', 'Asia/Tokyo')), '2026-08-26T15:00:00.000Z');
  // A zone ahead of UTC by a non-integral-ish offset.
  assert.equal(iso(dayBoundaryMs('2026-08-27', 'Asia/Kolkata')), '2026-08-26T18:30:00.000Z');
  // Southern hemisphere, and a zone with a large offset.
  assert.equal(iso(dayBoundaryMs('2026-08-27', 'Australia/Sydney')), '2026-08-26T14:00:00.000Z');
});

test('dayBoundaryMs is correct across daylight-saving transitions', () => {
  // A single offset lookup is wrong here: the offset at the naive UTC guess is
  // not the offset at the true local midnight. This is why the helper makes two
  // correction passes.
  // US spring forward 2026: 8 March, 02:00 local jumps to 03:00.
  assert.equal(iso(dayBoundaryMs('2026-03-08', 'America/New_York')), '2026-03-08T05:00:00.000Z');
  // US fall back 2026: 1 November, 02:00 local repeats.
  assert.equal(iso(dayBoundaryMs('2026-11-01', 'America/New_York')), '2026-11-01T04:00:00.000Z');
  // Southern-hemisphere DST runs the other way; January is still DST in Sydney.
  assert.equal(iso(dayBoundaryMs('2026-01-15', 'Australia/Sydney')), '2026-01-14T13:00:00.000Z');
  // EU spring forward 2026: 29 March.
  assert.equal(iso(dayBoundaryMs('2026-03-29', 'Europe/London')), '2026-03-29T00:00:00.000Z');
  // Northern-hemisphere summer: London is UTC+1, so its day starts earlier in UTC.
  assert.equal(iso(dayBoundaryMs('2026-07-01', 'Europe/London')), '2026-06-30T23:00:00.000Z');
});

test('dayBoundaryMs treats the end of a day as the next local midnight', () => {
  // Adding a fixed 24h to the start is only correct on a day with no DST change.
  // The end is the *next* local midnight, which the caller reaches by asking for
  // the next day - so this documents the contract rather than assuming 24h.
  const start = dayBoundaryMs('2026-08-27', 'America/New_York');
  const nextDay = dayBoundaryMs('2026-08-28', 'America/New_York');
  assert.equal(nextDay - start, 86_400_000, 'a normal day is 24h');
  assert.equal(iso(start), '2026-08-27T04:00:00.000Z');

  // On a spring-forward day the local day is only 23 hours long.
  const springStart = dayBoundaryMs('2026-03-08', 'America/New_York');
  const springNext = dayBoundaryMs('2026-03-09', 'America/New_York');
  assert.equal(springNext - springStart, 23 * 3_600_000, 'a spring-forward day is 23h');

  // The explicit endOfDay flag is a plain 24h step, so callers that need a true
  // local-day end must use the next day's start.
  assert.equal(dayBoundaryMs('2026-08-27', 'America/New_York', true) - start, 86_400_000);
});

test('dayBoundaryMs rejects a malformed date loudly', () => {
  // A bad date must not silently become "now", which is what the session
  // loader's tolerant variant used to do with corrupt persisted state.
  assert.throws(() => dayBoundaryMs('not-a-date', 'UTC'), /Invalid date/);
  assert.throws(() => dayBoundaryMs('2026-8-27', 'UTC'), /Invalid date/);
  assert.throws(() => dayBoundaryMs('27/08/2026', 'UTC'), /Invalid date/);
  assert.throws(() => dayBoundaryMs('', 'UTC'), /Invalid date/);
});

test('dayBoundaryMs round-trips with getLocalDateKey', () => {
  // The two are inverses: taking the local date key of an instant, then resolving
  // that key back, must land on the start of the same local day. If this fails the
  // app and the chart disagree about which day a candle belongs to.
  const zones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Kolkata'];
  const instants = [
    Date.UTC(2026, 0, 1, 3), Date.UTC(2026, 2, 8, 7), Date.UTC(2026, 6, 4, 23, 59),
    Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 11, 31, 23, 59, 59),
  ];
  for (const zone of zones) {
    for (const instant of instants) {
      const key = getLocalDateKey(instant, zone);
      const start = dayBoundaryMs(key, zone);
      const end = dayBoundaryMs(key, zone, true);
      assert.ok(start <= instant, `${zone} ${key}: instant must not precede its local day start`);
      assert.ok(instant < end, `${zone} ${key}: instant must fall before its local day end`);
    }
  }
});

test('formatUTCTimestamp takes seconds and does not swallow the epoch', () => {
  // There were three copies of this function; two disagreed about the unit
  // (seconds vs milliseconds), which is the same class of mistake as the
  // getBucketStart bug. It also used a truthiness check, so timestamp 0 rendered
  // as an empty string instead of 1970.
  assert.equal(formatUTCTimestamp(1_700_000_000), '2023-11-14 22:13:20 UTC');
  assert.equal(formatUTCTimestamp(0), '1970-01-01 00:00:00 UTC', 'epoch is a valid instant');
  assert.equal(formatUTCTimestamp(NaN), '');
  assert.equal(formatUTCTimestamp(Infinity), '');

  // A seconds value must not be read as milliseconds. 1_700_000_000 seconds is
  // 2023; read as ms it would be 1970.
  assert.ok(formatUTCTimestamp(1_700_000_000).startsWith('2023'));
});
