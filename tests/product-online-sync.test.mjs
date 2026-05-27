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
  supabaseAnonKey: 'publishable-key'
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const productService = await import('../src/services/product.service.js');
const dataProvider = await import('../src/services/data-provider.service.js');
const auth = await import('../src/services/auth.service.js');

dataProvider.resetDataProviderForTests();
auth.setAuthClientForTests({
  async getSession() {
    return {
      data: {
        session: {
          access_token: 'admin-token',
          user: { id: 'admin-1' }
        }
      },
      error: null
    };
  }
});

const calls = [];
productService.setProductCatalogClientForTests({
  from(table) {
    return {
      select() {
        return {
          order(column) {
            calls.push({ type: 'select', table, column });

            if (table === 'categories') {
              return {
                data: [{ id: 'bebidas', name: 'Bebidas', show_in_showcase: true }],
                error: null
              };
            }

            return {
              data: [{
                id: 'cafe',
                name: 'Cafe',
                category_id: 'bebidas',
                price: 4,
                cost: 0,
                stock: 0,
                active: false,
                aliases: [],
                favorite: true
              }],
              error: null
            };
          }
        };
      },
      upsert(record) {
        calls.push({ type: 'upsert', table, record });
        return { error: null };
      },
      delete() {
        return {
          eq(column, value) {
            calls.push({ type: 'delete', table, column, value });
            return { error: null };
          }
        };
      }
    };
  }
});

await productService.syncProductsFromOnlineDatabase();

assert(productService.getCategories().some((category) => category.id === 'bebidas'), 'online categories should populate local catalog');
assert(productService.getProducts().some((product) => product.id === 'cafe'), 'online products should populate local catalog');
assert(productService.getProductById('cafe').active === false, 'online catalog should keep hidden-from-cash-register flag');

const created = await productService.createProductOnline({
  name: 'Suco',
  categoryId: 'bebidas',
  price: 8,
  cost: 0,
  stock: 0,
  active: true
});
assert(created.id === 'suco', 'online create should return normalized product');
assert(calls.some((call) => call.type === 'upsert' && call.table === 'products'), 'online create should upsert product in Supabase');
assert(calls.some((call) => call.type === 'upsert' && call.table === 'products' && call.record.active === true), 'online upsert should send cash register visibility flag');

const category = await productService.createCategoryOnline('Salgados', { showInShowcase: true });
assert(category.id === 'salgados', 'online category create should return normalized category');
assert(calls.some((call) => call.type === 'upsert' && call.table === 'categories'), 'online category create should upsert category in Supabase');

await productService.deleteProductOnline('suco');
assert(calls.some((call) => call.type === 'delete' && call.table === 'products' && call.value === 'suco'), 'online product delete should delete product in Supabase');

console.log('product online sync ok');
