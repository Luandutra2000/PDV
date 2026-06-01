import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appJs = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const mobileDashboardJs = await readFile(new URL('../src/modules/mobile/mobile-dashboard.module.js', import.meta.url), 'utf8');
const srcHeader = config.headers.find((entry) => entry.source === '/src/(.*)');
const cacheControl = srcHeader?.headers.find((header) => header.key.toLowerCase() === 'cache-control')?.value || '';

assert(srcHeader, 'vercel config should define cache headers for source modules');
assert(!cacheControl.includes('immutable'), 'source modules should not be immutable because URLs are not content-hashed');
assert(cacheControl.includes('max-age=0'), 'source modules should revalidate so fixes appear after deploy');
assert(indexHtml.includes('./src/app.js?v=20260601-06'), 'app entrypoint should use the latest cache-busting version');
assert(indexHtml.includes('clearLocalDevelopmentCaches'), 'local development should clear stale app caches before boot');
assert(indexHtml.includes('navigator.serviceWorker.addEventListener(\'controllerchange\''), 'app should reload once when a fresh service worker takes control');
assert(appJs.includes('./modules/mobile/mobile-dashboard.module.js?v=20260601-05'), 'mobile dashboard import should use the latest cache-busting version');
assert(mobileDashboardJs.includes('../../services/mobile-notifications.service.js?v=20260601-05'), 'mobile feed service import should use the latest cache-busting version');

console.log('vercel cache config ok');
