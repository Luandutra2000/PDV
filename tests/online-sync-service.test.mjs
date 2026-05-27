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
  value: { onLine: true },
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
const storage = await import('../src/services/storage.service.js');
const sync = await import('../src/services/online-sync.service.js');

const calls = [];
const client = {
  from(table) {
    return {
      upsert(payload) {
        calls.push({ type: 'upsert', table, payload });
        return Promise.resolve({ error: null });
      },
      select() {
        return {
          order() {
            return {
              limit() {
                calls.push({ type: 'select', table });

                if (table === 'sales') {
                  return Promise.resolve({
                    data: [{
                      id: 'sale-remote',
                      payload: {
                        id: 'sale-remote',
                        type: 'venda',
                        status: 'ativa',
                        items: [],
                        total: 25,
                        paymentMethod: 'pix',
                        createdAt: '2026-05-27T10:00:00.000Z'
                      }
                    }],
                    error: null
                  });
                }

                return Promise.resolve({ data: [], error: null });
              }
            };
          }
        };
      }
    };
  }
};

sync.setOnlineSyncClientForTests(client);
storage.setItem(STORAGE_KEYS.syncQueue, [
  {
    id: 'sync-sale-1',
    type: SYNC_EVENTS.saleFinished,
    status: 'pending',
    payload: {
      id: 'sale-1',
      type: 'venda',
      status: 'ativa',
      comandaId: 'local-comanda-nao-existe-no-supabase',
      comandaNumber: 7,
      items: [{ productId: 'coxinha', name: 'Coxinha', quantity: 2, price: 7, total: 14 }],
      total: 14,
      paymentMethod: 'pix',
      receivedAmount: 14,
      change: 0,
      createdAt: '2026-05-27T09:00:00.000Z'
    }
  },
  {
    id: 'sync-cash-1',
    type: SYNC_EVENTS.cashMovementRegistered,
    status: 'pending',
    payload: {
      id: 'entrada-1',
      type: 'entrada',
      amount: 100,
      category: 'troco',
      description: 'Troco inicial',
      userName: 'Luan',
      createdAt: '2026-05-27T09:05:00.000Z'
    }
  }
]);

await sync.flushSyncQueue();

const saleUpsert = calls.find((call) => call.table === 'sales' && call.type === 'upsert');
assert(saleUpsert, 'sales should be pushed to Supabase');
assert(saleUpsert.payload.command_id === null, 'local comanda ids should not be sent as Supabase command foreign keys');
assert(saleUpsert.payload.command_number === 7, 'sale should keep the visible comanda number');
assert(calls.some((call) => call.table === 'cash_movements' && call.type === 'upsert'), 'cash movements should be pushed to Supabase');
assert(storage.getItem(STORAGE_KEYS.syncQueue, []).length === 0, 'successful sync should clear queue');

calls.length = 0;
storage.setItem(STORAGE_KEYS.syncQueue, [{
  id: 'sync-error-retry',
  type: SYNC_EVENTS.cashMovementRegistered,
  status: 'error',
  attempts: 12,
  payload: {
    id: 'entrada-retry',
    type: 'entrada',
    amount: 50,
    category: 'troco',
    description: 'Retry de evento antigo',
    createdAt: '2026-05-27T09:10:00.000Z'
  }
}]);

await sync.flushSyncQueue();

assert(calls.some((call) => call.table === 'cash_movements' && call.payload.id === 'entrada-retry'), 'old errored queue items should retry after fixes');
assert(storage.getItem(STORAGE_KEYS.syncQueue, []).length === 0, 'retried error item should clear queue after successful sync');

await sync.loadOnlineSnapshot();

const transactions = storage.getItem(STORAGE_KEYS.transactions, []);
assert(transactions.some((item) => item.id === 'sale-remote'), 'remote sales should hydrate local cache');

console.log('online sync service ok');
