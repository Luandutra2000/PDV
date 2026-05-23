const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { handler } = await import('../netlify/functions/create-user.mjs');

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key'
};

const invalidResponse = await handler({
  httpMethod: 'POST',
  headers: { authorization: 'Bearer admin-token' },
  body: JSON.stringify({ email: 'operador@pdv.local' })
}, {}, { env, fetch: async () => ({}) });

assert(invalidResponse.statusCode === 400, 'function should reject missing required fields');

const calls = [];
const fetch = async (url, options = {}) => {
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return jsonResponse({ id: 'admin-1', email: 'admin@pdv.local' });
  }

  if (url.includes('/rest/v1/profiles?id=eq.admin-1')) {
    return jsonResponse([{ id: 'admin-1', role: 'admin', is_active: true }]);
  }

  if (url.endsWith('/auth/v1/admin/users')) {
    return jsonResponse({ id: 'user-1', email: 'operador@pdv.local' });
  }

  if (url.endsWith('/rest/v1/profiles')) {
    return jsonResponse([{ id: 'user-1', name: 'Operador', role: 'operador', is_active: true }]);
  }

  throw new Error(`Unexpected URL: ${url}`);
};

const response = await handler({
  httpMethod: 'POST',
  headers: { authorization: 'Bearer admin-token' },
  body: JSON.stringify({
    name: 'Operador',
    email: 'operador@pdv.local',
    password: '123456',
    role: 'operador'
  })
}, {}, { env, fetch });

assert(response.statusCode === 200, 'function should create user');
const body = JSON.parse(response.body);
assert(body.user.id === 'user-1', 'function should return auth user');
assert(body.profile.role === 'operador', 'function should return profile');

const adminCreateCall = calls.find((call) => call.url.endsWith('/auth/v1/admin/users'));
assert(adminCreateCall.options.headers.Authorization === 'Bearer service-key', 'admin user creation should use service role key');

const profileCall = calls.find((call) => call.url.endsWith('/rest/v1/profiles'));
assert(profileCall.options.headers.Prefer.includes('resolution=merge-duplicates'), 'profile write should upsert');

console.log('create user function ok');

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return data;
    },
    async text() {
      return JSON.stringify(data);
    }
  };
}
