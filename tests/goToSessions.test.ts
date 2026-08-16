import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSIONS,
  getSessionTimestamp,
  getSessionJumpTimestamp,
  getNextTradingDayMs,
} from '../src/lib/goToSessions';

const NY = 'America/New_York';

/*
 * Weekend helper (1=Mon … 7=Sun in America/New_York).
 */
function weekdayEt(ms: number): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(new Date(ms));
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[short] ?? 0;
}

/*
 * Verify session-open wall-clock times.  Apr 2024 is EDT (UTC-4).
 *
 *   Mon Apr 1 2024 06:00 EDT = Apr 1 2024 10:00 UTC   ▶ 1711965600000
 *   Mon Apr 1 2024 08:30 EDT = Apr 1 2024 12:30 UTC   ▶ 1711974600000
 *   Mon Apr 1 2024 10:00 EDT = Apr 1 2024 14:00 UTC   ▶ 1711980000000
 *   Mon Apr 1 2024 19:00 EDT = Apr 1 2024 23:00 UTC   ▶ 1712012400000
 *   Mon Apr 1 2024 22:00 EDT = Apr 2 2024 02:00 UTC   ▶ 1712023200000
 *
 *   Wed Apr 3 2024 00:00 EDT = Apr 3 2024 04:00 UTC   ▶ 1712116800000
 *   Fri Apr 5 2024 22:00 EDT = Apr 6 2024 02:00 UTC   ▶ 1712368800000
 *
 *   Mon = Apr 1  μ  (0-index month=3)   μ  UTC h= 10  μ  UTC h=  -> Date.UTC(2024, 3, 1, 10)
 */

const MON_06EDT = Date.UTC(2024, 3, 1, 10); // Mon Apr 1 06:00 EDT
const MON_0830EDT = Date.UTC(2024, 3, 1, 12, 30); // Mon Apr 1 08:30 EDT (exactly NY open)
const MON_10EDT = Date.UTC(2024, 3, 1, 14); // Mon Apr 1 10:00 EDT (past NY + Equities, before PM)
const MON_19EDT = Date.UTC(2024, 3, 1, 23); // Mon Apr 1 19:00 EDT (Asia Open same day)
const WED_00EDT = Date.UTC(2024, 3, 3, 4); // Wed Apr 3 00:00 EDT
const FRI_22EDT = Date.UTC(2024, 3, 6, 2); // Fri Apr 5 22:00 EDT

test('getSessionTimestamp renders each session-open at its configured ET hour:minute', () => {
  // Feed a Monday cursor; all session-opens land on Monday in ET.
  for (const s of SESSIONS) {
    const ts = getSessionTimestamp(MON_06EDT, s.id, NY);
    const wall = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(ts));
    const [hh, mm] = wall.replace('24', '00').split(':').map(Number);
    assert.equal(hh, s.hour, `${s.id} wall-clock hour`);
    assert.equal(mm, s.minute, `${s.id} wall-clock minute`);
  }
});

test('getSessionJumpTimestamp returns today session-open when cursor is before it', () => {
  // 06:00 EDT ≪ NY open (08:30) ≪ Equities (09:30) …, so `new-york-open` must land on
  // today's 08:30 EDT (no roll to next day).
  const expected = getSessionTimestamp(MON_06EDT, 'new-york-open', NY);
  assert.equal(expected, MON_0830EDT, 'NY open at 08:30 EDT on Monday');
  const jump = getSessionJumpTimestamp(MON_06EDT, 'new-york-open', NY);
  assert.equal(jump, expected);
  assert.ok(jump > MON_06EDT, 'jump must move forward from 06:00 cursor');
});

test('getSessionJumpTimestamp rolls to next trading day when today session already passed', () => {
  // 10:00 EDT ≫ NY open (08:30) ≫ Equities open (09:30).  For 'new-york-open' we
  // expect *Tuesday's* 08:30 EDT → Apr 2 2024 08:30 EDT = Apr 2 12:30 UTC.
  const tueOpen = Date.UTC(2024, 3, 2, 12, 30);
  const jump = getSessionJumpTimestamp(MON_10EDT, 'new-york-open', NY);
  assert.equal(jump, tueOpen, 'must roll to Tue 08:30 EDT');
  assert.ok(jump > MON_10EDT, 'jump must move forward past today');
});

test('getSessionJumpTimestamp skips weekend when cursor is Friday evening', () => {
  // Fri 22:00 EDT — every session open for Friday has already passed.  All
  // session jumps should land on Monday (next trading day), NOT on Saturday/Sunday.
  const mondayMs = getNextTradingDayMs(FRI_22EDT, 1);
  assert.equal(weekdayEt(mondayMs), 1, 'next trading day from Friday must be Mon');

  for (const s of SESSIONS) {
    const jump = getSessionJumpTimestamp(FRI_22EDT, s.id, NY);
    const dow = weekdayEt(jump);
    assert.ok(dow >= 1 && dow <= 5, `${s.id} jump landed on weekend (weekday ${dow})`);
    assert.ok(jump > FRI_22EDT, `${s.id} jump must move forward from Fri evening`);
  }
});

test('getSessionJumpTimestamp always moves the cursor strictly forward across a full session list', () => {
  // Wednesday 00:00 EDT — every session on Wed is still in the future, so all
  // jumps should be ≫ cursor and land on Wednesday.
  for (const s of SESSIONS) {
    const jump = getSessionJumpTimestamp(WED_00EDT, s.id, NY);
    assert.ok(jump > WED_00EDT, `${s.id} jump must be strictly after Wed 00:00`);
  }
});