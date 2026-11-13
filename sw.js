/* ==========================================================================
   Offline support: keeps the app's own files so it opens with no internet.
   Pages and files are served from the cache straight away and refreshed in
   the background (stale-while-revalidate), so a new version arrives on the
   next visit. Your data never passes through here: it lives in localStorage.
   Bump CACHE when the list of files changes.
   ========================================================================== */

const CACHE = 'expense-tracker-v2';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/charts.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Our own files, plus the web font (Google Fonts), are cached; everything else goes straight to the network.
  const cacheable = url.origin === self.location.origin
    || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      const fresh = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      const res = await fresh;
      if (res) return res;
      // Offline and never cached: open the app itself for page loads.
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    })
  );
});
