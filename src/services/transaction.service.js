import { SYNC_EVENTS } from '../database/schema.js';
import { emit } from './event-bus.service.js';
import { getActiveComanda, getSubtotal, startNewComanda } from './comanda.service.js';
import { getProductById } from './product.service.js';
import { getDataProvider } from './data-provider.service.js';

export function finalizeComandaPayment({ paymentMethod, receivedAmount = 0 }) {
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
    createdAt: new Date().toISOString()
  };

  appendTransaction(sale);
  appendClosedComanda({
    ...comanda,
    status: 'fechada',
    closedAt: sale.createdAt,
    total,
    paymentMethod,
    receivedAmount: paidAmount,
    change
  });
  startNewComanda(comanda.number + 1);
  emit(SYNC_EVENTS.saleFinished, sale);

  return sale;
}

export function registerCashMovement({
  type,
  amount,
  category = 'sem-categoria',
  description = '',
  userName = 'Local'
}) {
  const normalizedAmount = Number(amount) || 0;

  if (!['entrada', 'saida'].includes(type)) {
    throw new Error('Tipo de movimento invalido.');
  }

  if (normalizedAmount <= 0) {
    throw new Error('Valor precisa ser maior que zero.');
  }

  const movement = {
    id: createId(type),
    type,
    status: 'ativa',
    amount: normalizedAmount,
    category: String(category || 'sem-categoria').trim() || 'sem-categoria',
    description,
    userName: String(userName || 'Local').trim() || 'Local',
    createdAt: new Date().toISOString()
  };

  appendTransaction(movement);
  emit(SYNC_EVENTS.cashMovementRegistered, movement);

  return movement;
}

export function getTransactions() {
  return getDataProvider().getCollection('transactions', []);
}

export function getClosedComandas() {
  return getDataProvider().getCollection('closedComandas', []);
}

export function clearTransactionHistory() {
  getDataProvider().setCollection('transactions', []);
  getDataProvider().setCollection('closedComandas', []);
}

export function cancelClosedComanda(comandaId) {
  const transactions = getTransactions().map((transaction) => {
    if (transaction.comandaId !== comandaId) {
      return transaction;
    }

    return {
      ...transaction,
      status: 'cancelada',
      canceledAt: new Date().toISOString()
    };
  });
  const comandas = getClosedComandas().map((comanda) => {
    if (comanda.id !== comandaId) {
      return comanda;
    }

    return {
      ...comanda,
      status: 'cancelada',
      canceledAt: new Date().toISOString()
    };
  });

  getDataProvider().setCollection('transactions', transactions);
  getDataProvider().setCollection('closedComandas', comandas);
}

export function cancelTransaction(transactionId) {
  const canceledAt = new Date().toISOString();
  let canceledSaleComandaId = null;
  const transactions = getTransactions().map((transaction) => {
    if (transaction.id !== transactionId) {
      return transaction;
    }

    if (transaction.type === 'venda' && transaction.comandaId) {
      canceledSaleComandaId = transaction.comandaId;
    }

    return {
      ...transaction,
      status: 'cancelada',
      canceledAt
    };
  });

  getDataProvider().setCollection('transactions', transactions);

  if (!canceledSaleComandaId) {
    return;
  }

  const comandas = getClosedComandas().map((comanda) => {
    if (comanda.id !== canceledSaleComandaId || comanda.status !== 'fechada') {
      return comanda;
    }

    return {
      ...comanda,
      status: 'cancelada',
      canceledAt
    };
  });

  getDataProvider().setCollection('closedComandas', comandas);
}

export function getActiveTransactions() {
  return getTransactions().filter((transaction) => transaction.status !== 'cancelada');
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
  const activeTransactions = getActiveTransactions().filter((transaction) => isInPeriod(transaction.createdAt, 'today'));
  const entriesTotal = sumByType(activeTransactions, 'entrada');
  const salesTotal = sumByType(activeTransactions, 'venda');
  const outputsTotal = sumByType(activeTransactions, 'saida');
  const paymentTotals = getPaymentMethodTotals(activeTransactions);
  const closedComandas = getClosedComandas().filter((comanda) => comanda.closedAt && isInPeriod(comanda.closedAt, 'today'));

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
    outputsTotal: sumByType(transactions, 'saida'),
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
  getDataProvider().setCollection('transactions', transactions);
}

function appendClosedComanda(comanda) {
  const comandas = getClosedComandas();
  comandas.unshift(comanda);
  getDataProvider().setCollection('closedComandas', comandas);
}

function sumByType(transactions, type) {
  return transactions
    .filter((transaction) => transaction.type === type && transaction.status !== 'cancelada')
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

  if (period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }

  if (period === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  if (period === 'year') {
    return date.getFullYear() === now.getFullYear();
  }

  return date.toDateString() === now.toDateString();
}
