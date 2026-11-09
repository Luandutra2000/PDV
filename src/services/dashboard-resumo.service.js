import { getShowcaseStockValue } from './estoque.service.js?v=20260804-06';
import { getMoneySummary } from './transaction.service.js?v=20260804-06';

export function getDashboardResumo({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const filters = { period, customStart, customEnd };
  const money = getMoneySummary(filters);
  const totalVendido = money.salesTotal;
  const entradas = money.entriesTotal;
  const saidas = money.outputsTotal;
  const caixaAtual = totalVendido + entradas - saidas;
  // Valor atual da vitrine (saldo x preco), inclusive o que sobrou de outros dias.
  const vitrineEstimada = Math.round(getShowcaseStockValue() * 100) / 100;

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
