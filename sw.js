/**
 * sw.js – Päijännetunneli PWA Service Worker
 *
 * Caching strategy:
 *   App shell (HTML/JS/CSS/icons/data)  → Cache-First
 *   Map tiles                           → Network-First, cache fallback, LRU eviction
 *   Routing / geocoding APIs            → Network-only (skip cache)
 */

'use strict';

const VERSION    = 'v2.1';
const SHELL_CACHE = `tunneli-shell-${VERSION}`;
const TILE_CACHE  = `tunneli-tiles-${VERSION}`;
const MAX_TILES   = 2000;   // ~80–120 MB depending on tile size

// ── Pre-cache: everything needed for offline cold start ───────
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './js/auth.js',
  './js/map.js',
  './js/notes.js',
  './js/tunnelDataLoader.js',
  './js/ui.js',
  './data/tunneli.enc.json',
  // Icons (critical sizes)
  './icons/icon-16.png',
  './icons/icon-32.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  // CDN libs — cached at install so they work offline
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: prune old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== TILE_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch dispatcher ──────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;           // skip POST etc.

  const url = new URL(req.url);

  // Never cache routing/geocoding APIs
  if (_isApiCall(url)) return;

  // Map tiles → network-first
  if (_isTile(url)) {
    event.respondWith(_tileFirst(req));
    return;
  }

  // Everything else → cache-first (app shell)
  event.respondWith(_cacheFirst(req));
});

// ── Strategy: cache-first ─────────────────────────────────────
async function _cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    const resp = await fetch(req);
    if (resp && resp.status === 200) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch {
    return new Response('Offline – resurssia ei välimuistissa', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ── Strategy: network-first for tiles ────────────────────────
async function _tileFirst(req) {
  try {
    const resp = await fetch(req, { signal: AbortSignal.timeout(5000) });
    if (resp && resp.status === 200) {
      const cache = await caches.open(TILE_CACHE);
      await cache.put(req, resp.clone());
      _evictOldTiles(cache);          // fire-and-forget
      return resp;
    }
  } catch { /* network unavailable */ }

  // Fallback: cache
  const cached = await caches.match(req);
  if (cached) return cached;

  // Last resort: transparent 1 × 1 px PNG
  return _emptyTile();
}

// ── Tile cache LRU eviction ───────────────────────────────────
async function _evictOldTiles(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    const remove = keys.slice(0, keys.length - MAX_TILES + 100);
    await Promise.all(remove.map(k => cache.delete(k)));
  }
}

// ── Helpers ───────────────────────────────────────────────────
function _isTile(url) {
  return (
    url.hostname === 'tile.openstreetmap.org'               ||
    url.hostname === 'tile.opentopomap.org'                 ||
    url.hostname.includes('arcgisonline.com')               ||
    url.hostname.includes('opentopomap.org')                ||
    /\/\d+\/\d+\/\d+\.(png|jpg|jpeg)(\?.*)?$/.test(url.pathname)
  );
}

function _isApiCall(url) {
  return (
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('project-osrm.org')            ||
    url.hostname.includes('router.project-osrm.org')
  );
}

function _emptyTile() {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return new Response(buf, {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
  });
}
