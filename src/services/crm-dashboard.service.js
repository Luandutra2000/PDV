import { getCategories, getProductById } from './product.service.js';
import { getActiveComanda } from './comanda.service.js';
import { getClosedComandas, getTransactions } from './transaction.service.js';

export function createPeriodFilter(period = 'today', customStart = '', customEnd = '') {
  const now = new Date();

  if (period === 'custom') {
    return {
      period,
      start: customStart ? new Date(`${customStart}T00:00:00`) : null,
      end: customEnd ? new Date(`${customEnd}T23:59:59`) : null
    };
  }

  if (period === 'yesterday') {
    const start = new Date(now);
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { period, start, end };
  }

  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { period, start, end: now };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { period, start, end: now };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { period: 'today', start, end };
}

export function getCrmSummary(filter = createPeriodFilter()) {
  const transactions = getPeriodTransactions(filter);
  const sales = transactions.filter((transaction) => transaction.type === 'venda');
  const entries = transactions.filter((transaction) => transaction.type === 'entrada');
  const outputs = transactions.filter((transaction) => transaction.type === 'saida');
  const salesTotal = sumTransactions(sales);
  const entriesTotal = sumTransactions(entries);
  const outputsTotal = sumTransactions(outputs);
  const closedComandas = getClosedComandas().filter((comanda) => (
    comanda.status !== 'cancelada' && isInFilter(comanda.closedAt, filter)
  ));

  return {
    salesTotal,
    entriesTotal,
    outputsTotal,
    estimatedProfit: salesTotal + entriesTotal - outputsTotal,
    openComandas: getActiveComanda().items.length ? 1 : 0,
    closedComandas: closedComandas.length,
    ticketAverage: sales.length ? salesTotal / sales.length : 0,
    paymentTotals: {
      dinheiro: sumPayment(sales, 'dinheiro'),
      pix: sumPayment(sales, 'pix'),
      debito: sumPayment(sales, 'debito'),
      credito: sumPayment(sales, 'credito'),
      outros: sumOtherPayments(sales)
    }
  };
}

export function getProductRanking(filter = createPeriodFilter()) {
  const totals = new Map();

  getPeriodSales(filter).forEach((sale) => {
    sale.items.forEach((item) => {
      const product = getProductById(item.productId);
      const current = totals.get(item.productId) || {
        productId: item.productId,
        name: item.name,
        categoryId: product?.categoryId || '',
        quantity: 0,
        revenue: 0
      };

      current.quantity += item.quantity;
      current.revenue += item.total;
      totals.set(item.productId, current);
    });
  });

  const items = Array.from(totals.values());
  return {
    byQuantity: [...items].sort((a, b) => b.quantity - a.quantity),
    byRevenue: [...items].sort((a, b) => b.revenue - a.revenue)
  };
}

export function getCategoryRanking(filter = createPeriodFilter()) {
  const categories = getCategories();
  const totals = new Map();

  getProductRanking(filter).byQuantity.forEach((item) => {
    const category = categories.find((current) => current.id === item.categoryId);
    const current = totals.get(item.categoryId) || {
      categoryId: item.categoryId,
      name: category?.name || 'Sem categoria',
      quantity: 0,
      revenue: 0
    };

    current.quantity += item.quantity;
    current.revenue += item.revenue;
    totals.set(item.categoryId, current);
  });

  return Array.from(totals.values()).sort((a, b) => b.revenue - a.revenue);
}

export function getSalesSeries(filter = createPeriodFilter()) {
  const buckets = new Map();

  getPeriodTransactions(filter).forEach((transaction) => {
    const key = formatDateKey(transaction.createdAt);
    const current = buckets.get(key) || { label: key, sales: 0, entries: 0, outputs: 0 };

    if (transaction.type === 'venda') current.sales += Number(transaction.total || 0);
    if (transaction.type === 'entrada') current.entries += Number(transaction.amount || 0);
    if (transaction.type === 'saida') current.outputs += Number(transaction.amount || 0);

    buckets.set(key, current);
  });

  return Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function getFinancialMovements(filter = createPeriodFilter()) {
  return getPeriodTransactions(filter).map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    category: transaction.category || transaction.paymentMethod || 'sem-categoria',
    description: transaction.description || transaction.paymentMethod || `Comanda ${transaction.comandaNumber || ''}`.trim(),
    amount: Number(transaction.total || transaction.amount || 0),
    createdAt: transaction.createdAt,
    userName: transaction.userName || 'Local'
  }));
}

function getPeriodTransactions(filter) {
  return getTransactions().filter((transaction) => (
    transaction.status !== 'cancelada' && isInFilter(transaction.createdAt, filter)
  ));
}

function getPeriodSales(filter) {
  return getPeriodTransactions(filter).filter((transaction) => transaction.type === 'venda');
}

function isInFilter(value, filter) {
  if (!value) return false;
  const date = new Date(value);
  if (filter.start && date < filter.start) return false;
  if (filter.end && date > filter.end) return false;
  return true;
}

function sumTransactions(transactions) {
  return transactions.reduce((total, transaction) => total + Number(transaction.total || transaction.amount || 0), 0);
}

function sumPayment(sales, paymentMethod) {
  return sales
    .filter((sale) => sale.paymentMethod === paymentMethod)
    .reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function sumOtherPayments(sales) {
  return sales
    .filter((sale) => !['dinheiro', 'pix', 'debito', 'credito'].includes(sale.paymentMethod))
    .reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function formatDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}
