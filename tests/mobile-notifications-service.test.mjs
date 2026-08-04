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
const notifications = await import('../src/services/mobile-notifications.service.js?v=20260804-04');
const auth = await import('../src/services/auth.service.js?v=20260804-04');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-04');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-04');

storage.resetAppData();
seedTestAdmin(storage, STORAGE_KEYS);

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
const saleDetailEvent = events.find((event) => event.kind === 'sale');
assert(saleDetailEvent.details.paymentLabel === 'Dinheiro', 'sale event should expose payment label for mobile detail');
assert(saleDetailEvent.details.items.some((item) => item.quantity === 2 && item.name === burger.name), 'sale event should expose purchased items and quantities');
assert(saleDetailEvent.details.change === 8, 'sale event should expose sale change for mobile detail');
assert(events.some((event) => event.kind === 'outflow' && event.level === 'danger'), 'high outflow should be danger');
assert(events.some((event) => event.kind === 'alert' && event.title === 'Produto acabando'), 'low showcase stock alert should be present');

const saleEvents = notifications.getMobileFeedEvents({ filter: 'sales' });
assert(saleEvents.length > 0, 'sales filter should return sale events');
assert(saleEvents.every((event) => event.kind === 'sale'), 'sales filter should only return sale events');

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

storage.setItem((await import('../src/database/schema.js?v=20260804-04')).STORAGE_KEYS.transactions, [
  {
    id: 'sale-yesterday',
    type: 'venda',
    status: 'ativa',
    items: [{ productId: burger.id, name: burger.name, quantity: 1, total: 16 }],
    total: 16,
    paymentMethod: 'dinheiro',
    createdAt: yesterday.toISOString()
  },
  {
    id: 'sale-today',
    type: 'venda',
    status: 'ativa',
    items: [{ productId: soda.id, name: soda.name, quantity: 1, total: 6 }],
    total: 6,
    paymentMethod: 'pix',
    createdAt: today.toISOString()
  }
]);
storage.setItem((await import('../src/database/schema.js?v=20260804-04')).STORAGE_KEYS.stockLaunches, []);

const liveEvents = notifications.getMobileFeedEvents({ now: today });
assert(liveEvents.some((event) => event.id === 'sale-sale-today'), 'live feed should include current-day events');
assert(!liveEvents.some((event) => event.id === 'sale-sale-yesterday'), 'live feed should hide previous-day events');

const yesterdayEvents = notifications.getMobileFeedEvents({ period: 'yesterday', now: today });
assert(yesterdayEvents.some((event) => event.id === 'sale-sale-yesterday'), 'yesterday filter should show previous-day events');
assert(!yesterdayEvents.some((event) => event.id === 'sale-sale-today'), 'yesterday filter should hide current-day events');

const historyEvents = notifications.getMobileFeedEvents({ period: 'all', now: today });
assert(historyEvents.some((event) => event.id === 'sale-sale-yesterday'), 'history filter should keep previous-day events accessible');
assert(historyEvents.some((event) => event.id === 'sale-sale-today'), 'history filter should include current-day events');

const currentMonthDate = new Date(today);
currentMonthDate.setDate(Math.max(1, today.getDate() - 2));
const previousMonthDate = new Date(today);
previousMonthDate.setMonth(today.getMonth() - 1);

storage.setItem((await import('../src/database/schema.js?v=20260804-04')).STORAGE_KEYS.transactions, [
  {
    id: 'sale-current-month',
    type: 'venda',
    status: 'ativa',
    items: [{ productId: burger.id, name: burger.name, quantity: 1, total: 16 }],
    total: 16,
    paymentMethod: 'dinheiro',
    createdAt: currentMonthDate.toISOString()
  },
  {
    id: 'sale-previous-month',
    type: 'venda',
    status: 'ativa',
    items: [{ productId: soda.id, name: soda.name, quantity: 1, total: 6 }],
    total: 6,
    paymentMethod: 'pix',
    createdAt: previousMonthDate.toISOString()
  }
]);

const monthEvents = notifications.getMobileFeedEvents({ period: 'month', now: today });
assert(monthEvents.some((event) => event.id === 'sale-sale-current-month'), 'month filter should show events from current month');
assert(!monthEvents.some((event) => event.id === 'sale-sale-previous-month'), 'month filter should hide events from previous months');

const customStart = formatDateInput(currentMonthDate);
const customEnd = formatDateInput(currentMonthDate);
const customEvents = notifications.getMobileFeedEvents({
  period: 'custom',
  customStart,
  customEnd,
  now: today
});
assert(customEvents.some((event) => event.id === 'sale-sale-current-month'), 'custom period should show events inside selected dates');
assert(!customEvents.some((event) => event.id === 'sale-sale-previous-month'), 'custom period should hide events outside selected dates');

const periodFilters = notifications.getMobileFeedPeriodFilters().map((filter) => filter.id).join(',');
assert(periodFilters === 'today,yesterday,month,custom', 'period filters should be today, yesterday, month, and custom period');

console.log('mobile notifications service ok');

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
