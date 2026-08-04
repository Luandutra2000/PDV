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

const storage = await import('../src/services/storage.service.js?v=20260804-01');
storage.setItem('pdv.users', [{
  id: 'admin-1',
  name: 'Administrador',
  username: 'admin',
  password: '1234',
  role: 'admin',
  active: true
}]);
storage.setItem('pdv.currentSession', { userId: 'admin-1', startedAt: '2026-06-10T10:00:00.000Z' });

const finance = await import('../src/services/financial.service.js?v=20260804-01');

finance.seedFinancialCategories();

const expenseCategory = finance.getFinancialCategories().find((category) => category.id === 'compra-materiais');
assert.equal(expenseCategory.name, 'Compra de materiais');

assert.throws(
  () => finance.createFinancialTransaction({ type: 'expense', amount: 100, categoryId: expenseCategory.id, description: '' }),
  /Descricao obrigatoria/
);

const expense = finance.createFinancialTransaction({
  type: 'expense',
  amount: 100,
  categoryId: expenseCategory.id,
  description: 'Retirada para pagar fornecedor',
  paymentMethod: 'dinheiro',
  status: 'paid',
  origin: 'finance'
});

assert.equal(expense.status, 'paid');
assert.equal(expense.description, 'Retirada para pagar fornecedor');

const bill = finance.createFinancialTransaction({
  type: 'expense',
  amount: 220,
  categoryId: 'fornecedor',
  description: 'Boleto fornecedor',
  paymentMethod: 'boleto',
  status: 'pending',
  transactionDate: '2026-06-10',
  dueDate: '2026-06-15'
});

assert.equal(finance.getPayables({ now: new Date('2026-06-10T12:00:00') }).pending.length, 1);
assert.equal(finance.getPayables({ now: new Date('2026-06-20T12:00:00') }).overdue.length, 1);

const paid = finance.markFinancialTransactionPaid(bill.id, { paidAt: '2026-06-11T10:00:00.000Z', paymentMethod: 'pix' });
assert.equal(paid.status, 'paid');
assert.equal(paid.paymentMethod, 'pix');

const summary = finance.getFinancialSummary({ period: 'all' });
assert.equal(summary.entriesTotal, 0);
assert.equal(summary.outputsTotal, 320);
assert.equal(summary.paidBillsCount, 1);

finance.createFinancialTransaction({
  type: 'income',
  amount: 50,
  categoryId: 'reforco-caixa',
  description: 'Reforco no periodo',
  paymentMethod: 'pix',
  status: 'paid',
  transactionDate: '2026-06-12'
});

const crmInPeriod = finance.buildFinancialCrm({
  period: 'custom',
  customStart: '2026-06-12',
  customEnd: '2026-06-12'
});
assert.equal(crmInPeriod.entriesByCategory['reforco-caixa'], 50);
assert.equal(crmInPeriod.outputsByCategory['compra-materiais'], undefined);

console.log('financial service ok');
