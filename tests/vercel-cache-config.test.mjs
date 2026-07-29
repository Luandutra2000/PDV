import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorkerJs = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
const appJs = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const mobileDashboardJs = await readFile(new URL('../src/modules/mobile/mobile-dashboard.module.js', import.meta.url), 'utf8');
const mobileCss = await readFile(new URL('../src/styles/mobile.css', import.meta.url), 'utf8');
const srcHeader = config.headers.find((entry) => entry.source === '/src/(.*)');
const cacheControl = srcHeader?.headers.find((header) => header.key.toLowerCase() === 'cache-control')?.value || '';

assert(srcHeader, 'vercel config should define cache headers for source modules');
assert(!cacheControl.includes('immutable'), 'source modules should not be immutable because URLs are not content-hashed');
assert(cacheControl.includes('max-age=0'), 'source modules should revalidate so fixes appear after deploy');
assert(indexHtml.includes('./src/app.js?v=20260729-04'), 'app entrypoint should use the latest cache-busting version');
assert(indexHtml.includes('maximum-scale=1'), 'mobile viewport should prevent focus zoom in the owner app');
assert(indexHtml.includes('user-scalable=no'), 'mobile viewport should keep the PWA static while entering data');
assert(indexHtml.includes('Nao foi possivel iniciar o PDV.'), 'startup should show a visible fallback when module boot fails');
assert(indexHtml.includes('Nao foi possivel limpar service workers antigos.'), 'startup should not block app boot when browser cache cleanup fails');
assert(serviceWorkerJs.includes('pdv-v64'), 'service worker cache name should change when app modules change');
assert(serviceWorkerJs.includes('./src/app.js?v=20260729-04'), 'service worker should precache the latest app entrypoint');
assert(!serviceWorkerJs.includes('./src/app.js?v=20260618-02'), 'service worker should not keep the stale app entrypoint');
assert(indexHtml.includes('clearStaleClientCaches'), 'stale app caches should be cleared before boot');
assert(indexHtml.includes('LOCAL_CACHE_VERSION'), 'local development cache clearing should be versioned');
assert(!indexHtml.includes('await new Promise(() => {})'), 'local cache clearing should not block app boot');
assert(indexHtml.includes('aria-label="Login do PDV"'), 'index should render a login fallback before JavaScript boot');
assert(indexHtml.includes('onsubmit="return false"'), 'login fallback should not submit credentials into the URL');
assert(indexHtml.includes('isLocalDevelopment'), 'local development should not keep registering the service worker');
assert(indexHtml.includes('navigator.serviceWorker.addEventListener(\'controllerchange\''), 'app should reload once when a fresh service worker takes control');
assert(appJs.includes('AUTH_SESSION_VERSION'), 'auth updates should force one fresh login after deploy');
assert(appJs.includes('20260620-02-company-profile'), 'company profile sync should force one fresh login after deploy');
assert(!appJs.includes('restoreSupabaseSession() || getCurrentUser()'), 'login screen should not wait for Supabase session restore before rendering');
assert(appJs.includes('./modules/mobile/mobile-dashboard.module.js?v=20260608-15'), 'mobile dashboard import should use the latest cache-busting version');
assert(appJs.includes('loadCompanySettingsLocal'), 'app shell should render with local company settings before remote settings load');
assert(appJs.includes('companySettingsChanged'), 'app shell should refresh branding when company settings change');
assert(
  appJs.includes('renderSidebar(getCurrentUser(), settings)'),
  'app shell should re-render the sidebar with refreshed company settings'
);
assert(appJs.includes("'empresa-config': 'company_settings.manage'"), 'company settings route should require manage permission');
assert(mobileDashboardJs.includes('../../services/mobile-notifications.service.js?v=20260616-04'), 'mobile feed service import should use the latest cache-busting version');
assert(mobileDashboardJs.includes('mobile-crm-chart'), 'mobile CRM should render chart panels');
assert(mobileDashboardJs.includes('renderMobileSalesChart'), 'mobile CRM should include sales chart renderer');
assert(mobileDashboardJs.includes('MOBILE_AUTO_REFRESH_MS = 40000'), 'owner app should auto-refresh every 40 seconds');
assert(mobileDashboardJs.includes('deferWhileEditing'), 'owner app auto-refresh should defer rendering while a field is focused');
assert(mobileCss.includes('.mobile-shell input'), 'mobile CSS should scope field sizing to the owner app');
assert(mobileCss.includes('font-size: 16px'), 'mobile form fields should avoid browser focus zoom');
assert(mobileCss.includes('grid-template-columns: repeat(6'), 'mobile bottom shortcuts should fit all tabs in one row');

console.log('vercel cache config ok');
