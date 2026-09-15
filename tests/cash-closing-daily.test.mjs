import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};
process.env.TZ = 'America/Sao_Paulo';
const RealDate = Date;
let now = new RealDate('2026-09-15T12:00:00-03:00').getTime();
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const closing = await import('../src/services/cash-closing.service.js?v=20260804-06');
const mobile = await import('../src/services/mobile-closing.service.js?v=20260804-06');
const crm = await import('../src/services/crm-dashboard.service.js?v=20260804-06');
seedTestAdmin(storage, STORAGE_KEYS);
const sale = (id, total, createdAt) => ({ id, type: 'venda', paymentMethod: 'dinheiro', total, createdAt, items: [] });
const yesterday = sale('yesterday', 100, '2026-09-14T23:59:59.999-03:00');
const today = sale('today', 10, '2026-09-15T00:00:00-03:00');
storage.setItem(STORAGE_KEYS.transactions, [yesterday, today]);
storage.setItem(STORAGE_KEYS.outOfStockSales, [yesterday, today].map((item) => ({
  id: item.id, saleId: item.id, productId: 'qa-product', quantity: 1, createdAt: item.createdAt
})));

const summary = closing.buildClosingSummary();
assert.equal(summary.payments.expectedCash, 10, 'daily closing excludes yesterday, even within the same UTC date');
assert.equal(summary.totals.sales, 10);
assert.equal(summary.totals.closedComandas, 1);
assert.deepEqual(summary.outOfStockSales.map((item) => item.saleId), ['today']);
assert.equal(summary.payments.expectedCash, crm.getCrmSummary().paymentTotals.dinheiro);
assert.equal(mobile.getMobileClosingSummary().formDefaults.countedCash, 10);
assert.equal(mobile.previewMobileClosing().expectedTotal, 10);

const first = closing.confirmClosing(closing.saveClosingDraft({ countedCash: 10 }), { sync: false });
now += 1000;
const lateSale = sale('later', 2.35, new Date().toISOString());
storage.setItem(STORAGE_KEYS.transactions, [yesterday, today, lateSale]);
assert.equal(closing.buildClosingSummary().payments.expectedCash, 12.35, 'second count is cumulative for the same day');
assert.deepEqual(closing.getSalesAfterClosing(first).map((item) => item.id), ['later']);
const second = closing.confirmClosing(closing.saveClosingDraft({ countedCash: 12.35 }), { sync: false });
storage.setItem(STORAGE_KEYS.transactions, [yesterday, { ...today, status: 'cancelada' }, lateSale]);
assert.equal(closing.buildClosingSummary().payments.expectedCash, 2.35, 'later cancellation updates the current daily summary');
assert.equal(first.totals.sales, 10, 'previous closing remains a snapshot');
assert.equal(second.totals.sales, 12.35);
const staleDraft = closing.saveClosingDraft({ countedCash: 2.35 });

now = new RealDate('2026-09-16T00:00:00-03:00').getTime();
assert.equal(closing.buildClosingSummary().payments.expectedCash, 0, 'local midnight starts a fresh daily summary');
assert.equal(mobile.getMobileClosingSummary().expectedCash, 0);
assert.deepEqual(closing.buildClosingSummary().outOfStockSales, []);
assert.throws(() => closing.confirmClosing(staleDraft, { sync: false }), /hoje|dia/i, 'a previous-day draft cannot be confirmed today');
storage.setItem(STORAGE_KEYS.transactions, [yesterday, today, lateSale, sale('next-day', 50, new Date().toISOString())]);
assert.deepEqual(closing.getSalesAfterClosing(first).map((item) => item.id), ['later'], 'history warnings only include sales from the closing day');
globalThis.Date = RealDate;
console.log('cash closing daily regression ok');
