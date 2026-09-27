/**
 * On-disk processed-payload cache: writing and eviction.
 *
 * Extracted from `server.ts` so it can be tested. That module calls
 * `startServer()` at import time and binds a port, so nothing in it was
 * reachable from `node --test` — which is how the eviction gap below survived:
 * the sweeper only ever handled `*_s1.json`, and nothing at all handled the
 * `m1`/`d1`/`h1`/`1W` payloads.
 */

import fs from 'fs';
import path from 'path';

/**
 * Writes a cache file off the request path.
 *
 * `JSON.stringify` of a multi-megabyte payload plus a synchronous `writeFileSync`
 * is charged to the event loop, stalling every other in-flight request while the
 * user waits for their own response. The stringify has to happen on this thread
 * either way, but the write need not, and the caller no longer waits for either.
 * Fire-and-forget because a cache miss costs a re-download, never correctness.
 *
 * Returns the serialized length so callers can log or test; the write itself is
 * still in flight when this returns.
 */
export function writeCacheFile(
  targetPath: string,
  payload: unknown,
  label: string,
  onError?: (message: string) => void,
): number {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch (err: any) {
    onError?.(`Could not serialize ${label}: ${err?.message ?? err}`);
    return 0;
  }
  fs.promises.writeFile(targetPath, serialized).catch((err: any) => {
    onError?.(`Could not write ${label}: ${err?.message ?? err}`);
  });
  return serialized.length;
}

export interface CacheSweepOptions {
  cacheDir: string;
  pipelineVersion: number;
  /** Budget for `*_s1.json` payloads, which are far larger per file. */
  s1MaxBytes: number;
  /** Budget for every other processed payload. */
  payloadMaxBytes: number;
  log?: (message: string) => void;
}

export interface CacheSweepResult {
  /** Files dropped because no pipeline version can read them again. */
  staleVersionRemoved: string[];
  /** Files dropped to get back under a size budget. */
  overBudgetRemoved: string[];
  /** Bytes freed. */
  reclaimedBytes: number;
}

interface ListedFile {
  name: string;
  path: string;
  mtimeMs: number;
  size: number;
  isS1: boolean;
}

/**
 * Evicts processed payloads that can no longer be read, or that have fallen out
 * of the on-disk budget.
 *
 * Two distinct jobs:
 *
 * 1. Stale pipeline versions. Processed filenames embed the cache key, which
 *    embeds the pipeline version, so every version bump orphans a full set of
 *    multi-megabyte payloads that nothing can ever read again. These are deleted
 *    outright rather than left to age out of a size budget they may never exceed.
 *
 * 2. Size. Oldest-first eviction within a per-class budget, kept separate for s1
 *    because tick data is an order of magnitude larger per file and would
 *    otherwise evict every other payload.
 *
 * Only files matching `processed_v<N>_` are considered; anything else in the
 * directory is left alone.
 */
export function enforceCacheLimits(options: CacheSweepOptions): CacheSweepResult {
  const { cacheDir, pipelineVersion, s1MaxBytes, payloadMaxBytes } = options;
  const log = options.log ?? (() => {});
  const result: CacheSweepResult = { staleVersionRemoved: [], overBudgetRemoved: [], reclaimedBytes: 0 };

  let all: ListedFile[];
  try {
    all = fs
      .readdirSync(cacheDir)
      .filter((f) => f.startsWith('processed_v'))
      .map((f): ListedFile | null => {
        const p = path.join(cacheDir, f);
        try {
          const stat = fs.statSync(p);
          return { name: f, path: p, mtimeMs: stat.mtimeMs, size: stat.size, isS1: f.endsWith('_s1.json') };
        } catch {
          return null;
        }
      })
      .filter((f): f is ListedFile => f !== null);
  } catch {
    return result;
  }

  const remove = (file: ListedFile, stale: boolean): void => {
    try {
      fs.unlinkSync(file.path);
      result.reclaimedBytes += file.size;
      if (stale) {
        result.staleVersionRemoved.push(file.name);
        log(`Removed cache file ${file.name} - written by an older pipeline version`);
      } else {
        result.overBudgetRemoved.push(file.name);
        log(`Removed oldest ${file.isS1 ? 's1 ' : ''}cache file ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
      }
    } catch {
      // ignore files that disappear between listing and deletion
    }
  };

  // 1. Stale pipeline versions can never be read again - drop them regardless of
  //    the size budget.
  const currentPrefix = `processed_v${pipelineVersion}_`;
  const keep: ListedFile[] = [];
  for (const file of all) {
    if (file.name.startsWith(currentPrefix)) keep.push(file);
    else remove(file, true);
  }

  // 2. Size budget, oldest first, separately per class.
  for (const [isS1, budget] of [
    [true, s1MaxBytes],
    [false, payloadMaxBytes],
  ] as Array<[boolean, number]>) {
    const files = keep.filter((f) => f.isS1 === isS1).sort((a, b) => a.mtimeMs - b.mtimeMs);
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes <= budget) continue;
    let reclaimed = 0;
    for (const file of files) {
      if (totalBytes - reclaimed <= budget) break;
      const before = result.reclaimedBytes;
      remove(file, false);
      reclaimed += result.reclaimedBytes - before;
    }
  }

  return result;
}

/**
 * A least-recently-used cache over a `Map`, bounded by entry count.
 *
 * Wrapped rather than open-coded at each call site so the bound cannot be
 * forgotten on a new one. `Map` preserves insertion order, so re-inserting a
 * key moves it to the end and `keys().next()` is always the eviction candidate.
 * A read promotes the key, otherwise this would be FIFO rather than LRU and a
 * hot entry would be evicted ahead of a cold one.
 */
export function createBoundedCache<T>(maxEntries: number): {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): void;
  readonly size: number;
} {
  const map = new Map<string, T>();
  const bound = Math.max(1, Math.floor(maxEntries));
  const evictIfNeeded = (): void => {
    while (map.size > bound) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  };
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key) as T;
      // Promote to most-recently-used.
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, value);
      evictIfNeeded();
    },
    has(key) {
      return map.has(key);
    },
    delete(key) {
      map.delete(key);
    },
    get size() {
      return map.size;
    },
  };
}
