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
const notifications = await import('../src/services/mobile-notifications.service.js');

storage.resetAppData();

const burger = products.getProductById('x-burger');
const soda = products.getProductById('refrigerante-lata');

estoque.createStockLaunch({ produtoId: burger.id, quantidade: 6 });
comandas.clearComanda();
comandas.addItem(burger);
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 40 });
transactions.registerCashMovement({ type: 'entrada', amount: 100, description: 'Troco inicial' });
transactions.registerCashMovement({ type: 'saida', amount: 85, description: 'Compra de material' });
estoque.createStockLaunch({ produtoId: soda.id, quantidade: 2 });

const events = notifications.getMobileFeedEvents({ now: new Date() });
assert(events.length >= 4, 'feed should include sales, cash movements, and stock alerts');
assert(events[0].createdAt >= events[1].createdAt, 'feed should be newest first');
assert(events.some((event) => event.kind === 'sale' && event.title === 'Venda realizada'), 'sale event should be present');
assert(events.some((event) => event.kind === 'outflow' && event.level === 'danger'), 'high outflow should be danger');
assert(events.some((event) => event.kind === 'alert' && event.title === 'Produto acabando'), 'low showcase stock alert should be present');

const saleEvents = notifications.getMobileFeedEvents({ filter: 'sales' });
assert(saleEvents.length > 0, 'sales filter should return sale events');
assert(saleEvents.every((event) => event.kind === 'sale'), 'sales filter should only return sale events');

console.log('mobile notifications service ok');
