import { STORAGE_KEYS, SYNC_EVENTS, UI_EVENTS } from '../database/schema.js?v=20260804-03';
import { emit } from './event-bus.service.js?v=20260804-03';
import { getActiveComanda, getSubtotal, startNewComanda } from './comanda.service.js?v=20260804-03';
import { getProductById } from './product.service.js?v=20260804-03';
import { getItem, setItem } from './storage.service.js?v=20260804-03';
import { getCurrentUser } from './auth.service.js?v=20260804-03';
import { assertPermission } from './permission.service.js?v=20260804-03';
import { recordAudit } from './audit.service.js?v=20260804-03';
import { isSupabaseEnabled } from './app-config.service.js?v=20260804-03';
import { createFinancialTransaction as createFinanceTransaction } from './financial.service.js?v=20260804-03';
import {
  cancelCashMovementInSupabase,
  cancelSaleInSupabase,
  clearFinancialHistoryInSupabase,
  getFinancialSyncStatus,
  saveCashMovementToSupabase,
  saveSaleToSupabase
} from './financial-sync.service.js?v=20260804-03';
import { processShowcaseSale, reverseShowcaseSale } from './showcase-sync.service.js?v=20260804-03';

export function finalizeComandaPayment({ paymentMethod, receivedAmount = 0 }) {
  const user = getCurrentUser();
  assertPermission(user, 'sales.create');

  const comanda = getActiveComanda();
  const total = getSubtotal(comanda);
  const paidAmount = paymentMethod === 'dinheiro' ? Number(receivedAmount) || 0 : total;
  const change = paymentMethod === 'dinheiro' ? Math.max(paidAmount - total, 0) : 0;

  if (!comanda.items.length) {
    throw new Error('Nao ha itens na comanda.');
  }

  if (paymentMethod === 'dinheiro' && paidAmount < total) {
    throw new Error('Valor recebido menor que o total.');
  }

  const sale = {
    id: createId('sale'),
    type: 'venda',
    status: 'ativa',
    comandaId: comanda.id,
    comandaNumber: comanda.number,
    items: comanda.items,
    total,
    paymentMethod,
    receivedAmount: paidAmount,
    change,
    createdBy: user?.id || '',
    userName: user?.name || 'Sistema',
    createdAt: new Date().toISOString()
  };

  const closedCommand = {
    ...comanda,
    status: 'fechada',
    closedAt: sale.createdAt,
    total,
    paymentMethod,
    receivedAmount: paidAmount,
    change
  };

  appendTransaction(sale);
  appendClosedComanda(closedCommand);
  syncSaleToSupabase(sale, closedCommand);
  runShowcaseSync(processShowcaseSale({
    operationId: sale.id,
    saleId: sale.id,
    commandId: sale.comandaId,
    userId: sale.createdBy,
    createdAt: sale.createdAt,
    items: sale.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? item.price,
      total: item.total
    }))
  }));
  startNewComanda(comanda.number + 1);
  emit(SYNC_EVENTS.saleFinished, sale);
  emit(UI_EVENTS.cashSummaryChanged, sale);
  recordAudit({
    action: 'sale.create',
    entityType: 'sale',
    entityId: sale.id,
    user,
    metadata: {
      total,
      paymentMethod
    }
  });

  return sale;
}

export function registerCashMovement({
  type,
  amount,
  category = 'sem-categoria',
  description = '',
  userName = 'Local',
  createFinancialTransaction = true
}) {
  const user = getCurrentUser();

  if (!['entrada', 'saida', 'sangria'].includes(type)) {
    throw new Error('Tipo de movimento invalido.');
  }

  assertPermission(user, type === 'entrada' ? 'cash.movement' : 'cash.withdrawal');

  const normalizedAmount = Number(amount) || 0;
  const normalizedDescription = String(description || '').trim();

  if (normalizedAmount <= 0) {
    throw new Error('Valor precisa ser maior que zero.');
  }

  if (!normalizedDescription) {
    throw new Error('Descricao obrigatoria.');
  }

  const movement = {
    id: createId(type),
    type,
    status: 'ativa',
    amount: normalizedAmount,
    category: String(category || 'sem-categoria').trim() || 'sem-categoria',
    description: normalizedDescription,
    userId: user?.id || '',
    userName: user?.name || String(userName || 'Local').trim() || 'Local',
    createdAt: new Date().toISOString()
  };

  appendTransaction(movement);
  if (createFinancialTransaction) {
    createFinanceTransaction({
      type: type === 'entrada' ? 'income' : 'expense',
      amount: normalizedAmount,
      categoryId: movement.category,
      description: movement.description,
      paymentMethod: 'dinheiro',
      status: 'paid',
      origin: 'cashier',
      cashMovementId: movement.id,
      movesCashSession: true,
      transactionDate: movement.createdAt.slice(0, 10),
      paidAt: movement.createdAt
    }, { enforcePermission: false });
  }
  syncCashMovementToSupabase(movement);
  emit(SYNC_EVENTS.cashMovementRegistered, movement);
  emit(UI_EVENTS.cashSummaryChanged, movement);
  recordAudit({
    action: 'cash.movement',
    entityType: 'transaction',
    entityId: movement.id,
    user,
    reason: movement.description,
    metadata: {
      type: movement.type,
      amount: movement.amount,
      category: movement.category
    }
  });

  return movement;
}

export function getTransactions() {
  return getItem(STORAGE_KEYS.transactions, []);
}

export function getClosedComandas() {
  return getItem(STORAGE_KEYS.closedComandas, []);
}

export async function clearTransactionHistory({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const filters = { customStart, customEnd };
  const shouldClear = (value) => isInPeriod(value, period, filters);
  setItem(STORAGE_KEYS.transactions, getTransactions().filter((transaction) => !shouldClear(transaction.createdAt)));
  setItem(STORAGE_KEYS.closedComandas, getClosedComandas().filter((comanda) => !shouldClear(comanda.closedAt || comanda.createdAt)));

  if (isSupabaseEnabled()) {
    await clearFinancialHistoryInSupabase({ period, customStart, customEnd });
  }

  emit(UI_EVENTS.cashSummaryChanged, { type: 'historico-limpo' });
}

export function cancelClosedComanda(comandaId, { reason = '' } = {}) {
  const cancelReason = String(reason || '').trim();
  if (!cancelReason) {
    throw new Error('Informe o motivo do cancelamento.');
  }

  const user = getCurrentUser();
  assertPermission(user, 'sales.cancel');

  const canceledAt = new Date().toISOString();
  const transactions = getTransactions().map((transaction) => {
    if (transaction.comandaId !== comandaId) {
      return transaction;
    }

    return {
      ...transaction,
      status: 'cancelada',
      canceledAt,
      canceledBy: user?.id || '',
      canceledByName: user?.name || 'Sistema',
      cancelReason
    };
  });
  const comandas = getClosedComandas().map((comanda) => {
    if (comanda.id !== comandaId) {
      return comanda;
    }

    return {
      ...comanda,
      status: 'cancelada',
      canceledAt,
      canceledBy: user?.id || '',
      canceledByName: user?.name || 'Sistema',
      cancelReason
    };
  });

  setItem(STORAGE_KEYS.transactions, transactions);
  setItem(STORAGE_KEYS.closedComandas, comandas);
  const sale = transactions.find((transaction) => transaction.comandaId === comandaId && transaction.type === 'venda');
  syncSaleCancellationToSupabase({ saleId: sale?.id, comandaId, canceledAt });
  if (sale?.id) {
    runShowcaseSync(reverseShowcaseSale({
      operationId: `reverse-${sale.id}`,
      saleId: sale.id,
      commandId: comandaId,
      userId: user?.id || '',
      createdAt: canceledAt
    }));
  }
  emit(UI_EVENTS.cashSummaryChanged, { type: 'comanda-cancelada', comandaId });
  recordAudit({
    action: 'comanda.cancel',
    entityType: 'comanda',
    entityId: comandaId,
    user,
    reason: cancelReason
  });
}

export function cancelTransaction(transactionId, { reason = '' } = {}) {
  const cancelReason = String(reason || '').trim();
  if (!cancelReason) {
    throw new Error('Informe o motivo do cancelamento.');
  }

  const user = getCurrentUser();
  assertPermission(user, 'sales.cancel');

  const currentTransactions = getTransactions();
  if (!currentTransactions.some((transaction) => transaction.id === transactionId)) {
    throw new Error('Movimentacao nao encontrada.');
  }

  const canceledAt = new Date().toISOString();
  let canceledSaleComandaId = null;
  let canceledMovementId = null;
  const transactions = currentTransactions.map((transaction) => {
    if (transaction.id !== transactionId) {
      return transaction;
    }

    if (transaction.type === 'venda' && transaction.comandaId) {
      canceledSaleComandaId = transaction.comandaId;
    } else {
      canceledMovementId = transaction.id;
    }

    return {
      ...transaction,
      status: 'cancelada',
      canceledAt,
      canceledBy: user?.id || '',
      canceledByName: user?.name || 'Sistema',
      cancelReason
    };
  });

  setItem(STORAGE_KEYS.transactions, transactions);

  if (!canceledSaleComandaId) {
    syncCashMovementCancellationToSupabase({ movementId: canceledMovementId, canceledAt });
    emit(UI_EVENTS.cashSummaryChanged, { type: 'movimentacao-cancelada', transactionId });
    recordAudit({
      action: 'transaction.cancel',
      entityType: 'transaction',
      entityId: transactionId,
      user,
      reason: cancelReason,
      metadata: {}
    });
    return;
  }

  const comandas = getClosedComandas().map((comanda) => {
    if (comanda.id !== canceledSaleComandaId || comanda.status !== 'fechada') {
      return comanda;
    }

    return {
      ...comanda,
      status: 'cancelada',
      canceledAt,
      canceledBy: user?.id || '',
      canceledByName: user?.name || 'Sistema',
      cancelReason
    };
  });

  setItem(STORAGE_KEYS.closedComandas, comandas);
  syncSaleCancellationToSupabase({ saleId: transactionId, comandaId: canceledSaleComandaId, canceledAt });
  const canceledSale = transactions.find((transaction) => transaction.id === transactionId && transaction.type === 'venda');
  if (canceledSale) {
    runShowcaseSync(reverseShowcaseSale({
      operationId: `reverse-${canceledSale.id}`,
      saleId: canceledSale.id,
      commandId: canceledSale.comandaId,
      userId: user?.id || '',
      createdAt: canceledAt
    }));
  }
  emit(UI_EVENTS.cashSummaryChanged, { type: 'movimentacao-cancelada', transactionId });
  recordAudit({
    action: 'transaction.cancel',
    entityType: 'transaction',
    entityId: transactionId,
    user,
    reason: cancelReason,
    metadata: {
      comandaId: canceledSaleComandaId
    }
  });
}

export function getActiveTransactions() {
  return getTransactions().filter((transaction) => transaction.status !== 'cancelada');
}

export function getTransactionSyncStatus() {
  return isSupabaseEnabled() ? getFinancialSyncStatus() : { state: 'local', pending: 0 };
}

export function getPaymentMethodTotals(transactions = getActiveTransactions()) {
  const sales = transactions.filter((transaction) => transaction.type === 'venda' && transaction.status !== 'cancelada');

  return {
    dinheiro: sumPaymentMethod(sales, 'dinheiro'),
    pix: sumPaymentMethod(sales, 'pix'),
    debito: sumPaymentMethod(sales, 'debito'),
    credito: sumPaymentMethod(sales, 'credito')
  };
}

export function getDailyMoneySummary() {
  return getMoneySummary({ period: 'today' });
}

export function getMoneySummary({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const filters = { customStart, customEnd };
  const activeTransactions = getActiveTransactions().filter((transaction) => isInPeriod(transaction.createdAt, period, filters));
  const entriesTotal = sumByType(activeTransactions, 'entrada');
  const salesTotal = sumByType(activeTransactions, 'venda');
  const outputsTotal = sumCashOutputs(activeTransactions);
  const paymentTotals = getPaymentMethodTotals(activeTransactions);
  const closedComandas = getClosedComandas().filter((comanda) => comanda.closedAt && isInPeriod(comanda.closedAt, period, filters));

  return {
    salesTotal,
    entriesTotal,
    outputsTotal,
    paymentTotals,
    expectedCash: paymentTotals.dinheiro + entriesTotal - outputsTotal,
    netTotal: salesTotal + entriesTotal - outputsTotal,
    closedComandas: closedComandas.filter((comanda) => comanda.status !== 'cancelada').length,
    canceledComandas: closedComandas.filter((comanda) => comanda.status === 'cancelada').length
  };
}

export function getTransactionSummary() {
  const transactions = getTransactions();

  return {
    entriesTotal: sumByType(transactions, 'entrada'),
    salesTotal: sumByType(transactions, 'venda'),
    outputsTotal: sumCashOutputs(transactions),
    closedComandas: getClosedComandas().filter((comanda) => comanda.status !== 'cancelada').length
  };
}

export function getBestSellingProducts({
  categoryId = 'todos',
  period = 'today',
  customStart = '',
  customEnd = ''
} = {}) {
  const sales = getTransactions().filter((transaction) => (
    transaction.type === 'venda'
      && transaction.status !== 'cancelada'
      && isInPeriod(transaction.createdAt, period, { customStart, customEnd })
  ));
  const totals = new Map();

  sales.forEach((sale) => {
    sale.items.forEach((item) => {
      const product = getProductById(item.productId);

      if (!product) {
        return;
      }

      if (categoryId !== 'todos' && product.categoryId !== categoryId) {
        return;
      }

      const current = totals.get(item.productId) || {
        productId: item.productId,
        name: item.name,
        categoryId: product.categoryId,
        quantity: 0,
        revenue: 0
      };

      current.quantity += item.quantity;
      current.revenue += item.total;
      totals.set(item.productId, current);
    });
  });

  return Array.from(totals.values()).sort((a, b) => {
    if (b.quantity !== a.quantity) {
      return b.quantity - a.quantity;
    }

    return b.revenue - a.revenue;
  });
}

function appendTransaction(transaction) {
  const transactions = getTransactions();
  transactions.unshift(transaction);
  setItem(STORAGE_KEYS.transactions, transactions);
}

function appendClosedComanda(comanda) {
  const comandas = getClosedComandas();
  comandas.unshift(comanda);
  setItem(STORAGE_KEYS.closedComandas, comandas);
}

function syncSaleToSupabase(sale, command) {
  if (!isSupabaseEnabled()) {
    return;
  }

  runFinancialSync(saveSaleToSupabase({ sale, command }));
}

function syncCashMovementToSupabase(movement) {
  if (!isSupabaseEnabled()) {
    return;
  }

  runFinancialSync(saveCashMovementToSupabase(movement));
}

function syncSaleCancellationToSupabase({ saleId, comandaId, canceledAt }) {
  if (!isSupabaseEnabled() || !saleId) {
    return;
  }

  runFinancialSync(cancelSaleInSupabase({ saleId, comandaId, canceledAt }));
}

function syncCashMovementCancellationToSupabase({ movementId, canceledAt }) {
  if (!isSupabaseEnabled() || !movementId) {
    return;
  }

  runFinancialSync(cancelCashMovementInSupabase({ movementId, canceledAt }));
}

function runFinancialSync(promise) {
  promise.catch((error) => {
    console.warn('Nao foi possivel enviar alteracao financeira ao Supabase.', error);
  });
}

function runShowcaseSync(promise) {
  promise.catch((error) => {
    console.warn('Nao foi possivel sincronizar alteracao da vitrine.', error);
  });
}

function sumByType(transactions, type) {
  return transactions
    .filter((transaction) => transaction.type === type && transaction.status !== 'cancelada')
    .reduce((total, transaction) => total + (transaction.total || transaction.amount || 0), 0);
}

function sumCashOutputs(transactions) {
  return transactions
    .filter((transaction) => ['saida', 'sangria'].includes(transaction.type) && transaction.status !== 'cancelada')
    .reduce((total, transaction) => total + (transaction.total || transaction.amount || 0), 0);
}

function sumPaymentMethod(sales, paymentMethod) {
  return sales
    .filter((sale) => sale.paymentMethod === paymentMethod)
    .reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isInPeriod(value, period, filters = {}) {
  if (!value || period === 'all') {
    return true;
  }

  const date = new Date(value);
  const now = new Date();

  if (period === 'custom') {
    const start = filters.customStart ? new Date(`${filters.customStart}T00:00:00`) : null;
    const end = filters.customEnd ? new Date(`${filters.customEnd}T23:59:59`) : null;
    return (!start || date >= start) && (!end || date <= end);
  }

  if (period === 'hour') {
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate()
      && date.getHours() === now.getHours();
  }

  if (period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }

  if (period === 'last7' || period === 'last30') {
    const days = period === 'last7' ? 7 : 30;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    return date >= start && date <= now;
  }

  if (period === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  if (period === 'year') {
    return date.getFullYear() === now.getFullYear();
  }

  return date.toDateString() === now.toDateString();
}
