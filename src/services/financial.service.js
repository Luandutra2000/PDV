import { STORAGE_KEYS, SYNC_EVENTS, UI_EVENTS } from '../database/schema.js';
import { emit } from './event-bus.service.js';
import { getCurrentUser } from './auth.service.js';
import { assertPermission } from './permission.service.js';
import { getItem, setItem } from './storage.service.js';
import { recordAudit } from './audit.service.js';

export const PAYMENT_METHODS = ['dinheiro', 'pix', 'cartao', 'boleto', 'transferencia', 'outro'];
export const FINANCIAL_STATUSES = ['paid', 'pending', 'overdue', 'canceled'];
export const FINANCIAL_CATEGORY_SEED = [
  { id: 'compra-materiais', name: 'Compra de materiais', type: 'expense', color: '#c2413b' },
  { id: 'fornecedor', name: 'Fornecedor', type: 'expense', color: '#c2413b' },
  { id: 'boleto', name: 'Boleto', type: 'expense', color: '#ff6b1a' },
  { id: 'aluguel', name: 'Aluguel', type: 'expense', color: '#c2413b' },
  { id: 'energia', name: 'Energia', type: 'expense', color: '#c2413b' },
  { id: 'agua', name: 'Agua', type: 'expense', color: '#c2413b' },
  { id: 'internet', name: 'Internet', type: 'expense', color: '#c2413b' },
  { id: 'funcionario', name: 'Funcionario', type: 'expense', color: '#c2413b' },
  { id: 'retirada-dono', name: 'Retirada do dono', type: 'expense', color: '#c2413b' },
  { id: 'manutencao', name: 'Manutencao', type: 'expense', color: '#c2413b' },
  { id: 'reforco-caixa', name: 'Reforco de caixa', type: 'income', color: '#17824f' },
  { id: 'aporte-dono', name: 'Aporte do dono', type: 'income', color: '#17824f' },
  { id: 'reembolso', name: 'Reembolso', type: 'income', color: '#17824f' },
  { id: 'outros-financeiro', name: 'Outros', type: 'both', color: '#ff6b1a' }
];

export function seedFinancialCategories() {
  const existing = getFinancialCategories({ activeOnly: false });
  const existingIds = new Set(existing.map((category) => category.id));
  const missing = FINANCIAL_CATEGORY_SEED.filter((category) => !existingIds.has(category.id));

  if (!missing.length) {
    return existing;
  }

  const now = new Date().toISOString();
  const nextCategories = [
    ...existing,
    ...missing.map((category) => ({ ...category, active: true, createdAt: now, updatedAt: now }))
  ];
  setItem(STORAGE_KEYS.financialCategories, nextCategories);
  return nextCategories;
}

export function getFinancialCategories({ type = 'all', activeOnly = true } = {}) {
  const now = new Date().toISOString();
  const categories = getItem(STORAGE_KEYS.financialCategories, FINANCIAL_CATEGORY_SEED.map((category) => ({
    ...category,
    active: true,
    createdAt: now,
    updatedAt: now
  })));

  return categories.filter((category) => {
    if (activeOnly && category.active === false) {
      return false;
    }

    return type === 'all' || category.type === type || category.type === 'both';
  });
}

export function getFinancialTransactions() {
  return getItem(STORAGE_KEYS.financialTransactions, []);
}

export function createFinancialTransaction(input) {
  const user = getCurrentUser();
  assertPermission(user, 'financial.transaction.create');

  const transaction = normalizeFinancialTransaction(input, user);
  const transactions = [transaction, ...getFinancialTransactions()];
  setItem(STORAGE_KEYS.financialTransactions, transactions);
  emitFinanceChanged(transaction);
  recordAudit({
    action: 'financial.transaction.create',
    entityType: 'financial_transaction',
    entityId: transaction.id,
    user,
    reason: transaction.description,
    metadata: { type: transaction.type, amount: transaction.amount, status: transaction.status }
  });
  return transaction;
}

export function upsertFinancialTransaction(transaction) {
  const transactions = getFinancialTransactions();
  const exists = transactions.some((candidate) => candidate.id === transaction.id);
  const nextTransactions = exists
    ? transactions.map((candidate) => (candidate.id === transaction.id ? transaction : candidate))
    : [transaction, ...transactions];

  setItem(STORAGE_KEYS.financialTransactions, sortNewestFirst(nextTransactions));
  emitFinanceChanged(transaction);
  return transaction;
}

export function markFinancialTransactionPaid(
  transactionId,
  { paidAt = new Date().toISOString(), paymentMethod = 'dinheiro', cashMovementId = null, movesCashSession = false } = {}
) {
  const user = getCurrentUser();
  assertPermission(user, 'financial.payable.pay');

  const transaction = getFinancialTransactions().find((candidate) => candidate.id === transactionId);

  if (!transaction) {
    throw new Error('Lancamento financeiro nao encontrado.');
  }

  const nextTransaction = {
    ...transaction,
    status: 'paid',
    paidAt,
    paymentMethod,
    cashMovementId: cashMovementId || transaction.cashMovementId || null,
    movesCashSession: movesCashSession || transaction.movesCashSession === true,
    updatedAt: new Date().toISOString()
  };

  upsertFinancialTransaction(nextTransaction);
  recordAudit({
    action: 'financial.payable.paid',
    entityType: 'financial_transaction',
    entityId: nextTransaction.id,
    user,
    reason: nextTransaction.description,
    metadata: { amount: nextTransaction.amount, paymentMethod: nextTransaction.paymentMethod }
  });
  return nextTransaction;
}

export function cancelFinancialTransaction(transactionId, { reason = '' } = {}) {
  const user = getCurrentUser();
  assertPermission(user, 'financial.transaction.cancel');
  const cancelReason = String(reason || '').trim();

  if (!cancelReason) {
    throw new Error('Informe o motivo do cancelamento.');
  }

  const transaction = getFinancialTransactions().find((candidate) => candidate.id === transactionId);

  if (!transaction) {
    throw new Error('Lancamento financeiro nao encontrado.');
  }

  const canceled = {
    ...transaction,
    status: 'canceled',
    canceledAt: new Date().toISOString(),
    cancelReason,
    updatedAt: new Date().toISOString()
  };
  upsertFinancialTransaction(canceled);
  recordAudit({
    action: 'financial.transaction.cancel',
    entityType: 'financial_transaction',
    entityId: canceled.id,
    user,
    reason: cancelReason,
    metadata: { amount: canceled.amount }
  });
  return canceled;
}

export function getFinancialSummary({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const filtered = getFinancialTransactions()
    .map(resolveOverdueStatus)
    .filter((transaction) => transaction.status !== 'canceled' && isInPeriod(transaction.transactionDate || transaction.createdAt, period, { customStart, customEnd }));
  const paid = filtered.filter((transaction) => transaction.status === 'paid');
  const pending = filtered.filter((transaction) => transaction.status === 'pending');
  const overdue = filtered.filter((transaction) => transaction.status === 'overdue');
  const entriesTotal = sumTransactions(paid, 'income');
  const outputsTotal = sumTransactions(paid, 'expense');

  return {
    entriesTotal,
    outputsTotal,
    balance: entriesTotal - outputsTotal,
    payablesCount: pending.length + overdue.length,
    paidBillsCount: paid.filter((transaction) => transaction.type === 'expense' && transaction.dueDate).length,
    overdueCount: overdue.length
  };
}

export function getPayables({ now = new Date() } = {}) {
  const payables = getFinancialTransactions()
    .filter((transaction) => transaction.type === 'expense' && transaction.status !== 'paid' && transaction.status !== 'canceled')
    .map((transaction) => resolveOverdueStatus(transaction, now));

  return {
    pending: payables.filter((transaction) => transaction.status === 'pending'),
    overdue: payables.filter((transaction) => transaction.status === 'overdue'),
    upcoming: payables.filter((transaction) => isUpcoming(transaction, now))
  };
}

export function buildFinancialCrm() {
  const active = getFinancialTransactions().map(resolveOverdueStatus).filter((transaction) => transaction.status !== 'canceled');
  const paid = active.filter((transaction) => transaction.status === 'paid');

  return {
    outputsByCategory: totalsBy(paid.filter((transaction) => transaction.type === 'expense'), 'categoryId'),
    entriesByCategory: totalsBy(paid.filter((transaction) => transaction.type === 'income'), 'categoryId'),
    spendingByPaymentMethod: totalsBy(paid.filter((transaction) => transaction.type === 'expense'), 'paymentMethod'),
    pendingByCategory: totalsBy(active.filter((transaction) => transaction.status === 'pending' || transaction.status === 'overdue'), 'categoryId')
  };
}

export function normalizeFinancialTransaction(input, user = getCurrentUser()) {
  const description = String(input.description || '').trim();
  const amount = Number(input.amount) || 0;
  const type = input.type === 'income' || input.type === 'entrada' ? 'income' : 'expense';
  const status = normalizeStatus(input.status);
  const now = new Date().toISOString();

  if (!description) {
    throw new Error('Descricao obrigatoria.');
  }

  if (amount <= 0) {
    throw new Error('Valor precisa ser maior que zero.');
  }

  return {
    id: input.id || createId('fin'),
    type,
    description,
    amount,
    categoryId: input.categoryId || 'outros-financeiro',
    paymentMethod: normalizePaymentMethod(input.paymentMethod),
    status,
    transactionDate: input.transactionDate || now.slice(0, 10),
    dueDate: input.dueDate || '',
    paidAt: status === 'paid' ? (input.paidAt || now) : null,
    notes: String(input.notes || '').trim(),
    origin: input.origin || 'finance',
    cashMovementId: input.cashMovementId || null,
    movesCashSession: input.movesCashSession === true,
    createdBy: user?.id || '',
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function emitFinanceChanged(payload) {
  emit(SYNC_EVENTS.financialTransactionChanged, payload);
  emit(UI_EVENTS.financeChanged, payload);
  emit(UI_EVENTS.financialDataChanged, payload);
  emit(UI_EVENTS.cashSummaryChanged, payload);
}

function normalizeStatus(status) {
  if (FINANCIAL_STATUSES.includes(status)) {
    return status;
  }

  if (status === 'pago') {
    return 'paid';
  }

  if (status === 'vencido') {
    return 'overdue';
  }

  return 'pending';
}

function normalizePaymentMethod(paymentMethod) {
  return PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : 'dinheiro';
}

function resolveOverdueStatus(transaction, now = new Date()) {
  if (transaction.status !== 'pending' || !transaction.dueDate) {
    return transaction;
  }

  const due = new Date(`${transaction.dueDate}T23:59:59`);
  return due < now ? { ...transaction, status: 'overdue' } : transaction;
}

function isUpcoming(transaction, now) {
  if (!transaction.dueDate || transaction.status !== 'pending') {
    return false;
  }

  const due = new Date(`${transaction.dueDate}T23:59:59`);
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return due >= now && due <= end;
}

function sumTransactions(transactions, type) {
  return transactions.filter((transaction) => transaction.type === type).reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
}

function totalsBy(transactions, key) {
  return transactions.reduce((totals, transaction) => {
    const id = transaction[key] || 'sem-categoria';
    totals[id] = (totals[id] || 0) + Number(transaction.amount || 0);
    return totals;
  }, {});
}

function sortNewestFirst(items) {
  return [...items].sort((left, right) => Date.parse(right.createdAt || right.transactionDate || 0) - Date.parse(left.createdAt || left.transactionDate || 0));
}

function isInPeriod(value, period, filters = {}) {
  if (!value || period === 'all') {
    return true;
  }

  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  const now = new Date();

  if (period === 'custom') {
    const start = filters.customStart ? new Date(`${filters.customStart}T00:00:00`) : null;
    const end = filters.customEnd ? new Date(`${filters.customEnd}T23:59:59`) : null;
    return (!start || date >= start) && (!end || date <= end);
  }

  if (period === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  return date.toDateString() === now.toDateString();
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
