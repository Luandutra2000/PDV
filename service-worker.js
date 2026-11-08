const CACHE_NAME = 'pdv-v87';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/assets/pwa-icon.svg',
  './src/styles/base.css?v=20260807-20',
  './src/styles/layout.css?v=20260807-20',
  './src/styles/buttons.css?v=20260807-20',
  './src/styles/modal.css?v=20260807-21',
  './src/styles/forms.css?v=20260807-21',
  './src/styles/tokens.css?v=20260807-21',
  './src/styles/components.css?v=20260807-21',
  './src/styles/pdv-b.css?v=20260807-21',
  './src/styles/modal-b.css?v=20260807-21',
  './src/styles/login-b.css?v=20260807-21',
  './src/styles/caixa-b.css?v=20260807-12',
  './src/styles/historico-b.css?v=20260807-13',
  './src/styles/vitrine-b.css?v=20260807-21',
  './src/styles/produtos-b.css?v=20260807-21',
  './src/styles/pessoas-b.css?v=20260807-21',
  './src/styles/financeiro-b.css?v=20260807-21',
  './src/styles/relatorios-b.css?v=20260807-21',
  './src/styles/empresa-config.css?v=20260807-18',
  './src/styles/suporte-b.css?v=20260807-18',
  './src/styles/mobile-b.css?v=20260807-21',
  './src/config/runtime-config.js?v=20260807-02',
  './src/modules/auth/login.module.js?v=20260807-21',
  './src/app.js?v=20260807-21'
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
