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

const storage = await import('../src/services/storage.service.js');
const comandas = await import('../src/services/comanda.service.js');

storage.ensureSeedData();
const firstId = comandas.getActiveComanda().id;

storage.resetAppData();
const resetId = comandas.getActiveComanda().id;
const nextId = comandas.startNewComanda(2).id;

if (firstId === 'comanda-local' || resetId === 'comanda-local') {
  throw new Error('initial commands must not use a shared fixed id');
}

if (new Set([firstId, resetId, nextId]).size !== 3) {
  throw new Error('each command lifecycle must receive a unique id');
}

console.log('comanda unique id ok');
