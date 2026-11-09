import { getShowcaseStockValue } from './estoque.service.js?v=20260804-06';
import { getCashRefundsOfEarlierSales, getMoneySummary } from './transaction.service.js?v=20260804-06';
import { getCashSession } from './cash-session.service.js?v=20260804-06';
import { createPeriodFilter } from './crm-dashboard.service.js?v=20260804-06';

export function getDashboardResumo({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const filters = { period, customStart, customEnd };
  const money = getMoneySummary(filters);
  const totalVendido = money.salesTotal;
  const entradas = money.entriesTotal;
  const saidas = money.outputsTotal;
  // "Caixa atual" e o dinheiro da gaveta: Pix e cartoes nao entram. O troco
  // inicial e as devolucoes de vendas de outros dias so valem para hoje.
  const isToday = period === 'today';
  const caixaAtual = Math.round(((isToday ? Number(getCashSession()?.openingAmount || 0) : 0)
    + Number(money.paymentTotals.dinheiro || 0)
    + entradas
    - saidas
    - (isToday ? getCashRefundsOfEarlierSales(createPeriodFilter('today')) : 0)) * 100) / 100;
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
