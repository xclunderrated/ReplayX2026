export type GoToSessionId = 'asia-open' | 'london-open' | 'new-york-open' | 'equities-open' | 'pm-session';

export interface SessionInfo {
  id: GoToSessionId;
  label: string;
  timeLabel: string;
  hour: number;
  minute: number;
}

export const SESSIONS: SessionInfo[] = [
  { id: 'asia-open', label: 'Asia Open', timeLabel: '19:00 ET', hour: 19, minute: 0 },
  { id: 'london-open', label: 'London Open', timeLabel: '02:00 ET', hour: 2, minute: 0 },
  { id: 'new-york-open', label: 'New York Open', timeLabel: '08:30 ET', hour: 8, minute: 30 },
  { id: 'equities-open', label: 'Equities Open', timeLabel: '09:30 ET', hour: 9, minute: 30 },
  { id: 'pm-session', label: 'PM Session', timeLabel: '14:00 ET', hour: 14, minute: 0 },
];

const SESSION_TIMES: Record<GoToSessionId, { hour: number; minute: number }> = Object.fromEntries(
  SESSIONS.map((s) => [s.id, { hour: s.hour, minute: s.minute }])
) as Record<GoToSessionId, { hour: number; minute: number }>;

function getTimeZoneOffsetMs(timeZone: string, timestampMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(timestampMs));

  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }

  const asUtc = Date.UTC(
    values.year ?? 1970,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    values.hour ?? 0,
    values.minute ?? 0,
    values.second ?? 0,
  );

  return asUtc - timestampMs;
}

export function getSessionTimestamp(
  currentTimestampMs: number,
  session: GoToSessionId,
  chartTimeZone: string,
): number {
  const nyParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(currentTimestampMs));

  const year = Number(nyParts.find((part) => part.type === 'year')?.value ?? '1970');
  const month = Number(nyParts.find((part) => part.type === 'month')?.value ?? '01');
  const day = Number(nyParts.find((part) => part.type === 'day')?.value ?? '01');
  const { hour, minute } = SESSION_TIMES[session];

  // Compute UTC ms for `year-month-day hour:minute` in America/New_York.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = getTimeZoneOffsetMs('America/New_York', utcGuess);
  return utcGuess - offsetMs;
}

/**
 * Returns the timestamp of the NEXT forward occurrence of the given session open
 * relative to `currentTimestampMs`. If today's session hasn't started yet (its
 * open is later than the cursor), returns today's session open. If it has
 * already started (or is in the past), rolls to the next trading day's session
 * open — skipping weekends via `getNextTradingDayMs` — so the jump always moves
 * the replay cursor forward, matching FXreplay's "Go to session" behavior.
 *
 * All wall-clock math is in America/New_York.  The returned value is a UTC
 * millisecond timestamp (consistent with candle timestamps in the store),
 * computed the same way as `getSessionTimestamp`.
 */
export function getSessionJumpTimestamp(
  currentTimestampMs: number,
  session: GoToSessionId,
  chartTimeZone: string,
): number {
  const todaySessionMs = getSessionTimestamp(currentTimestampMs, session, chartTimeZone);
  if (todaySessionMs > currentTimestampMs) {
    return todaySessionMs;
  }
  const nextDayMs = getNextTradingDayMs(currentTimestampMs, 1);
  return getSessionTimestamp(nextDayMs, session, chartTimeZone);
}

/**
 * Returns the start-of-day timestamp (00:00 ET) for the next or previous trading day,
 * skipping Saturday and Sunday.
 */
export function getNextTradingDayMs(currentTimestampMs: number, direction: 1 | -1 = 1): number {
  const DAY_MS = 86_400_000;
  let candidate = currentTimestampMs + direction * DAY_MS;

  // Skip weekends (max 3 iterations to skip Sat+Sun)
  for (let i = 0; i < 3; i++) {
    const nyDate = new Date(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(candidate))
    );

    const dayOfWeek = nyDate.getUTCDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      candidate += direction * DAY_MS;
      continue;
    }
    break;
  }

  return candidate;
}

/**
 * Converts a user-provided date and time into a millisecond UTC timestamp,
 * interpreting the date/time as New York time.
 */
export function getDateTimestampMs(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = getTimeZoneOffsetMs('America/New_York', utcGuess);
  return utcGuess - offsetMs;
}
