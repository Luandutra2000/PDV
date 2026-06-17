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

const storage = await import('../src/services/storage.service.js');
const auth = await import('../src/services/auth.service.js');
const permissions = await import('../src/services/permission.service.js');
storage.setItem('pdv.users', [{
  id: 'admin-1',
  name: 'Administrador',
  username: 'admin',
  password: '1234',
  role: 'admin',
  active: true
}]);
storage.setItem('pdv.currentSession', { userId: 'admin-1', startedAt: '2026-06-10T10:00:00.000Z' });

const finance = await import('../src/services/financial.service.js');

finance.seedFinancialCategories();

const expenseCategory = finance.getFinancialCategories().find((category) => category.id === 'compra-materiais');
assert.equal(expenseCategory.name, 'Compra de materiais');

const financeOperator = auth.createUser({
  name: 'Operador Financeiro',
  username: 'operador-financeiro',
  password: '1234',
  role: 'operator'
});
permissions.setUserPermissionOverride(financeOperator.id, 'financial.income.create', 'allow');
permissions.setUserPermissionOverride(financeOperator.id, 'financial.expense.create', 'deny');
auth.login({ username: 'operador-financeiro', password: '1234' });

const operatorIncome = finance.createFinancialTransaction({
  type: 'income',
  amount: 75,
  categoryId: 'reforco-caixa',
  description: 'Entrada autorizada',
  paymentMethod: 'pix',
  status: 'paid'
});
assert.equal(operatorIncome.type, 'income');
const operatorAliasIncome = finance.createFinancialTransaction({
  type: 'entrada',
  amount: 40,
  categoryId: 'reforco-caixa',
  description: 'Entrada alias autorizada',
  paymentMethod: 'pix',
  status: 'paid'
});
assert.equal(operatorAliasIncome.type, 'income');
assert.throws(
  () => finance.createFinancialTransaction({
    type: 'expense',
    amount: 25,
    categoryId: expenseCategory.id,
    description: 'Despesa bloqueada',
    paymentMethod: 'dinheiro',
    status: 'paid'
  }),
  /Usuario sem permissao/
);
assert.throws(
  () => finance.createFinancialTransaction({
    type: 'saida',
    amount: 25,
    categoryId: expenseCategory.id,
    description: 'Saida alias bloqueada',
    paymentMethod: 'dinheiro',
    status: 'paid'
  }),
  /Usuario sem permissao/
);
assert.throws(
  () => finance.createFinancialTransaction({
    type: 'expense',
    amount: 120,
    categoryId: 'fornecedor',
    description: 'Boleto bloqueado',
    paymentMethod: 'boleto',
    status: 'pending',
    transactionDate: '2026-06-10',
    dueDate: '2026-06-15'
  }),
  /Usuario sem permissao/
);
assert.throws(
  () => finance.upsertFinancialTransaction({
    ...operatorIncome,
    description: 'Entrada sem permissao de edicao'
  }),
  /Usuario sem permissao/
);
permissions.setUserPermissionOverride(financeOperator.id, 'financial.entries.edit', 'allow');
const editedOperatorIncome = finance.upsertFinancialTransaction({
  ...operatorIncome,
  description: 'Entrada com permissao de edicao'
});
assert.equal(editedOperatorIncome.description, 'Entrada com permissao de edicao');
assert.equal(editedOperatorIncome.id, operatorIncome.id);
assert.equal(editedOperatorIncome.createdAt, operatorIncome.createdAt);
const financialTransactionsBeforeInvalidUpsert = finance.getFinancialTransactions().length;
assert.throws(
  () => finance.upsertFinancialTransaction({
    ...operatorIncome,
    amount: 0,
    description: 'Entrada invalida'
  }),
  /Valor precisa ser maior que zero/
);
assert.equal(finance.getFinancialTransactions().length, financialTransactionsBeforeInvalidUpsert);
assert.equal(
  finance.getFinancialTransactions().find((transaction) => transaction.id === operatorIncome.id).amount,
  operatorIncome.amount
);
assert.throws(
  () => finance.upsertFinancialTransaction({
    ...operatorIncome,
    amount: -1,
    description: 'Entrada negativa'
  }),
  /Valor precisa ser maior que zero/
);
assert.equal(finance.getFinancialTransactions().length, financialTransactionsBeforeInvalidUpsert);
assert.equal(
  finance.getFinancialTransactions().find((transaction) => transaction.id === operatorIncome.id).amount,
  operatorIncome.amount
);

auth.login({ username: 'admin', password: '1234' });

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

const unpaidBill = finance.createFinancialTransaction({
  type: 'expense',
  amount: 180,
  categoryId: 'fornecedor',
  description: 'Conta bloqueada para pagamento',
  paymentMethod: 'boleto',
  status: 'pending',
  transactionDate: '2026-06-10',
  dueDate: '2026-06-18'
});
auth.login({ username: 'operador-financeiro', password: '1234' });
assert.throws(
  () => finance.markFinancialTransactionPaid(unpaidBill.id, { paidAt: '2026-06-11T10:00:00.000Z', paymentMethod: 'pix' }),
  /Usuario sem permissao/
);
auth.login({ username: 'admin', password: '1234' });

const cancelCandidate = finance.createFinancialTransaction({
  type: 'expense',
  amount: 90,
  categoryId: 'fornecedor',
  description: 'Conta bloqueada para cancelamento',
  paymentMethod: 'boleto',
  status: 'pending',
  transactionDate: '2026-06-10',
  dueDate: '2026-06-19'
});
auth.login({ username: 'operador-financeiro', password: '1234' });
assert.throws(
  () => finance.cancelFinancialTransaction(cancelCandidate.id, { reason: 'Teste permissao' }),
  /Usuario sem permissao/
);
auth.login({ username: 'admin', password: '1234' });

const summary = finance.getFinancialSummary({ period: 'all' });
assert.equal(summary.entriesTotal, 115);
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
