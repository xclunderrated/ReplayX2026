import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { enforceCacheLimits, writeCacheFile, createBoundedCache } from '../src/lib/cacheStore';

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
