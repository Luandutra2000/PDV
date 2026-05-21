const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const storage = await import('../src/services/storage.service.js');
const products = await import('../src/services/product.service.js');
const comandas = await import('../src/services/comanda.service.js');
const transactions = await import('../src/services/transaction.service.js');
const crm = await import('../src/services/crm-dashboard.service.js');

storage.ensureSeedData();
comandas.clearComanda();

comandas.addItem(products.getProductById('x-burger'));
comandas.addItem(products.getProductById('x-burger'));
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 40 });

comandas.addItem(products.getProductById('refrigerante-lata'));
transactions.finalizeComandaPayment({ paymentMethod: 'pix' });

transactions.registerCashMovement({
  type: 'entrada',
  amount: 20,
  category: 'reforco-caixa',
  description: 'Reforco'
});

transactions.registerCashMovement({
  type: 'saida',
  amount: 5,
  category: 'compra-ingredientes',
  description: 'Compra'
});

const period = crm.createPeriodFilter('today');
const summary = crm.getCrmSummary(period);

assert(summary.salesTotal === 38, 'CRM should total period sales');
assert(summary.entriesTotal === 20, 'CRM should total period entries');
assert(summary.outputsTotal === 5, 'CRM should total period outputs');
assert(summary.estimatedProfit === 53, 'CRM should calculate estimated profit');
assert(summary.ticketAverage === 19, 'CRM should calculate ticket average');
assert(summary.paymentTotals.dinheiro === 32, 'CRM should total cash payments');
assert(summary.paymentTotals.pix === 6, 'CRM should total pix payments');

const ranking = crm.getProductRanking(period);
assert(ranking.byQuantity[0].productId === 'x-burger', 'quantity ranking should put x-burger first');
assert(ranking.byRevenue[0].revenue === 32, 'revenue ranking should calculate product revenue');

const categoryRanking = crm.getCategoryRanking(period);
assert(categoryRanking[0].quantity >= 1, 'category ranking should aggregate sold units');

const dailySeries = crm.getSalesSeries(period);
assert(dailySeries.length === 1, 'today series should include one bucket');
assert(dailySeries[0].sales === 38, 'today series should include sales amount');

const movements = crm.getFinancialMovements(period);
assert(movements.length === 4, 'financial movements should include sales, entries and outputs');

console.log('crm dashboard service ok');
