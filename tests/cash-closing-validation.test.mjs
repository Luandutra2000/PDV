import assert from 'node:assert/strict';

const store = new Map();
let blockedKey = null;
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => {
    if (key === blockedKey) throw new Error('QuotaExceededError');
    store.set(key, String(value));
  },
  removeItem: (key) => store.delete(key)
};
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const closing = await import('../src/services/cash-closing.service.js?v=20260804-06');
const mobile = await import('../src/services/mobile-closing.service.js?v=20260804-06');
seedTestAdmin(storage, STORAGE_KEYS);

for (const countedCash of ['abc', ' ', Infinity, NaN, true]) {
  const draft = closing.saveClosingDraft({ countedCash });
  assert.throws(() => closing.confirmClosing(draft, { sync: false }), /contado|valor/i, `reject invalid cash: ${countedCash}`);
}
for (const field of ['checkedPix', 'checkedDebit', 'checkedCredit']) {
  assert.throws(() => closing.confirmClosing(closing.saveClosingDraft({ countedCash: 0, [field]: 'abc' }), { sync: false }), /valor|conferido/i);
  assert.throws(() => closing.confirmClosing(closing.saveClosingDraft({ countedCash: 0, [field]: -1 }), { sync: false }), /valor|conferido/i);
}
assert.equal(closing.getCashClosings().length, 0, 'invalid amounts never create a confirmed closing');
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' };
for (const input of [{ countedCash: 'abc' }, { countedCash: ' ' }, { countedCash: 0, checkedCard: 'abc' }, { countedCash: 0, checkedPix: Infinity }]) {
  await assert.rejects(() => mobile.submitMobileClosing(input), /contado|valor|conferido/i, 'mobile rejects invalid values before sending');
}
globalThis.__PDV_RUNTIME_CONFIG__ = null;

storage.setItem(STORAGE_KEYS.transactions, [
  { id: 'decimal-cash', type: 'venda', paymentMethod: 'dinheiro', total: 0.1, createdAt: new Date().toISOString(), items: [] },
  { id: 'decimal-debit', type: 'venda', paymentMethod: 'debito', total: 0.1, createdAt: new Date().toISOString(), items: [] },
  { id: 'decimal-credit', type: 'venda', paymentMethod: 'credito', total: 0.2, createdAt: new Date().toISOString(), items: [] }
]);
const preview = mobile.previewMobileClosing({ countedCash: 0.2, checkedCard: 0.4 });
assert.equal(preview.expectedCard, 0.3);
assert.equal(preview.cardDifference, 0.1);
assert.equal(preview.differenceTotal, 0.2);
assert.equal(closing.buildClosingSummary().totals.sales, 0.4);
const pendingDraft = closing.saveClosingDraft({ countedCash: 0.1 });
blockedKey = STORAGE_KEYS.cashClosings;
assert.throws(() => closing.confirmClosing(pendingDraft, { sync: false }), /armazenamento/);
assert.equal(closing.getCashClosings().length, 0, 'failed closing storage never confirms or leaves a phantom in memory');
assert.equal(closing.getCurrentClosingDraft().id, pendingDraft.id, 'failed closing keeps its draft for retry');
blockedKey = null;
console.log('cash closing validation regression ok');
