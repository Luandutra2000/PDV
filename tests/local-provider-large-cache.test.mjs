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
  if (!condition) throw new Error(message);
};

const { createLocalProvider } = await import('../src/services/providers/local.provider.js?v=20260804-04');
const provider = createLocalProvider();
const largeCollection = Array.from({ length: 20000 }, (_, index) => ({
  id: `large-${index}`,
  description: `Registro de carga ${index} ${'x'.repeat(100)}`
}));

provider.write('pdv.large.test', largeCollection);

assert(provider.read('pdv.large.test', []).length === 20000, 'large collections should remain complete in the shared memory cache');
assert(JSON.parse(localStorage.getItem('pdv.large.test')).length === 1000, 'large persisted arrays should be capped to protect the browser storage quota');

provider.remove('pdv.large.test');
assert(provider.read('pdv.large.test', []).length === 0, 'removing a key should clear both memory and local persistence');

console.log('local provider large cache ok');
