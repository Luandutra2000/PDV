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
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};

const storage = await import('../src/services/storage.service.js?v=20260804-03');
const auth = await import('../src/services/auth.service.js?v=20260804-03');
const supabaseClient = await import('../src/services/supabase-client.service.js?v=20260804-03');
const { STORAGE_KEYS, UI_EVENTS } = await import('../src/database/schema.js?v=20260804-03');
const userAdmin = await import('../src/services/user-admin.service.js?v=20260804-03');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-03');

seedTestAdmin(storage, STORAGE_KEYS);
storage.setItem(STORAGE_KEYS.userPermissionOverrides, {});
storage.ensureSeedData();

assert(UI_EVENTS.usersChanged === 'USERS_CHANGED', 'users changed UI event should exist');
assert(UI_EVENTS.permissionsChanged === 'PERMISSIONS_CHANGED', 'permissions changed UI event should exist');

let localCreateRejected = false;
try {
  await userAdmin.createManagedUser({
    name: 'Operador Local',
    username: 'operador-local',
    password: '1234',
    role: 'operador',
    active: true
  });
} catch (error) {
  localCreateRejected = error.message === 'Gerenciamento de usuarios exige autenticacao central.';
}
assert(localCreateRejected, 'local user management should be disabled');

const calls = [];
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};
storage.setItem(STORAGE_KEYS.currentSession, {
  userId: 'user-admin',
  startedAt: '2026-06-10T10:00:00.000Z',
  accessToken: 'jwt-expired',
  refreshToken: 'refresh-token'
});

let refreshCalls = 0;
supabaseClient.configureSupabaseClientForTests({
  client: {
    from() {
      return {
        async upsert() {
          return { error: null };
        }
      };
    },
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              access_token: 'jwt-current',
              refresh_token: 'refresh-token'
            }
          },
          error: null
        };
      },
      async refreshSession() {
        refreshCalls += 1;
        return {
          data: {
            session: {
              access_token: 'jwt-refreshed',
              refresh_token: 'refresh-token-2'
            }
          },
          error: null
        };
      }
    }
  }
});

globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  const body = JSON.parse(options.body);
  const mustRefresh = body.action === 'deleteUser'
    && options.headers.Authorization === 'Bearer jwt-current';

  return {
    ok: !mustRefresh,
    status: mustRefresh ? 401 : 200,
    async json() {
      if (mustRefresh) {
        return { error: 'Sessao administrativa invalida.' };
      }

      if (body.action === 'createUser') {
        return {
          user: {
            id: 'remote-user',
            name: body.payload.name,
            username: body.payload.username,
            role: body.payload.role,
            active: body.payload.active
          }
        };
      }

      if (body.action === 'savePermissionOverrides') {
        return { ok: true };
      }

      return {
        user: {
          id: body.payload.userId,
          name: 'Operador Online',
          username: 'operador@example.com',
          role: 'operador',
          active: true
        }
      };
    }
  };
};

const remote = await userAdmin.createManagedUser({
  name: 'Operador Online',
  username: 'operador@example.com',
  password: '123456',
  role: 'operador',
  active: true
});

assert(remote.id === 'remote-user', 'supabase create should return edge function user');
assert(calls[0].url === 'https://example.supabase.co/functions/v1/admin-users', 'supabase create should call admin-users function');
assert(calls[0].options.headers.apikey === 'anon-key', 'supabase create should send anon key');
assert(calls[0].options.headers.Authorization === 'Bearer jwt-current', 'supabase create should send the current Supabase JWT');
assert(!JSON.stringify(remote).includes('123456'), 'supabase create result should not expose password');

await userAdmin.saveManagedPermissionChecklist(remote, {
  'sales.access': true,
  'sales.discount': true
});

const permissionCall = calls.find((call) => JSON.parse(call.options.body).action === 'savePermissionOverrides');
assert(permissionCall, 'supabase checklist save should call edge function');

await userAdmin.deleteManagedUser(remote.id);
const deleteCalls = calls.filter((call) => JSON.parse(call.options.body).action === 'deleteUser');
assert(deleteCalls.length === 2, 'supabase delete should retry once after an expired administrative session');
assert(deleteCalls[1].options.headers.Authorization === 'Bearer jwt-refreshed', 'retry should use the refreshed Supabase JWT');
assert(refreshCalls === 1, 'expired administrative session should refresh exactly once');
assert(storage.getItem(STORAGE_KEYS.currentSession).accessToken === 'jwt-refreshed', 'refreshed JWT should replace the stale app token');
assert(!auth.getUsers().some((user) => user.id === remote.id), 'delete should remove user from local cache');

console.log('user admin service ok');
