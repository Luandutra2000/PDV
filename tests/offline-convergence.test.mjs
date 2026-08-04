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

const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-04');
const financial = await import('../src/services/financial-sync.service.js?v=20260804-04');

let online = false;
let remoteMovement = null;
let upsertCount = 0;
let cancelCount = 0;

const client = {
  from(table) {
    assert(table === 'cash_movements', 'offline convergence should touch only cash movements');
    return {
      upsert(rows) {
        if (!online) {
          return Promise.resolve({ error: new Error('offline') });
        }
        upsertCount += 1;
        remoteMovement = { ...(remoteMovement || {}), ...rows[0] };
        return Promise.resolve({ error: null });
      },
      update(patch) {
        return {
          eq(column, id) {
            if (!online) {
              return Promise.resolve({ error: new Error('offline') });
            }
            cancelCount += 1;
            if (remoteMovement?.[column] === id) {
              remoteMovement = { ...remoteMovement, ...patch };
            }
            return Promise.resolve({ error: null });
          }
        };
      }
    };
  }
};

financial.configureFinancialSyncForTests({ getClient: async () => client });

const movement = {
  id: 'offline-movement-1',
  type: 'entrada',
  status: 'ativa',
  amount: 100,
  category: 'abertura-caixa',
  description: 'Abertura offline',
  userName: 'QA Caixa',
  createdAt: '2026-07-29T10:00:00.000Z'
};

await financial.saveCashMovementToSupabase(movement);
await financial.saveCashMovementToSupabase({
  ...movement,
  amount: 120,
  description: 'Abertura offline corrigida'
});
await financial.cancelCashMovementInSupabase({
  movementId: movement.id,
  canceledAt: '2026-07-29T10:05:00.000Z'
});
await financial.cancelCashMovementInSupabase({
  movementId: movement.id,
  canceledAt: '2026-07-29T10:06:00.000Z'
});

const offlineQueue = JSON.parse(localStorage.getItem(STORAGE_KEYS.financialSyncQueue));
assert(offlineQueue.length === 2, 'queue should contain one save and one cancellation for the same entity');
assert(offlineQueue[0].action === 'saveCashMovement', 'save should remain before cancellation');
assert(offlineQueue[0].movement.amount === 120, 'latest offline state should replace the older save');
assert(offlineQueue[1].action === 'cancelCashMovement', 'latest cancellation should remain last');
assert(offlineQueue[1].canceledAt === '2026-07-29T10:06:00.000Z', 'latest cancellation timestamp should win');

online = true;
await financial.flushFinancialQueue();

assert(financial.getFinancialSyncStatus().pending === 0, 'queue should clear after reconnection');
assert(upsertCount === 1, 'reconnection should upsert the movement once');
assert(cancelCount === 1, 'reconnection should cancel the movement once');
assert(remoteMovement.amount === 120, 'remote state should receive latest offline value');
assert(remoteMovement.status === 'cancelada', 'remote state should converge to canceled');
assert(remoteMovement.canceled_at === '2026-07-29T10:06:00.000Z', 'remote state should keep latest cancellation time');

const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions));
assert(cached.length === 1, 'local cache should contain one movement');
assert(cached[0].status === 'cancelada', 'local cache should converge to canceled state');
assert(cached[0].syncPending !== true, 'local cache should clear pending marker');

financial.configureFinancialSyncForTests();

console.log('offline convergence ok');
