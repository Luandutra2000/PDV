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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};

const { getDataProvider } = await import('../src/services/data-provider.service.js');

const provider = getDataProvider();

assert(provider.mode === 'local', 'local provider should be selected by default');
provider.write('pdv.test', [{ id: 1, name: 'Teste' }]);

const readBack = provider.read('pdv.test', []);

assert(Array.isArray(readBack), 'provider should return stored arrays');
assert(readBack[0].name === 'Teste', 'provider should persist values through localStorage');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

const supabaseProvider = getDataProvider();

assert(supabaseProvider.mode === 'supabase', 'supabase provider should be selected when configured');

console.log('data provider service ok');
