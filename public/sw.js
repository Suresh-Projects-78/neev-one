/**
 * Conservative service worker: precache nothing, cache-first only for built
 * static assets (hashed filenames make them immutable), network-only for
 * /api and navigations. An accounting app must never show stale books; the
 * win here is instant repeat loads of the app shell's JS/CSS, offline
 * tolerance for assets already seen, and installability.
 */
const CACHE = 'neev-static-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // books are never cached
  const isStatic = url.pathname.startsWith('/assets/') || /\.(js|css|svg|woff2?)$/.test(url.pathname);
  if (!isStatic) return;

  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
    )
  );
});
