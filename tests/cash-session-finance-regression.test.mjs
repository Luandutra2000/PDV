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

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const finance = await import('../src/services/financial.service.js?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');
const crm = await import('../src/services/crm-dashboard.service.js?v=20260804-06');
const closing = await import('../src/services/cash-closing.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');

seedTestAdmin(storage, STORAGE_KEYS);
storage.ensureSeedData();

finance.createFinancialTransaction({
  id: 'finance-cash-entry',
  type: 'income',
  amount: 7,
  categoryId: 'reforco-caixa',
  description: 'Aporte de teste no caixa',
  status: 'paid',
  movesCashSession: true,
  transactionDate: finance.getLocalDateKey()
});

const cashTransactions = transactions.getCashSessionTransactions();
if (!cashTransactions.some((transaction) => transaction.id === 'finance-cash-entry')) {
  throw new Error('financial entries marked for cash must appear in the cash session');
}

const period = crm.createPeriodFilter('today');
const crmSummary = crm.getCrmSummary(period);
if (crmSummary.entriesTotal !== 7) {
  throw new Error(`CRM should include linked finance entry, got ${crmSummary.entriesTotal}`);
}

const closingSummary = closing.buildClosingSummary({ countedCash: 7 });
if (closingSummary.totals.entries !== 7 || closingSummary.payments.expectedCash !== 7) {
  throw new Error('cash closing should include linked finance entry exactly once');
}

console.log('cash session finance regression ok');
