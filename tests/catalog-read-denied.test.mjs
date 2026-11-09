// Regressao (QA 2026-11, BUG-017): o servidor so libera products/categories
// para admin (products.view) e gerente (products.manage). Logada como operador,
// a lista vinha vazia, o app marcava "sincronizado", apagava o catalogo do
// aparelho e a frente de caixa ficava sem nenhum produto para vender.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.test', supabaseAnonKey: 'public' };

const storage = await import('../src/services/storage.service.js?v=20261109-01');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { setTestUserSession } = await import('./test-auth-fixture.mjs?v=20260804-06');
const { configureSupabaseClientForTests } = await import('../src/services/supabase-client.service.js?v=20260804-06');
const sync = await import('../src/services/product-sync.service.js?v=20261109-01');

let remoteProducts = [];
const client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
  from: (table) => ({ select: async () => ({ data: table === 'products' ? remoteProducts : [], error: null }) })
};
configureSupabaseClientForTests({ client });
storage.resetAppData();

const cached = [{ id: 'qa-cafe', name: 'QA Cafe', categoryId: 'qa-bebidas', price: 4.5, stock: 0, active: true }];
disk.set(keys.products, JSON.stringify(cached));
setTestUserSession(storage, keys, { id: 'op-1', name: 'Operadora', username: 'op', role: 'operador', active: true });

const listed = await sync.loadProductsFromSupabase();
assert.equal(listed.length, 1, 'mantem o catalogo do aparelho quando o servidor nega a leitura');
assert.equal(JSON.parse(disk.get(keys.products)).length, 1, 'cache local nao e apagado');
const status = sync.getProductSyncStatus();
assert.notEqual(status.state, 'synced', 'nao pode marcar sincronizado');
assert.match(status.products.error, /não liberou o catálogo/, 'mensagem clara para o operador');

// Para o admin, lista vazia continua sendo um catalogo vazio legitimo.
setTestUserSession(storage, keys, { id: 'adm-1', name: 'Admin', username: 'adm', role: 'admin', active: true });
await sync.loadProductsFromSupabase();
assert.equal(JSON.parse(disk.get(keys.products)).length, 0, 'admin pode esvaziar o catalogo');

const migration = fs.readFileSync(new URL('../supabase/migrations/202611090001_allow_sellers_read_catalog.sql', import.meta.url), 'utf8');
for (const table of ['products', 'categories']) {
  const policy = `create policy "catalog readers read ${table}" on public.${table}`;
  const index = migration.indexOf(policy);
  assert.ok(index >= 0, `migracao cria a politica de leitura de ${table}`);
  assert.match(migration.slice(index + policy.length, index + policy.length + 40), /^\s+for select to authenticated/, `politica de ${table} e somente leitura`);
}
assert.match(migration, /current_profile_has_permission\('sales\.access'\)/, 'quem vende le o catalogo');
assert.doesNotMatch(migration, /for (all|insert|update|delete)/, 'migracao so adiciona leitura');

const vendas = fs.readFileSync(new URL('../src/modules/vendas/vendas.module.js', import.meta.url), 'utf8');
assert.match(vendas, /Produtos indisponíveis: /, 'frente de caixa mostra o erro do catalogo');
console.log('catalog read denied ok');

// A hidratacao generica da camada de dados tambem nao apaga o catalogo local.
const providerSource = fs.readFileSync(new URL('../src/services/providers/supabase.provider.js', import.meta.url), 'utf8');
assert.match(providerSource, /if \(!data\.length && \[STORAGE_KEYS\.categories, STORAGE_KEYS\.products\]\.includes\(key\) && localProvider\.read\(key, \[\]\)\.length\)/, 'hidratacao preserva catalogo local diante de lista vazia');
assert.match(vendas, /\[UI_EVENTS\.productCatalogChanged, UI_EVENTS\.productSyncStatusChanged\]\.forEach/, 'frente de caixa redesenha a grade quando o catalogo muda');
console.log('catalog hydrate guard ok');

// Enviar a fila (vazia) na inicializacao nao pode apagar o erro de leitura.
setTestUserSession(storage, keys, { id: 'op-1', name: 'Operadora', username: 'op', role: 'operador', active: true });
disk.set(keys.products, JSON.stringify(cached));
await sync.loadProductsFromSupabase();
await sync.flushProductCatalogQueue();
assert.equal(sync.getProductSyncStatus().products.state !== 'synced', true, 'flush sem pendencias mantem o erro de leitura do catalogo');
console.log('catalog flush keeps read error ok');
