import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNewsCsvPath } from '../src/lib/newsDataset';

test('resolveNewsCsvPath prefers project-root forex_factory_cache.csv when present', () => {
  const result = resolveNewsCsvPath('/project', '/project/.cache/forex_factory_cache.csv', (candidate) => (
    candidate === '/project/forex_factory_cache.csv'
  ));

  assert.equal(result, '/project/forex_factory_cache.csv');
});

test('resolveNewsCsvPath falls back to cache path when root file is absent', () => {
  const result = resolveNewsCsvPath('/project', '/project/.cache/forex_factory_cache.csv', (candidate) => (
    candidate === '/project/.cache/forex_factory_cache.csv'
  ));

  assert.equal(result, '/project/.cache/forex_factory_cache.csv');
});

test('resolveNewsCsvPath returns null when no candidate exists', () => {
  const result = resolveNewsCsvPath('/project', '/project/.cache/forex_factory_cache.csv', () => false);
  assert.equal(result, null);
});
