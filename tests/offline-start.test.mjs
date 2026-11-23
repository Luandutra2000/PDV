// Abrir o PDV sem internet: o index.html apagava o cache a cada aba nova
// (versao guardada no sessionStorage), a biblioteca do Supabase (esm.sh) nao
// ficava guardada, e uma falha de rede no inicio mandava o usuario ja logado
// para a tela de login.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const indexHtml = read('index.html');
assert.match(indexHtml, /localStorage\.getItem\('pdv\.localCacheVersion'\) === LOCAL_CACHE_VERSION/, 'versao do cache sobrevive a fechar o navegador');
assert.doesNotMatch(indexHtml, /sessionStorage\.(get|set)Item\('pdv\.localCacheVersion'/, 'sem sessionStorage para a versao do cache');
assert.match(indexHtml, /navigator\.onLine === false\)\s*{\s*return false;/, 'sem internet o cache nao e apagado');

const serviceWorker = read('service-worker.js');
assert.match(serviceWorker, /const LIBRARY_ORIGIN = 'https:\/\/esm\.sh';/);
assert.match(serviceWorker, /url\.origin === LIBRARY_ORIGIN\)\s*{\s*event\.respondWith\(fetchAndKeepCopy\(event\)\);/, 'biblioteca do Supabase guardada para uso offline');
assert.match(serviceWorker, /cache\.match\(event\.request\)/, 'sem rede responde com a copia guardada');

const app = read('src/app.js');
assert.match(app, /if \(!isNetworkFailure\(error\)\) {\s*renderLoginModule/, 'so erro que nao e de rede volta para o login');
assert.match(app, /onlineStartPending = true;/);
assert.match(app, /if \(onlineStartPending && navigator\.onLine !== false\) {\s*startOnlineServices\(\)/, 'conexao e retomada quando a internet volta');

// A falha ao carregar a biblioteca nao fica gravada para sempre.
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-test-key' };
const { getSupabaseClient } = await import('../src/services/supabase-client.service.js?v=20261123-03');
const first = getSupabaseClient();
await assert.rejects(first);
const second = getSupabaseClient();
assert.notEqual(second, first, 'nova tentativa depois da falha');
await assert.rejects(second);

console.log('offline start ok');
