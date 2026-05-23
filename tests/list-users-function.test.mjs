const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { handler } = await import('../netlify/functions/list-users.mjs');

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key'
};

const calls = [];
const fetch = async (url, options = {}) => {
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return jsonResponse({ id: 'admin-1', email: 'admin@pdv.local' });
  }

  if (url.includes('/rest/v1/profiles?id=eq.admin-1')) {
    return jsonResponse([{ id: 'admin-1', role: 'admin', is_active: true }]);
  }

  if (url.includes('/rest/v1/profiles?select=')) {
    return jsonResponse([
      { id: 'admin-1', name: 'Admin', role: 'admin', is_active: true },
      { id: 'user-1', name: 'Operador', role: 'operador', is_active: true }
    ]);
  }

  throw new Error(`Unexpected URL: ${url}`);
};

const response = await handler({
  httpMethod: 'GET',
  headers: { authorization: 'Bearer admin-token' }
}, {}, { env, fetch });

assert(response.statusCode === 200, 'function should list users');
const body = JSON.parse(response.body);
assert(body.people.length === 2, 'function should return people');
assert(body.people[1].role === 'operador', 'function should return profile roles');

const listCall = calls.find((call) => call.url.includes('/rest/v1/profiles?select='));
assert(listCall.options.headers.Authorization === 'Bearer service-key', 'profile list should use service role key');

console.log('list users function ok');

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
