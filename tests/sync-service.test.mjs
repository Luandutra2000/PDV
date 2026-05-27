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

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: false },
  configurable: true
});
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { STORAGE_KEYS, SYNC_EVENTS } = await import('../src/database/schema.js');
const { emit } = await import('../src/services/event-bus.service.js');
const storage = await import('../src/services/storage.service.js');
const syncService = await import('../src/services/sync.service.js');

syncService.initSyncService();
emit(SYNC_EVENTS.comandaItemAdded, { id: 'local-comanda-event' });
emit(SYNC_EVENTS.saleFinished, { id: 'sale-sync-event' });

const queue = storage.getItem(STORAGE_KEYS.syncQueue, []);
assert(queue.length === 1, 'sync service should queue only persistent events');
assert(queue[0].type === SYNC_EVENTS.saleFinished, 'sync service should queue sales');

console.log('sync service ok');
