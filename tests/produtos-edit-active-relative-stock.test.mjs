// Regressao (QA 2026-11):
// - BUG-022: havia filtro "Inativos" mas nenhuma acao para inativar produto.
// - BUG-027: a edicao gravava o estoque da vitrine como valor absoluto lido ao
//   abrir o formulario; uma venda feita nesse meio-tempo era desfeita.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const NativeFormData = globalThis.FormData;
globalThis.FormData = class extends NativeFormData {
  constructor(form) { super(); Object.entries(form?.fields || {}).forEach(([k, v]) => this.set(k, v)); }
};
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs');
const sync = await import('../src/services/showcase-sync.service.js?v=20260804-06');
const products = await import('../src/services/product.service.js?v=20260804-06');
const showcase = await import('../src/services/showcase-stock.service.js?v=20260804-06');
const { initProdutosModule } = await import('../src/modules/produtos/produtos.module.js?v=20260807-21');

seedTestAdmin(storage, STORAGE_KEYS);
storage.setItem(STORAGE_KEYS.categories, [{ id: 'qa', name: 'QA', showInShowcase: true }]);
storage.setItem(STORAGE_KEYS.products, [{ id: 'qa-cafe', name: 'QA Cafe', categoryId: 'qa', price: 4.5, stock: 10, active: true }]);
await sync.processShowcaseProduction({ operationId: 'p', productId: 'qa-cafe', quantity: 10 });

const handlers = {};
const container = { innerHTML: '', addEventListener: (type, handler) => { handlers[type] = handler; } };
initProdutosModule(container);
await new Promise((resolve) => setTimeout(resolve, 0));
await handlers.click({ target: { closest: () => ({ dataset: { action: 'edit-product', productId: 'qa-cafe' } }) } });
assert.match(container.innerHTML, /name="stockBase" value="10"/, 'formulario guarda o saldo de quando abriu');
assert.match(container.innerHTML, /name="active" checked/, 'formulario mostra o produto ativo');

// Outro aparelho vende 3 enquanto o formulario esta aberto.
await sync.processShowcaseSale({ operationId: 's', saleId: 's', items: [{ productId: 'qa-cafe', unitPrice: 4.5, quantity: 3 }] });

const form = { matches: (selector) => selector === '[data-product-form]', closest: () => ({}), fields: { name: 'QA Cafe', categoryId: 'qa', price: '4.80', stock: '10', stockBase: '10', activeField: '1' } };
await handlers.submit({ preventDefault() {}, target: form });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(showcase.getShowcaseStockByProductId('qa-cafe').quantityAvailable, 7, 'so o preco mudou: a venda de outro aparelho permanece');
assert.equal(products.getProductById('qa-cafe').price, 4.8);
assert.equal(products.getProductById('qa-cafe').active, false, 'checkbox desmarcado inativa o produto');
assert.equal(products.searchProducts({}).some((p) => p.id === 'qa-cafe'), false, 'produto inativo sai da frente de caixa');
console.log('produtos edit active relative stock ok');
