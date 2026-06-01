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
const { STORAGE_KEYS } = await import('../src/database/schema.js');
const { renderLoginModule } = await import('../src/modules/auth/login.module.js');

storage.setItem(STORAGE_KEYS.users, []);
storage.setItem(STORAGE_KEYS.currentSession, null);
storage.ensureSeedData();

let submittedHandler = null;
const errorNode = {
  hidden: true,
  textContent: ''
};
const formNode = {
  addEventListener(eventName, handler) {
    if (eventName === 'submit') {
      submittedHandler = handler;
    }
  }
};
const container = {
  innerHTML: '',
  querySelector(selector) {
    if (selector === '[data-login-form]') {
      return formNode;
    }
    if (selector === '[data-login-error]') {
      return errorNode;
    }
    return null;
  }
};

const originalFormData = globalThis.FormData;
globalThis.FormData = class FakeFormData {
  get(name) {
    const values = {
      username: 'admin',
      password: 'admin123'
    };
    return values[name];
  }
};

let successCalled = false;
renderLoginModule(container, () => {
  successCalled = true;
});

assert(container.innerHTML.includes('Entrar no PDV'), 'login screen should render title');
assert(container.innerHTML.includes('name="username"'), 'login screen should ask for username');
assert(typeof submittedHandler === 'function', 'login form should bind submit handler');

await submittedHandler({
  preventDefault() {},
  currentTarget: formNode
});

assert(successCalled, 'login should call success callback with valid admin credentials');
assert(storage.getItem(STORAGE_KEYS.currentSession, null)?.userId === 'user-admin', 'login should persist current session');
assert(errorNode.hidden === true, 'login error should stay hidden after successful login');

globalThis.FormData = originalFormData;

console.log('login module ok');
