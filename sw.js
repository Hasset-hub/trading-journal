// === Service Worker ===
// Network-first: always fetch the freshest files when online (so deploys show up
// immediately), fall back to cache when offline. Bump CACHE to invalidate old caches.

const CACHE = 'tj-v11';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.webmanifest',
  '/icon.svg',
  '/js/storage.js',
  '/js/utils.js',
  '/js/stats.js',
  '/js/charts.js',
  '/js/sample.js',
  '/js/chart.umd.js',
  '/js/ai.js',
  '/js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Network-first with cache fallback + background cache refresh.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || (req.mode === 'navigate' ? caches.match('/index.html') : undefined)))
  );
});
