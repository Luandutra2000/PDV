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

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const financial = await import('../src/services/financial-sync.service.js');

const calls = [];
let failTable = '';
let realtimeCallback = null;

const rows = {
  sales: [],
  sale_items: [],
  cash_movements: [],
  commands: [],
  command_items: [],
  cash_closings: []
};

const fakeClient = {
  from(table) {
    return {
      select() {
        return Promise.resolve({ data: rows[table] || [], error: null });
      },
      upsert(nextRows) {
        calls.push({ table, rows: nextRows });
        if (failTable === table) {
          return Promise.resolve({ error: new Error(`fail ${table}`) });
        }
        rows[table] = mergeRows(rows[table] || [], nextRows);
        return Promise.resolve({ error: null });
      },
      update(patch) {
        return {
          eq(column, value) {
            calls.push({ table, patch, column, value });
            rows[table] = (rows[table] || []).map((row) => (
              row[column] === value ? { ...row, ...patch } : row
            ));
            return Promise.resolve({ error: null });
          }
        };
      }
    };
  },
  channel() {
    return {
      on(eventName, filter, callback) {
        realtimeCallback = callback;
        return this;
      },
      subscribe() {
        return this;
      }
    };
  },
  removeChannel() {}
};

function mergeRows(currentRows, nextRows) {
  const byId = new Map(currentRows.map((row) => [row.id, row]));
  nextRows.forEach((row) => byId.set(row.id, row));
  return Array.from(byId.values());
}

financial.configureFinancialSyncForTests({ getClient: async () => fakeClient });

const sale = {
  id: 'sale-1',
  type: 'venda',
  status: 'ativa',
  comandaId: 'comanda-1',
  comandaNumber: 1,
  items: [{ productId: 'x-burger', name: 'X-Burger', quantity: 2, unitPrice: 16, total: 32 }],
  total: 32,
  paymentMethod: 'dinheiro',
  receivedAmount: 40,
  change: 8,
  createdAt: '2026-06-02T10:00:00.000Z'
};
const command = {
  id: 'comanda-1',
  number: 1,
  status: 'fechada',
  items: sale.items,
  total: 32,
  paymentMethod: 'dinheiro',
  receivedAmount: 40,
  change: 8,
  createdAt: '2026-06-02T09:00:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
  closedAt: '2026-06-02T10:00:00.000Z'
};

await financial.saveSaleToSupabase({ sale, command });
assert(calls.find((call) => call.table === 'commands'), 'sale save should write command');
assert(calls.find((call) => call.table === 'command_items'), 'sale save should write command items');
assert(calls.find((call) => call.table === 'sales'), 'sale save should write sale');
assert(calls.find((call) => call.table === 'sale_items'), 'sale save should write sale items');
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions))[0].id === 'sale-1', 'sale save should update transaction cache');

failTable = 'sale_items';
await financial.saveSaleToSupabase({ sale: { ...sale, id: 'sale-queued' }, command: { ...command, id: 'comanda-queued' } });
assert(financial.getFinancialSyncStatus().state === 'pending', 'failed composed sale should set pending status');
assert(JSON.parse(localStorage.getItem('pdv.syncQueue.financial')).length === 1, 'failed composed sale should queue operation');

failTable = '';
await financial.flushFinancialQueue();
assert(financial.getFinancialSyncStatus().pending === 0, 'flush should clear successful financial queue');

await financial.saveCashMovementToSupabase({
  id: 'entrada-1',
  type: 'entrada',
  amount: 20,
  category: 'troco',
  description: 'Troco inicial',
  userName: 'Luan',
  createdAt: '2026-06-02T11:00:00.000Z'
});
assert(calls.find((call) => call.table === 'cash_movements'), 'cash movement should write cash_movements');

await financial.hydrateFinancialData();
assert(Array.isArray(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions))), 'hydrate should write transaction cache');

await financial.startFinancialRealtime();
rows.cash_movements.push({
  id: 'entrada-2',
  type: 'entrada',
  status: 'ativa',
  amount: 10,
  category: 'troco',
  description: 'Realtime',
  user_name: 'Luan',
  created_at: '2026-06-02T12:00:00.000Z'
});
await realtimeCallback();
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions)).some((item) => item.id === 'entrada-2'), 'realtime should refresh financial cache');

console.log('financial sync service ok');
