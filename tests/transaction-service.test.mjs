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
const schema = await import('../src/database/schema.js');
const products = await import('../src/services/product.service.js');
const comandas = await import('../src/services/comanda.service.js');
const transactions = await import('../src/services/transaction.service.js');

storage.ensureSeedData();
comandas.clearComanda();
comandas.addItem(products.getProductById('x-burger'));
comandas.addItem(products.getProductById('x-burger'));

const sale = transactions.finalizeComandaPayment({
  paymentMethod: 'dinheiro',
  receivedAmount: 40
});

assert(sale.total === 32, 'sale total should match comanda subtotal');
assert(sale.change === 8, 'cash payment should calculate change');
assert(sale.paymentMethod === 'dinheiro', 'sale should keep payment method');
assert(sale.comandaNumber === 1, 'sale should store comanda number');
assert(sale.items.length === 1, 'sale should store sold items');
assert(comandas.getActiveComanda().items.length === 0, 'comanda should be cleared after payment');
assert(comandas.getActiveComanda().number === 2, 'active comanda should advance after payment');

comandas.addItem(products.getProductById('batata-frita'));
comandas.addItem(products.getProductById('batata-frita'));
comandas.addItem(products.getProductById('x-burger'));
transactions.finalizeComandaPayment({
  paymentMethod: 'pix',
  receivedAmount: 0
});

const bestSellers = transactions.getBestSellingProducts();
assert(bestSellers[0].productId === 'x-burger', 'best seller should be x-burger by quantity');
assert(bestSellers[0].quantity === 3, 'best seller should sum quantities across comandas');
assert(transactions.getBestSellingProducts({ categoryId: 'porcoes' })[0].productId === 'batata-frita', 'category filter should work');

transactions.registerCashMovement({
  type: 'entrada',
  amount: 10,
  description: 'Reforco de caixa'
});

transactions.registerCashMovement({
  type: 'saida',
  amount: 3,
  description: 'Compra pequena'
});

const summary = transactions.getTransactionSummary();

assert(summary.salesTotal === 76, 'summary should include sales total');
assert(summary.entriesTotal === 10, 'summary should include entries');
assert(summary.outputsTotal === 3, 'summary should include outputs');
assert(summary.closedComandas === 2, 'summary should count closed comandas');

transactions.cancelClosedComanda(sale.comandaId);
const canceledSummary = transactions.getTransactionSummary();
const canceledSale = transactions.getTransactions().find((transaction) => transaction.comandaId === sale.comandaId);
const canceledComanda = transactions.getClosedComandas().find((comanda) => comanda.id === sale.comandaId);

assert(canceledSummary.salesTotal === 44, 'canceling comanda should remove only that sale total');
assert(canceledSummary.closedComandas === 1, 'canceling comanda should remove closed comanda from active count');
assert(canceledSale.status === 'cancelada', 'canceling comanda should mark sale as canceled');
assert(canceledComanda.status === 'cancelada', 'canceling comanda should keep canceled comanda registered');

const entrada = transactions.registerCashMovement({
  type: 'entrada',
  amount: 5,
  description: 'Teste cancelamento'
});
transactions.cancelTransaction(entrada.id);
const canceledMovement = transactions.getTransactions().find((transaction) => transaction.id === entrada.id);

assert(canceledMovement.status === 'cancelada', 'canceling movement should mark transaction as canceled');

comandas.clearComanda();
comandas.addItemQuantity(products.getProductById('refrigerante-lata'), 5);
const quickItem = comandas.getActiveComanda().items.find((item) => item.productId === 'refrigerante-lata');
assert(quickItem.quantity === 5, 'quick quantity should add requested amount');
assert(quickItem.total === 30, 'quick quantity should calculate total');

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayIso = yesterday.toISOString();

storage.setItem(schema.STORAGE_KEYS.transactions, [
  ...transactions.getTransactions(),
  {
    id: 'sale-yesterday',
    type: 'venda',
    status: 'ativa',
    total: 100,
    paymentMethod: 'dinheiro',
    createdAt: yesterdayIso
  },
  {
    id: 'entry-yesterday',
    type: 'entrada',
    status: 'ativa',
    amount: 20,
    createdAt: yesterdayIso
  },
  {
    id: 'output-yesterday',
    type: 'saida',
    status: 'ativa',
    amount: 4,
    createdAt: yesterdayIso
  }
]);

storage.setItem(schema.STORAGE_KEYS.closedComandas, [
  ...transactions.getClosedComandas(),
  {
    id: 'closed-yesterday',
    status: 'fechada',
    closedAt: yesterdayIso
  },
  {
    id: 'canceled-yesterday',
    status: 'cancelada',
    closedAt: yesterdayIso
  }
]);

const dailyMoney = transactions.getDailyMoneySummary();
assert(dailyMoney.salesTotal === 44, 'daily money should ignore canceled sale');
assert(dailyMoney.entriesTotal === 10, 'daily money should ignore canceled entry');
assert(dailyMoney.outputsTotal === 3, 'daily money should include active outputs');
assert(dailyMoney.expectedCash === 7, 'expected cash should be active cash sales plus entries minus outputs');
assert(dailyMoney.paymentTotals.pix === 44, 'pix total should include active pix sale');
assert(dailyMoney.paymentTotals.dinheiro === 0, 'cash sale total should ignore canceled cash sale');
assert(dailyMoney.netTotal === 51, 'net total should be sales plus entries minus outputs');
assert(dailyMoney.closedComandas === 1, 'daily money should ignore previous-day closed comandas');
assert(dailyMoney.canceledComandas === 1, 'daily money should count canceled comandas');

const transactionCanceledSale = transactions.finalizeComandaPayment({
  paymentMethod: 'pix'
});
transactions.cancelTransaction(transactionCanceledSale.id);
const canceledByTransaction = transactions.getTransactions().find((transaction) => transaction.id === transactionCanceledSale.id);
const comandaCanceledByTransaction = transactions.getClosedComandas().find((comanda) => comanda.id === transactionCanceledSale.comandaId);
const transactionCanceledSummary = transactions.getTransactionSummary();

assert(canceledByTransaction.status === 'cancelada', 'canceling sale transaction should mark transaction as canceled');
assert(comandaCanceledByTransaction.status === 'cancelada', 'canceling sale transaction should mark matching closed comanda as canceled');
assert(transactionCanceledSummary.closedComandas === 2, 'canceling sale transaction should remove matching closed comanda from active count');

console.log('transaction service ok');
