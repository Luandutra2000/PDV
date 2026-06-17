import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const storage = await import('../src/services/storage.service.js');
const { initProdutosModule } = await import('../src/modules/produtos/produtos.module.js');

storage.setItem(STORAGE_KEYS.users, [{
  id: 'products-denied',
  name: 'Operador produtos',
  username: 'produtos',
  password: '1234',
  role: 'operador',
  active: true
}]);
storage.setItem(STORAGE_KEYS.currentSession, { userId: 'products-denied', startedAt: '2026-06-15T10:00:00.000Z' });
storage.setItem(STORAGE_KEYS.userPermissionOverrides, {
  'products-denied': {
    'products.manage': 'deny',
    'categories.manage': 'deny'
  }
});
storage.setItem(STORAGE_KEYS.categories, [{ id: 'salgados', name: 'Salgados', showInShowcase: true }]);
storage.setItem(STORAGE_KEYS.products, [{
  id: 'coxinha',
  name: 'Coxinha',
  categoryId: 'salgados',
  price: 8,
  stock: 0,
  active: true
}]);

const container = {
  innerHTML: '',
  addEventListener() {}
};

initProdutosModule(container);

assert(!container.innerHTML.includes('data-action="new-category"'), 'denied products user should not see category creation');
assert(!container.innerHTML.includes('data-action="new-product"'), 'denied products user should not see product creation');
assert(!container.innerHTML.includes('data-action="edit-category"'), 'denied products user should not see category edit');
assert(!container.innerHTML.includes('data-action="delete-category"'), 'denied products user should not see category delete');
assert(!container.innerHTML.includes('data-action="edit-product"'), 'denied products user should not see product edit');
assert(!container.innerHTML.includes('data-action="delete-product"'), 'denied products user should not see product delete');

console.log('produtos module ok');
