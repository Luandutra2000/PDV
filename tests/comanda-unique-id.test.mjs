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

localStorage.setItem('pdv.activeComanda', JSON.stringify({
  id: 'comanda-local',
  number: 7,
  status: 'aberta',
  items: [{ productId: 'agua', name: 'Agua', quantity: 1, unitPrice: 4, total: 4 }]
}));
storage.ensureSeedData();
const migratedComanda = comandas.getActiveComanda();

storage.resetAppData();
const resetId = comandas.getActiveComanda().id;
const nextId = comandas.startNewComanda(2).id;

if (firstId === 'comanda-local' || resetId === 'comanda-local') {
  throw new Error('initial commands must not use a shared fixed id');
}

if (new Set([firstId, resetId, nextId]).size !== 3) {
  throw new Error('each command lifecycle must receive a unique id');
}

if (migratedComanda.id === 'comanda-local' || migratedComanda.number !== 7 || migratedComanda.items.length !== 1) {
  throw new Error('legacy active commands must receive a unique id without losing their contents');
}

console.log('comanda unique id ok');
