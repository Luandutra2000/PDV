import assert from 'node:assert/strict';

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

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const storage = await import('../src/services/storage.service.js');
const auth = await import('../src/services/auth.service.js');
const permissions = await import('../src/services/permission.service.js');
const userAdmin = await import('../src/services/user-admin.service.js');

function resetUsers(users) {
  store.clear();
  storage.ensureSeedData();
  storage.setItem(STORAGE_KEYS.users, users);
  storage.setItem(STORAGE_KEYS.currentSession, null);
  storage.setItem(STORAGE_KEYS.userPermissionOverrides, {});
  storage.setItem(STORAGE_KEYS.auditLogs, []);
}

function makeUser(overrides = {}) {
  return {
    id: 'user-base',
    name: 'Usuario Base',
    username: 'base',
    password: '1234',
    role: 'operador',
    active: true,
    createdAt: '2026-06-17T10:00:00.000Z',
    updatedAt: '2026-06-17T10:00:00.000Z',
    ...overrides
  };
}

resetUsers([
  makeUser({
    id: 'admin-1',
    name: 'Admin',
    username: 'admin',
    password: 'admin123',
    role: 'admin'
  })
]);

const gerente = userAdmin.createManagedUser({
  name: 'Maria Gerente',
  username: 'maria',
  password: '1234',
  role: 'gerente'
});

assert.equal(gerente.role, 'gerente', 'local createManagedUser should preserve gerente role');
assert.equal(
  storage.getItem(STORAGE_KEYS.users, []).find((user) => user.id === gerente.id)?.role,
  'gerente',
  'created managed user should store gerente role'
);

resetUsers([
  makeUser({
    id: 'admin-1',
    username: 'admin',
    password: 'admin123',
    role: 'admin'
  }),
  makeUser({
    id: 'owner-1',
    name: 'Dono',
    username: 'dono',
    role: 'operador'
  })
]);

const dono = userAdmin.updateManagedUser('owner-1', { role: 'dono' });
assert.equal(dono.role, 'dono', 'local updateManagedUser should preserve dono role');
assert.equal(auth.getUsers().find((user) => user.id === 'owner-1')?.role, 'dono', 'auth.getUsers should load saved role after update');

const checklist = permissions.PERMISSIONS.reduce((state, permission) => {
  state[permission.id] = permissions.getRolePermissions('dono').includes(permission.id);
  return state;
}, {});
checklist['reports.view'] = false;

userAdmin.saveManagedPermissionChecklist(dono, checklist);
assert.equal(
  permissions.getUserPermissionOverride('owner-1', 'reports.view'),
  'deny',
  'saveManagedPermissionChecklist should store deny override when checklist differs from defaults'
);

resetUsers([
  makeUser({
    id: 'admin-1',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    active: true
  }),
  makeUser({
    id: 'operator-1',
    username: 'operador',
    role: 'operador',
    active: true
  })
]);

assert.throws(
  () => userAdmin.updateManagedUser('admin-1', { active: false }),
  /Nao e permitido desativar o ultimo administrador ativo\./,
  'updateManagedUser should not deactivate the last active admin'
);
assert.equal(auth.getUsers().find((user) => user.id === 'admin-1')?.active, true, 'last active admin should remain active');

assert.throws(
  () => userAdmin.deleteManagedUser('admin-1'),
  /Nao e permitido desativar o ultimo administrador ativo\./,
  'deleteManagedUser should not delete the last active admin'
);

const deletedOperator = userAdmin.deleteManagedUser('operator-1');
assert.equal(deletedOperator.id, 'operator-1', 'deleteManagedUser should return the deleted local user');
assert(!auth.getUsers().some((user) => user.id === 'operator-1'), 'deleteManagedUser should remove local users');

const originalFetch = globalThis.fetch;
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

resetUsers([
  makeUser({
    id: 'admin-1',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    active: true
  })
]);
storage.setItem(STORAGE_KEYS.currentSession, {
  userId: 'admin-1',
  accessToken: 'test-access-token',
  startedAt: '2026-06-17T10:00:00.000Z'
});

let managedUserRequest = null;
globalThis.fetch = async (url, options) => {
  managedUserRequest = { url, options };
  const body = JSON.parse(options.body);

  if (body.action === 'listUsers') {
    return {
      ok: true,
      async json() {
        return {
          users: [
            {
              id: 'admin-1',
              name: 'Admin',
              username: 'admin@example.test',
              role: 'admin',
              active: true
            },
            {
              id: 'remote-user',
              name: 'Usuario Remoto',
              username: 'remote@example.test',
              role: 'operador',
              active: true
            }
          ]
        };
      }
    };
  }

  return {
    ok: true,
    async json() {
      return {
        user: {
          id: 'admin-1',
          name: 'Admin',
          username: 'admin',
          role: 'operador',
          active: true
        }
      };
    }
  };
};

const loadedUsers = await userAdmin.loadManagedUsers();
assert(
  loadedUsers.some((user) => user.id === 'remote-user' && user.username === 'remote@example.test'),
  'loadManagedUsers should cache remote Supabase users for Pessoas'
);
assert(
  !loadedUsers.some((user) => user.id === 'admin-1' && user.username === 'admin'),
  'loadManagedUsers should replace stale local-only users with the remote Supabase list'
);

const supabaseUpdatedUser = await userAdmin.updateManagedUser('admin-1', { role: 'operador' });
assert.equal(
  managedUserRequest.options.headers.Authorization,
  'Bearer test-access-token',
  'supabase managed-user calls should use the authenticated access token'
);
assert.equal(supabaseUpdatedUser.role, 'operador', 'supabase updateManagedUser should return remote updated user');

resetUsers([
  makeUser({
    id: 'admin-1',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    active: true
  })
]);

let unauthenticatedFetchCalled = false;
globalThis.fetch = async () => {
  unauthenticatedFetchCalled = true;
  return {
    ok: true,
    async json() {
      return { user: null };
    }
  };
};

storage.setItem(STORAGE_KEYS.currentSession, {
  userId: 'admin-1',
  accessToken: 'test-access-token',
  startedAt: '2026-06-17T10:30:00.000Z'
});

assert.throws(
  () => userAdmin.createManagedUser({
    name: 'Maria',
    username: 'maria',
    password: '123456',
    role: 'operador'
  }),
  /No modo online, o campo Usuario precisa ser um e-mail valido\./,
  'supabase createManagedUser should require email-shaped usernames'
);
assert.equal(
  unauthenticatedFetchCalled,
  false,
  'supabase createManagedUser should fail before fetch when username is not an email'
);

assert.throws(
  () => userAdmin.createManagedUser({
    name: 'Maria',
    username: 'maria@example.test',
    password: '12345',
    role: 'operador'
  }),
  /A senha precisa ter pelo menos 6 caracteres\./,
  'supabase createManagedUser should validate minimum Supabase password length'
);

storage.setItem(STORAGE_KEYS.currentSession, null);

await assert.rejects(
  () => userAdmin.createManagedUser({
    name: 'Sem Sessao',
    username: 'sem-sessao@example.test',
    password: '123456',
    role: 'operador'
  }),
  /Entre novamente com seu usuario Supabase para cadastrar usuarios\./,
  'supabase createManagedUser should require an authenticated session token'
);
assert.equal(
  unauthenticatedFetchCalled,
  false,
  'supabase createManagedUser should fail before fetch when session has no access token'
);

storage.setItem(STORAGE_KEYS.currentSession, {
  userId: 'admin-1',
  accessToken: 'test-access-token',
  startedAt: '2026-06-17T11:00:00.000Z'
});
globalThis.fetch = async () => ({
  ok: false,
  async json() {
    return { error: 'Email ja cadastrado no Supabase.' };
  }
});

await assert.rejects(
  () => userAdmin.createManagedUser({
    name: 'Email Duplicado',
    username: 'duplicado@example.test',
    password: '12345678',
    role: 'operador'
  }),
  /Email ja cadastrado no Supabase\./,
  'supabase createManagedUser should surface Edge Function error messages'
);

globalThis.fetch = originalFetch;
globalThis.__PDV_RUNTIME_CONFIG__ = null;

console.log('user admin service ok');
