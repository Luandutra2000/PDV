import { STORAGE_KEYS } from '../src/database/schema.js?v=20260729-12';
import { createSupabaseProvider } from '../src/services/providers/supabase.provider.js?v=20260729-12';

const calls = [];
const reads = [];
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
      select(columns) {
        reads.push({ table, columns });

        if (table === 'categories') {
          return Promise.resolve({
            data: [{ id: 'salgados', name: 'Salgados', show_in_showcase: true }],
            error: null
          });
        }

        if (table === 'products') {
          return Promise.resolve({
            data: [{
              id: 'coxinha',
              name: 'Coxinha',
              category_id: 'salgados',
              price: 7,
              cost: 3,
              stock: 20,
              active: true,
              aliases: ['cox'],
              favorite: true
            }],
            error: null
          });
        }

        if (table === 'profiles') {
          return Promise.resolve({
            data: [{
              id: 'profile-1',
              name: 'Caixa Online',
              role_id: 'caixa',
              is_active: true,
              created_at: '2026-06-10T10:00:00.000Z',
              updated_at: '2026-06-10T11:00:00.000Z'
            }],
            error: null
          });
        }

        if (table === 'user_permission_overrides') {
          return Promise.resolve({
            data: [{ user_id: 'profile-1', permission_id: 'sales.discount', state: 'allow' }],
            error: null
          });
        }

        if (table === 'audit_logs') {
          return Promise.resolve({
            data: [{
              id: 'audit-1',
              action: 'user.update',
              entity_type: 'user',
              entity_id: 'profile-1',
              user_id: 'profile-1',
              user_name: 'Caixa Online',
              metadata: { module: 'Sistema', details: 'Usuario editado' },
              created_at: '2026-06-10T11:30:00.000Z'
            }],
            error: null
          });
        }

        return Promise.resolve({ data: [], error: null });
      },
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

localProvider.write(STORAGE_KEYS.products, []);
localProvider.write(STORAGE_KEYS.categories, []);
localProvider.write(STORAGE_KEYS.users, []);
localProvider.write(STORAGE_KEYS.userPermissionOverrides, {});
localProvider.write(STORAGE_KEYS.auditLogs, []);
await provider.hydrate([
  STORAGE_KEYS.categories,
  STORAGE_KEYS.products,
  STORAGE_KEYS.users,
  STORAGE_KEYS.userPermissionOverrides,
  STORAGE_KEYS.auditLogs
]);

assert(reads.some((read) => read.table === 'products'), 'hydrate should read products from Supabase');
assert(provider.read(STORAGE_KEYS.products, [])[0].name === 'Coxinha', 'hydrate should cache remote products locally');
assert(provider.read(STORAGE_KEYS.categories, [])[0].showInShowcase === true, 'hydrate should cache remote categories locally');
assert(provider.read(STORAGE_KEYS.users, [])[0].role === 'caixa', 'hydrate should cache profiles as users');
assert(
  provider.read(STORAGE_KEYS.userPermissionOverrides, {})['profile-1']['sales.discount'] === 'allow',
  'hydrate should cache user permission overrides'
);
assert(provider.read(STORAGE_KEYS.auditLogs, [])[0].action === 'user.update', 'hydrate should cache audit logs');

console.log('supabase provider ok');
