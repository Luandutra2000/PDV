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

const storage = await import('../src/services/storage.service.js?v=20260804-04');
const products = await import('../src/services/product.service.js?v=20260804-04');
const comandas = await import('../src/services/comanda.service.js?v=20260804-04');
const transactions = await import('../src/services/transaction.service.js?v=20260804-04');
const estoque = await import('../src/services/estoque.service.js?v=20260804-04');
const cashFlow = await import('../src/services/mobile-cash-flow.service.js?v=20260804-04');
const auth = await import('../src/services/auth.service.js?v=20260804-04');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-04');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-04');

storage.resetAppData();
seedTestAdmin(storage, STORAGE_KEYS);

const burger = products.getProductById('x-burger');
comandas.clearComanda();
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 20 });
transactions.registerCashMovement({ type: 'entrada', amount: 100, description: 'Troco inicial' });
transactions.registerCashMovement({ type: 'saida', amount: 25, description: 'Compra de material' });
estoque.createStockLaunch({ produtoId: burger.id, quantidade: 3, note: 'Balcao' });

const summary = cashFlow.getMobileCashFlowSummary();

assert(summary.salesTotal === burger.price, 'cash flow should include daily sales total');
assert(summary.entriesTotal === 100, 'cash flow should include daily entries');
assert(summary.outputsTotal === 25, 'cash flow should include daily outputs');
assert(summary.expectedCash === burger.price + 100 - 25, 'cash flow should calculate expected physical cash');
assert(summary.estimatedProfit === burger.price + 100 - 25, 'cash flow should calculate current cash');
assert(summary.paymentTotals.dinheiro === burger.price, 'cash flow should include payment totals');
assert(summary.currentCash === summary.expectedCash, 'mobile Caixa atual should use total vendido + entradas - saídas');
assert(summary.cards.find((card) => card.id === 'cash').value === summary.expectedCash, 'Caixa atual card should show standardized current cash');
assert(summary.estimatedShowcase === burger.price * 2, 'mobile vitrine estimada should come from current showcase value');
assert(summary.cards.find((card) => card.id === 'showcase').label === 'Vitrine estimada', 'showcase card should use standard label');
assert(summary.cards.find((card) => card.id === 'cash').label === 'Caixa atual', 'cash card should use standard label');
assert(summary.cards.length === 5, 'cash flow should expose five dashboard cards');

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

storage.setItem((await import('../src/database/schema.js?v=20260804-04')).STORAGE_KEYS.transactions, [
  ...transactions.getTransactions(),
  {
    id: 'sale-yesterday',
    type: 'venda',
    status: 'ativa',
    items: [{ productId: burger.id, name: burger.name, quantity: 1, total: burger.price }],
    total: burger.price,
    paymentMethod: 'pix',
    createdAt: yesterday.toISOString()
  },
  {
    id: 'entry-yesterday',
    type: 'entrada',
    status: 'ativa',
    amount: 40,
    createdAt: yesterday.toISOString()
  }
]);

const yesterdaySummary = cashFlow.getMobileCashFlowSummary({ period: 'yesterday' });
assert(yesterdaySummary.salesTotal === burger.price, 'cash flow should respect selected period sales');
assert(yesterdaySummary.entriesTotal === 40, 'cash flow should respect selected period entries');
assert(yesterdaySummary.outputsTotal === 0, 'cash flow should hide outputs outside selected period');

console.log('mobile cash flow service ok');
