import assert from 'node:assert/strict';

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

globalThis.document = {
  createElement() {
    return { innerHTML: '', querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  }
};

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const { initDespesasModule, renderFinanceiroMarkup } = await import('../src/modules/despesas/despesas.module.js?v=20260804-06');
const { getLocalDateKey } = await import('../src/services/financial.service.js?v=20260804-06');

seedTestAdmin(storage, STORAGE_KEYS);

const html = renderFinanceiroMarkup({
  summary: {
    entriesTotal: 420,
    outputsTotal: 185,
    balance: 235,
    payablesCount: 3,
    paidBillsCount: 8,
    overdueCount: 1
  },
  categories: [{ id: 'reforco-caixa', name: 'Reforco de caixa', type: 'income' }],
  transactions: [{
    id: 'fin-1',
    type: 'expense',
    description: 'Boleto fornecedor',
    amount: 220,
    categoryId: 'fornecedor',
    status: 'pending',
    transactionDate: '2026-06-10',
    dueDate: '2026-06-15'
  }],
  payables: {
    pending: [],
    overdue: [{
      id: 'fin-2',
      description: 'Energia',
      amount: 320,
      status: 'overdue',
      transactionDate: '2026-06-10',
      dueDate: '2026-06-09',
      notes: 'Conta de energia da lanchonete.'
    }],
    upcoming: []
  },
  crm: {
    outputsByCategory: { fornecedor: 220 },
    entriesByCategory: { 'reforco-caixa': 100 },
    spendingByPaymentMethod: { boleto: 220 },
    pendingByCategory: { fornecedor: 220 }
  },
  modal: { type: 'bill' }
});

assert(html.includes('Financeiro'));
assert(html.includes('+ Entrada'));
assert(html.includes('- Saida'));
assert(html.includes('+ Boleto'));
assert(html.includes('Descricao obrigatoria'));
assert(html.includes('Contas a pagar'));
assert(html.includes('Mais info'));
assert(html.includes('Mini CRM financeiro'));
assert(html.includes('Vencimento: 09/06/2026'));
assert(html.includes('data-finance-period="today"'));
assert(html.includes('data-finance-period="yesterday"'));
assert(html.includes('data-finance-period="month"'));
assert(html.includes('data-finance-period="custom"'));
assert(html.includes('data-finance-filter="type"'));
assert(html.includes('data-finance-filter="categoryId"'));
assert(html.includes('data-finance-filter="status"'));

const filteredHtml = renderFinanceiroMarkup({
  summary: {
    entriesTotal: 0,
    outputsTotal: 0,
    balance: 0,
    payablesCount: 0,
    paidBillsCount: 0,
    overdueCount: 0
  },
  categories: [
    { id: 'reforco-caixa', name: 'Reforco de caixa', type: 'income' },
    { id: 'fornecedor', name: 'Fornecedor', type: 'expense' }
  ],
  transactions: [
    {
      id: 'fin-income',
      type: 'income',
      description: 'Troco',
      amount: 100,
      categoryId: 'reforco-caixa',
      status: 'paid',
      transactionDate: '2026-06-15'
    },
    {
      id: 'fin-expense',
      type: 'expense',
      description: 'Boleto fornecedor',
      amount: 220,
      categoryId: 'fornecedor',
      status: 'pending',
      transactionDate: '2026-06-15'
    }
  ],
  payables: { pending: [], overdue: [], upcoming: [] },
  crm: {
    outputsByCategory: {},
    entriesByCategory: {},
    spendingByPaymentMethod: {},
    pendingByCategory: {}
  },
  filters: {
    period: 'today',
    customStart: '',
    customEnd: '',
    type: 'income',
    categoryId: 'reforco-caixa',
    status: 'paid'
  }
});

assert(filteredHtml.includes('Troco'));
assert(!filteredHtml.includes('Boleto fornecedor'));

store.clear();
storage.setItem('pdv.users', [{
  id: 'admin-1',
  name: 'Administrador',
  username: 'admin',
  password: '1234',
  role: 'admin',
  active: true
}]);
storage.setItem('pdv.currentSession', { userId: 'admin-1', startedAt: '2026-06-15T10:00:00.000Z' });
storage.setItem('pdv.financialTransactions', [
  {
    id: 'fin-income-change',
    type: 'income',
    description: 'Troco',
    amount: 100,
    categoryId: 'reforco-caixa',
    status: 'paid',
    transactionDate: getLocalDateKey()
  },
  {
    id: 'fin-expense-change',
    type: 'expense',
    description: 'Conta fornecedor',
    amount: 150,
    categoryId: 'fornecedor',
    status: 'paid',
    transactionDate: getLocalDateKey()
  }
]);

const filterListeners = {};
const filterContainer = {
  innerHTML: '',
  addEventListener(type, handler) {
    filterListeners[type] = filterListeners[type] || [];
    filterListeners[type].push(handler);
  }
};

initDespesasModule(filterContainer);
assert(filterContainer.innerHTML.includes('Troco'));
assert(filterContainer.innerHTML.includes('Conta fornecedor'));

filterListeners.change[0]({
  target: {
    name: 'type',
    value: 'income',
    matches(selector) {
      return selector === '[data-finance-filter]';
    }
  }
});

assert(filterContainer.innerHTML.includes('Troco'));
assert(!filterContainer.innerHTML.includes('Conta fornecedor'));

const customHtml = renderFinanceiroMarkup({
  summary: {
    entriesTotal: 0,
    outputsTotal: 0,
    balance: 0,
    payablesCount: 0,
    paidBillsCount: 0,
    overdueCount: 0
  },
  categories: [],
  transactions: [],
  payables: { pending: [], overdue: [], upcoming: [] },
  crm: {
    outputsByCategory: {},
    entriesByCategory: {},
    spendingByPaymentMethod: {},
    pendingByCategory: {}
  },
  filters: { period: 'custom', customStart: '2026-06-01', customEnd: '2026-06-15' }
});

assert(customHtml.includes('name="customStart"'));
assert(customHtml.includes('name="customEnd"'));
assert(customHtml.includes('value="2026-06-01"'));
assert(customHtml.includes('value="2026-06-15"'));

store.clear();
storage.setItem('pdv.users', [{
  id: 'admin-1',
  name: 'Administrador',
  username: 'admin',
  password: '1234',
  role: 'admin',
  active: true
}]);
storage.setItem('pdv.currentSession', { userId: 'admin-1', startedAt: '2026-06-15T10:00:00.000Z' });

const originalFormData = globalThis.FormData;
globalThis.FormData = class TestFormData {
  get(name) {
    return {
      formType: 'expense',
      description: 'Pagamento casa das frutas',
      amount: '150',
      categoryId: 'compra-materiais',
      transactionDate: '2026-06-15',
      dueDate: '',
      notes: '',
      movesCashSession: ''
    }[name];
  }
};

const listeners = {};
const container = {
  innerHTML: '',
  addEventListener(type, handler) {
    listeners[type] = listeners[type] || [];
    listeners[type].push(handler);
  }
};

initDespesasModule(container);
initDespesasModule(container);

const submitEvent = {
  preventDefault() {},
  target: {
    matches(selector) {
      return selector === '[data-finance-form]';
    }
  }
};

for (const listener of listeners.submit) {
  listener(submitEvent);
}

const savedTransactions = JSON.parse(localStorage.getItem('pdv.financialTransactions'));
assert.equal(savedTransactions.length, 1);
assert.equal(savedTransactions[0].description, 'Pagamento casa das frutas');

globalThis.FormData = originalFormData;

console.log('despesas module ok');
