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
const cashFlow = await import('../src/services/mobile-cash-flow.service.js');

storage.resetAppData();

const burger = products.getProductById('x-burger');
comandas.clearComanda();
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 20 });
transactions.registerCashMovement({ type: 'entrada', amount: 100, description: 'Troco inicial' });
transactions.registerCashMovement({ type: 'saida', amount: 25, description: 'Compra de material' });

const summary = cashFlow.getMobileCashFlowSummary();

assert(summary.salesTotal === burger.price, 'cash flow should include daily sales total');
assert(summary.entriesTotal === 100, 'cash flow should include daily entries');
assert(summary.outputsTotal === 25, 'cash flow should include daily outputs');
assert(summary.expectedCash === burger.price + 100 - 25, 'cash flow should calculate expected cash');
assert(summary.estimatedProfit === burger.price + 100 - 25, 'cash flow should calculate estimated profit');
assert(summary.paymentTotals.dinheiro === burger.price, 'cash flow should include payment totals');
assert(summary.cards.length === 5, 'cash flow should expose five dashboard cards');

console.log('mobile cash flow service ok');
