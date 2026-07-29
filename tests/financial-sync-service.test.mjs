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
let delayTable = '';
let realtimeCallback = null;

const rows = {
  sales: [],
  sale_items: [],
  cash_movements: [],
  commands: [],
  command_items: [],
  cash_closings: [],
  financial_categories: [],
  financial_transactions: []
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
        if (delayTable === table) {
          return new Promise((resolve) => {
            setTimeout(() => {
              rows[table] = mergeRows(rows[table] || [], nextRows);
              resolve({ error: null });
            }, 120);
          });
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
      },
      delete() {
        return {
          eq(column, value) {
            calls.push({ table, delete: true, column, value });
            rows[table] = (rows[table] || []).filter((row) => row[column] !== value);
            return Promise.resolve({ error: null });
          },
          in(column, values) {
            calls.push({ table, delete: true, column, values });
            rows[table] = (rows[table] || []).filter((row) => !values.includes(row[column]));
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

function countRowsById(table, id) {
  return rows[table].filter((row) => row.id === id).length;
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
await financial.saveSaleToSupabase({
  sale: { ...sale, id: 'sale-queued', comandaId: 'comanda-queued', createdAt: '2026-06-02T10:30:00.000Z' },
  command: { ...command, id: 'comanda-queued', closedAt: '2026-06-02T10:30:00.000Z', updatedAt: '2026-06-02T10:30:00.000Z' }
});
assert(financial.getFinancialSyncStatus().state === 'pending', 'failed composed sale should set pending status');
assert(JSON.parse(localStorage.getItem('pdv.syncQueue.financial')).length === 1, 'failed composed sale should queue operation');
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions))[0].id === 'sale-queued', 'pending sale should be newest-first in transaction cache');
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.closedComandas))[0].id === 'comanda-queued', 'pending command should be newest-first in command cache');
assert(countRowsById('sales', 'sale-queued') === 0, 'failed composed sale should clean partial sale rows');
assert(countRowsById('commands', 'comanda-queued') === 0, 'failed composed sale should clean partial command rows');
await financial.saveSaleToSupabase({
  sale: { ...sale, id: 'sale-queued', comandaId: 'comanda-queued', total: 35, createdAt: '2026-06-02T10:30:00.000Z' },
  command: { ...command, id: 'comanda-queued', total: 35, closedAt: '2026-06-02T10:30:00.000Z', updatedAt: '2026-06-02T10:31:00.000Z' }
});
const compactedSaleQueue = JSON.parse(localStorage.getItem('pdv.syncQueue.financial'));
assert(compactedSaleQueue.length === 1, 'repeated offline sale save should keep one queue entry per sale id');
assert(compactedSaleQueue[0].sale.total === 35, 'repeated offline sale save should keep the latest state');

failTable = '';
await financial.flushFinancialQueue();
assert(financial.getFinancialSyncStatus().pending === 0, 'flush should clear successful financial queue');
assert(countRowsById('commands', 'comanda-queued') === 1, 'flush retry should keep one command row after partial failure');
assert(countRowsById('command_items', rows.command_items.find((row) => row.command_id === 'comanda-queued').id) === 1, 'flush retry should keep one command item row after partial failure');
assert(countRowsById('sales', 'sale-queued') === 1, 'flush retry should keep one sale row after partial failure');
assert(countRowsById('sale_items', 'sale-queued-x-burger-0') === 1, 'flush retry should keep one sale item row after partial failure');
assert(rows.sales.find((row) => row.id === 'sale-queued').total === 35, 'flush should persist the latest compacted sale state');

delayTable = 'sale_items';
const inFlightSalePromise = financial.saveSaleToSupabase({
  sale: { ...sale, id: 'sale-in-flight', comandaId: 'comanda-in-flight', createdAt: '2026-06-02T10:45:00.000Z' },
  command: { ...command, id: 'comanda-in-flight', closedAt: '2026-06-02T10:45:00.000Z', updatedAt: '2026-06-02T10:45:00.000Z' }
});
await financial.hydrateFinancialData({ includePending: true });
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions)).some((item) => item.id === 'sale-in-flight'), 'hydrate should keep in-flight sale visible while Supabase write finishes');
await inFlightSalePromise;
delayTable = '';

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
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions))[0].id === 'entrada-1', 'new cash movement should be newest-first in transaction cache');

await financial.hydrateFinancialData();
assert(Array.isArray(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions))), 'hydrate should write transaction cache');
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions))[0].id === 'entrada-1', 'hydrate should sort transactions newest-first');
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.closedComandas)).some((item) => item.id === 'comanda-queued'), 'hydrate should keep closed comandas from Supabase');
assert(calls.find((call) => call.table === 'financial_categories') || Array.isArray(JSON.parse(localStorage.getItem(STORAGE_KEYS.financialCategories))), 'financial categories should hydrate');
assert(calls.find((call) => call.table === 'financial_transactions') || Array.isArray(JSON.parse(localStorage.getItem(STORAGE_KEYS.financialTransactions))), 'financial transactions should hydrate');

await financial.saveFinancialTransactionToSupabase({
  id: 'fin-1',
  type: 'expense',
  description: 'Boleto fornecedor',
  amount: 220,
  categoryId: 'fornecedor',
  paymentMethod: 'boleto',
  status: 'pending',
  transactionDate: '2026-06-10',
  dueDate: '2026-06-15',
  origin: 'finance',
  movesCashSession: false,
  createdAt: '2026-06-10T10:00:00.000Z',
  updatedAt: '2026-06-10T10:00:00.000Z'
});
assert(calls.find((call) => call.table === 'financial_transactions'), 'financial transaction should write financial_transactions');

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
realtimeCallback();
await new Promise((resolve) => {
  setTimeout(resolve, 700);
});
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions)).some((item) => item.id === 'entrada-2'), 'realtime should refresh financial cache');
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions))[0].id === 'entrada-2', 'realtime refresh should keep newest transaction first');

localStorage.setItem(STORAGE_KEYS.financialSyncQueue, JSON.stringify([{
  action: 'saveCashMovement',
  movement: {
    id: 'local-only-entrada',
    type: 'entrada',
    amount: 99,
    category: 'teste',
    description: 'Somente local',
    userName: 'Luan',
    createdAt: '2026-06-02T13:00:00.000Z'
  },
  createdAt: '2026-06-02T13:00:00.000Z'
}]));
await financial.hydrateFinancialData();
assert(
  !JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions)).some((item) => item.id === 'local-only-entrada'),
  'online hydrate should not display local-only queued movements as synced history'
);

await financial.clearFinancialHistoryInSupabase({ period: 'all' });
assert(rows.sales.length === 0, 'remote history clear should delete sales');
assert(rows.sale_items.length === 0, 'remote history clear should delete sale items');
assert(rows.commands.length === 0, 'remote history clear should delete commands');
assert(rows.command_items.length === 0, 'remote history clear should delete command items');
assert(rows.cash_movements.length === 0, 'remote history clear should delete cash movements');

console.log('financial sync service ok');
