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

const { createEntitySyncRepository } = await import('../src/services/repositories/entity-sync.repository.js?v=20260729-12');

let rows = [{ id: 'item-1', name: 'Item 1' }];
let shouldFailSelect = false;
let shouldFailUpsert = false;
let shouldFailDelete = false;
let failedUpsertIds = new Set();
let upsertedRows = [];
let realtimeCallback = null;
let removedChannels = [];

const fakeClient = {
  from(tableName) {
    assert(tableName === 'items', 'repository should use adapter table');
    return {
      select() {
        return Promise.resolve(shouldFailSelect
          ? { data: null, error: new Error('offline') }
          : { data: rows, error: null });
      },
      upsert(nextRows) {
        upsertedRows = nextRows;
        if (shouldFailUpsert || nextRows.some((row) => failedUpsertIds.has(row.id))) {
          return Promise.resolve({ error: new Error('write offline') });
        }
        for (const nextRow of nextRows) {
          const existingIndex = rows.findIndex((row) => row.id === nextRow.id);
          if (existingIndex >= 0) {
            rows[existingIndex] = { ...rows[existingIndex], ...nextRow };
          } else {
            rows.push(nextRow);
          }
        }
        return Promise.resolve({ error: null });
      },
      delete() {
        return {
          eq(column, value) {
            if (shouldFailDelete) {
              return Promise.resolve({ error: new Error('delete offline') });
            }
            rows = rows.filter((row) => row[column] !== value);
            return Promise.resolve({ error: null });
          }
        };
      }
    };
  },
  channel() {
    const nextChannel = {
      on(eventName, options, callback) {
        if (eventName === 'postgres_changes') {
          realtimeCallback = callback;
        }
        return this;
      },
      subscribe() {
        return this;
      }
    };
    return nextChannel;
  },
  removeChannel(channel) {
    removedChannels.push(channel);
  }
};

const adapter = {
  table: 'items',
  cacheKey: 'test.items',
  queueKey: 'test.items.queue',
  select: 'id,name',
  fromRow(row) {
    return { id: row.id, name: row.name };
  },
  toRow(item) {
    return { id: item.id, name: item.name };
  }
};

const repository = createEntitySyncRepository({
  adapter,
  getClient: async () => fakeClient,
  emitChange: () => {}
});

const listed = await repository.list();
assert(listed.length === 1, 'list should return Supabase rows');
assert(JSON.parse(localStorage.getItem('test.items')).length === 1, 'list should update cache');
assert(repository.getSyncStatus().state === 'synced', 'successful list should mark synced');

await repository.remove('item-1');
assert(!JSON.parse(localStorage.getItem('test.items')).some((item) => item.id === 'item-1'), 'successful remove should delete item from cache');
assert(repository.getSyncStatus().state === 'synced', 'successful remove should mark synced when queue is empty');
assert(repository.getSyncStatus().pending === 0, 'successful remove should keep pending count empty');

rows = [{ id: 'item-1', name: 'Item 1' }];
await repository.list();

shouldFailSelect = true;
const cached = await repository.list();
assert(cached.length === 1, 'failed list should return cache');
assert(repository.getSyncStatus().state === 'cache', 'failed list should mark cache state');

shouldFailSelect = false;
shouldFailDelete = true;
await repository.remove('item-1');
const failedDeleteQueue = JSON.parse(localStorage.getItem('test.items.queue'));
assert(failedDeleteQueue.length === 1, 'failed remove should queue delete operation');
assert(failedDeleteQueue[0].action === 'delete', 'failed remove should queue delete action');
assert(failedDeleteQueue[0].id === 'item-1', 'failed remove should queue deleted id');
assert(failedDeleteQueue[0].createdAt, 'failed remove should queue createdAt timestamp');
assert(!JSON.parse(localStorage.getItem('test.items')).some((item) => item.id === 'item-1'), 'failed remove should remove item from cache');
assert(repository.getSyncStatus().state === 'pending', 'failed remove should set pending status');
assert(repository.getSyncStatus().pending === 1, 'failed remove should update pending count');

rows = [{ id: 'item-1', name: 'Item 1' }];
shouldFailDelete = false;
await repository.list();
assert(!JSON.parse(localStorage.getItem('test.items')).some((item) => item.id === 'item-1'), 'queued delete should remain absent after list overlay');

localStorage.removeItem('test.items.queue');

shouldFailUpsert = true;
const queuedItem = await repository.save({ id: 'item-2', name: 'Item 2' });
assert(queuedItem.id === 'item-2', 'failed save should return item');
assert(JSON.parse(localStorage.getItem('test.items.queue')).length === 1, 'failed save should queue operation');
assert(repository.getSyncStatus().pending === 1, 'failed save should update pending count');
await repository.save({ id: 'item-2', name: 'Item 2 atualizado' });
const compactedItemQueue = JSON.parse(localStorage.getItem('test.items.queue'));
assert(compactedItemQueue.length === 1, 'repeated offline save should keep one queued operation per entity');
assert(compactedItemQueue[0].item.name === 'Item 2 atualizado', 'latest offline edit should replace older queued edit');

shouldFailSelect = false;
shouldFailUpsert = false;
shouldFailDelete = false;
await repository.flushQueue();
assert(upsertedRows[0].id === 'item-2', 'flush should upsert queued row');
assert(upsertedRows[0].name === 'Item 2 atualizado', 'flush should send the latest queued entity state');
assert(JSON.parse(localStorage.getItem('test.items.queue')).length === 0, 'flush should clear queue');
assert(repository.getSyncStatus().state === 'synced', 'flush success should mark synced');

shouldFailUpsert = true;
await repository.save({ id: 'item-3', name: 'Item 3' });
await repository.save({ id: 'item-4', name: 'Item 4' });

shouldFailUpsert = false;
failedUpsertIds = new Set(['item-4']);
await repository.flushQueue();

const remainingQueue = JSON.parse(localStorage.getItem('test.items.queue'));
assert(remainingQueue.length === 1, 'partial flush should keep failed operation queued');
assert(remainingQueue[0].item.id === 'item-4', 'partial flush should keep the failed item queued');
const partialFlushCache = JSON.parse(localStorage.getItem('test.items'));
const pendingItem = partialFlushCache.find((item) => item.id === 'item-4');
assert(pendingItem.syncPending === true, 'partial flush should keep failed upsert in cache as syncPending');
assert(repository.getSyncStatus().state === 'pending', 'partial flush should keep pending status');
assert(repository.getSyncStatus().pending === 1, 'partial flush should keep pending count');

localStorage.clear();
rows = [{ id: 'server-1', name: 'Server Item' }];
failedUpsertIds = new Set();
localStorage.setItem('test.items.queue', JSON.stringify([
  { action: 'upsert', item: { id: 'local-1', name: 'Local Item' }, createdAt: '2026-06-02T00:00:00.000Z' }
]));

const repositoryWithPendingQueue = createEntitySyncRepository({
  adapter,
  getClient: async () => fakeClient,
  emitChange: () => {}
});

const listedWithPending = await repositoryWithPendingQueue.list();
const listedPendingItem = listedWithPending.find((item) => item.id === 'local-1');
const cacheWithPending = JSON.parse(localStorage.getItem('test.items'));
const cachePendingItem = cacheWithPending.find((item) => item.id === 'local-1');
assert(listedPendingItem.syncPending === true, 'list should return queued upsert as syncPending');
assert(cachePendingItem.syncPending === true, 'list should keep queued upsert in cache as syncPending');
assert(repositoryWithPendingQueue.getSyncStatus().state === 'pending', 'list with queued operations should keep pending status');
assert(repositoryWithPendingQueue.getSyncStatus().pending === 1, 'list with queued operations should keep pending count');

localStorage.clear();
localStorage.setItem('test.items.queue', JSON.stringify([
  { action: 'upsert', item: { id: 'null-client-item', name: 'Null Client Item' }, createdAt: '2026-06-02T00:00:00.000Z' }
]));

const nullClientRepository = createEntitySyncRepository({
  adapter,
  getClient: async () => null,
  emitChange: () => {}
});

await nullClientRepository.flushQueue();
assert(JSON.parse(localStorage.getItem('test.items.queue')).length === 1, 'null client flush should keep queue unchanged');
assert(nullClientRepository.getSyncStatus().state === 'pending', 'null client flush should keep pending status');
assert(nullClientRepository.getSyncStatus().pending === 1, 'null client flush should keep pending count');
assert(nullClientRepository.getSyncStatus().error, 'null client flush should set error message');

const throwingClientRepository = createEntitySyncRepository({
  adapter,
  getClient: async () => {
    throw new Error('client unavailable');
  },
  emitChange: () => {}
});

await throwingClientRepository.flushQueue();
assert(JSON.parse(localStorage.getItem('test.items.queue')).length === 1, 'throwing client flush should keep queue unchanged');
assert(throwingClientRepository.getSyncStatus().state === 'pending', 'throwing client flush should keep pending status');
assert(throwingClientRepository.getSyncStatus().pending === 1, 'throwing client flush should keep pending count');
assert(throwingClientRepository.getSyncStatus().error, 'throwing client flush should set error message');

localStorage.clear();
rows = [{ id: 'server-before-refresh-failure', name: 'Server Before Refresh Failure' }];
shouldFailSelect = false;
failedUpsertIds = new Set();
localStorage.setItem('test.items.queue', JSON.stringify([
  { action: 'upsert', item: { id: 'flush-success-refresh-fail', name: 'Flush Success Refresh Fail' }, createdAt: '2026-06-02T00:00:00.000Z' }
]));

const flushRefreshFailureRepository = createEntitySyncRepository({
  adapter,
  getClient: async () => fakeClient,
  emitChange: () => {}
});

shouldFailSelect = true;
await flushRefreshFailureRepository.flushQueue();
assert(JSON.parse(localStorage.getItem('test.items.queue')).length === 0, 'flush with refresh failure should clear successful operations');
assert(flushRefreshFailureRepository.getSyncStatus().state === 'synced', 'flush with all operations cleared should finish synced even if refresh fails');
assert(flushRefreshFailureRepository.getSyncStatus().pending === 0, 'flush with all operations cleared should finish with no pending count');

localStorage.clear();
rows = [{ id: 'flush-cache-normalize-server', name: 'Flush Cache Normalize Server' }];
shouldFailSelect = false;
shouldFailUpsert = true;
failedUpsertIds = new Set();

const flushCacheNormalizeRepository = createEntitySyncRepository({
  adapter,
  getClient: async () => fakeClient,
  emitChange: () => {}
});

await flushCacheNormalizeRepository.save({ id: 'flush-cache-normalize', name: 'Flush Cache Normalize' });
assert(
  JSON.parse(localStorage.getItem('test.items')).find((item) => item.id === 'flush-cache-normalize').syncPending === true,
  'failed save should create syncPending cache item before flush'
);

shouldFailUpsert = false;
shouldFailSelect = true;
await flushCacheNormalizeRepository.flushQueue();

const normalizedFlushCache = JSON.parse(localStorage.getItem('test.items'));
const normalizedFlushItem = normalizedFlushCache.find((item) => item.id === 'flush-cache-normalize');
assert(JSON.parse(localStorage.getItem('test.items.queue')).length === 0, 'successful flush with failed refresh should clear queue');
assert(normalizedFlushItem && normalizedFlushItem.syncPending !== true, 'successful flush with failed refresh should clear syncPending cache flag');
assert(flushCacheNormalizeRepository.getSyncStatus().state === 'synced', 'successful flush with failed refresh should finish synced');
assert(flushCacheNormalizeRepository.getSyncStatus().pending === 0, 'successful flush with failed refresh should finish with zero pending');

localStorage.clear();
localStorage.setItem('test.items', '{invalid json');
shouldFailSelect = true;

const invalidJsonRepository = createEntitySyncRepository({
  adapter,
  getClient: async () => fakeClient,
  emitChange: () => {}
});

const originalWarn = console.warn;
console.warn = () => {};
const invalidJsonFallback = await invalidJsonRepository.list();
console.warn = originalWarn;
assert(Array.isArray(invalidJsonFallback), 'invalid cache JSON list fallback should be an array');
assert(invalidJsonFallback.length === 0, 'invalid cache JSON list fallback should be empty');
assert(invalidJsonRepository.getSyncStatus().state === 'error', 'invalid cache JSON failed list should mark error state');

localStorage.clear();
rows = [{ id: 'realtime-before', name: 'Realtime Before' }];
shouldFailSelect = false;
realtimeCallback = null;
removedChannels = [];
const realtimeEvents = [];

const subscribeRepository = createEntitySyncRepository({
  adapter,
  getClient: async () => fakeClient,
  emitChange: (event) => {
    realtimeEvents.push(event);
  }
});

const subscribedChannel = await subscribeRepository.subscribe();
assert(subscribedChannel, 'subscribe should resolve with channel');
assert(typeof realtimeCallback === 'function', 'subscribe should register postgres changes callback');

rows = [{ id: 'realtime-after', name: 'Realtime After' }];
await realtimeCallback();
const realtimeCache = JSON.parse(localStorage.getItem('test.items'));
assert(realtimeCache.some((item) => item.id === 'realtime-after'), 'realtime callback should refresh cache');
assert(realtimeEvents.some((event) => event.type === 'realtime'), 'realtime callback should emit realtime event');

await subscribeRepository.unsubscribe();
assert(removedChannels.length === 1, 'unsubscribe should remove subscribed channel');

let delayedClientResolve;
const delayedClientPromise = new Promise((resolve) => {
  delayedClientResolve = resolve;
});
removedChannels = [];

const delayedSubscribeRepository = createEntitySyncRepository({
  adapter,
  getClient: () => delayedClientPromise,
  emitChange: () => {}
});

const delayedSubscribePromise = delayedSubscribeRepository.subscribe();
const delayedUnsubscribePromise = delayedSubscribeRepository.unsubscribe();
delayedClientResolve(fakeClient);
await delayedSubscribePromise;
await delayedUnsubscribePromise;
assert(removedChannels.length === 1, 'unsubscribe should wait for pending subscription and remove channel');

const nullSubscribeRepository = createEntitySyncRepository({
  adapter,
  getClient: async () => null,
  emitChange: () => {}
});

const nullSubscribeChannel = await nullSubscribeRepository.subscribe();
assert(nullSubscribeChannel === null, 'subscribe with null client should resolve null');
await nullSubscribeRepository.unsubscribe();

const rejectedSubscribeRepository = createEntitySyncRepository({
  adapter,
  getClient: async () => {
    throw new Error('subscribe client unavailable');
  },
  emitChange: () => {}
});

const rejectedSubscribeChannel = await rejectedSubscribeRepository.subscribe();
assert(rejectedSubscribeChannel === null, 'subscribe with rejected client should resolve null');
await rejectedSubscribeRepository.unsubscribe();

console.log('entity sync repository ok');
