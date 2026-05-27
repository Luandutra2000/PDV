import { STORAGE_KEYS } from '../src/database/schema.js';
import { createSupabaseProvider } from '../src/services/providers/supabase.provider.js';

const calls = [];
const store = new Map();
const localProvider = {
  mode: 'local',
  read(key, fallback = null) {
    return store.has(key) ? store.get(key) : fallback;
  },
  write(key, value) {
    store.set(key, value);
    return value;
  },
  remove(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const fakeClient = {
  from(table) {
    return {
      upsert(rows) {
        calls.push({ table, rows });
        return Promise.resolve({ error: null });
      }
    };
  }
};

const provider = createSupabaseProvider({
  getClient: async () => fakeClient,
  localProvider
});

provider.write(STORAGE_KEYS.products, [
  {
    id: 'coxinha',
    name: 'Coxinha',
    categoryId: 'salgados',
    price: 7,
    cost: 3,
    stock: 20,
    active: true,
    aliases: ['cox'],
    favorite: true
  }
]);

provider.write(STORAGE_KEYS.transactions, [
  {
    id: 'sale-1',
    type: 'venda',
    status: 'ativa',
    comandaId: 'comanda-1',
    comandaNumber: 1,
    total: 14,
    paymentMethod: 'pix',
    receivedAmount: 14,
    change: 0,
    createdAt: '2026-05-27T10:00:00.000Z',
    items: [
      {
        productId: 'coxinha',
        name: 'Coxinha',
        quantity: 2,
        price: 7,
        total: 14
      }
    ]
  },
  {
    id: 'entrada-1',
    type: 'entrada',
    amount: 100,
    category: 'troco',
    description: 'Troco inicial',
    userName: 'Luan',
    createdAt: '2026-05-27T09:00:00.000Z'
  }
]);

await provider.flush();

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

assert(provider.mode === 'supabase', 'provider should expose supabase mode');
assert(calls.some((call) => call.table === 'products'), 'products should sync to products table');
assert(calls.some((call) => call.table === 'sales'), 'sales should sync to sales table');
assert(calls.some((call) => call.table === 'sale_items'), 'sale items should sync to sale_items table');
assert(calls.some((call) => call.table === 'cash_movements'), 'cash movements should sync to cash_movements table');

const productCall = calls.find((call) => call.table === 'products');
assert(productCall.rows[0].category_id === 'salgados', 'product category should be mapped to snake_case');

console.log('supabase provider ok');
