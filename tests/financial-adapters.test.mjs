import assert from 'node:assert/strict';

const categoryAdapter = await import('../src/services/repositories/financial-category.adapter.js?v=20260804-06');
const transactionAdapter = await import('../src/services/repositories/financial-transaction.adapter.js?v=20260804-06');
const closingAdapter = await import('../src/services/repositories/cash-closing.adapter.js?v=20260804-06');

const category = categoryAdapter.fromRow({
  id: 'fornecedor',
  name: 'Fornecedor',
  type: 'expense',
  color: '#c2413b',
  active: true,
  created_at: '2026-06-10T10:00:00.000Z',
  updated_at: '2026-06-10T10:00:00.000Z'
});

assert.equal(category.name, 'Fornecedor');
assert.equal(category.active, true);
assert.equal(categoryAdapter.toRow(category).created_at, '2026-06-10T10:00:00.000Z');

const transaction = transactionAdapter.fromRow({
  id: 'fin-1',
  type: 'expense',
  description: 'Boleto fornecedor',
  amount: 220,
  category_id: 'fornecedor',
  payment_method: 'boleto',
  status: 'pending',
  transaction_date: '2026-06-10',
  due_date: '2026-06-15',
  paid_at: null,
  notes: 'Entrega de embalagens',
  origin: 'finance',
  cash_movement_id: null,
  moves_cash_session: false,
  created_by: 'user-1',
  canceled_at: null,
  cancel_reason: null,
  created_at: '2026-06-10T10:00:00.000Z',
  updated_at: '2026-06-10T10:00:00.000Z'
});

assert.equal(transaction.amount, 220);
assert.equal(transaction.categoryId, 'fornecedor');
assert.equal(transaction.paymentMethod, 'boleto');
assert.equal(transaction.dueDate, '2026-06-15');
assert.equal(transaction.movesCashSession, false);
assert.equal(transactionAdapter.toRow(transaction).category_id, 'fornecedor');
assert.equal(transactionAdapter.toRow(transaction).cash_movement_id, null);

const closing = closingAdapter.fromRow({
  id: 'closing-1',
  status: 'fechado',
  totals: { sales: 44, expectedCash: 44, countedCash: 44, generalDifference: 0 },
  payments: { expectedCash: 44, countedCash: 44 },
  showcase: [],
  differences: [],
  input: { countedCash: 44, note: 'Conferido' },
  created_by: 'user-1',
  created_at: '2026-06-10T22:00:00.000Z',
  closed_at: '2026-06-10T22:00:00.000Z',
  updated_at: '2026-06-10T22:00:00.000Z'
});

assert.equal(closing.createdBy, 'user-1');
assert.equal(closing.totals.countedCash, 44);
assert.equal(closingAdapter.toRow(closing).created_by, 'user-1');
assert.equal(closingAdapter.toRow(closing).input.note, 'Conferido');

console.log('financial adapters ok');
