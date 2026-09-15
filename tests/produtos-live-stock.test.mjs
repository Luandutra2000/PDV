import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs');
const sync = await import('../src/services/showcase-sync.service.js?v=20260804-06');
const { initProdutosModule } = await import('../src/modules/produtos/produtos.module.js?v=20260804-06');
seedTestAdmin(storage, STORAGE_KEYS);
storage.setItem(STORAGE_KEYS.categories, [{ id: 'qa', name: 'QA', showInShowcase: true }]);
storage.setItem(STORAGE_KEYS.products, [{ id: 'qa-produto', name: 'QA produto', categoryId: 'qa', price: 7.5, stock: 10, active: true }]);
await sync.processShowcaseProduction({ operationId: 'produce', productId: 'qa-produto', quantity: 10 });
const handlers = {};
const container = { innerHTML: '', addEventListener: (event, handler) => { handlers[event] = handler; } };
initProdutosModule(container);
await Promise.resolve();
await sync.processShowcaseSale({ operationId: 'sale', saleId: 'sale', items: [{ productId: 'qa-produto', unitPrice: 7.5, quantity: 5 }] });
assert.match(container.innerHTML, /Estoque: 5<\/span>/, 'catalog reacts to sold stock without reopening');
await handlers.click({ target: { closest: () => ({ dataset: { action: 'edit-product', productId: 'qa-produto' } }) } });
assert.match(container.innerHTML, /name="stock"[^>]*value="5"/, 'editing price must not restore stale catalog stock');
await sync.reverseShowcaseSale({ operationId: 'reverse', saleId: 'sale' });
assert.match(container.innerHTML, /Estoque: 10<\/span>/, 'cancellation restores displayed stock');
await sync.processShowcaseSale({ operationId: 'sell-all', saleId: 'sell-all', items: [{ productId: 'qa-produto', unitPrice: 7.5, quantity: 10 }] });
assert.match(container.innerHTML, /Estoque: 0<\/span>/);
assert.match(container.innerHTML, /Estoque zerado/, 'zero stock alert uses current showcase balance');
console.log('produtos live stock ok');
