import test from 'node:test';
import assert from 'node:assert/strict';
import { Instrument } from 'dukascopy-node';
import { SUPPORTED_INSTRUMENTS, UNAVAILABLE_UPSTREAM, unavailableReason } from '../src/lib/instruments';
import { DUKASCOPY_ALIAS_MAP } from '../src/lib/dukascopyRequest';
import { maxLegitimateGapSeconds } from '../src/lib/dukascopyRequest';

const DAY_SEC = 86_400;
const isValidUpstream = (symbol: string) =>
  new Set(Object.values(Instrument as Record<string, string>).map((v) => String(v).toLowerCase())).has(
    symbol.toLowerCase(),
  );

test('every catalogue instrument is either served by Dukascopy or documented as unavailable', () => {
  // This is the regression guard for a real bug: seven catalogue entries
  // (xrpusd, dotusd, linkusd, dogeusd, avaxusd, metaususd, solusd) were not
  // served upstream at all, yet the catalogue was the only validation gate, so
  // they passed and then threw inside dukascopy-node as a bare 500. Diffing
  // against dukascopy-node's own enum is what found them.
  const undocumented = SUPPORTED_INSTRUMENTS.filter(
    (i) => !isValidUpstream(i.id) && !(i.id in UNAVAILABLE_UPSTREAM),
  );
  assert.deepEqual(
    undocumented.map((i) => i.id),
    [],
    'catalogue entries not served by Dukascopy must be listed in UNAVAILABLE_UPSTREAM',
  );
});

test('UNAVAILABLE_UPSTREAM entries are genuinely unavailable, not stale', () => {
  // Guards the other direction: if Dukascopy starts carrying one of these, the
  // entry should be removed so the server stops rejecting it.
  const nowServed = Object.keys(UNAVAILABLE_UPSTREAM).filter(isValidUpstream);
  assert.deepEqual(nowServed, [], 'these are served by Dukascopy now - remove them from the blocklist');
});

test('every alias target resolves to a real Dukascopy symbol', () => {
  const broken = Object.entries(DUKASCOPY_ALIAS_MAP)
    .filter(([, target]) => !isValidUpstream(target))
    .map(([alias, target]) => `${alias} -> ${target}`);
  assert.deepEqual(broken, [], 'DUKASCOPY_ALIAS_MAP points at symbols Dukascopy does not serve');
});

test('unavailableReason explains why, and returns null when serviceable', () => {
  assert.equal(unavailableReason('eurusd', isValidUpstream), null);
  assert.equal(unavailableReason('solusd', isValidUpstream), UNAVAILABLE_UPSTREAM['solusd']);
  assert.match(unavailableReason('metaususd', isValidUpstream) as string, /Meta Platforms/);
  // Unknown symbol still gets a usable message rather than undefined.
  assert.match(unavailableReason('zzzznope', isValidUpstream) as string, /zzzznope/);
});

test('the seven known-broken instruments are all accounted for', () => {
  // Pin the count so a newly-added dud is noticed.
  assert.equal(Object.keys(UNAVAILABLE_UPSTREAM).length, 7);
  for (const id of ['xrpusd', 'dotusd', 'linkusd', 'dogeusd', 'avaxusd', 'metaususd', 'solusd']) {
    assert.ok(id in UNAVAILABLE_UPSTREAM, `${id} missing from UNAVAILABLE_UPSTREAM`);
  }
});

test('per-class gap tolerances come from measurement, with headroom', () => {
  // Measured maxima on the m1 feed (which is NOT flat-filled on weekends, unlike
  // d1): crypto 1.00d, FX 2.00d, commodities 2.13d, US indices 3.16d, stocks
  // 4.17d, ASX 5.00d, Hang Seng 5.83d. Each threshold must sit above its
  // measured max or a legitimate closure becomes a false "incomplete" warning
  // that is never cached.
  const measuredMaxDays: Record<string, number> = {
    crypto: 1.0,
    forex_major: 2.0,
    forex_cross: 2.0,
    commodities: 2.13,
    stocks: 4.17,
    indices: 5.83,
  };
  for (const [cls, measured] of Object.entries(measuredMaxDays)) {
    const allowed = maxLegitimateGapSeconds('m15', cls as any) / DAY_SEC;
    assert.ok(
      allowed > measured,
      `${cls}: threshold ${allowed}d must exceed measured max ${measured}d`,
    );
    assert.ok(allowed <= 10, `${cls}: threshold ${allowed}d is looser than the old global 7d`);
  }
  // A 24/7 market must be the strictest - nothing about crypto has an excuse for
  // a multi-day hole.
  assert.ok(
    maxLegitimateGapSeconds('m15', 'crypto') < maxLegitimateGapSeconds('m15', 'indices'),
    'crypto should be far stricter than indices',
  );
  // Unmeasured classes must default to the loosest intraday value so they cannot
  // produce a false positive.
  assert.equal(
    maxLegitimateGapSeconds('m15', 'forex_exotic'),
    maxLegitimateGapSeconds('m15', 'indices'),
  );
  assert.equal(maxLegitimateGapSeconds('m15', undefined), maxLegitimateGapSeconds('m15', 'indices'));

  // Coarser timeframes stay loose regardless of class.
  assert.equal(maxLegitimateGapSeconds('d1', 'crypto'), 21 * DAY_SEC);
  assert.equal(maxLegitimateGapSeconds('1W', 'indices'), 90 * DAY_SEC);
  assert.equal(maxLegitimateGapSeconds('mn1', 'crypto'), 400 * DAY_SEC);
});
