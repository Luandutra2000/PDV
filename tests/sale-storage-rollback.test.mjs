import assert from 'node:assert/strict';
const disk = new Map();
let failKey = '';
globalThis.localStorage = {
  getItem: key => disk.get(key) ?? null,
  setItem(key, value) { if (key === failKey) { failKey = ''; throw new Error('QuotaExceededError'); } disk.set(key, String(value)); },
  removeItem: key => disk.delete(key), clear: () => disk.clear()
};
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const comanda = await import('../src/services/comanda.service.js?v=20260804-06');
const { finalizeComandaPayment } = await import('../src/services/transaction.service.js?v=20260804-06');
const { on, emit } = await import('../src/services/event-bus.service.js?v=20260804-06');
const { SYNC_EVENTS, UI_EVENTS } = await import('../src/database/schema.js?v=20260804-06');
const { runLocalTransaction, deferLocalEffect, setLocalCache } = await import('../src/services/providers/local.provider.js?v=20260804-06');
seedTestAdmin(storage, keys);
storage.ensureSeedData();
comanda.clearComanda();
comanda.addItem({id:'qa',name:'QA',price:7.5});
for (const key of [keys.closedComandas, keys.activeComanda, keys.auditLogs, keys.showcaseMovements]) {
  const before = new Map(disk);
  failKey = key;
  assert.throws(() => finalizeComandaPayment({paymentMethod:'pix'}), /Quota|armazenamento/);
  assert.deepEqual(disk, before, `failed ${key} must preserve sale, cart and stock`);
  assert.equal(comanda.getActiveComanda().items.length, 1);
}
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args);
let laterListeners = 0;
for (const eventName of [UI_EVENTS.showcaseDataChanged, SYNC_EVENTS.saleFinished, UI_EVENTS.cashSummaryChanged]) {
  on(eventName, () => { throw new Error(`observer:${eventName}`); });
  on(eventName, () => { laterListeners++; });
}
let sale;
try {
  sale = finalizeComandaPayment({paymentMethod:'pix'});
} finally {
  console.warn = originalWarn;
}
assert.equal(sale.total, 7.5);
assert.notEqual(sale.comandaId, 'comanda-local', 'new devices must not reuse the demo command identity');
assert.equal(storage.getItem(keys.transactions).length, 1);
assert.equal(comanda.getActiveComanda().items.length, 0);
assert.equal(laterListeners, 3, 'all later observers must run despite earlier observer failures');
assert.equal(warnings.length, 3, 'secondary observer failures must be reported');

let lastEffectRan = false;
console.warn = (...args) => warnings.push(args);
try {
  const result = runLocalTransaction(() => {
    setLocalCache('pdv.testCommitted', { confirmed: true });
    deferLocalEffect(() => { throw new Error('after commit'); });
    deferLocalEffect(() => { lastEffectRan = true; });
    return 'confirmed';
  });
  assert.equal(result, 'confirmed');
} finally {
  console.warn = originalWarn;
}
assert(lastEffectRan, 'one failed post-commit effect must not block remaining effects');
assert.equal(JSON.parse(disk.get('pdv.testCommitted')).confirmed, true);
const beforeValidationFailure = new Map(disk);
assert.throws(() => runLocalTransaction(() => {
  setLocalCache('pdv.testCommitted', { confirmed: false });
  throw new Error('validation before commit');
}), /validation before commit/);
assert.deepEqual(disk, beforeValidationFailure, 'pre-commit errors must still reject and preserve disk');
const warningsBeforeAsync = warnings.length;
console.warn = (...args) => warnings.push(args);
try {
  on('test.asyncObserver', async () => { throw new Error('async observer failed'); });
  emit('test.asyncObserver');
  deferLocalEffect(async () => { throw new Error('async effect failed'); });
  await new Promise(resolve => setImmediate(resolve));
} finally {
  console.warn = originalWarn;
}
assert.equal(warnings.length, warningsBeforeAsync + 2, 'async secondary failures must be observed without unhandled rejections');
console.log('Sale quota rollback and successful retry passed');
