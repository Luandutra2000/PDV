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

globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'local' };

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { DATA_PROVIDER_MODES } = await import('../src/database/schema.js');
const { getDataProvider } = await import('../src/services/data-provider.service.js');

assert(DATA_PROVIDER_MODES.local === 'local', 'local mode should be exported');

const provider = getDataProvider();
provider.setCollection('products', [{ id: 'x-salada', name: 'X Salada' }]);
const products = provider.getCollection('products', []);

assert(products.length === 1, 'local provider should read collection');
assert(products[0].id === 'x-salada', 'local provider should preserve item');

console.log('data provider service ok');
