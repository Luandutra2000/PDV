import { getStockSummary } from './estoque.service.js?v=20260804-04';
import { getMoneySummary } from './transaction.service.js?v=20260804-04';

export function getDashboardResumo({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const filters = { period, customStart, customEnd };
  const money = getMoneySummary(filters);
  const stock = getStockSummary(filters);
  const totalVendido = money.salesTotal;
  const entradas = money.entriesTotal;
  const saidas = money.outputsTotal;
  const caixaAtual = totalVendido + entradas - saidas;
  const vitrineEstimada = Math.max(0, Number(stock.valueDifference || 0));

  return {
    totalVendido,
    entradas,
    saidas,
    caixaAtual,
    vitrineEstimada,
    paymentTotals: money.paymentTotals,
    closedComandas: money.closedComandas,
    canceledComandas: money.canceledComandas
  };
}
