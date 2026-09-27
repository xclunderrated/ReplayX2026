import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { enforceCacheLimits, writeCacheFile, createBoundedCache, createRateLimiter } from '../src/lib/cacheStore';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cachestore-'));
}

/** Writes a file of a chosen size with a chosen mtime, oldest last. */
function makeFile(dir: string, name: string, bytes: number, ageMs: number): void {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.alloc(bytes, 0x61));
  const when = Date.now() - ageMs;
  fs.utimesSync(p, when / 1000, when / 1000);
}

const base = { pipelineVersion: 3, s1MaxBytes: Infinity, payloadMaxBytes: Infinity, log: () => {} };

test('a pipeline version bump no longer orphans cache files', () => {
  // The regression this guards. Processed filenames embed the cache key, which
  // embeds the pipeline version, so bumping the version orphans a full set of
  // multi-megabyte payloads that nothing can read again. The old sweeper only
  // handled `*_s1.json` and nothing handled the m1/d1/h1/1W payloads at all, so
  // every bump leaked a set of them permanently.
  const dir = tmpDir();
  makeFile(dir, 'processed_v2_eurusd_2026-01-01_2026-02-01_bid_m15.json', 4096, 0);
  makeFile(dir, 'processed_v2_eurusd_2026-01-01_2026-02-01_bid_d1.json', 4096, 0);
  makeFile(dir, 'processed_v3_eurusd_2026-01-01_2026-02-01_bid_m15.json', 4096, 0);
  makeFile(dir, 'processed_v1_eurusd_2026-01-01_2026-02-01_bid_s1.json', 4096, 0);

  const result = enforceCacheLimits({ ...base, cacheDir: dir });

  assert.equal(result.staleVersionRemoved.length, 3, 'both non-s1 and s1 stale files must go');
  assert.deepEqual(
    result.staleVersionRemoved.filter((f) => !f.endsWith('_s1.json')).length,
    2,
    'the m1/d1 payloads the old sweeper ignored must be reclaimed too',
  );
  assert.deepEqual(fs.readdirSync(dir), ['processed_v3_eurusd_2026-01-01_2026-02-01_bid_m15.json']);
});

test('files that are not processed payloads are left alone', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'some-other-file.json'), '{}');
  fs.writeFileSync(path.join(dir, 'raw_eurusd_2026.bin'), 'x');
  makeFile(dir, 'processed_v2_stale.json', 128, 0);
  enforceCacheLimits({ ...base, cacheDir: dir });
  assert.deepEqual(
    fs.readdirSync(dir).sort(),
    ['raw_eurusd_2026.bin', 'some-other-file.json'],
  );
});

test('over-budget non-s1 payloads are evicted oldest first', () => {
  // There was no non-s1 size budget at all before, so these grew without bound.
  const dir = tmpDir();
  makeFile(dir, 'processed_v3_a_m15.json', 1000, 300_000); // oldest
  makeFile(dir, 'processed_v3_b_m15.json', 1000, 200_000);
  makeFile(dir, 'processed_v3_c_m15.json', 1000, 100_000); // newest

  const result = enforceCacheLimits({ ...base, cacheDir: dir, payloadMaxBytes: 2500 });

  assert.deepEqual(result.overBudgetRemoved, ['processed_v3_a_m15.json']);
  assert.deepEqual(fs.readdirSync(dir).sort(), [
    'processed_v3_b_m15.json',
    'processed_v3_c_m15.json',
  ]);
});

test('s1 and non-s1 budgets are independent', () => {
  // A tick cache must not evict every other payload, which is what a single
  // shared budget would do given tick payloads are far larger per file.
  const dir = tmpDir();
  makeFile(dir, 'processed_v3_big_s1.json', 4000, 0);
  makeFile(dir, 'processed_v3_small_m15.json', 1000, 0);

  // s1 budget is tight, payload budget is generous: only the s1 file goes.
  const result = enforceCacheLimits({
    cacheDir: dir, pipelineVersion: 3, s1MaxBytes: 2000, payloadMaxBytes: 100_000, log: () => {},
  });
  assert.deepEqual(result.overBudgetRemoved, ['processed_v3_big_s1.json']);
  assert.deepEqual(fs.readdirSync(dir), ['processed_v3_small_m15.json']);
});

test('a sweep under budget removes nothing', () => {
  const dir = tmpDir();
  makeFile(dir, 'processed_v3_a_m15.json', 100, 0);
  makeFile(dir, 'processed_v3_b_s1.json', 100, 0);
  const result = enforceCacheLimits({ ...base, cacheDir: dir });
  assert.deepEqual(result.overBudgetRemoved, []);
  assert.deepEqual(result.staleVersionRemoved, []);
  assert.equal(fs.readdirSync(dir).length, 2);
});

test('a missing cache directory is not an error', () => {
  const result = enforceCacheLimits({ ...base, cacheDir: path.join(os.tmpdir(), 'definitely-not-here-12345') });
  assert.deepEqual(result.staleVersionRemoved, []);
  assert.deepEqual(result.overBudgetRemoved, []);
});

test('writeCacheFile reports a serialization failure instead of throwing', () => {
  const dir = tmpDir();
  const cyclic: any = {};
  cyclic.self = cyclic;
  const errors: string[] = [];
  const len = writeCacheFile(path.join(dir, 'x.json'), cyclic, 'test payload', (m) => errors.push(m));
  assert.equal(len, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Could not serialize/);
});

test('writeCacheFile actually writes valid JSON', async () => {
  const dir = tmpDir();
  const target = path.join(dir, 'payload.json');
  writeCacheFile(target, { a: 1, b: [2, 3] }, 'test payload', (m) => assert.fail(m));
  // The write is deliberately not awaited by the caller; give it a tick.
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf-8')), { a: 1, b: [2, 3] });
});

test('the rate limiter refuses a flood but not normal interactive use', () => {
  // Unbounded download volume feeds back into the original bug: Dukascopy
  // rate-limits, a 429 on the hour feed's per-month file is swallowed, and the
  // session silently loses a month. So this bounds upstream pressure, not just
  // local resource use.
  let clock = 1_000_000;
  const limiter = createRateLimiter({ requestsPerMinute: 30, burst: 10, now: () => clock });

  // A burst of 10 is allowed - a person opening a session, switching timeframe
  // and scrolling the viewport is nowhere near this.
  for (let i = 0; i < 10; i++) {
    assert.equal(limiter.take('client-a'), true, `burst request ${i + 1} must be allowed`);
  }
  assert.equal(limiter.take('client-a'), false, 'the 11th in an instant must be refused');

  // One token every 2 seconds at 30/min.
  clock += 2000;
  assert.equal(limiter.take('client-a'), true, 'a token must be available after 2s');
  assert.equal(limiter.take('client-a'), false, 'and only one');

  // Other clients have independent budgets.
  assert.equal(limiter.take('client-b'), true);
  assert.equal(limiter.take('client-c'), true);

  // Sustained rate. Capacity equals the burst, so after an idle minute the bucket
  // refills to full (10), not to a minute's worth of credit (30). The sustained
  // rate is then measured by consuming steadily.
  clock += 60_000;
  let burstAfterIdle = 0;
  while (limiter.take('client-a')) burstAfterIdle++;
  assert.equal(burstAfterIdle, 10, 'an idle bucket refills to capacity, no more');

  let allowed = 0;
  for (let step = 0; step < 30; step++) {
    clock += 2000; // 30 steps of 2s = 60s, at which 30 tokens accrue
    if (limiter.take('client-a')) allowed++;
  }
  assert.ok(allowed >= 28 && allowed <= 30, `expected ~30/min sustained, got ${allowed}`);
});

test('an idle rate-limit bucket is capped at the burst size', () => {
  // Otherwise a client could bank unlimited credit by idling and then fire a
  // huge burst, which is exactly what the limiter is meant to prevent.
  let clock = 0;
  const limiter = createRateLimiter({ requestsPerMinute: 30, burst: 5, now: () => clock });
  assert.equal(limiter.take('a'), true);
  clock += 60 * 60_000; // an hour idle
  let allowed = 0;
  for (let i = 0; i < 50; i++) if (limiter.take('a')) allowed++;
  assert.equal(allowed, 5, 'credit must not accumulate beyond the burst');
});

test('the rate limiter forgets idle clients so its own map stays bounded', () => {
  // Each simulated client is idle for well past the TTL by the time the loop ends,
  // so the walk must actually reclaim them - otherwise the limiter's own map is
  // the unbounded growth it was added to prevent.
  let clock = 0;
  const limiter = createRateLimiter({ requestsPerMinute: 30, burst: 10, idleTtlMs: 1_000, now: () => clock });
  for (let i = 0; i < 500; i++) {
    limiter.take(`client-${i}`);
    clock += 5_000; // each client goes idle long before the next request
  }
  assert.ok(limiter.size <= 2, `expected idle clients pruned, map holds ${limiter.size}`);
});

test('retryAfterSeconds is sane', () => {
  let clock = 0;
  const limiter = createRateLimiter({ requestsPerMinute: 30, burst: 1, now: () => clock });
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), false);
  const retry = limiter.retryAfterSeconds('a');
  assert.ok(retry >= 1 && retry <= 3, `expected 1-3s at 30/min, got ${retry}`);
  assert.equal(limiter.retryAfterSeconds('unknown-client'), 1);
});

test('the in-memory cache is bounded and evicts least-recently-used', () => {
  // It was an unbounded Map, so browsing instruments, ranges and timeframes grew
  // it for the lifetime of the process - and the same candles are also held
  // client-side, so a session's data existed twice in two representations.
  const cache = createBoundedCache<number>(3);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.size, 3);

  // Touch 'a' so 'b' becomes the least recently used.
  assert.equal(cache.get('a'), 1);
  cache.set('d', 4);

  assert.equal(cache.size, 3, 'must never exceed the bound');
  assert.equal(cache.get('b'), undefined, 'least recently used is evicted');
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
  assert.equal(cache.get('d'), 4);

  // Re-inserting an existing key refreshes rather than duplicating.
  cache.set('a', 10);
  assert.equal(cache.size, 3);
  assert.equal(cache.get('a'), 10);
});

test('the bounded cache stays correct when pushed well past capacity', () => {
  const cache = createBoundedCache<string>(5);
  for (let i = 0; i < 100; i++) cache.set(`k${i}`, `v${i}`);
  assert.equal(cache.size, 5);
  assert.equal(cache.get('k99'), 'v99', 'the newest entry survives');
  assert.equal(cache.get('k0'), undefined, 'the oldest entries are gone');
});
