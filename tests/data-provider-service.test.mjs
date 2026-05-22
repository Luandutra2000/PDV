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

const assertThrows = (callback, expectedMessage, message) => {
  try {
    callback();
  } catch (error) {
    assert(error.message === expectedMessage, message);
    return;
  }

  throw new Error(message);
};

const { DATA_PROVIDER_MODES } = await import('../src/database/schema.js');
const {
  getDataProvider,
  resetDataProviderForTests,
  setDataProviderForTests
} = await import('../src/services/data-provider.service.js');

assert(DATA_PROVIDER_MODES.local === 'local', 'local mode should be exported');

const provider = getDataProvider();
provider.setCollection('products', [{ id: 'x-salada', name: 'X Salada' }]);
const products = provider.getCollection('products', []);

assert(products.length === 1, 'local provider should read collection');
assert(products[0].id === 'x-salada', 'local provider should preserve item');

provider.setCollection('caixa', { aberto: true, saldoInicial: 50 });
assert(provider.getCollection('caixa', null).saldoInicial === 50, 'local provider should support caixa');

provider.setItem('activeComanda', { id: 'mesa-1', items: [] });
assert(provider.getItem('activeComanda', null).id === 'mesa-1', 'local provider should support activeComanda');

assertThrows(
  () => provider.setCollection('unknownCollection', []),
  'Collection desconhecida: unknownCollection',
  'local provider should reject unknown collections'
);

globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase' };
resetDataProviderForTests();
const supabaseFallbackProvider = getDataProvider();
assert(supabaseFallbackProvider.mode === 'local', 'supabase mode should fallback to local provider for now');

const testProvider = { mode: 'test' };
setDataProviderForTests(testProvider);
assert(getDataProvider() === testProvider, 'setDataProviderForTests should override active provider');

resetDataProviderForTests();
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'local' };
assert(getDataProvider().mode === 'local', 'resetDataProviderForTests should reset active provider');

console.log('data provider service ok');
