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

export function getMobileFeedEvents({
  filter = 'all',
  period = 'today',
  customStart = '',
  customEnd = '',
  limit = 30,
  now = new Date()
} = {}) {
  const events = [
    ...buildTransactionEvents(),
    ...buildShowcaseAlertEvents(now)
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return events
    .filter((event) => isInFeedPeriod(event.createdAt, period, now, { customStart, customEnd }))
    .filter(FILTERS[filter] || FILTERS.all)
    .slice(0, limit);
}

export function getMobileFeedFilters() {
  return [
    { id: 'all', label: 'Tudo' },
    { id: 'sales', label: 'Vendas' },
    { id: 'entries', label: 'Entradas' },
    { id: 'outputs', label: 'Saídas' },
    { id: 'alerts', label: 'Alertas' }
  ];
}

export function getMobileFeedPeriodFilters() {
  return [
    { id: 'today', label: 'Hoje' },
    { id: 'yesterday', label: 'Ontem' },
    { id: 'month', label: 'Mes' },
    { id: 'custom', label: 'Periodo' }
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
  const quantity = sale.items.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const firstItem = sale.items[0]?.name || 'Venda';

  return {
    id: `sale-${sale.id}`,
    kind: 'sale',
    level: Number(sale.total || 0) >= HIGH_SALE_AMOUNT ? 'success' : 'info',
    title: 'Venda realizada',
    description: `${quantity} item(ns) - ${firstItem}`,
    amount: Number(sale.total || 0),
    createdAt: sale.createdAt,
    icon: 'R$',
    details: {
      comandaNumber: sale.comandaNumber,
      paymentMethod: sale.paymentMethod,
      paymentLabel: getPaymentLabel(sale.paymentMethod),
      receivedAmount: Number(sale.receivedAmount || 0),
      change: Number(sale.change || 0),
      total: Number(sale.total || 0),
      items: sale.items.map((item) => ({
        name: item.name,
        quantity: Number(item.quantity || 0) || 1,
        total: Number(item.total || 0)
      }))
    }
  };
}

function getPaymentLabel(method) {
  const labels = {
    dinheiro: 'Dinheiro',
    pix: 'Pix',
    debito: 'Debito',
    credito: 'Credito'
  };

  return labels[method] || method || 'Nao informado';
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
    createdAt: movement.createdAt,
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

function isInFeedPeriod(value, period, now, filters = {}) {
  if (!value || period === 'all') {
    return true;
  }

  const date = new Date(value);

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
    return isSameCalendarDay(date, yesterday);
  }

  return isSameCalendarDay(date, now);
}

function isSameCalendarDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}
