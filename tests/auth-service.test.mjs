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

storage.ensureSeedData();

const users = auth.getUsers();
assert(users.some((user) => user.role === 'admin'), 'seed should create admin user');

const adminSession = auth.login({ username: 'admin', password: 'admin123' });
assert(adminSession.user.name === 'Administrador', 'admin login should return session user');
assert(auth.getCurrentUser().username === 'admin', 'current user should be stored');

const operator = auth.createUser({
  name: 'Caixa 1',
  username: 'caixa',
  password: '1234',
  role: 'operator'
});

assert(operator.id, 'created user should have id');
assert(operator.active === true, 'created user should be active');

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

auth.logout();
auth.login({ username: 'caixa', password: '1234' });
assert(auth.getCurrentUser().role === 'operator', 'operator should log in');

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
