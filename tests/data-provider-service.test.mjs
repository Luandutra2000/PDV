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
const supportedCollections = [
  ['products', [{ id: 'x-salada', name: 'X Salada' }]],
  ['categories', [{ id: 'lanches', name: 'Lanches' }]],
  ['activeComanda', { id: 'mesa-1', items: [] }],
  ['caixa', { aberto: true, saldoInicial: 50 }],
  ['transactions', [{ id: 'txn-1', total: 25 }]],
  ['closedComandas', [{ id: 'comanda-1', total: 25 }]],
  ['stockLaunches', [{ id: 'stock-1', quantity: 3 }]],
  ['hiddenStockComparisons', ['product-1']],
  ['cashClosings', [{ id: 'closing-1', total: 100 }]],
  ['cashClosingDraft', { operador: 'Luan', total: 100 }],
  ['showcaseWriteOffs', [{ id: 'write-off-1', quantity: 1 }]],
  ['syncQueue', [{ id: 'sync-1', type: 'SALE_FINISHED' }]]
];

for (const [name, value] of supportedCollections) {
  provider.setCollection(name, value);
  assert(
    JSON.stringify(provider.getCollection(name, null)) === JSON.stringify(value),
    `local provider should support ${name} collection`
  );

  const itemValue = { collection: name, viaItemApi: true };
  provider.setItem(name, itemValue);
  assert(
    JSON.stringify(provider.getItem(name, null)) === JSON.stringify(itemValue),
    `local provider should support ${name} item`
  );
}

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
