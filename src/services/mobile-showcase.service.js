import { getProductionSalesComparison, getStockSummary } from './estoque.service.js';

export function getMobileShowcaseSummary(filters = {}) {
  const periodFilters = {
    period: filters.period || 'today',
    customStart: filters.customStart || '',
    customEnd: filters.customEnd || ''
  };
  const summary = getStockSummary(periodFilters);
  const rows = getProductionSalesComparison(periodFilters);
  const bestSellers = [...rows].sort((a, b) => b.quantidadeVendida - a.quantidadeVendida);
  const slowSellers = [...rows].sort((a, b) => a.percentualVendido - b.percentualVendido);

  return {
    producedUnits: summary.producedUnits,
    soldUnits: summary.soldUnits,
    remainingUnits: summary.quantityBalance,
    estimatedValue: summary.estimatedProductionValue,
    soldValue: summary.salesValue,
    valueDifference: summary.valueDifference,
    bestSeller: bestSellers[0] || null,
    slowSeller: slowSellers[0] || null,
    lowStock: rows.filter((row) => row.sobraQuantidade > 0 && row.sobraQuantidade <= 5),
    rows
  };
}
