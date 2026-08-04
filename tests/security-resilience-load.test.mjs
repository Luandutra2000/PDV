const store = new Map();

globalThis.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const storage = await import('../src/services/storage.service.js?v=20260804-05');
const schema = await import('../src/database/schema.js?v=20260804-05');
const products = await import('../src/services/product.service.js?v=20260804-05');
const comandas = await import('../src/services/comanda.service.js?v=20260804-05');
const transactions = await import('../src/services/transaction.service.js?v=20260804-05');
const backup = await import('../src/services/backup.service.js?v=20260804-05');
const { renderProductCard } = await import('../src/components/product-card.component.js?v=20260804-05');
const { renderOrderPanel } = await import('../src/components/order-panel.component.js?v=20260804-05');
const { seedTestAdmin, setTestUserSession } = await import('./test-auth-fixture.mjs?v=20260804-05');

storage.resetAppData();
seedTestAdmin(storage, schema.STORAGE_KEYS);

const attack = '\"><img src=x onerror=globalThis.__xss=1>';
const productMarkup = renderProductCard({
  id: attack,
  name: attack,
  stock: 1,
  price: 10
}, attack);
const orderMarkup = renderOrderPanel({
  items: [{ productId: attack, name: attack, unitPrice: 10, quantity: 1, total: 10 }]
});
assert(!productMarkup.includes('<img'), 'product card must escape stored HTML');
assert(!orderMarkup.includes('<img'), 'order panel must escape stored HTML');
assert(productMarkup.includes('&lt;img'), 'escaped product content should remain visible as text');

const burger = products.getProductById('x-burger');
const startedAt = performance.now();
for (let index = 0; index < 100; index += 1) {
  comandas.clearComanda();
  comandas.addItem(burger);
  transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 20 });
}
const durationMs = performance.now() - startedAt;
assert(transactions.getTransactions().filter((item) => item.type === 'venda').length === 100, '100 sequential orders should be preserved');
assert(durationMs < 5000, `100-order local load should finish under 5s, got ${Math.round(durationMs)}ms`);

const serialized = backup.createBackup();
const beforeRestoreSales = transactions.getTransactions().filter((item) => item.type === 'venda').length;
storage.resetAppData();
assert(transactions.getTransactions().length === 0, 'empty target should start without transactions');
const restored = backup.restoreBackup(serialized);
assert(restored.keysRestored > 0, 'backup should report restored keys');
assert(
  transactions.getTransactions().filter((item) => item.type === 'venda').length === beforeRestoreSales,
  'restored backup should reproduce all sales'
);

const tampered = JSON.parse(serialized);
tampered.data[schema.STORAGE_KEYS.transactions] = [];
let checksumRejected = false;
try {
  backup.restoreBackup(JSON.stringify(tampered));
} catch (error) {
  checksumRejected = error.message.includes('Checksum');
}
assert(checksumRejected, 'tampered backup must be rejected');
assert(
  transactions.getTransactions().filter((item) => item.type === 'venda').length === beforeRestoreSales,
  'failed restore must preserve current data'
);

setTestUserSession(storage, schema.STORAGE_KEYS, {
  id: 'operator-security',
  name: 'Operador',
  username: 'operator@example.test',
  role: 'operador',
  active: true
});
let unauthorizedCancelRejected = false;
try {
  transactions.cancelTransaction(transactions.getTransactions()[0].id, { reason: 'ID manipulado' });
} catch (error) {
  unauthorizedCancelRejected = error.message.includes('sem permissao');
}
assert(unauthorizedCancelRejected, 'identifier manipulation must not bypass cancellation permission');

console.log(`Security/resilience/load tests passed (100 orders in ${Math.round(durationMs)} ms).`);
