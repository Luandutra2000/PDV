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

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const storage = await import('../src/services/storage.service.js');

storage.ensureSeedData();

const products = JSON.parse(localStorage.getItem(STORAGE_KEYS.products));
const categories = JSON.parse(localStorage.getItem(STORAGE_KEYS.categories));

if (products.length !== 0 || categories.length !== 0) {
  throw new Error('online startup must not seed demonstration catalog data');
}

console.log('online catalog seed ok');
