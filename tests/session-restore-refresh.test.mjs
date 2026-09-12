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

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const auth = await import('../src/services/auth.service.js?v=20260804-06');
const supabaseClient = await import('../src/services/supabase-client.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');

storage.setItem(STORAGE_KEYS.users, [{
  id: 'supabase-user',
  name: 'Luan',
  username: 'luan@example.com',
  role: 'admin',
  active: true,
  empresaId: '00000000-0000-0000-0000-000000000001'
}]);
storage.setItem(STORAGE_KEYS.currentSession, { userId: 'supabase-user' });

let refreshCalls = 0;
const freshSession = {
  access_token: 'fresh-access-token',
  refresh_token: 'fresh-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'supabase-user', email: 'luan@example.com' }
};

supabaseClient.configureSupabaseClientForTests({
  client: {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              ...freshSession,
              access_token: 'expired-access-token',
              expires_at: 1
            }
          },
          error: null
        };
      },
      async refreshSession() {
        refreshCalls += 1;
        return { data: { session: freshSession }, error: null };
      },
      async setSession() {}
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
                        name: 'Luan',
                        role_id: 'admin',
                        is_active: true,
                        empresa_id: '00000000-0000-0000-0000-000000000001'
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

const restoredUser = await auth.restoreSupabaseSession();
const currentSession = storage.getItem(STORAGE_KEYS.currentSession, null);

assert(restoredUser?.id === 'supabase-user', 'session restore should keep the authenticated profile');
assert(refreshCalls === 1, 'expired sessions should be refreshed before restoring the local user');
assert(currentSession.accessToken === 'fresh-access-token', 'refreshed access token should be cached');
assert(currentSession.refreshToken === 'fresh-refresh-token', 'refreshed refresh token should be cached');

supabaseClient.configureSupabaseClientForTests();
globalThis.__PDV_RUNTIME_CONFIG__ = null;

console.log('session restore refresh ok');
