import assert from 'node:assert/strict';
import test from 'node:test';

test('history store moves sales history out of localStorage', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };

  const { STORAGE_KEYS } = await import('../src/database/schema.js');
  const history = await import('../src/services/history-store.service.js');
  const storage = await import('../src/services/storage.service.js');

  store.set(STORAGE_KEYS.transactions, JSON.stringify([{ id: 'sale-old' }]));
  store.set(STORAGE_KEYS.products, JSON.stringify([{ id: 'p-1' }]));

  const persisted = new Map();
  const backend = {
    get: async (key) => (persisted.has(key) ? structuredClone(persisted.get(key)) : undefined),
    put: async (key, value) => persisted.set(key, structuredClone(value))
  };

  assert.equal(await history.initHistoryStore({ backend }), true);

  assert.deepEqual(storage.getItem(STORAGE_KEYS.transactions), [{ id: 'sale-old' }], 'legacy sales should be migrated');
  assert.equal(store.has(STORAGE_KEYS.transactions), false, 'migrated sales should leave localStorage');
  assert.deepEqual(persisted.get(STORAGE_KEYS.transactions), [{ id: 'sale-old' }]);
  assert.deepEqual(storage.getItem(STORAGE_KEYS.products), [{ id: 'p-1' }], 'small collections stay in localStorage');

  const readCopy = storage.getItem(STORAGE_KEYS.transactions);
  readCopy.push({ id: 'mutated' });
  assert.equal(storage.getItem(STORAGE_KEYS.transactions).length, 1, 'reads should return copies');

  storage.setItem(STORAGE_KEYS.transactions, [{ id: 'sale-new' }, { id: 'sale-old' }]);
  assert.equal(storage.getItem(STORAGE_KEYS.transactions).length, 2, 'writes should be visible immediately');
  await history.whenHistoryWritesSettled();
  assert.equal(persisted.get(STORAGE_KEYS.transactions).length, 2, 'writes should reach the backend');
  assert.equal(store.has(STORAGE_KEYS.transactions), false);

  assert.deepEqual(storage.getItem(STORAGE_KEYS.cashClosings, []), [], 'missing collections should use fallback');

  history.resetHistoryStoreForTests();
  await history.initHistoryStore({ backend });
  assert.equal(storage.getItem(STORAGE_KEYS.transactions).length, 2, 'data should survive a reload');
});
