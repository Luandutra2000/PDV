import { getProductionSalesComparison, getStockLaunches, getStockSummary } from './estoque.service.js';
import { getTransactions } from './transaction.service.js';

export function getMobileShowcaseSummary(filters = { period: 'today' }) {
  const normalizedFilters = { period: 'today', ...filters };
  const summary = getStockSummary(normalizedFilters);
  const rows = getProductionSalesComparison(normalizedFilters);
  const canceledLaunches = getStockLaunches(normalizedFilters).filter((launch) => launch.status === 'cancelado');
  const soldWithoutStock = calculateSoldWithoutStock(rows, normalizedFilters);
  const bestSellers = [...rows].sort((a, b) => b.quantidadeVendida - a.quantidadeVendida);
  const slowSellers = [...rows].sort((a, b) => a.percentualVendido - b.percentualVendido);

  return {
    cards: [
      { id: 'showcase', label: 'Vitrine', value: summary.producedUnits, tone: 'info', isCurrency: false },
      { id: 'sold', label: 'Vendidos', value: summary.soldUnits, tone: 'success', isCurrency: false },
      { id: 'leftovers', label: 'Sobras', value: summary.quantityBalance, tone: 'warning', isCurrency: false },
      { id: 'soldWithoutStock', label: 'Vendidos sem estoque', value: soldWithoutStock, tone: soldWithoutStock ? 'danger' : 'success', isCurrency: false }
    ],
    producedUnits: summary.producedUnits,
    soldUnits: summary.soldUnits,
    remainingUnits: summary.quantityBalance,
    estimatedValue: Math.max(0, summary.valueDifference),
    soldValue: summary.salesValue,
    valueDifference: summary.valueDifference,
    soldWithoutStock,
    bestSeller: bestSellers[0] || null,
    slowSeller: slowSellers[0] || null,
    lowStock: rows.filter((row) => row.sobraQuantidade > 0 && row.sobraQuantidade <= 5),
    rows,
    comparisonRows: rows,
    canceledLaunches
  };
}

function calculateSoldWithoutStock(rows, filters) {
  const producedByProduct = new Map(rows.map((row) => [row.produtoId, Number(row.quantidadeProduzida || 0)]));
  const soldByProduct = new Map();

  getTransactions()
    .filter((transaction) => transaction.type === 'venda' && transaction.status !== 'cancelada')
    .filter((transaction) => isInPeriod(transaction.createdAt, filters.period || 'today', filters))
    .forEach((sale) => {
      (sale.items || []).forEach((item) => {
        soldByProduct.set(item.productId, (soldByProduct.get(item.productId) || 0) + Number(item.quantity || 0));
      });
    });

  return Array.from(soldByProduct.entries()).reduce((total, [productId, sold]) => {
    const produced = producedByProduct.get(productId) || 0;
    return total + Math.max(0, sold - produced);
  }, 0);
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

  if (period === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  if (period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }

  if (period === 'year') {
    return date.getFullYear() === now.getFullYear();
  }

  return date.toDateString() === now.toDateString();
}
