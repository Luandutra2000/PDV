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

const storage = await import('../src/services/storage.service.js');
const { initDespesasModule, renderFinanceiroMarkup } = await import('../src/modules/despesas/despesas.module.js');
const today = new Date().toISOString().slice(0, 10);

function seedUser({ role = 'admin', overrides = {} } = {}) {
  const user = {
    id: `user-${role}`,
    name: `Usuario ${role}`,
    username: role,
    password: '1234',
    role,
    active: true
  };

  storage.setItem('pdv.users', [user]);
  storage.setItem('pdv.currentSession', { userId: user.id, startedAt: '2026-06-15T10:00:00.000Z' });
  storage.setItem('pdv.userPermissionOverrides', { [user.id]: overrides });
  return user;
}

seedUser();

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
    status: 'paid',
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
assert(html.includes('data-finance-action="edit"'));
assert(html.includes('Mini CRM financeiro'));
assert(html.includes('Vencimento: 09/06/2026'));
assert(html.includes('data-finance-period="today"'));
assert(html.includes('data-finance-period="yesterday"'));
assert(html.includes('data-finance-period="month"'));
assert(html.includes('data-finance-period="custom"'));
assert(html.includes('data-finance-filter="type"'));
assert(html.includes('data-finance-filter="historyKind"'));
assert(html.includes('Mov. caixa'));
assert(html.includes('Boletos'));
assert(html.includes('data-finance-filter="categoryId"'));
assert(html.includes('data-finance-filter="status"'));
assert(html.includes('<strong>Boleto</strong>'));
assert(html.includes('Observacao: Boleto fornecedor'));
assert(!html.includes('<strong>Boleto fornecedor</strong>'));

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
    historyKind: 'cash',
    categoryId: 'reforco-caixa',
    status: 'paid'
  }
});

assert(filteredHtml.includes('Troco'));
assert(!filteredHtml.includes('Boleto fornecedor'));

store.clear();
seedUser({
  role: 'operador',
  overrides: {
    'financial.income.create': 'deny',
    'financial.expense.create': 'deny',
    'financial.bill.pay': 'deny',
    'financial.entries.edit': 'deny'
  }
});

const deniedHtml = renderFinanceiroMarkup({
  summary: {
    entriesTotal: 0,
    outputsTotal: 0,
    balance: 0,
    payablesCount: 1,
    paidBillsCount: 0,
    overdueCount: 0
  },
  categories: [{ id: 'fornecedor', name: 'Fornecedor', type: 'expense' }],
  transactions: [{
    id: 'fin-pending',
    type: 'expense',
    description: 'Conta sem permissao',
    amount: 80,
    categoryId: 'fornecedor',
    paymentMethod: 'boleto',
    status: 'pending',
    transactionDate: '2026-06-15',
    dueDate: '2026-06-20'
  }, {
    id: 'fin-paid',
    type: 'expense',
    description: 'Conta paga',
    amount: 90,
    categoryId: 'fornecedor',
    status: 'paid',
    transactionDate: '2026-06-15'
  }],
  payables: {
    pending: [{
      id: 'fin-pending',
      description: 'Conta sem permissao',
      amount: 80,
      status: 'pending',
      transactionDate: '2026-06-15',
      dueDate: '2026-06-20'
    }],
    overdue: [],
    upcoming: []
  },
  crm: {
    outputsByCategory: {},
    entriesByCategory: {},
    spendingByPaymentMethod: {},
    pendingByCategory: {}
  }
});

assert(!deniedHtml.includes('data-finance-action="open-income"'), 'denied user should not see income creation');
assert(!deniedHtml.includes('data-finance-action="open-expense"'), 'denied user should not see expense creation');
assert(!deniedHtml.includes('data-finance-action="open-bill"'), 'denied user should not see bill creation');
assert(!deniedHtml.includes('data-payable-id="fin-pending"'), 'denied user should not see bill payment buttons');
assert(!deniedHtml.includes('data-finance-action="edit"'), 'denied user should not see finance edit buttons');

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
    transactionDate: today
  },
  {
    id: 'fin-expense-change',
    type: 'expense',
    description: 'Conta fornecedor',
    amount: 150,
    categoryId: 'fornecedor',
    status: 'paid',
    transactionDate: today
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
storage.setItem('pdv.financialTransactions', [{
  id: 'fin-edit',
  type: 'expense',
  description: 'Conta antiga',
  amount: 80,
  categoryId: 'fornecedor',
  paymentMethod: 'boleto',
  status: 'paid',
  transactionDate: '2026-06-15',
  dueDate: '2026-06-20',
  notes: ''
}]);

const editListeners = {};
const editContainer = {
  innerHTML: '',
  addEventListener(type, handler) {
    editListeners[type] = editListeners[type] || [];
    editListeners[type].push(handler);
  }
};

initDespesasModule(editContainer);
editListeners.click[0]({
  target: {
    closest(selector) {
      if (selector === '[data-finance-action]') {
        return { dataset: { financeAction: 'edit', transactionId: 'fin-edit' } };
      }

      return null;
    }
  }
});
assert(editContainer.innerHTML.includes('Editar lancamento'), 'edit action should open transaction modal');
assert(editContainer.innerHTML.includes('value="Conta antiga"'), 'edit modal should preload current description');

globalThis.FormData = class EditFormData {
  get(name) {
    return {
      transactionId: 'fin-edit',
      formType: 'expense',
      description: 'Conta editada',
      amount: '95',
      categoryId: 'fornecedor',
      paymentMethod: 'boleto',
      status: 'paid',
      transactionDate: '2026-06-16',
      dueDate: '2026-06-21',
      notes: 'ajuste'
    }[name];
  }
};

editListeners.submit[0](submitEvent);
const editedTransactions = JSON.parse(localStorage.getItem('pdv.financialTransactions'));
assert.equal(editedTransactions.length, 1);
assert.equal(editedTransactions[0].description, 'Conta editada');
assert.equal(editedTransactions[0].amount, 95);
assert.equal(editedTransactions[0].dueDate, '2026-06-21');

globalThis.FormData = originalFormData;

console.log('despesas module ok');
