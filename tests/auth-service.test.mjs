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

console.log('auth service ok');
