import { getMoneySummary } from './transaction.service.js';

export function getMobileCashFlowSummary(filters = {}) {
  const summary = getMoneySummary({
    period: filters.period || 'today',
    customStart: filters.customStart || '',
    customEnd: filters.customEnd || ''
  });
  const estimatedProfit = summary.salesTotal + summary.entriesTotal - summary.outputsTotal;
  const currentCash = estimatedProfit;

  return {
    salesTotal: summary.salesTotal,
    entriesTotal: summary.entriesTotal,
    outputsTotal: summary.outputsTotal,
    currentCash,
    expectedCash: summary.expectedCash,
    estimatedProfit,
    paymentTotals: summary.paymentTotals,
    cards: [
      { id: 'sales', label: 'Total vendido', value: summary.salesTotal, tone: 'primary' },
      { id: 'entries', label: 'Entradas', value: summary.entriesTotal, tone: 'success' },
      { id: 'outputs', label: 'Saidas', value: summary.outputsTotal, tone: 'danger' },
      { id: 'cash', label: 'Caixa atual', value: currentCash, tone: 'info' },
      { id: 'profit', label: 'Lucro estimado', value: estimatedProfit, tone: 'warning' }
    ]
  };
}
