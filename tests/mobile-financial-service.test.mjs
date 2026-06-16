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

const storage = await import('../src/services/storage.service.js');
const auth = await import('../src/services/auth.service.js');
const schema = await import('../src/database/schema.js');
const sync = await import('../src/services/financial-sync.service.js');
const mobileFinance = await import('../src/services/mobile-financial.service.js');

storage.resetAppData();
auth.login({ username: 'admin', password: 'admin123' });

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
const calls = [];
let failWrites = false;

const fakeClient = {
  from(table) {
    return {
      select() {
        return Promise.resolve({ data: rows[table] || [], error: null });
      },
      upsert(nextRows) {
        calls.push({ table, rows: nextRows });

        if (failWrites) {
          return Promise.resolve({ error: new Error('offline') });
        }

        rows[table] = mergeRows(rows[table] || [], nextRows);
        return Promise.resolve({ error: null });
      }
    };
  }
};

function mergeRows(currentRows, nextRows) {
  const byId = new Map(currentRows.map((row) => [row.id, row]));
  nextRows.forEach((row) => byId.set(row.id, row));
  return Array.from(byId.values());
}

sync.configureFinancialSyncForTests({ getClient: async () => fakeClient });

const initial = mobileFinance.getMobileFinancialSummary();
assert(initial.cards.length === 6, 'finance summary should expose six cards');
assert(initial.categories.length > 0, 'finance summary should expose categories');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon'
};

await mobileFinance.createMobileFinancialTransaction({
  type: 'income',
  description: 'Aporte dono',
  amount: 50,
  categoryId: 'aporte-dono',
  paymentMethod: 'dinheiro',
  status: 'paid'
});
assert(calls.some((call) => call.table === 'financial_transactions'), 'mobile finance should write to Supabase');
assert(
  JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.financialTransactions)).some((item) => item.description === 'Aporte dono'),
  'mobile finance should update cache after online success'
);

const bill = await mobileFinance.createMobileFinancialTransaction({
  type: 'expense',
  description: 'Boleto fornecedor',
  amount: 120,
  categoryId: 'fornecedor',
  paymentMethod: 'boleto',
  status: 'pending',
  dueDate: '2026-06-20'
});
await mobileFinance.markMobileFinancialTransactionPaid(bill.id, { paymentMethod: 'boleto' });
assert(
  JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.financialTransactions)).find((item) => item.id === bill.id).status === 'paid',
  'mobile finance should mark payable paid'
);

failWrites = true;
let failed = false;

try {
  await mobileFinance.createMobileFinancialTransaction({
    type: 'expense',
    description: 'Falha online',
    amount: 10,
    categoryId: 'fornecedor'
  });
} catch (error) {
  failed = error.message.includes('Supabase') || error.message.includes('offline');
}

assert(failed, 'mobile finance should fail when Supabase write fails');
assert(
  !JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.financialTransactions)).some((item) => item.description === 'Falha online'),
  'failed online write should not remain in cache'
);

console.log('mobile financial service ok');
