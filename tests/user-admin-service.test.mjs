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

console.log('user admin service ok');
