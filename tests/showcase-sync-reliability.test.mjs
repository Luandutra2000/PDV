import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const sync = await import('../src/services/showcase-sync.service.js?v=20260804-06');
const stock = await import('../src/services/showcase-stock.service.js?v=20260804-06');
const queue = () => JSON.parse(store.get(STORAGE_KEYS.showcaseSyncQueue) || '[]');
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
beforeEach(() => {
  globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'local' };
  stock.resetShowcaseStockForTests();
  store.set(STORAGE_KEYS.showcaseSyncQueue, '[]');
  sync.configureShowcaseSyncForTests();
  globalThis.__PDV_RUNTIME_CONFIG__ = {
    dataProvider: 'supabase', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'test'
  };
});

test('sale RPC receives SQL item names while local sale items remain camelCase', async () => {
  let payload;
  sync.configureShowcaseSyncForTests({ getClient: async () => ({ rpc: async (name, args) => {
    assert.equal(name, 'process_showcase_sale');
    payload = args._payload;
    return { data: { changed: true, changedItems: 1 }, error: null };
  } }) });
  const items = [{ productId: 'qa-produto', quantity: 1, unitPrice: 7.5 }];
  await sync.processShowcaseSale({ operationId: 'sale-a', saleId: 'sale-a', items });
  assert.equal(payload.items[0].product_id, 'qa-produto');
  assert.equal(payload.items[0].unit_price, 7.5);
  assert.deepEqual(items, [{ productId: 'qa-produto', quantity: 1, unitPrice: 7.5 }]);
  assert.equal(stock.getOutOfStockSales()[0].unitPrice, 7.5);
});

test('operation is durable while waiting for the network client', async () => {
  const client = deferred();
  sync.configureShowcaseSyncForTests({ getClient: () => client.promise });
  const pending = sync.processShowcaseProduction({ operationId: 'durable', productId: 'qa-produto', quantity: 10 });
  const persisted = queue();
  client.resolve({ rpc: async () => ({ error: null }) });
  await pending;
  assert.equal(persisted[0]?.input.operationId, 'durable');
  assert.equal(queue().length, 0);
});

test('new failed operation survives completion of an older flush', async () => {
  store.set(STORAGE_KEYS.showcaseSyncQueue, JSON.stringify([{
    action: 'processProduction', input: { operationId: 'a', productId: 'qa-produto', quantity: 1 }
  }]));
  const started = deferred();
  const response = deferred();
  sync.configureShowcaseSyncForTests({ getClient: async () => ({ rpc: async (_, { _payload }) => {
    if (_payload.operationId === 'a') { started.resolve(); return response.promise; }
    return { error: new Error('offline') };
  } }) });
  const flush = sync.flushShowcaseQueue();
  await started.promise;
  const next = sync.processShowcaseProduction({ operationId: 'b', productId: 'qa-produto', quantity: 2 });
  await Promise.resolve();
  response.resolve({ error: null });
  await Promise.all([flush, next]);
  assert.deepEqual(queue().map((op) => op.input.operationId), ['b']);
});

test('concurrent flush callers send each queued operation once', async () => {
  store.set(STORAGE_KEYS.showcaseSyncQueue, JSON.stringify([{
    action: 'processProduction', input: { operationId: 'a', productId: 'qa-produto', quantity: 1 }
  }]));
  const response = deferred();
  let calls = 0;
  sync.configureShowcaseSyncForTests({ getClient: async () => ({ rpc: async () => {
    calls++;
    return response.promise;
  } }) });
  const first = sync.flushShowcaseQueue();
  const second = sync.flushShowcaseQueue();
  await Promise.resolve();
  response.resolve({ error: null });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test('server explicitly processing zero sale items leaves the sale pending', async () => {
  sync.configureShowcaseSyncForTests({ getClient: async () => ({ rpc: async () => ({
    data: { changed: false, changedItems: 0 }, error: null
  }) }) });
  await sync.processShowcaseSale({ operationId: 'zero', saleId: 'zero', items: [{ productId: 'qa-produto', quantity: 1, unitPrice: 7.5 }] });
  assert.equal(queue().length, 1);
});

test('missing server sale acknowledgment keeps the operation pending', async () => {
  sync.configureShowcaseSyncForTests({ getClient: async () => ({ rpc: async () => ({ data: null, error: null }) }) });
  await sync.processShowcaseSale({ operationId: 'missing-result', saleId: 'missing-result', items: [{ productId: 'qa-produto', quantity: 1, unitPrice: 7.5 }] });
  assert.equal(queue().length, 1);
});

test('hydration preserves all 1100 remote stock rows', async () => {
  const rows = Array.from({ length: 1100 }, (_, index) => ({ id: `stock-${index}`, product_id: `p-${index}`, quantity_available: 2 }));
  sync.configureShowcaseSyncForTests({ getClient: async () => ({ from: (table) => ({ select: () => {
    const result = table === 'product_stock' ? rows : [];
    const query = {
      order: () => query,
      range: async (start, end) => ({ data: result.slice(start, end + 1), error: null }),
      then: (done) => Promise.resolve({ data: result.slice(0, 1000), error: null }).then(done)
    };
    return query;
  } }) }) });
  await sync.hydrateShowcaseData();
  assert.equal(storage.getItem(STORAGE_KEYS.productStock).length, 1100);
  assert.equal(stock.getShowcaseStockByProductId('p-1099').quantityAvailable, 2);
});

test('a stale hydration response cannot overwrite a local operation made during the request', async () => {
  const response = deferred();
  const started = deferred();
  sync.configureShowcaseSyncForTests({ getClient: async () => ({
    rpc: async () => ({ error: new Error('offline') }),
    from: () => ({ select: () => ({ order: () => ({ range: async () => {
      started.resolve();
      return response.promise;
    } }) }) })
  }) });
  const hydration = sync.hydrateShowcaseData();
  await started.promise;
  await sync.processShowcaseProduction({ operationId: 'during-hydration', productId: 'qa-produto', quantity: 10 });
  response.resolve({ data: [], error: null });
  await hydration;
  assert.equal(stock.getShowcaseStockByProductId('qa-produto').quantityAvailable, 10);
  assert.equal(stock.getShowcaseMovements().length, 1);
  assert.equal(queue().length, 1);
});

test('queue persistence failure rejects the operation before any network call', async () => {
  const originalSetItem = localStorage.setItem;
  let calls = 0;
  localStorage.setItem = (key, value) => {
    if (key === STORAGE_KEYS.showcaseSyncQueue) throw new Error('quota exceeded');
    return originalSetItem(key, value);
  };
  sync.configureShowcaseSyncForTests({ getClient: async () => { calls++; return { rpc: async () => ({ error: null }) }; } });
  try {
    await assert.rejects(sync.processShowcaseProduction({ operationId: 'quota', productId: 'qa-produto', quantity: 1 }));
    assert.equal(calls, 0);
  } finally {
    localStorage.setItem = originalSetItem;
  }
});
