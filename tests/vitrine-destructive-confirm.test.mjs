// Regressao (QA 2026-11, BUG-026): "Cancelar" lancamento e "Apagar" linha do
// comparativo agiam com um unico clique.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
globalThis.window = { location: { href: '', pathname: '/' }, confirm: () => false, prompt: () => '' };
globalThis.document = { documentElement: { dataset: {} } };
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const schema = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const estoque = await import('../src/services/estoque.service.js?v=20260804-06');
const { initEstoqueModule } = await import('../src/modules/estoque/estoque.module.js?v=20260807-21');

seedTestAdmin(storage, schema.STORAGE_KEYS);
storage.setItem(schema.STORAGE_KEYS.categories, [{ id: 'qa', name: 'QA', showInShowcase: true }]);
storage.setItem(schema.STORAGE_KEYS.products, [{ id: 'qa-coxinha', name: 'QA Coxinha', categoryId: 'qa', price: 7.5, stock: 0, active: true }]);
const launch = estoque.createStockLaunch({ produtoId: 'qa-coxinha', quantidade: 5 });

const listeners = {};
const screen = { innerHTML: '', addEventListener: (type, handler) => { (listeners[type] ||= []).push(handler); }, querySelector: (s) => (s === '[data-estoque-screen]' ? {} : null) };
initEstoqueModule(screen);
await new Promise((resolve) => setTimeout(resolve, 0));
const click = (action, data) => listeners.click.forEach((handler) => handler({ target: { closest: (selector) => (selector.includes('data-estoque-screen') || selector.includes('data-action') ? { dataset: { action, ...data }, matches: () => false } : null) } }));

click('cancel-launch', { launchId: launch.id });
assert.equal(estoque.getStockLaunches({ period: 'all' })[0].status, 'ativo', 'primeiro clique so pede confirmacao');
assert.match(screen.innerHTML, /Confirmar cancelamento/, 'botao vira Confirmar cancelamento');
click('cancel-launch', { launchId: launch.id });
assert.equal(estoque.getStockLaunches({ period: 'all' })[0].status, 'cancelado', 'segundo clique cancela');
console.log('vitrine destructive confirm ok');
