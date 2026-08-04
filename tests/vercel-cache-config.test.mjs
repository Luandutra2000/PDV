import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorkerJs = await readFile(new URL('../service-worker.js?v=20260804-02', import.meta.url), 'utf8');
const appJs = await readFile(new URL('../src/app.js?v=20260804-02', import.meta.url), 'utf8');
const mobileDashboardJs = await readFile(new URL('../src/modules/mobile/mobile-dashboard.module.js?v=20260804-02', import.meta.url), 'utf8');
const srcHeader = config.headers.find((entry) => entry.source === '/src/(.*)');
const cacheControl = srcHeader?.headers.find((header) => header.key.toLowerCase() === 'cache-control')?.value || '';

assert(srcHeader, 'vercel config should define cache headers for source modules');
assert(!cacheControl.includes('immutable'), 'source modules should not be immutable because URLs are not content-hashed');
assert(cacheControl.includes('max-age=0'), 'source modules should revalidate so fixes appear after deploy');
assert(indexHtml.includes('./src/app.js?v=20260804-02'), 'app entrypoint should use the latest cache-busting version');
assert(indexHtml.includes('Nao foi possivel iniciar o PDV.'), 'startup should show a visible fallback when module boot fails');
assert(indexHtml.includes('Nao foi possivel limpar service workers antigos.'), 'startup should not block app boot when browser cache cleanup fails');
assert(serviceWorkerJs.includes('pdv-v75'), 'service worker cache name should change when app modules change');
assert(serviceWorkerJs.includes('./src/app.js?v=20260804-02'), 'service worker should precache the latest app entrypoint');
assert(appJs.includes('./utils/dom.js?v=20260804-02'), 'shared DOM helper import should be versioned with the module graph');
assert(appJs.includes('./modules/vendas/vendas.module.js?v=20260804-02'), 'critical UI modules should be versioned with the module graph');
assert(!serviceWorkerJs.includes('./src/app.js?v=20260602-06'), 'service worker should not keep the stale app entrypoint');
assert(indexHtml.includes('clearStaleClientCaches'), 'stale app caches should be cleared before boot');
assert(indexHtml.includes('LOCAL_CACHE_VERSION'), 'local development cache clearing should be versioned');
assert(!indexHtml.includes('await new Promise(() => {})'), 'local cache clearing should not block app boot');
assert(indexHtml.includes('aria-label="Login do PDV"'), 'index should render a login fallback before JavaScript boot');
assert(indexHtml.includes('onsubmit="return false"'), 'login fallback should not submit credentials into the URL');
assert(indexHtml.includes('isLocalDevelopment'), 'local development should not keep registering the service worker');
assert(indexHtml.includes('navigator.serviceWorker.addEventListener(\'controllerchange\''), 'app should reload once when a fresh service worker takes control');
assert(appJs.includes('AUTH_SESSION_VERSION'), 'auth updates should force one fresh login after deploy');
assert(!appJs.includes('restoreSupabaseSession() || getCurrentUser()'), 'login screen should not wait for Supabase session restore before rendering');
assert(appJs.includes('restoreSessionInBackground(app)'), 'valid Supabase sessions should recover after reload without blocking login rendering');
assert(appJs.includes('./modules/mobile/mobile-dashboard.module.js?v=20260804-02'), 'mobile dashboard import should use the latest cache-busting version');
assert(mobileDashboardJs.includes('../../services/mobile-notifications.service.js?v=20260804-02'), 'mobile feed service import should use the latest cache-busting version');
assert(mobileDashboardJs.includes('mobile-crm-chart'), 'mobile CRM should render chart panels');
assert(mobileDashboardJs.includes('renderMobileSalesChart'), 'mobile CRM should include sales chart renderer');

console.log('vercel cache config ok');
