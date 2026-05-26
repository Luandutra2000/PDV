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
const functionCalls = [];
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
                active: true,
                aliases: [],
                favorite: true
              }],
              error: null
            };
          }
        };
      },
    };
  }
});
productService.setProductCatalogFetchForTests(async (url, options) => {
  functionCalls.push({ url, options, body: JSON.parse(options.body) });
  return {
    ok: true,
    async json() {
      return { result: {} };
    }
  };
});

await productService.syncProductsFromOnlineDatabase();

assert(productService.getCategories().some((category) => category.id === 'bebidas'), 'online categories should populate local catalog');
assert(productService.getProducts().some((product) => product.id === 'cafe'), 'online products should populate local catalog');

const created = await productService.createProductOnline({
  name: 'Suco',
  categoryId: 'bebidas',
  price: 8,
  cost: 0,
  stock: 0,
  active: true
});
assert(created.id === 'suco', 'online create should return normalized product');
assert(functionCalls.some((call) => call.body.resource === 'products' && call.body.action === 'upsert'), 'online create should call secure product write function');

const category = await productService.createCategoryOnline('Salgados', { showInShowcase: true });
assert(category.id === 'salgados', 'online category create should return normalized category');
assert(functionCalls.some((call) => call.body.resource === 'categories' && call.body.action === 'upsert'), 'online category create should call secure category write function');

await productService.deleteProductOnline('suco');
assert(functionCalls.some((call) => call.body.resource === 'products' && call.body.action === 'delete' && call.body.id === 'suco'), 'online product delete should call secure product delete function');

console.log('product online sync ok');
