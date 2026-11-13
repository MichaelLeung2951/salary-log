/* Salary Tracking — Service Worker
   Strategy:
   - App shell (navigation): network first, fall back to cached index.html
   - Same-origin assets: stale-while-revalidate
   - Cross-origin (Tailwind CDN): cache first, then network
   Bump CACHE_VERSION whenever you change index.html / app.js. */

const CACHE_VERSION = 'v1.2.0';
const SHELL_CACHE = `daily-log-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `daily-log-runtime-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

const CDN_ASSETS = ['https://cdn.tailwindcss.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(
      SHELL_ASSETS.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      )
    );
    await Promise.all(
      CDN_ASSETS.map((url) =>
        fetch(url, { mode: 'no-cors' })
          .then((res) => cache.put(url, res))
          .catch(() => {})
      )
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Page loads: try the network, otherwise serve the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (err) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Same-origin assets: instant from cache, refresh in the background.
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request, { ignoreVary: true });
      const network = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => null);
      if (cached) return cached;
      const fresh = await network;
      return fresh || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
    return;
  }

  // Cross-origin (CDN): cache first.
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    try {
      const res = await fetch(request);
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      return new Response('', { status: 504 });
    }
  })());
});

// Let the page ask the worker to activate a new version immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
