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

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const schema = await import('../src/database/schema.js?v=20260804-06');
const auth = await import('../src/services/auth.service.js?v=20260804-06');
const products = await import('../src/services/product.service.js?v=20260804-06');
const comandas = await import('../src/services/comanda.service.js?v=20260804-06');
const financial = await import('../src/services/financial-sync.service.js?v=20260804-06');
const showcase = await import('../src/services/showcase-sync.service.js?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');

seedTestAdmin(storage, schema.STORAGE_KEYS);
storage.ensureSeedData();
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

const calls = [];
const makeClient = (scope) => ({
  from(table) {
    return {
      upsert() {
        calls.push(`${scope}:from:${table}`);
        return Promise.resolve({ error: null });
      },
      update() {
        return { eq: () => Promise.resolve({ error: null }) };
      },
      delete() {
        return { eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) };
      }
    };
  },
  rpc(name) {
    calls.push(`${scope}:rpc:${name}`);
    return Promise.resolve({ error: null });
  }
});

financial.configureFinancialSyncForTests({ getClient: async () => makeClient('financial') });
showcase.configureShowcaseSyncForTests({ getClient: async () => makeClient('showcase') });

comandas.clearComanda();
comandas.addItem(products.getProductById('x-burger'));
transactions.finalizeComandaPayment({ paymentMethod: 'pix' });
await new Promise((resolve) => setTimeout(resolve, 10));

const saleWriteIndex = calls.indexOf('financial:from:sales');
const showcaseRpcIndex = calls.indexOf('showcase:rpc:process_showcase_sale');
assert(saleWriteIndex >= 0, 'sale should be written through the financial sync client');
assert(showcaseRpcIndex >= 0, 'showcase sale should be sent through its RPC');
assert(saleWriteIndex < showcaseRpcIndex, 'showcase sale RPC must run after the sale row is persisted');

console.log('sale showcase order ok');
