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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const auth = await import('../src/services/auth.service.js?v=20260804-06');
const supabaseClient = await import('../src/services/supabase-client.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};

storage.setItem(STORAGE_KEYS.users, [{
  id: 'legacy-admin',
  name: 'Administrador antigo',
  username: 'admin',
  password: 'admin123',
  role: 'admin',
  active: true
}]);
storage.ensureSeedData();

const localUsers = storage.getItem(STORAGE_KEYS.users, []);
assert(localUsers.length === 1, 'migration should preserve local profile metadata');
assert(!Object.hasOwn(localUsers[0], 'password'), 'migration should purge local plaintext passwords');

let localLoginRejected = false;
try {
  auth.login({ username: 'admin', password: 'admin123' });
} catch (error) {
  localLoginRejected = error.message === 'Autenticacao central obrigatoria. Configure o Supabase.';
}
assert(localLoginRejected, 'local password authentication should be disabled');

let localCreateRejected = false;
try {
  auth.createUser({ name: 'Caixa', username: 'caixa', password: '1234', role: 'caixa' });
} catch (error) {
  localCreateRejected = error.message === 'Gerenciamento de usuarios exige autenticacao central.';
}
assert(localCreateRejected, 'local credential creation should be disabled');

let localUpdateRejected = false;
try {
  auth.updateUser('legacy-admin', { password: 'nova-senha' });
} catch (error) {
  localUpdateRejected = error.message === 'Gerenciamento de usuarios exige autenticacao central.';
}
assert(localUpdateRejected, 'local credential updates should be disabled');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

let supabaseLoginBody = null;
let supabaseSessionPayload = null;
supabaseClient.configureSupabaseClientForTests({
  client: {
    auth: {
      async setSession(session) {
        supabaseSessionPayload = session;
      }
    },
    from(table) {
      return {
        select() {
          return {
            eq() {
              if (table === 'profiles') {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        id: 'supabase-user',
                        name: 'Luan Dutra',
                        role_id: 'admin',
                        is_active: true,
                        empresa_id: 'empresa-qa'
                      },
                      error: null
                    };
                  }
                };
              }
              return Promise.resolve({ data: [], error: null });
            }
          };
        }
      };
    }
  }
});

globalThis.fetch = async (url, options) => {
  supabaseLoginBody = JSON.parse(options.body);
  return { ok: false };
};

let oldAdminRejected = false;
try {
  await auth.login({ username: 'admin', password: 'admin123' });
} catch (error) {
  oldAdminRejected = error.message === 'Usuario ou senha invalidos.';
}
assert(oldAdminRejected, 'legacy admin credentials should not bypass Supabase');
assert(supabaseLoginBody.email === 'admin', 'every login should be sent to central authentication');

globalThis.fetch = async (url, options) => {
  supabaseLoginBody = JSON.parse(options.body);
  return {
    ok: true,
    async json() {
      return {
        user: {
          id: 'supabase-user',
          email: 'luandutra27@gmail.com',
          user_metadata: { name: 'Luan Dutra', role: 'admin' }
        },
        access_token: 'access-token',
        refresh_token: 'refresh-token'
      };
    }
  };
};

const session = await auth.login({
  username: 'luandutra27@gmail,com',
  password: 'senha-enviada-somente-ao-supabase'
});

assert(supabaseLoginBody.email === 'luandutra27@gmail.com', 'email typo should be normalized');
assert(supabaseSessionPayload.access_token === 'access-token', 'SDK should receive access token');
assert(supabaseSessionPayload.refresh_token === 'refresh-token', 'SDK should receive refresh token');
assert(session.user.username === 'luandutra27@gmail.com', 'central profile should be cached');
assert(!Object.hasOwn(session.user, 'password'), 'session user should not expose password');
assert(
  storage.getItem(STORAGE_KEYS.users, []).every((user) => !Object.hasOwn(user, 'password')),
  'cached profiles should never contain passwords'
);
assert(auth.getCurrentUser().id === 'supabase-user', 'central login should persist current user session');

delete globalThis.fetch;
globalThis.__PDV_RUNTIME_CONFIG__ = null;
supabaseClient.configureSupabaseClientForTests();

console.log('auth service ok');
