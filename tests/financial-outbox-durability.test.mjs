import assert from 'node:assert/strict';
const disk = new Map();
globalThis.localStorage = {
  getItem: (key) => disk.get(key) ?? null,
  setItem: (key, value) => disk.set(key, String(value)),
  removeItem: (key) => disk.delete(key)
};
const financial = await import('../src/services/financial-sync.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const queue = () => JSON.parse(disk.get(STORAGE_KEYS.financialSyncQueue) || '[]');
const movement = (amount) => ({ id: 'durable', type: 'entrada', status: 'ativa', amount, createdAt: new Date().toISOString() });
let release;
let signalStarted;
const started = new Promise((resolve) => { signalStarted = resolve; });
const gate = new Promise((resolve) => { release = resolve; });
const calls = [];
const client = { from: () => ({
  async upsert(rows) {
    calls.push({ action: 'save', amount: rows[0].amount });
    if (calls.length === 1) { signalStarted(); await gate; }
    return { error: null };
  },
  update(patch) { return { async eq() { calls.push({ action: 'cancel', status: patch.status }); return { error: null }; } }; }
}) };
financial.configureFinancialSyncForTests({ getClient: async () => client });
const first = financial.saveCashMovementToSupabase(movement(10));
assert.equal(queue().length, 1, 'operation is durable synchronously, before client or request resolves');
globalThis.__PDV_MEMORY_CACHE__ = new Map();
globalThis.__PDV_SERIALIZED_CACHE__ = new Map();
assert.equal(financial.getFinancialSyncStatus().pending, 1, 'a reload during a suspended request retains the outbox');
await started;
const flushing = financial.flushFinancialQueue();
await financial.saveCashMovementToSupabase(movement(20));
assert.equal(queue()[0].movement.amount, 20, 'new revision is persisted while older revision is in flight');
await financial.cancelCashMovementInSupabase({ movementId: 'durable', canceledAt: new Date().toISOString() });
assert.equal(calls.length, 1, 'flush, direct save and cancellation share one writer');
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.transactions))[0].status, 'cancelada');
release();
await Promise.all([first, flushing]);
assert.deepEqual(calls, [
  { action: 'save', amount: 10 },
  { action: 'save', amount: 20 },
  { action: 'cancel', status: 'cancelada' }
]);
assert.equal(queue().length, 0);
const final = JSON.parse(disk.get(STORAGE_KEYS.transactions))[0];
assert.equal(final.amount, 20, 'completion of the old request must not overwrite a newer cached revision');
assert.equal(final.status, 'cancelada');
const beforePrepareCalls = calls.length;
financial.prepareFinancialOperation({ action: 'saveCashMovement', movement: movement(30) });
financial.prepareFinancialOperation({ action: 'cancelCashMovement', movementId: 'durable', canceledAt: new Date().toISOString() });
financial.prepareFinancialOperation({ action: 'saveCashMovement', movement: movement(40) });
assert.equal(calls.length, beforePrepareCalls, 'prepare is synchronous and never initiates network');
assert.deepEqual(queue().map((operation) => operation.action), ['saveCashMovement', 'cancelCashMovement', 'saveCashMovement'], 'compaction must not move a newer save across a cancellation');
await financial.flushFinancialQueue();
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.transactions))[0].amount, 40);
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.transactions))[0].status, 'ativa');
const finance = { id: 'strict-revision', type: 'income', status: 'paid', amount: 1, createdAt: new Date().toISOString() };
const staleStrict = financial.saveFinancialTransactionToSupabaseStrict(finance);
const newerSave = financial.saveFinancialTransactionToSupabase({ ...finance, amount: 2 });
await assert.rejects(staleStrict, /alterad|versao/i, 'a strict operation queued before a newer revision must not overwrite it');
await newerSave;
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.financialTransactions))[0].amount, 2);
console.log('financial outbox durability ok');
