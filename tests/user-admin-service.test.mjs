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

const storage = await import('../src/services/storage.service.js');
const auth = await import('../src/services/auth.service.js');
const { STORAGE_KEYS, UI_EVENTS } = await import('../src/database/schema.js');
const userAdmin = await import('../src/services/user-admin.service.js');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs');

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
  accessToken: 'jwt-admin'
});

globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  const body = JSON.parse(options.body);

  return {
    ok: true,
    async json() {
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

      return { user: body.payload };
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
assert(calls[0].options.headers.Authorization === 'Bearer jwt-admin', 'supabase create should send logged user JWT');
assert(!JSON.stringify(remote).includes('123456'), 'supabase create result should not expose password');

await userAdmin.saveManagedPermissionChecklist(remote, {
  'sales.access': true,
  'sales.discount': true
});

const permissionCall = calls.find((call) => JSON.parse(call.options.body).action === 'savePermissionOverrides');
assert(permissionCall, 'supabase checklist save should call edge function');

await userAdmin.deleteManagedUser(remote.id);
const deleteCall = calls.find((call) => JSON.parse(call.options.body).action === 'deleteUser');
assert(deleteCall, 'supabase delete should call edge function');
assert(!auth.getUsers().some((user) => user.id === remote.id), 'delete should remove user from local cache');

console.log('user admin service ok');
