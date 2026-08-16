/**
 * AuraEngine Service Worker
 *
 * Caches `/api/historical-data` POST responses in the Cache API so that
 * previously-fetched ranges are available instantly — even on slow or offline
 * connections. Historical data is immutable, so cached responses are valid
 * forever (the only exception is the current day, which may still be
 * receiving ticks — but Dukascopy only publishes real-time data with a delay,
 * so even that edge case is safe for our replay use case).
 *
 * Also handles navigation requests (network-first) and static assets
 * (cache-first with network fallback).
 */

const CACHE_VERSION = 'aura-v1';
const HISTORICAL_CACHE = `${CACHE_VERSION}-historical`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year — data is historical & immutable

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([
      '/',
      '/index.html',
    ]).catch(() => { /* ignore individual failures */ })),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clean up old cache versions
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== HISTORICAL_CACHE && key !== STATIC_CACHE)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

/**
 * Build a cache key from a POST /api/historical-data request.
 * We use the body payload (instrument|timeframe|from|to) as the key suffix
 * so that identical requests hit the cache regardless of header order.
 */
async function historicalCacheKey(request) {
  const cloned = request.clone();
  let body;
  try {
    body = await cloned.json();
  } catch {
    return null;
  }
  const instrument = String(body.instrument ?? '').toLowerCase();
  const timeframe = String(body.timeframe ?? '').toLowerCase();
  const from = String(body.from ?? '');
  const to = String(body.to ?? '');
  return `${HISTORICAL_CACHE}:${instrument}|${timeframe}|${from}|${to}`;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle same-origin requests
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // POST /api/historical-data — cache-first with network fallback
  if (request.method === 'POST' && url.pathname === '/api/historical-data') {
    event.respondWith((async () => {
      const cacheKey = await historicalCacheKey(request);
      if (cacheKey) {
        const cached = await caches.open(HISTORICAL_CACHE);
        const hit = await cached.match(cacheKey);
        if (hit) {
          // Revive in background (no need to revalidate — historical is immutable)
          return hit;
        }
      }

      // Network fetch
      try {
        const response = await fetch(request);
        if (response.ok && cacheKey) {
          const cache = await caches.open(HISTORICAL_CACHE);
          // Clone before consuming (response can only be used once)
          cache.put(cacheKey, response.clone()).catch(() => { /* fire-and-forget */ });
        }
        return response;
      } catch (error) {
        // Network failed — try a fuzzy cache match (relax the range)
        if (cacheKey) {
          const cache = await caches.open(HISTORICAL_CACHE);
          const keys = await cache.keys();
          // Try to find a cached response for the same instrument+timeframe
          // that covers an overlapping range. This is best-effort — if the
          // user is offline and never fetched this range, we have nothing.
          const prefix = cacheKey.split('|').slice(0, 2).join('|'); // instrument|timeframe
          for (const key of keys) {
            if (key.url.startsWith(prefix)) {
              const response = await cache.match(key);
              if (response) return response;
            }
          }
        }
        throw error;
      }
    })());
    return;
  }

  // GET /api/instruments — stale-while-revalidate (catalog rarely changes)
  if (request.method === 'GET' && url.pathname === '/api/instruments') {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      const networkPromise = fetch(request).then((response) => {
        if (response.ok) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      return cached || networkPromise;
    })());
    return;
  }

  // GET /api/health — always network (cheap, short-lived)
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return; // fall through to default browser fetch
  }

  // GET /api/news — network-first, ignore cache (volatile)
  if (request.method === 'GET' && url.pathname.startsWith('/api/news')) {
    return;
  }

  // Navigation requests — network-first (HMR-friendly), fall back to cache
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match('/index.html') || await cache.match('/');
        if (cached) return cached;
        throw new Error('Offline and no cached page available');
      }
    })());
    return;
  }

  // Static assets (JS, CSS, images) — cache-first
  if (request.method === 'GET' && /\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }
});
