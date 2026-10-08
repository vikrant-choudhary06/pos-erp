// Lets the POS and kitchen screens open without a connection.
// Static build files are cached forever (their names change every build);
// pages are fetched fresh when possible and served from cache when not.
// API calls are never cached here, the app keeps its own offline data.

const STATIC = 'static-v1';
const PAGES = 'pages-v1';
const OFFLINE_PAGES = ['/pos', '/kitchen', '/lock'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/favicon.svg') {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate' && OFFLINE_PAGES.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(networkFirst(request, url.pathname));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, path) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    // only keep real pages, not redirects to the login screen
    if (response.ok && !response.redirected) cache.put(path, response.clone());
    return response;
  } catch {
    return (await cache.match(path)) ?? (await cache.match('/pos')) ?? Response.error();
  }
}
