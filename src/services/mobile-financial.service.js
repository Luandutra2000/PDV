import {
  buildFinancialCrm,
  getFinancialCategories,
  getFinancialSummary,
  getFinancialTransactions,
  getPayables,
  normalizeFinancialTransaction,
  seedFinancialCategories
} from './financial.service.js?v=20260804-06';
import { getCurrentUser } from './auth.service.js?v=20260804-06';
import { isSupabaseEnabled } from './app-config.service.js?v=20260804-06';
import { saveFinancialTransactionToSupabaseStrict, updateFinancialTransactionInSupabaseStrict } from './financial-sync.service.js?v=20260804-06';
import { assertPermission } from './permission.service.js?v=20260804-06';

export function getMobileFinancialSummary(filters = { period: 'today' }) {
  const normalizedFilters = { period: 'today', ...filters };

  seedFinancialCategories();

  const summary = getFinancialSummary(normalizedFilters);
  const categories = getFinancialCategories();
  const transactions = getFinancialTransactions(normalizedFilters);
  const payables = getPayables();
  const crm = buildFinancialCrm(normalizedFilters);

  return {
    cards: [
      { id: 'entries', label: 'Entradas', value: summary.entriesTotal, tone: 'success' },
      { id: 'outputs', label: 'Saidas', value: summary.outputsTotal, tone: 'danger' },
      { id: 'balance', label: 'Saldo', value: summary.balance, tone: summary.balance < 0 ? 'danger' : 'primary' },
      { id: 'payables', label: 'Contas a pagar', value: summary.payablesCount, tone: 'warning', isCurrency: false },
      { id: 'paidBills', label: 'Contas pagas', value: summary.paidBillsCount, tone: 'success', isCurrency: false },
      { id: 'overdue', label: 'Vencidas', value: summary.overdueCount, tone: 'danger', isCurrency: false }
    ],
    summary,
    categories,
    transactions,
    payables,
    crm
  };
}

export async function createMobileFinancialTransaction(input) {
  assertOnlineSupabase();

  const user = getCurrentUser();
  assertPermission(user, getCreateMobileFinancialTransactionPermission(input), { source: 'mobile-financial' });
  const transaction = normalizeFinancialTransaction({ ...input, origin: 'finance' }, user);

  try {
    await saveFinancialTransactionToSupabaseStrict(transaction);
  } catch (error) {
    throw new Error(error.message || 'Nao foi possivel salvar o lancamento financeiro no Supabase.');
  }

  return transaction;
}

export async function markMobileFinancialTransactionPaid(transactionId, input = {}) {
  assertOnlineSupabase();

  const user = getCurrentUser();
  assertPermission(user, 'financial.bill.pay', { source: 'mobile-financial', transactionId });

  const transaction = getFinancialTransactions({ period: 'all' }).find((item) => item.id === transactionId);

  if (!transaction) {
    throw new Error('Lancamento financeiro nao encontrado.');
  }

  const nextTransaction = {
    ...transaction,
    status: 'paid',
    paidAt: input.paidAt || new Date().toISOString(),
    paymentMethod: input.paymentMethod || transaction.paymentMethod || 'dinheiro',
    updatedAt: new Date().toISOString()
  };

  try {
    await updateFinancialTransactionInSupabaseStrict(nextTransaction);
  } catch (error) {
    throw new Error(error.message || 'Nao foi possivel marcar a conta como paga no Supabase.');
  }

  return nextTransaction;
}

function assertOnlineSupabase() {
  if (!isSupabaseEnabled()) {
    throw new Error('Supabase online obrigatorio para esta acao.');
  }
}

function getCreateMobileFinancialTransactionPermission(input = {}) {
  const type = String(input.type || '').trim();
  return type === 'income' || type === 'entrada'
    ? 'financial.income.create'
    : 'financial.expense.create';
}
