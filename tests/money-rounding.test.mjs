// Regressao (QA 2026-11, BUG-028): somas de reais em ponto flutuante
// apareciam como 621.9999999999999 e 7662.099999999994 nos servicos.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const comanda = await import('../src/services/comanda.service.js?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');
const crm = await import('../src/services/crm-dashboard.service.js?v=20260804-06');
const { roundMoney } = await import('../src/utils/currency.js?v=20260804-06');

assert.equal(roundMoney(0.1 + 0.2), 0.3);
assert.equal(roundMoney(1.005), 1.01);
assert.equal(roundMoney(-2.675), -2.68);

storage.resetAppData();
seedTestAdmin(storage, keys);
comanda.addItemQuantity({ id: 'x', name: 'X', price: 0.1 }, 3);
assert.equal(comanda.getSubtotal(), 0.3, 'item 3 x 0,10 = 0,30');
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 1 });
for (const price of [62.2, 55.12, 4.8, 42.9, 83.1, 18.05]) {
  comanda.addItem({ id: `p-${price}`, name: 'P', price });
  transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 100 });
}
const summary = transactions.getMoneySummary({ period: 'today' });
assert.equal(summary.paymentTotals.dinheiro, 266.47);
assert.equal(String(summary.salesTotal), '266.47', 'sem residuo de ponto flutuante');
assert.equal(String(crm.getCrmSummary(crm.createPeriodFilter('today')).salesTotal), '266.47');
console.log('money rounding ok');
