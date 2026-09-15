const CACHE_NAME = 'pdv-v83';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/assets/pwa-icon.svg',
  './src/styles/base.css',
  './src/styles/layout.css',
  './src/styles/sidebar.css',
  './src/styles/buttons.css',
  './src/styles/cards.css',
  './src/styles/forms.css',
  './src/styles/modal.css',
  './src/styles/pdv.css',
  './src/styles/mobile.css',
  './src/config/runtime-config.js',
  './src/modules/auth/login.module.js',
  './src/app.js?v=20260804-06'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('pdv-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const publicPath = url.pathname === '/' || url.pathname === '/index.html'
    || url.pathname === '/manifest.json' || url.pathname === '/favicon.ico'
    || /^\/src\/.*\.(?:js|css|svg|png|jpe?g|webp|ico|woff2?)$/.test(url.pathname);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin
    || !publicPath || event.request.headers.has('authorization')
    || [...url.searchParams.keys()].some((key) => key !== 'v')) {
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque'
          || response.redirected || /(?:private|no-store)/i.test(response.headers.get('cache-control') || '')) {
          return response;
        }

        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, copy))
          .catch(() => {}));
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(event.request)) || Response.error();
      })
  );
});
