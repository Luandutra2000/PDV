const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { handler } = await import('../netlify/functions/catalog-read.mjs');

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key'
};

const calls = [];
const fetch = async (url, options = {}) => {
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return jsonResponse({ id: 'admin-1' });
  }

  if (url.includes('/rest/v1/categories')) {
    return jsonResponse([{ id: 'bebidas', name: 'Bebidas', show_in_showcase: true }]);
  }

  if (url.includes('/rest/v1/products')) {
    return jsonResponse([{ id: 'cafe', name: 'Cafe', category_id: 'bebidas', price: 4, active: true }]);
  }

  throw new Error(`Unexpected URL: ${url}`);
};

const response = await handler({
  httpMethod: 'GET',
  headers: { authorization: 'Bearer admin-token' }
}, {}, { env, fetch });

assert(response.statusCode === 200, 'catalog read should return catalog');
const body = JSON.parse(response.body);
assert(body.categories.length === 1, 'catalog read should return categories');
assert(body.products.length === 1, 'catalog read should return products');

const categoryCall = calls.find((call) => call.url.includes('/rest/v1/categories'));
assert(categoryCall.options.headers.Authorization === 'Bearer service-key', 'catalog read should use service role');

console.log('catalog read function ok');

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return data;
    }
  };
}
