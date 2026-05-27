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
const estoque = await import('../src/services/estoque.service.js');
const showcase = await import('../src/services/mobile-showcase.service.js');

storage.resetAppData();

const burger = products.getProductById('x-burger');
const soda = products.getProductById('refrigerante-lata');

estoque.createStockLaunch({ produtoId: burger.id, quantidade: 10 });
estoque.createStockLaunch({ produtoId: soda.id, quantidade: 2 });
comandas.clearComanda();
comandas.addItem(burger);
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'pix' });

const summary = showcase.getMobileShowcaseSummary();

assert(summary.producedUnits === 12, 'showcase should include produced units');
assert(summary.soldUnits === 2, 'showcase should include sold units');
assert(summary.remainingUnits === 10, 'showcase should include remaining units');
assert(summary.estimatedValue === (burger.price * 10) + (soda.price * 2), 'showcase should include estimated value');
assert(summary.soldValue === burger.price * 2, 'showcase should include sold value');
assert(summary.bestSeller.produtoId === burger.id, 'showcase should expose best seller');
assert(summary.lowStock.some((item) => item.produtoId === soda.id), 'showcase should expose low stock rows');

console.log('mobile showcase service ok');
