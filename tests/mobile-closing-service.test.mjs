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
const closing = await import('../src/services/cash-closing.service.js');
const mobileClosing = await import('../src/services/mobile-closing.service.js');

storage.resetAppData();

const burger = products.getProductById('x-burger');
comandas.clearComanda();
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 20 });
transactions.registerCashMovement({ type: 'entrada', amount: 10, description: 'Reforco' });
transactions.registerCashMovement({ type: 'saida', amount: 5, description: 'Compra pequena' });

const draft = closing.saveClosingDraft({ countedCash: burger.price + 3 });
closing.confirmClosing(draft);

const summary = mobileClosing.getMobileClosingSummary();

assert(summary.expectedCash === burger.price + 10 - 5, 'closing should expose expected cash');
assert(summary.entriesTotal === 10, 'closing should expose entries total');
assert(summary.outputsTotal === 5, 'closing should expose outputs total');
assert(summary.cashDifference === 0, 'closing preview without counted cash should default to no current difference');
assert(summary.history.length === 1, 'closing should expose closing history');

console.log('mobile closing service ok');
