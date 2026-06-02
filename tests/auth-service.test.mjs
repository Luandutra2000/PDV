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

const storage = await import('../src/services/storage.service.js');
const auth = await import('../src/services/auth.service.js');
const { STORAGE_KEYS } = await import('../src/database/schema.js');

storage.setItem(STORAGE_KEYS.users, []);
storage.ensureSeedData();

const assertNoPassword = (user, message) => {
  assert(!Object.hasOwn(user, 'password'), message);
};

const assertUsersHaveNoPassword = (usersToCheck, message) => {
  assert(usersToCheck.every((user) => !Object.hasOwn(user, 'password')), message);
};

const makeUser = (overrides) => ({
  id: 'user-test',
  name: 'Usuario Teste',
  username: 'teste',
  password: '1234',
  role: 'operator',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

const seedUsers = (usersToSeed) => {
  storage.setItem(STORAGE_KEYS.users, usersToSeed);
  storage.setItem(STORAGE_KEYS.currentSession, null);
  storage.ensureSeedData();
  return storage.getItem(STORAGE_KEYS.users, []);
};

let seededUsers = seedUsers([]);
assert(seededUsers.some((user) => user.role === 'admin' && user.active === true), 'empty seed should create active admin');
auth.login({ username: 'admin', password: 'admin123' });
auth.logout();

seededUsers = seedUsers([
  makeUser({
    id: 'inactive-admin',
    username: 'old-admin',
    password: 'oldpass',
    role: 'admin',
    active: false
  })
]);
assert(seededUsers.length === 2, 'inactive admin seed should append default admin login when admin username is missing');
assert(seededUsers.some((user) => user.id === 'inactive-admin'), 'inactive admin seed should keep existing admin record');
assert(seededUsers.some((user) => user.username === 'admin' && user.password === 'admin123'), 'inactive admin seed should add default admin credentials');
auth.login({ username: 'admin', password: 'admin123' });
auth.logout();

seededUsers = seedUsers([
  makeUser({
    id: 'admin-login-user',
    username: 'admin',
    password: 'operator-admin-password',
    role: 'operator',
    active: false
  })
]);
assert(seededUsers.length === 1, 'admin username seed should not append duplicate username');
assert(seededUsers[0].id === 'admin-login-user', 'admin username seed should keep existing admin username user');
assert(seededUsers[0].role === 'admin', 'admin username seed should promote existing user');
assert(seededUsers[0].active === true, 'admin username seed should reactivate promoted user');
assert(auth.login({ username: 'admin', password: 'admin123' }).user.role === 'admin', 'promoted admin username should log in as admin');
auth.logout();

seededUsers = seedUsers([
  makeUser({
    id: 'regular-user',
    username: 'regular',
    password: 'regularpass',
    role: 'operator'
  })
]);
assert(seededUsers.some((user) => user.id === 'regular-user'), 'seed should preserve existing non-admin users');
assert(seededUsers.some((user) => user.username === 'admin' && user.role === 'admin' && user.active === true), 'seed should append default admin when admin username is free');
auth.login({ username: 'admin', password: 'admin123' });
auth.logout();

storage.setItem(STORAGE_KEYS.users, []);
storage.setItem(STORAGE_KEYS.currentSession, null);
storage.ensureSeedData();

const users = auth.getUsers();
assert(users.some((user) => user.role === 'admin'), 'seed should create admin user');
assertUsersHaveNoPassword(users, 'getUsers should not expose passwords');

const adminSession = auth.login({ username: 'admin', password: 'admin123' });
assert(adminSession.user.name === 'Administrador', 'admin login should return session user');
assertNoPassword(adminSession.user, 'login user should not expose password');
assert(auth.getCurrentUser().username === 'admin', 'current user should be stored');
assertNoPassword(auth.getCurrentUser(), 'current user should not expose password');

const operator = auth.createUser({
  name: 'Caixa 1',
  username: 'caixa',
  password: '1234',
  role: 'operator'
});

assert(operator.id, 'created user should have id');
assert(operator.active === true, 'created user should be active');
assertNoPassword(operator, 'createUser should not expose password');
assertUsersHaveNoPassword(auth.getUsers(), 'getUsers should not expose created user password');
assertUsersHaveNoPassword(auth.getActiveUsers(), 'getActiveUsers should not expose passwords');

let blankNameRejected = false;
try {
  auth.createUser({
    name: '   ',
    username: 'blank-name',
    password: '1234',
    role: 'operator'
  });
} catch (error) {
  blankNameRejected = error.message === 'Preencha nome, usuario, senha e perfil.';
}

assert(blankNameRejected, 'whitespace-only name should be rejected');

let blankUsernameRejected = false;
try {
  auth.createUser({
    name: 'Operador',
    username: '   ',
    password: '1234',
    role: 'operator'
  });
} catch (error) {
  blankUsernameRejected = error.message === 'Preencha nome, usuario, senha e perfil.';
}

assert(blankUsernameRejected, 'whitespace-only username should be rejected');

let blankPasswordRejected = false;
try {
  auth.createUser({
    name: 'Operador',
    username: 'blank-password',
    password: '   ',
    role: 'operator'
  });
} catch (error) {
  blankPasswordRejected = error.message === 'Preencha nome, usuario, senha e perfil.';
}

assert(blankPasswordRejected, 'whitespace-only password should be rejected');

let invalidPatchRejected = false;
try {
  auth.updateUser(operator.id, null);
} catch (error) {
  invalidPatchRejected = error.message === 'Dados do usuario invalidos.';
}

assert(invalidPatchRejected, 'updateUser should reject null patch');

let invalidPatchTypeRejected = false;
try {
  auth.updateUser(operator.id, 'invalid');
} catch (error) {
  invalidPatchTypeRejected = error.message === 'Dados do usuario invalidos.';
}

assert(invalidPatchTypeRejected, 'updateUser should reject non-object patch');

let updateBlankNameRejected = false;
try {
  auth.updateUser(operator.id, { name: '   ' });
} catch (error) {
  updateBlankNameRejected = error.message === 'Preencha nome, usuario, senha e perfil.';
}

assert(updateBlankNameRejected, 'updateUser should reject whitespace-only name');

let updateBlankUsernameRejected = false;
try {
  auth.updateUser(operator.id, { username: '   ' });
} catch (error) {
  updateBlankUsernameRejected = error.message === 'Preencha nome, usuario, senha e perfil.';
}

assert(updateBlankUsernameRejected, 'updateUser should reject whitespace-only username');

let updateBlankPasswordRejected = false;
try {
  auth.updateUser(operator.id, { password: '   ' });
} catch (error) {
  updateBlankPasswordRejected = error.message === 'Preencha nome, usuario, senha e perfil.';
}

assert(updateBlankPasswordRejected, 'updateUser should reject whitespace-only password');

let invalidActiveRejected = false;
try {
  auth.updateUser(operator.id, { active: 'false' });
} catch (error) {
  invalidActiveRejected = error.message === 'Status do usuario invalido.';
}

assert(invalidActiveRejected, 'updateUser should reject non-boolean active status');

let duplicateUsernameRejected = false;
try {
  auth.updateUser(operator.id, { username: 'admin' });
} catch (error) {
  duplicateUsernameRejected = error.message === 'Ja existe usuario com este login.';
}

assert(duplicateUsernameRejected, 'updateUser should reject duplicate username');

const updatedOperator = auth.updateUser(operator.id, { id: 'changed-user-id', name: 'Caixa Principal' });
assert(updatedOperator.id === operator.id, 'updateUser should not allow id changes');
assertNoPassword(updatedOperator, 'updateUser should not expose password');
assert(!auth.getUsers().some((user) => user.id === 'changed-user-id'), 'stored user id should not change');

auth.logout();
auth.login({ username: 'caixa', password: '1234' });
assert(auth.getCurrentUser().role === 'operator', 'operator should log in');
assertNoPassword(auth.getCurrentUser(), 'current operator should not expose password');

auth.updateUser(operator.id, { active: false });
auth.logout();

let blocked = false;
try {
  auth.login({ username: 'caixa', password: '1234' });
} catch (error) {
  blocked = error.message === 'Usuario inativo.';
}

assert(blocked, 'inactive user should not log in');

const originalFetch = globalThis.fetch;
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

let supabaseLoginBody = null;
globalThis.fetch = async (url, options) => {
  supabaseLoginBody = JSON.parse(options.body);
  return {
    ok: true,
    async json() {
      return {
        user: {
          id: 'supabase-user',
          email: 'luandutra27@gmail.com',
          user_metadata: { name: 'Luan Dutra' }
        },
        session: { access_token: 'token' }
      };
    }
  };
};

const supabaseSession = await auth.login({ username: 'luandutra27@gmail,com', password: '84276331' });
assert(supabaseLoginBody.email === 'luandutra27@gmail.com', 'supabase login should normalize comma email typo');
assert(supabaseSession.user.username === 'luandutra27@gmail.com', 'supabase login should create local session user');
assert(auth.getCurrentUser().id === 'supabase-user', 'supabase login should persist local current session');

globalThis.fetch = originalFetch;
globalThis.__PDV_RUNTIME_CONFIG__ = null;

console.log('auth service ok');
