import assert from 'node:assert/strict';
const disk = new Map();
let blockedKey = '';
globalThis.localStorage = {
  getItem: (key) => disk.get(key) ?? null,
  setItem: (key, value) => {
    if (key === blockedKey) throw new Error('QuotaExceededError');
    disk.set(key, String(value));
  },
  removeItem: (key) => disk.delete(key)
};
const financial = await import('../src/services/financial-sync.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
let rejectClient;
let clientRequests = 0;
const suspendedClient = new Promise((resolve, reject) => { rejectClient = reject; });
financial.configureFinancialSyncForTests({ getClient: () => { clientRequests += 1; return suspendedClient; } });
const now = new Date().toISOString();
const sale = { id: 'sale-durable', type: 'venda', total: 10, items: [{ productId: 'product', quantity: 1, total: 10 }], createdAt: now };
const requests = [
  financial.saveSaleToSupabase({ sale, command: { id: 'command-durable', items: sale.items, total: 10, createdAt: now } }),
  financial.saveCashMovementToSupabase({ id: 'movement-durable', type: 'entrada', amount: 20, createdAt: now }),
  financial.saveFinancialTransactionToSupabase({ id: 'finance-durable', type: 'income', amount: 30, createdAt: now }),
  financial.saveCashClosingToSupabase({ id: 'closing-durable', totals: { sales: 10 }, createdAt: now }),
  financial.cancelSaleInSupabase({ saleId: 'sale-durable', comandaId: 'command-durable', canceledAt: now }),
  financial.cancelCashMovementInSupabase({ movementId: 'movement-durable', canceledAt: now }),
  financial.cancelFinancialTransactionInSupabase({ transactionId: 'finance-durable', canceledAt: now })
];
const pending = JSON.parse(disk.get(STORAGE_KEYS.financialSyncQueue));
assert.equal(pending.length, 7, 'every non-strict entry point persists before yielding to the client');
sale.items[0].quantity = 99;
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.financialSyncQueue))[0].sale.items[0].quantity, 1, 'outbox owns an immutable snapshot of nested caller data');
await Promise.resolve();
assert.equal(clientRequests, 1, 'only one writer can obtain a client while all entry points are called');
rejectClient(new Error('offline'));
await Promise.all(requests);
assert.equal(financial.getFinancialSyncStatus().pending, 7);
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.transactions)).find((item) => item.id === 'sale-durable').status, 'cancelada');
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.financialTransactions))[0].status, 'canceled');

const beforeBlockedWrite = clientRequests;
blockedKey = STORAGE_KEYS.financialSyncQueue;
await assert.rejects(() => financial.saveCashMovementToSupabase({ id: 'must-not-send', type: 'entrada', amount: 1, createdAt: now }), /armazenamento/);
assert.equal(clientRequests, beforeBlockedWrite, 'unpersisted operations must never start a remote request');
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.financialSyncQueue)).length, 7);
blockedKey = '';
console.log('financial outbox preparation ok');
