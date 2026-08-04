import { getMoneySummary, getTransactions, getClosedComandas } from './transaction.service.js?v=20260804-05';

export function reconcileOperations({
  period = 'today',
  customStart = '',
  customEnd = '',
  userId = '',
  productId = '',
  paymentMethod = '',
  remote = null
} = {}) {
  const filter = { period, customStart, customEnd, userId, productId, paymentMethod };
  const allTransactions = getTransactions();
  const sales = allTransactions
    .filter((transaction) => transaction.type === 'venda' && transaction.status !== 'cancelada')
    .filter((sale) => matchesFilters(sale, filter));
  const movements = allTransactions
    .filter((transaction) => ['entrada', 'saida', 'sangria'].includes(transaction.type) && transaction.status !== 'cancelada')
    .filter((movement) => matchesFilters(movement, filter));
  const commands = getClosedComandas()
    .filter((command) => command.status !== 'cancelada')
    .filter((command) => matchesPeriod(command.closedAt || command.createdAt, filter));
  const issues = [];

  sales.forEach((sale) => {
    const command = commands.find((candidate) => candidate.id === sale.comandaId);
    if (!command) {
      issues.push(issue('sale_without_command', sale.id, 'Venda sem comanda fechada correspondente.'));
    } else {
      compareMoney(issues, 'sale_command_total', sale.id, sale.total, command.total);
      if (sale.paymentMethod !== command.paymentMethod) {
        issues.push(issue('sale_command_payment', sale.id, 'Forma de pagamento difere da comanda.'));
      }
    }

    const itemTotal = sale.items.reduce((total, item) => total + Number(item.total || 0), 0);
    compareMoney(issues, 'sale_items_total', sale.id, sale.total, itemTotal);

  });

  commands.forEach((command) => {
    if (!sales.some((sale) => sale.comandaId === command.id) && matchesEntityFilters(command, filter)) {
      issues.push(issue('command_without_sale', command.id, 'Comanda fechada sem venda correspondente.'));
    }
  });

  const salesTotal = roundMoney(sales.reduce((total, sale) => total + Number(sale.total || 0), 0));
  const paymentTotals = sumPayments(sales);
  compareMoney(
    issues,
    'sales_payment_totals',
    'period',
    salesTotal,
    Object.values(paymentTotals).reduce((total, value) => total + value, 0)
  );

  const entriesTotal = sumMovements(movements, ['entrada']);
  const outputsTotal = sumMovements(movements, ['saida', 'sangria']);
  const expectedCash = roundMoney(paymentTotals.dinheiro + entriesTotal - outputsTotal);

  if (!userId && !productId && !paymentMethod) {
    const summary = getMoneySummary({ period, customStart, customEnd });
    compareMoney(issues, 'report_sales_total', 'money-summary', salesTotal, summary.salesTotal);
    compareMoney(issues, 'report_expected_cash', 'money-summary', expectedCash, summary.expectedCash);
  }

  if (remote) {
    compareRemoteCollection(issues, 'sale', sales, remote.sales || [], 'id', ['status', 'total', 'paymentMethod']);
    compareRemoteCollection(issues, 'command', commands, remote.commands || [], 'id', ['status', 'total', 'paymentMethod']);
    if (Array.isArray(remote.saleItems)) {
      compareRemoteSaleItems(issues, sales, remote.saleItems);
    }
  }

  return {
    ok: issues.length === 0,
    generatedAt: new Date().toISOString(),
    filters: filter,
    totals: {
      sales: salesTotal,
      entries: entriesTotal,
      outputs: outputsTotal,
      expectedCash,
      payments: paymentTotals,
      salesCount: sales.length,
      commandsCount: commands.filter((command) => matchesEntityFilters(command, filter)).length,
      soldUnits: sales.reduce(
        (total, sale) => total + sale.items.reduce((subtotal, item) => subtotal + Number(item.quantity || 0), 0),
        0
      )
    },
    issues
  };
}

function compareRemoteSaleItems(issues, sales, remoteItems) {
  sales.forEach((sale) => {
    sale.items.forEach((item) => {
      const remote = remoteItems.find((candidate) => (
        candidate.saleId === sale.id && candidate.productId === item.productId
      ));
      const entityId = `${sale.id}:${item.productId}`;
      if (!remote) {
        issues.push(issue('remote_missing_sale_item', entityId, 'Item vendido ausente no banco remoto.'));
        return;
      }
      compareMoney(issues, 'remote_sale_item_quantity', entityId, item.quantity, remote.quantity);
      compareMoney(issues, 'remote_sale_item_total', entityId, item.total, remote.total);
    });
  });
}

function compareRemoteCollection(issues, entityType, localItems, remoteItems, idField, fields) {
  localItems.forEach((local) => {
    const remote = remoteItems.find((candidate) => candidate[idField] === local[idField]);
    if (!remote) {
      issues.push(issue(`remote_missing_${entityType}`, local[idField], `${entityType} ausente no banco remoto.`));
      return;
    }
    fields.forEach((field) => {
      const localValue = normalizeComparable(local[field]);
      const remoteValue = normalizeComparable(remote[field]);
      if (localValue !== remoteValue) {
        issues.push(issue(`remote_${entityType}_${field}`, local[idField], `${field} diverge do banco remoto.`, localValue, remoteValue));
      }
    });
  });
}

function sumPayments(sales) {
  const totals = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
  sales.forEach((sale) => {
    if (Object.hasOwn(totals, sale.paymentMethod)) {
      totals[sale.paymentMethod] += Number(sale.total || 0);
    }
  });
  Object.keys(totals).forEach((key) => { totals[key] = roundMoney(totals[key]); });
  return totals;
}

function sumMovements(movements, types) {
  return roundMoney(movements
    .filter((movement) => types.includes(movement.type))
    .reduce((total, movement) => total + Number(movement.amount || 0), 0));
}

function compareMoney(issues, code, entityId, expected, actual) {
  const left = roundMoney(expected);
  const right = roundMoney(actual);
  if (left !== right) {
    issues.push(issue(code, entityId, 'Valores divergentes.', left, right));
  }
}

function issue(code, entityId, message, expected = null, actual = null) {
  return { code, entityId, message, expected, actual };
}

function matchesFilters(entity, filter) {
  return matchesPeriod(entity.createdAt, filter)
    && matchesEntityFilters(entity, filter);
}

function matchesEntityFilters(entity, filter) {
  if (filter.userId && entity.createdBy !== filter.userId && entity.userId !== filter.userId) return false;
  if (filter.paymentMethod && entity.paymentMethod !== filter.paymentMethod) return false;
  if (filter.productId && !(entity.items || []).some((item) => item.productId === filter.productId)) return false;
  return true;
}

function matchesPeriod(value, { period, customStart, customEnd }) {
  if (!value || period === 'all') return true;
  const date = new Date(value);
  const now = new Date();
  if (period === 'custom') {
    const start = customStart ? new Date(`${customStart}T00:00:00`) : null;
    const end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : null;
    return (!start || date >= start) && (!end || date <= end);
  }
  if (period === 'today') return date.toDateString() === now.toDateString();
  if (period === 'month') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  return true;
}

function normalizeComparable(value) {
  return typeof value === 'number' ? roundMoney(value) : String(value ?? '');
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
