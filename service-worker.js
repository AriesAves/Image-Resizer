/* =============================================================
   AI Image Enhancer — Service Worker
   Strategy:
   - Pre-cache the app shell (index.html, manifest, icons)
   - Runtime cache AI libraries + model weights (cache-first, long TTL)
   - Network-first for HTML/JS so updates roll out fast
   ============================================================= */

const APP_VERSION = 'ai-enhancer-v1';
const APP_SHELL_CACHE = `app-shell-${APP_VERSION}`;
const AI_CACHE = `ai-runtime-${APP_VERSION}`;
const MODEL_CACHE = `ai-models-${APP_VERSION}`;

const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './README.md',
];

// Hosts whose assets we cache (TF.js + UpscalerJS come from jsdelivr)
const CACHEABLE_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
]);

// AI model weight files are large; we cap the model cache size.
const MAX_MODEL_CACHE_BYTES = 500 * 1024 * 1024; // 500 MB

// ---------- Install: pre-cache the app shell ----------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL_FILES).catch(err => {
        // Non-fatal: shell might not exist yet in dev
        console.warn('[SW] shell pre-cache partial fail:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ---------- Activate: clean up old caches ----------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => k !== APP_SHELL_CACHE && k !== AI_CACHE && k !== MODEL_CACHE)
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// ---------- Fetch: route based on what's being requested ----------
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Same-origin app shell: network-first, fall back to cache
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, APP_SHELL_CACHE));
    return;
  }

  // CDN assets (TF.js, UpscalerJS, models)
  if (CACHEABLE_HOSTS.has(url.hostname)) {
    // Model weights are large and rarely change — cache-first
    if (isModelWeight(url)) {
      event.respondWith(cacheFirstWithLimit(req, MODEL_CACHE, MAX_MODEL_CACHE_BYTES));
    } else {
      // JS libraries: cache-first so the app works offline
      event.respondWith(cacheFirst(req, AI_CACHE));
    }
    return;
  }
});

// ---------- Helpers ----------

async function networkFirst(request, cacheName) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && request.url.startsWith(self.location.origin)) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last-ditch: return the app shell so navigation works offline
    if (request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw e;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (e) {
    // Offline + not in cache: try to fall back to the app shell
    if (request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw e;
  }
}

// Model weight files: same as cacheFirst but enforces a cache size cap.
// When the cap is exceeded, oldest entries are evicted.
async function cacheFirstWithLimit(request, cacheName, maxBytes) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
      // Evict oldest if over the cap
      trimCache(cacheName, maxBytes);
    }
    return fresh;
  } catch (e) {
    throw e;
  }
}

async function trimCache(cacheName, maxBytes) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  let total = 0;
  const sizes = [];
  for (const k of keys) {
    const resp = await cache.match(k);
    if (!resp) continue;
    const blob = await resp.clone().blob();
    const size = blob.size;
    total += size;
    sizes.push({ key: k, size });
  }
  if (total <= maxBytes) return;
  // Sort by insertion order (oldest first) — keys() returns insertion order
  for (const { key, size } of sizes) {
    if (total <= maxBytes) break;
    await cache.delete(key);
    total -= size;
    console.log(`[SW] evicted ${key.url} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

function isModelWeight(url) {
  // UpscalerJS models are .bin files; TF.js graph models are model.json + shards
  return /\.(bin|weights|shard)$/i.test(url.pathname)
      || /\/models\//i.test(url.pathname)
      || /\/[0-9]+x\//i.test(url.pathname);
}
