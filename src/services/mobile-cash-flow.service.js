import { getCaixaSummary } from './caixa.service.js';
import { getDailyMoneySummary } from './transaction.service.js';

export function getMobileCashFlowSummary() {
  const caixa = getCaixaSummary();
  const summary = getDailyMoneySummary();
  const currentCash = Number(caixa.currentAmount || 0);
  const estimatedProfit = summary.salesTotal + summary.entriesTotal - summary.outputsTotal;

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
      { id: 'cash', label: 'Saldo caixa', value: currentCash, tone: 'info' },
      { id: 'profit', label: 'Lucro estimado', value: estimatedProfit, tone: 'warning' }
    ]
  };
}
