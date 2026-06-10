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

const { renderFinanceiroMarkup } = await import('../src/modules/despesas/despesas.module.js');

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

console.log('despesas module ok');
