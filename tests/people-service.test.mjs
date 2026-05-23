const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'publishable-key'
};

const auth = await import('../src/services/auth.service.js');
const people = await import('../src/services/people.service.js');

auth.setAuthClientForTests({
  async getSession() {
    return {
      data: {
        session: {
          access_token: 'session-token',
          user: { id: 'admin-1', email: 'admin@pdv.local' }
        }
      },
      error: null
    };
  }
});

let request = null;
people.setPeopleFetchForTests(async (url, options) => {
  request = { url, options };
  return {
    ok: true,
    async json() {
      return {
        user: {
          id: 'user-1',
          email: 'operador@pdv.local'
        },
        profile: {
          id: 'user-1',
          name: 'Operador',
          role: 'operador',
          is_active: true
        }
      };
    }
  };
});

const result = await people.createPersonUser({
  name: 'Operador',
  email: 'operador@pdv.local',
  password: '123456',
  role: 'operador'
});

assert(request.url === '/.netlify/functions/create-user', 'service should call Netlify function');
assert(request.options.method === 'POST', 'service should use POST');
assert(request.options.headers.Authorization === 'Bearer session-token', 'service should send session token');

const payload = JSON.parse(request.options.body);
assert(payload.name === 'Operador', 'service should send name');
assert(payload.email === 'operador@pdv.local', 'service should send email');
assert(payload.password === '123456', 'service should send password');
assert(payload.role === 'operador', 'service should send role');
assert(result.profile.role === 'operador', 'service should return created profile');

people.setPeopleFetchForTests(async () => ({
  ok: false,
  async json() {
    return { error: 'Email ja cadastrado.' };
  }
}));

let rejected = false;
try {
  await people.createPersonUser({
    name: 'Operador',
    email: 'operador@pdv.local',
    password: '123456',
    role: 'operador'
  });
} catch (error) {
  rejected = error.message === 'Email ja cadastrado.';
}

assert(rejected, 'service should surface function errors');

console.log('people service ok');
