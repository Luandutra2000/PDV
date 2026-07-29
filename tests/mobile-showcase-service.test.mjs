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

const storage = await import('../src/services/storage.service.js?v=20260729-12');
const products = await import('../src/services/product.service.js?v=20260729-12');
const comandas = await import('../src/services/comanda.service.js?v=20260729-12');
const transactions = await import('../src/services/transaction.service.js?v=20260729-12');
const estoque = await import('../src/services/estoque.service.js?v=20260729-12');
const showcase = await import('../src/services/mobile-showcase.service.js?v=20260729-12');
const auth = await import('../src/services/auth.service.js?v=20260729-12');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260729-12');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260729-12');

storage.resetAppData();
seedTestAdmin(storage, STORAGE_KEYS);

const burger = products.getProductById('x-burger');
const soda = products.getProductById('refrigerante-lata');

estoque.createStockLaunch({ produtoId: burger.id, quantidade: 10 });
estoque.createStockLaunch({ produtoId: soda.id, quantidade: 2 });
comandas.clearComanda();
comandas.addItem(burger);
comandas.addItem(burger);
transactions.finalizeComandaPayment({
  paymentMethod: 'pix'
});

const summary = showcase.getMobileShowcaseSummary();

assert(summary.producedUnits === 12, 'showcase should include produced units');
assert(summary.soldUnits === 2, 'showcase should include sold units');
assert(summary.remainingUnits === 10, 'showcase should include remaining units');
assert(summary.estimatedValue === (burger.price * 8) + (soda.price * 2), 'showcase should include current estimated showcase value');
assert(summary.soldValue === burger.price * 2, 'showcase should include sold value');
assert(summary.bestSeller.produtoId === burger.id, 'showcase should expose best seller');
assert(summary.lowStock.some((item) => item.produtoId === soda.id), 'showcase should expose low stock rows');

const canceledLaunch = estoque.createStockLaunch({ produtoId: soda.id, quantidade: 3 });
estoque.cancelStockLaunch(canceledLaunch.id);

const summaryAfterCancel = showcase.getMobileShowcaseSummary();

assert(Array.isArray(summaryAfterCancel.cards), 'showcase should expose mobile cards');
assert(summaryAfterCancel.cards.find((card) => card.id === 'showcase').value === 12, 'Vitrine card should count active produced units');
assert(summaryAfterCancel.cards.find((card) => card.id === 'sold').value === 2, 'Vendidos card should count sold units');
assert(summaryAfterCancel.cards.find((card) => card.id === 'leftovers').value === 10, 'Sobras card should count remaining active units');
assert(summaryAfterCancel.cards.find((card) => card.id === 'soldWithoutStock').value === 0, 'Vendidos sem estoque should be zero when production covers sales');
assert(summaryAfterCancel.comparisonRows[0].produtoNome, 'comparison rows should include product name');
assert('valorProduzido' in summaryAfterCancel.comparisonRows[0], 'comparison rows should include produced value');
assert(summaryAfterCancel.canceledLaunches.some((launch) => launch.id === canceledLaunch.id), 'showcase should expose canceled launches');
assert(!summaryAfterCancel.rows.some((row) => row.produtoId === soda.id && row.quantidadeProduzida === 5), 'canceled launches should not inflate active rows');

console.log('mobile showcase service ok');
