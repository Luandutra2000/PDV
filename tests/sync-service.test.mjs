import assert from 'node:assert/strict';
import test from 'node:test';

test('sync service queues events with unique identifiers', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    }
  };

  const { STORAGE_KEYS, SYNC_EVENTS } = await import('../src/database/schema.js');
  const { emit } = await import('../src/services/event-bus.service.js');
  const sync = await import('../src/services/sync.service.js');

  sync.initSyncService();
  emit(SYNC_EVENTS.saleFinished, { id: 'sale-1' });

  const queue = sync.getSyncQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].type, SYNC_EVENTS.saleFinished);
  assert.equal(queue[0].payload.id, 'sale-1');
  assert.match(queue[0].id, new RegExp(`^${SYNC_EVENTS.saleFinished}-\\d+-[a-f0-9]+$`));
  assert.equal(JSON.parse(store.get(STORAGE_KEYS.syncQueue)).length, 1);
});
