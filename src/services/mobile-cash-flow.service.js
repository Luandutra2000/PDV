import { getDashboardResumo } from './dashboard-resumo.service.js?v=20260804-05';
import { getMoneySummary } from './transaction.service.js?v=20260804-05';

export function getMobileCashFlowSummary({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const resumo = getDashboardResumo({ period, customStart, customEnd });
  const summary = getMoneySummary({ period, customStart, customEnd });

  return {
    salesTotal: resumo.totalVendido,
    entriesTotal: resumo.entradas,
    outputsTotal: resumo.saidas,
    currentCash: resumo.caixaAtual,
    expectedCash: summary.expectedCash,
    estimatedProfit: resumo.caixaAtual,
    estimatedShowcase: resumo.vitrineEstimada,
    paymentTotals: summary.paymentTotals,
    cards: [
      { id: 'sales', label: 'Total vendido', value: resumo.totalVendido, tone: 'primary' },
      { id: 'entries', label: 'Entradas', value: resumo.entradas, tone: 'success' },
      { id: 'outputs', label: 'Saídas', value: resumo.saidas, tone: 'danger' },
      { id: 'cash', label: 'Caixa atual', value: resumo.caixaAtual, tone: 'info' },
      { id: 'showcase', label: 'Vitrine estimada', value: resumo.vitrineEstimada, tone: 'warning' }
    ]
  };
}
