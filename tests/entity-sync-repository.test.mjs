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

const { createEntitySyncRepository } = await import('../src/services/repositories/entity-sync.repository.js');

let rows = [{ id: 'item-1', name: 'Item 1' }];
let shouldFailSelect = false;
let shouldFailUpsert = false;
let failedUpsertIds = new Set();
let upsertedRows = [];

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
        rows = nextRows;
        return Promise.resolve({ error: null });
      },
      delete() {
        return {
          eq(column, value) {
            rows = rows.filter((row) => row[column] !== value);
            return Promise.resolve({ error: null });
          }
        };
      }
    };
  },
  channel() {
    return {
      on() {
        return this;
      },
      subscribe() {
        return this;
      }
    };
  },
  removeChannel() {}
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

shouldFailSelect = true;
const cached = await repository.list();
assert(cached.length === 1, 'failed list should return cache');
assert(repository.getSyncStatus().state === 'cache', 'failed list should mark cache state');

shouldFailUpsert = true;
const queuedItem = await repository.save({ id: 'item-2', name: 'Item 2' });
assert(queuedItem.id === 'item-2', 'failed save should return item');
assert(JSON.parse(localStorage.getItem('test.items.queue')).length === 1, 'failed save should queue operation');
assert(repository.getSyncStatus().pending === 1, 'failed save should update pending count');

shouldFailSelect = false;
shouldFailUpsert = false;
await repository.flushQueue();
assert(upsertedRows[0].id === 'item-2', 'flush should upsert queued row');
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
assert(repository.getSyncStatus().state === 'pending', 'partial flush should keep pending status');
assert(repository.getSyncStatus().pending === 1, 'partial flush should keep pending count');

console.log('entity sync repository ok');
