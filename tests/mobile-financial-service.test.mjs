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

const assertRejects = async (callback, expectedMessage, message) => {
  try {
    await callback();
  } catch (error) {
    assert(
      error.message.includes(expectedMessage),
      `${message}: expected "${expectedMessage}", got "${error.message}"`
    );
    return error;
  }

  throw new Error(message);
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
      },
      update(patch) {
        return {
          eq(column, value) {
            calls.push({ table, patch, column, value });

            if (failWrites) {
              return Promise.resolve({ error: new Error('offline') });
            }

            rows[table] = (rows[table] || []).map((row) => (
              row[column] === value ? { ...row, ...patch } : row
            ));
            return Promise.resolve({ error: null });
          }
        };
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
assert(calls.some((call) => call.table === 'financial_transactions' && call.patch?.status === 'paid'), 'mobile pay should update Supabase transaction');
assert(
  JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.financialTransactions)).find((item) => item.id === bill.id).status === 'paid',
  'mobile finance should mark payable paid'
);

auth.createUser({
  name: 'Operador Mobile',
  username: 'mobile-op',
  password: 'mobile123',
  role: 'operador'
});

const deniedBill = await mobileFinance.createMobileFinancialTransaction({
  type: 'expense',
  description: 'Conta sem permissao',
  amount: 45,
  categoryId: 'fornecedor',
  paymentMethod: 'boleto',
  status: 'pending',
  dueDate: '2026-06-21'
});

auth.login({ username: 'mobile-op', password: 'mobile123' });

let callCount = calls.length;
await assertRejects(
  () => mobileFinance.createMobileFinancialTransaction({
    type: 'income',
    description: 'Entrada bloqueada',
    amount: 25,
    categoryId: 'aporte-dono',
    paymentMethod: 'dinheiro',
    status: 'paid'
  }),
  'Usuario sem permissao para esta acao.',
  'mobile finance create should require income permission'
);
assert(calls.length === callCount, 'denied mobile finance create should not write to Supabase');
assert(
  !JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.financialTransactions)).some((item) => item.description === 'Entrada bloqueada'),
  'denied mobile finance create should not update cache'
);

let auditLogs = JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.auditLogs));
assert(auditLogs[0]?.action === 'permission.denied', 'denied mobile finance create should record permission audit');
assert(auditLogs[0]?.entityId === 'financial.income.create', 'denied mobile finance create should audit income permission');

for (const type of ['saida', 'bill']) {
  callCount = calls.length;
  await assertRejects(
    () => mobileFinance.createMobileFinancialTransaction({
      type,
      description: `Saida bloqueada ${type}`,
      amount: 35,
      categoryId: 'fornecedor',
      paymentMethod: 'boleto',
      status: 'pending'
    }),
    'Usuario sem permissao para esta acao.',
    `mobile finance create should require expense permission for ${type}`
  );
  assert(calls.length === callCount, `denied mobile finance create ${type} should not write to Supabase`);

  auditLogs = JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.auditLogs));
  assert(auditLogs[0]?.entityId === 'financial.expense.create', `denied mobile finance create ${type} should audit expense permission`);
}

callCount = calls.length;
await assertRejects(
  () => mobileFinance.markMobileFinancialTransactionPaid(deniedBill.id, { paymentMethod: 'boleto' }),
  'Usuario sem permissao para esta acao.',
  'mobile finance pay should require bill pay permission'
);
assert(calls.length === callCount, 'denied mobile finance pay should not write to Supabase');
assert(
  JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.financialTransactions)).find((item) => item.id === deniedBill.id).status === 'pending',
  'denied mobile finance pay should leave bill pending'
);

auditLogs = JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.auditLogs));
assert(auditLogs[0]?.action === 'permission.denied', 'denied mobile finance pay should record permission audit');
assert(auditLogs[0]?.entityId === 'financial.bill.pay', 'denied mobile finance pay should audit bill pay permission');

auth.login({ username: 'admin', password: 'admin123' });

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
