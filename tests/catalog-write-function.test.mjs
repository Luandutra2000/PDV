const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { handler } = await import('../netlify/functions/catalog-write.mjs');

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

  if (url.includes('/rest/v1/profiles?id=eq.admin-1')) {
    return jsonResponse([{ id: 'admin-1', role: 'admin', is_active: true }]);
  }

  if (url.endsWith('/rest/v1/categories')) {
    return jsonResponse([{ id: 'bebidas', name: 'Bebidas', show_in_showcase: true }]);
  }

  return jsonResponse([]);
};

const response = await handler({
  httpMethod: 'POST',
  headers: { authorization: 'Bearer admin-token' },
  body: JSON.stringify({
    resource: 'categories',
    action: 'upsert',
    record: { id: 'bebidas', name: 'Bebidas', show_in_showcase: true }
  })
}, {}, { env, fetch });

assert(response.statusCode === 200, 'catalog function should upsert category');
const categoryCall = calls.find((call) => call.url.endsWith('/rest/v1/categories'));
assert(categoryCall.options.headers.Authorization === 'Bearer service-key', 'catalog writes should use service role');

console.log('catalog write function ok');

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return data;
    }
  };
}
