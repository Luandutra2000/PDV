import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const showcaseDomain = await import('../src/services/showcase-stock.service.js');
const showcaseSync = await import('../src/services/showcase-sync.service.js');

const rows = {
  product_stock: [],
  showcase_movements: [],
  out_of_stock_sales: []
};
const rpcCalls = [];
const registeredTables = [];
let rpcFailure = null;
let failOperationId = '';

const fakeClient = {
  from(table) {
    return {
      select(columns) {
        return Promise.resolve({ data: rows[table] || [], error: null, columns });
      }
    };
  },
  rpc(functionName, input) {
    rpcCalls.push({ functionName, input });

    if (input?._payload?.operationId === failOperationId) {
      return Promise.resolve({ data: null, error: new Error(`fail ${failOperationId}`) });
    }

    if (rpcFailure) {
      return Promise.resolve({ data: null, error: rpcFailure });
    }

    return Promise.resolve({ data: { ok: true }, error: null });
  },
  channel(name) {
    return {
      name,
      on(eventName, filter, callback) {
        registeredTables.push(filter.table);
        this.callback = callback;
        return this;
      },
      subscribe() {
        return this;
      }
    };
  },
  removeChannel() {}
};

function reset() {
  localStorage.clear();
  showcaseDomain.resetShowcaseStockForTests();
  rows.product_stock = [];
  rows.showcase_movements = [];
  rows.out_of_stock_sales = [];
  rpcCalls.length = 0;
  registeredTables.length = 0;
  rpcFailure = null;
  failOperationId = '';
  showcaseSync.configureShowcaseSyncForTests({ getClient: async () => fakeClient });
}

function readJson(key) {
  return JSON.parse(localStorage.getItem(key) || '[]');
}

reset();

rows.product_stock = [{
  id: 'stock-coxinha',
  product_id: 'coxinha',
  quantity_available: '7',
  updated_by: 'user-1',
  updated_at: '2026-06-15T10:00:00.000Z'
}];

await showcaseSync.hydrateShowcaseData();
assert.equal(showcaseDomain.getShowcaseStockByProductId('coxinha').quantityAvailable, 7, 'hydrate should cache product_stock rows from Supabase');
assert.deepEqual(readJson(STORAGE_KEYS.showcaseMovements), [], 'hydrate should write empty movement cache when there are no rows');
assert.equal(showcaseSync.getShowcaseSyncStatus().state, 'synced', 'successful hydrate without queue should be synced');

reset();
showcaseDomain.applyProductionToShowcase({
  operationId: 'seed-coxinha',
  productId: 'coxinha',
  quantity: 3,
  userId: 'user-1',
  createdAt: '2026-06-15T10:05:00.000Z'
});

let result = await showcaseSync.processShowcaseSale({
  operationId: 'sale-online-op',
  saleId: 'sale-online',
  commandId: 'cmd-online',
  userId: 'user-1',
  createdAt: '2026-06-15T10:10:00.000Z',
  items: [{ productId: 'coxinha', quantity: 2, unitPrice: 7 }]
});

assert.equal(showcaseDomain.getShowcaseStockByProductId('coxinha').quantityAvailable, 1, 'online sale should apply local stock result immediately');
assert.equal(result.stock[0].quantityAvailable, 1, 'online sale should return local domain result');
assert.equal(rpcCalls[0].functionName, 'process_showcase_sale', 'online sale should call sale RPC');
assert.equal(readJson(STORAGE_KEYS.showcaseSyncQueue).length, 0, 'successful online sale should not queue operation');

reset();
showcaseDomain.applyProductionToShowcase({
  operationId: 'seed-short',
  productId: 'risole',
  quantity: 1,
  userId: 'user-1',
  createdAt: '2026-06-15T10:15:00.000Z'
});
rpcFailure = new Error('network down');

result = await showcaseSync.processShowcaseSale({
  operationId: 'sale-short-op',
  saleId: 'sale-short',
  commandId: 'cmd-short',
  userId: 'user-1',
  createdAt: '2026-06-15T10:20:00.000Z',
  items: [{ productId: 'risole', quantity: 3, unitPrice: 8 }]
});

assert.equal(showcaseDomain.getShowcaseStockByProductId('risole').quantityAvailable, 0, 'failed online sale should still consume local stock');
assert.equal(result.outOfStockSales[0].quantity, 2, 'failed online sale should still record out-of-stock quantity locally');
assert.equal(readJson(STORAGE_KEYS.showcaseSyncQueue).length, 1, 'failed RPC should enqueue operation');
assert.equal(showcaseSync.getShowcaseSyncStatus().state, 'pending', 'failed RPC should set pending status');
assert.match(showcaseSync.getShowcaseSyncStatus().error, /network down/, 'failed RPC should expose useful status error');

rpcFailure = null;
await showcaseSync.flushShowcaseQueue();
assert.equal(rpcCalls.at(-1).functionName, 'process_showcase_sale', 'flush should retry queued RPC operation');
assert.equal(readJson(STORAGE_KEYS.showcaseSyncQueue).length, 0, 'successful flush should clear queue');
assert.equal(showcaseSync.getShowcaseSyncStatus().state, 'synced', 'successful flush should set synced status');

reset();
localStorage.setItem(STORAGE_KEYS.showcaseSyncQueue, JSON.stringify([
  {
    action: 'processProduction',
    input: {
      operationId: 'queued-first',
      productId: 'coxinha',
      quantity: 4,
      userId: 'user-1',
      createdAt: '2026-06-15T10:30:00.000Z'
    },
    createdAt: '2026-06-15T10:30:00.000Z'
  },
  {
    action: 'adjustStock',
    input: {
      operationId: 'queued-second',
      productId: 'coxinha',
      quantityAvailable: 8,
      userId: 'user-1',
      createdAt: '2026-06-15T10:35:00.000Z'
    },
    createdAt: '2026-06-15T10:35:00.000Z'
  }
]));
failOperationId = 'queued-first';

await showcaseSync.flushShowcaseQueue();
assert.deepEqual(
  rpcCalls.map((call) => call.input._payload.operationId),
  ['queued-first'],
  'flush should stop at first failed queued operation'
);
assert.deepEqual(
  readJson(STORAGE_KEYS.showcaseSyncQueue).map((operation) => operation.input.operationId),
  ['queued-first', 'queued-second'],
  'flush should keep failed operation and all later operations in order'
);
assert.equal(showcaseSync.getShowcaseSyncStatus().state, 'pending', 'failed ordered flush should keep pending status');

reset();
await showcaseSync.startShowcaseRealtime();
assert.deepEqual(
  registeredTables,
  ['product_stock', 'showcase_movements', 'out_of_stock_sales', 'stock_production'],
  'realtime should subscribe to all showcase-related tables'
);
await showcaseSync.stopShowcaseRealtime();

const onlineDataSource = await readFile(new URL('../src/services/online-data.service.js', import.meta.url), 'utf8');
assert(onlineDataSource.includes('hydrateShowcaseData'), 'online data hydration should call showcase sync hydrate when showcase option is true');
assert(onlineDataSource.includes('flushShowcaseQueue'), 'online data hydration should flush showcase sync queue when showcase option is true');

console.log('showcase sync service ok');
