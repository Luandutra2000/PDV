const CACHE_NAME = 'pdv-lanchonete-v22';
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
  './src/app.js'
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
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (new URL(event.request.url).pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }

        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
