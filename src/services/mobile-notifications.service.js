import { getProductionSalesComparison } from './estoque.service.js';
import { getTransactions } from './transaction.service.js';

const FILTERS = {
  all: () => true,
  sales: (event) => event.kind === 'sale',
  entries: (event) => event.kind === 'inflow',
  outputs: (event) => event.kind === 'outflow',
  alerts: (event) => event.kind === 'alert'
};

const HIGH_SALE_AMOUNT = 100;
const HIGH_OUTPUT_AMOUNT = 80;
const LOW_SHOWCASE_QUANTITY = 5;

export function getMobileFeedEvents({ filter = 'all', limit = 30, now = new Date() } = {}) {
  const events = [
    ...buildTransactionEvents(),
    ...buildShowcaseAlertEvents(now)
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return events.filter(FILTERS[filter] || FILTERS.all).slice(0, limit);
}

export function getMobileFeedFilters() {
  return [
    { id: 'all', label: 'Tudo' },
    { id: 'sales', label: 'Vendas' },
    { id: 'entries', label: 'Entradas' },
    { id: 'outputs', label: 'Saidas' },
    { id: 'alerts', label: 'Alertas' }
  ];
}

function buildTransactionEvents() {
  return getTransactions()
    .filter((transaction) => transaction.status !== 'cancelada')
    .map((transaction) => {
      if (transaction.type === 'venda') {
        return buildSaleEvent(transaction);
      }

      if (transaction.type === 'entrada') {
        return buildCashEvent(transaction, 'inflow');
      }

      if (transaction.type === 'saida') {
        return buildCashEvent(transaction, 'outflow');
      }

      return null;
    })
    .filter(Boolean);
}

function buildSaleEvent(sale) {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const quantity = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const firstItem = items[0]?.name || 'Venda';

  return {
    id: `sale-${sale.id}`,
    kind: 'sale',
    level: Number(sale.total || 0) >= HIGH_SALE_AMOUNT ? 'success' : 'info',
    title: 'Venda realizada',
    description: `${quantity} item(ns) - ${firstItem}`,
    amount: Number(sale.total || 0),
    createdAt: sale.createdAt || new Date().toISOString(),
    icon: 'R$'
  };
}

function buildCashEvent(movement, kind) {
  const isOutput = kind === 'outflow';
  const amount = Number(movement.amount || 0);

  return {
    id: `${kind}-${movement.id}`,
    kind,
    level: isOutput && amount >= HIGH_OUTPUT_AMOUNT ? 'danger' : isOutput ? 'warning' : 'success',
    title: isOutput ? 'Saida de caixa' : 'Entrada de caixa',
    description: movement.description || movement.category || 'Movimento de caixa',
    amount,
    createdAt: movement.createdAt || new Date().toISOString(),
    icon: isOutput ? '!' : '+'
  };
}

function buildShowcaseAlertEvents(now) {
  return getProductionSalesComparison({ period: 'today' })
    .filter((item) => item.sobraQuantidade > 0 && item.sobraQuantidade <= LOW_SHOWCASE_QUANTITY)
    .map((item) => ({
      id: `showcase-low-${item.produtoId}`,
      kind: 'alert',
      level: 'danger',
      title: 'Produto acabando',
      description: `${item.produtoNome}: restam ${item.sobraQuantidade} unidade(s)`,
      amount: null,
      createdAt: now.toISOString(),
      icon: '!'
    }));
}
