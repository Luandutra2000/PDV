import createUserHandler from '../api/create-user.mjs';
import listUsersHandler from '../api/list-users.mjs';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const originalEnv = { ...process.env };
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return jsonResponse({ id: 'admin-1', email: 'admin@pdv.local' });
  }

  if (url.includes('/rest/v1/profiles?id=eq.admin-1')) {
    return jsonResponse([{ id: 'admin-1', name: 'Admin', role: 'admin', is_active: true }]);
  }

  if (url.includes('/rest/v1/profiles?select=')) {
    return jsonResponse([
      { id: 'admin-1', name: 'Admin', role: 'admin', is_active: true },
      { id: 'dono-1', name: 'Dono', role: 'dono', is_active: true }
    ]);
  }

  if (url.endsWith('/auth/v1/admin/users')) {
    return jsonResponse({ id: 'dono-1', email: 'dono@pdv.local' });
  }

  if (url.endsWith('/rest/v1/profiles')) {
    const body = JSON.parse(options.body);
    return jsonResponse([{ ...body[0] }]);
  }

  throw new Error(`Unexpected URL: ${url}`);
};

const createResponse = createMockResponse();
await createUserHandler({
  method: 'POST',
  headers: { authorization: 'Bearer admin-token' },
  body: {
    name: 'Dono',
    email: 'dono@pdv.local',
    password: '123456',
    role: 'dono'
  }
}, createResponse);

assert(createResponse.statusCode === 200, 'create user API should return 200');
assert(JSON.parse(createResponse.body).profile.role === 'dono', 'create user API should return normalized role');

const listResponse = createMockResponse();
await listUsersHandler({
  method: 'GET',
  headers: { authorization: 'Bearer admin-token' }
}, listResponse);

assert(listResponse.statusCode === 200, 'list users API should return 200');
assert(JSON.parse(listResponse.body).people.length === 2, 'list users API should return people');

process.env = originalEnv;

console.log('vercel people api ok');

function createMockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(body) {
      this.body = body;
    }
  };
}

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return data;
    }
  };
}
