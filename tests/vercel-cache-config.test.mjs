import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(projectRoot, path), 'utf8');
const RELEASE = '20261109-01';

const config = JSON.parse(await read('vercel.json'));
const indexHtml = await read('index.html');
const serviceWorkerJs = await read('service-worker.js');
const appJs = await read('src/app.js');
const mobileDashboardJs = await read('src/modules/mobile/mobile-dashboard.module.js');
const srcHeader = config.headers.find((entry) => entry.source === '/src/(.*)');
const cacheControl = srcHeader?.headers.find((header) => header.key.toLowerCase() === 'cache-control')?.value || '';

// Cabecalhos de cache do Vercel
assert(srcHeader, 'vercel config should define cache headers for source modules');
assert(!cacheControl.includes('immutable'), 'source modules should not be immutable because URLs are not content-hashed');
assert(cacheControl.includes('max-age=0'), 'source modules should revalidate so fixes appear after deploy');

// Folhas de estilo: todas versionadas, base antes dos tokens, telas depois dos componentes
const stylesheets = [...indexHtml.matchAll(/<link rel="stylesheet" href="(\.\/src\/styles\/[^"]+)">/g)].map((match) => match[1]);
const position = (name) => stylesheets.findIndex((href) => href.startsWith(`./src/styles/${name}.css?`));
assert(stylesheets.length > 0 && stylesheets.every((href) => /\.css\?v=\d{8}-\d{2}$/.test(href)), 'every stylesheet link should carry a ?v= cache-busting version');
assert(['base', 'layout', 'buttons', 'modal', 'forms'].every((name) => position(name) >= 0 && position(name) < position('tokens')), 'base styles should load before the design tokens');
assert(position('components') === position('tokens') + 1, 'shared components should load right after the tokens');
assert(['pdv-b', 'modal-b', 'login-b', 'caixa-b', 'historico-b', 'vitrine-b', 'produtos-b', 'pessoas-b', 'financeiro-b', 'relatorios-b', 'empresa-config', 'suporte-b', 'mobile-b'].every((name) => position(name) > position('components')), 'screen styles should load after the shared components');
assert(position('modal-b') > position('modal'), 'modal frame styles should load after the base modal styles');
['redesign', 'sidebar', 'cards', 'pdv', 'mobile'].forEach((name) => assert(!indexHtml.includes(`./src/styles/${name}.css`) && !serviceWorkerJs.includes(`./src/styles/${name}.css`), `removed stylesheet ${name}.css should not be linked or precached`));
const styleFiles = (await readdir(resolve(projectRoot, 'src/styles'))).filter((file) => file.endsWith('.css'));
assert(styleFiles.length === stylesheets.length && styleFiles.every((file) => position(file.replace('.css', '')) >= 0), 'every stylesheet in src/styles should be linked from index.html');

// Service worker: cache novo e pre-cache igual ao que o index carrega
const precached = [...serviceWorkerJs.matchAll(/'(\.\/[^']*)'/g)].map((match) => match[1]);
assert(serviceWorkerJs.includes("const CACHE_NAME = 'pdv-v88';"), 'service worker cache name should change when app modules change');
assert(stylesheets.every((href) => precached.includes(href)), 'service worker should precache every linked stylesheet with its version');
assert(precached.filter((href) => href.includes('/src/styles/')).length === stylesheets.length, 'service worker should not precache stylesheets the index does not load');
assert(precached.includes(`./src/app.js?v=${RELEASE}`), 'service worker should precache the latest app entrypoint');
assert(precached.includes(`./src/modules/auth/login.module.js?v=${RELEASE}`), 'service worker should precache the login module with the version app.js imports');
assert(appJs.includes(`./modules/auth/login.module.js?v=${RELEASE}`), 'app should import the login module with the precached version');
assert(precached.includes('./src/config/runtime-config.js?v=20260807-02') && appJs.includes('./config/runtime-config.js?v=20260807-02'), 'runtime config should be precached with the version app.js imports');

// Entrada do app e imports alterados nesta versao
assert(indexHtml.includes(`./src/app.js?v=${RELEASE}`), 'app entrypoint should use the latest cache-busting version');
assert(appJs.includes(`./modules/vendas/vendas.module.js?v=${RELEASE}`), 'front-of-house module import should use the latest cache-busting version');
assert(appJs.includes(`./modules/mobile/mobile-dashboard.module.js?v=${RELEASE}`), 'mobile dashboard import should use the latest cache-busting version');
assert(appJs.includes(`./modules/empresa-config/empresa-config.module.js?v=${RELEASE}`), 'company module import should use the latest cache-busting version');
assert(appJs.includes(`./components/topbar.component.js?v=${RELEASE}`), 'shell component import should be versioned with the module graph');
assert(mobileDashboardJs.includes(`../../services/mobile-notifications.service.js?v=${RELEASE}`), 'mobile feed service import should keep its cache-busting version');

// Um modulo, uma versao: imports do mesmo arquivo com ?v= diferentes viram instancias separadas no navegador
async function listModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? listModules(resolve(directory, entry.name)) : [resolve(directory, entry.name)])));
  return nested.flat().filter((file) => file.endsWith('.js'));
}
const versionsByModule = new Map();
for (const file of [...await listModules(resolve(projectRoot, 'src')), resolve(projectRoot, 'index.html'), resolve(projectRoot, 'service-worker.js')]) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/['"`](\.{1,2}\/[^'"`?]+\.(?:js|css))(\?v=[^'"`]*)?['"`]/g)) {
    const target = relative(projectRoot, resolve(dirname(file), match[1])).replaceAll('\\', '/');
    if (!versionsByModule.has(target)) versionsByModule.set(target, new Set());
    versionsByModule.get(target).add(match[2] || '(none)');
  }
}
const mixed = [...versionsByModule].filter(([, versions]) => versions.size > 1).map(([target, versions]) => `${target} ${[...versions].join(' ')}`);
assert(mixed.length === 0, `every import of a module should use the same ?v=: ${mixed.join('; ')}`);

// Moldura do PWA na paleta nova (ambar #FFB547, fundo #F1F3F7, escuro #1C2331)
const manifest = JSON.parse(await read('manifest.json'));
assert(manifest.theme_color === '#FFB547' && manifest.background_color === '#F1F3F7', 'manifest should use the new palette');
assert(indexHtml.includes('<meta name="theme-color" content="#FFB547" media="(prefers-color-scheme: light)">'), 'light theme-color should be the new amber');
assert(indexHtml.includes('<meta name="theme-color" content="#1C2331" media="(prefers-color-scheme: dark)">'), 'dark theme-color should follow the dark background');
assert(!/#ff6b1a/i.test(indexHtml) && !/#ff6b1a/i.test(JSON.stringify(manifest)), 'old orange should not remain in the PWA chrome');

// Inicializacao
assert(indexHtml.includes('Nao foi possivel iniciar o PDV.'), 'startup should show a visible fallback when module boot fails');
assert(indexHtml.includes('Nao foi possivel limpar service workers antigos.'), 'startup should not block app boot when browser cache cleanup fails');
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
assert(mobileDashboardJs.includes('Vendas por dia'), 'mobile CRM should render the sales per day chart');
assert(mobileDashboardJs.includes('renderMobileSalesChart'), 'mobile CRM should include sales chart renderer');

console.log('vercel cache config ok');
