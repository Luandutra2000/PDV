import assert from 'node:assert/strict';
const disk = new Map();
let failKey = '';
let remoteCalls = 0;
const remoteUpdates = [];
globalThis.localStorage = {
  getItem: key => disk.get(key) ?? null,
  setItem(key, value) { if (key === failKey) { failKey = ''; throw new Error('QuotaExceededError'); } disk.set(key, String(value)); },
  removeItem: key => disk.delete(key), clear: () => disk.clear()
};
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin, setTestUserSession } = await import('./test-auth-fixture.mjs?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');
const comanda = await import('../src/services/comanda.service.js?v=20260804-06');
const financial = await import('../src/services/financial-sync.service.js?v=20260804-06');
const { getFinancialSummary } = await import('../src/services/financial.service.js?v=20260804-06');
const showcase = await import('../src/services/showcase-sync.service.js?v=20260804-06');
const { configureSupabaseClientForTests } = await import('../src/services/supabase-client.service.js?v=20260804-06');
const client = {
  auth: { getSession: async () => ({ data: { session: null } }) },
  from(table) {
    return {
      upsert: async () => { remoteCalls++; return { error: null }; },
      update: values => ({ eq: async (key, id) => { remoteCalls++; remoteUpdates.push({ table, values, id }); return { error: null }; } })
    };
  },
  rpc: async () => { remoteCalls++; return { data: { changed: true, changedItems: 1 }, error: null }; }
};
financial.configureFinancialSyncForTests({ getClient: async () => client });
showcase.configureShowcaseSyncForTests({ getClient: async () => client });
configureSupabaseClientForTests({ client });
storage.resetAppData();
seedTestAdmin(storage, keys);
storage.setItem(keys.productStock, [{ productId: 'qa', quantityAvailable: 5 }]);
comanda.addItem({ id: 'qa', name: 'QA', price: 7.5 });
const sale = transactions.finalizeComandaPayment({ paymentMethod: 'pix' });
const movement = transactions.registerCashMovement({ type: 'entrada', amount: 10, description: 'Troco inicial' });
const baseline = new Map(disk);
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.test', supabaseAnonKey: 'public' };

function restoreBaseline() {
  disk.clear();
  for (const [key, value] of baseline) disk.set(key, value);
  globalThis.__PDV_MEMORY_CACHE__?.clear();
  globalThis.__PDV_SERIALIZED_CACHE__?.clear();
  failKey = '';
  remoteCalls = 0;
  remoteUpdates.length = 0;
}

const cases = [
  {
    name: 'register movement',
    invoke: () => transactions.registerCashMovement({ type: 'saida', amount: 3, description: 'Compra pequena' }),
    blocked: [keys.transactions, keys.financialTransactions, keys.auditLogs, keys.financialSyncQueue]
  },
  {
    name: 'cancel movement',
    invoke: () => transactions.cancelTransaction(movement.id, { reason: 'Duplicado' }),
    blocked: [keys.transactions, keys.financialTransactions, keys.auditLogs, keys.financialSyncQueue]
  },
  {
    name: 'cancel sale',
    invoke: () => transactions.cancelTransaction(sale.id, { reason: 'Cliente desistiu' }),
    blocked: [keys.transactions, keys.closedComandas, keys.productStock, keys.showcaseMovements, keys.outOfStockSales, keys.auditLogs, keys.financialSyncQueue, keys.showcaseSyncQueue]
  },
  {
    name: 'cancel command',
    invoke: () => transactions.cancelClosedComanda(sale.comandaId, { reason: 'Cliente desistiu' }),
    blocked: [keys.transactions, keys.closedComandas, keys.productStock, keys.showcaseMovements, keys.outOfStockSales, keys.auditLogs, keys.financialSyncQueue, keys.showcaseSyncQueue]
  }
];
for (const scenario of cases) {
  for (const key of scenario.blocked) {
    restoreBaseline();
    failKey = key;
    assert.throws(scenario.invoke, /Quota|armazenamento/, `${scenario.name} must reject quota at ${key}`);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(disk, baseline, `${scenario.name}: quota at ${key} must preserve every stored record`);
    assert.equal(remoteCalls, 0, `${scenario.name}: no network mutation before full local commit`);
  }
  restoreBaseline();
  scenario.invoke();
  await financial.flushFinancialQueue();
  await showcase.flushShowcaseQueue();
  assert(remoteCalls > 0, `${scenario.name}: committed operation must send after successful retry`);
  if (scenario.name === 'register movement') {
    const savedMovement = transactions.getTransactions().find(item => item.description === 'Compra pequena');
    const finance = storage.getItem(keys.financialTransactions).find(item => item.cashMovementId === savedMovement.id);
    assert.equal(savedMovement.amount, 3);
    assert.equal(finance.amount, 3, 'movement and financial record must remain linked after commit');
  } else {
    const canceledId = scenario.name === 'cancel movement' ? movement.id : sale.id;
    assert.equal(transactions.getTransactions().find(item => item.id === canceledId).status, 'cancelada');
    if (scenario.name === 'cancel movement') {
      const finance = storage.getItem(keys.financialTransactions).find(item => item.cashMovementId === movement.id);
      assert.equal(finance.status, 'canceled', 'linked financial record must cancel with the cash movement');
      assert.equal(finance.cancelReason, 'Duplicado');
      assert.equal(finance.canceledAt, transactions.getTransactions().find(item => item.id === movement.id).canceledAt);
      assert.equal(transactions.getDailyMoneySummary().entriesTotal, 0, 'cash summary must remove canceled income');
      assert.equal(getFinancialSummary({ period: 'all' }).entriesTotal, 0, 'financial summary must remove canceled income');
      const sentFinance = remoteUpdates.find(update => update.table === 'financial_transactions' && update.id === finance.id);
      const sentCash = remoteUpdates.find(update => update.table === 'cash_movements' && update.id === movement.id);
      assert.equal(sentFinance.values.status, 'canceled');
      assert.equal(sentFinance.values.cancel_reason, 'Duplicado');
      assert.equal(sentFinance.values.canceled_at, sentCash.values.canceled_at, 'both remote cancellations must use the same timestamp');
    }
    if (scenario.name !== 'cancel movement') {
      assert.equal(transactions.getClosedComandas().find(item => item.id === sale.comandaId).status, 'cancelada');
      assert.equal(storage.getItem(keys.productStock).find(item => item.productId === 'qa').quantityAvailable, 5, 'successful cancellation must restore sold stock');
    }
  }
}
restoreBaseline();
setTestUserSession(storage, keys, { id: 'manager', name: 'Gerente', role: 'gerente', active: true });
const beforePermissionFailure = new Map(disk);
assert.throws(() => transactions.cancelTransaction(movement.id, { reason: 'Duplicado' }), /cancelar.*lancamento financeiro vinculado/i);
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(disk, beforePermissionFailure, 'financial permission denial must occur before any mutation');
assert.equal(remoteCalls, 0);
// A cash-only movement keeps its existing cancellation permission.
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'local' };
const standalone = transactions.registerCashMovement({ type: 'entrada', amount: 2, description: 'Sem vinculo', createFinancialTransaction: false });
transactions.cancelTransaction(standalone.id, { reason: 'Duplicado' });
assert.equal(transactions.getTransactions().find(item => item.id === standalone.id).status, 'cancelada');
console.log('Cash movement and cancellation quota rollback passed (24 failure points)');
