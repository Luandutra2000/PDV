import assert from 'node:assert/strict';
import test from 'node:test';

test('sync queue stays small during a busy day', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value))
  };

  const { STORAGE_KEYS, SYNC_EVENTS } = await import('../src/database/schema.js');
  const { emit } = await import('../src/services/event-bus.service.js');

  const oldQueue = Array.from({ length: 5000 }, (_, index) => ({
    id: `old-${index}`,
    type: SYNC_EVENTS.comandaItemAdded,
    payload: { comanda: { items: [] } },
    status: 'pending'
  }));
  store.set(STORAGE_KEYS.syncQueue, JSON.stringify(oldQueue));

  const sync = await import('../src/services/sync.service.js');
  sync.initSyncService();

  assert.ok(sync.getSyncQueue().length <= sync.SYNC_QUEUE_LIMIT, 'existing oversized queue should be trimmed on start');

  const bigComanda = { items: Array.from({ length: 20 }, (_, index) => ({ productId: `p-${index}`, name: 'Produto', quantity: 1 })) };

  for (let index = 0; index < 1000; index += 1) {
    emit(SYNC_EVENTS.comandaItemAdded, { comandaId: 'c-1', productId: 'p-1', comanda: bigComanda });
  }

  const queue = sync.getSyncQueue();
  assert.ok(queue.length <= sync.SYNC_QUEUE_LIMIT, 'queue should be capped');
  assert.equal(queue.at(-1).payload.comanda, undefined, 'full comanda snapshots should not be stored');
  assert.equal(queue.at(-1).payload.productId, 'p-1');
  assert.ok(store.get(STORAGE_KEYS.syncQueue).length < 100_000, 'queue should stay under 100 KB');
});

test('storage write frees the sync queue when the browser is full', async () => {
  const { STORAGE_KEYS } = await import('../src/database/schema.js');
  const store = new Map();
  let limit = 50;
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem(key, value) {
      const used = [...store.entries()].filter(([k]) => k !== key).reduce((total, [, v]) => total + v.length, 0);

      if (used + String(value).length > limit) {
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      }

      store.set(key, String(value));
    },
    removeItem: (key) => store.delete(key)
  };

  store.set(STORAGE_KEYS.syncQueue, 'x'.repeat(45));
  const storage = await import('../src/services/storage.service.js');

  storage.setItem(STORAGE_KEYS.transactions, [{ id: 'sale-1' }]);

  assert.deepEqual(storage.getItem(STORAGE_KEYS.transactions), [{ id: 'sale-1' }]);
  assert.deepEqual(storage.getItem(STORAGE_KEYS.syncQueue), []);

  limit = 5;
  assert.throws(() => storage.setItem(STORAGE_KEYS.transactions, [{ id: 'sale-2' }]), /armazenamento/i);
});
