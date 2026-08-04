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

const storage = await import('../src/services/storage.service.js?v=20260804-04');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-04');
const { renderLoginModule } = await import('../src/modules/auth/login.module.js?v=20260804-04');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-04');

seedTestAdmin(storage, STORAGE_KEYS);
storage.ensureSeedData();

let submittedHandler = null;
const errorNode = {
  hidden: true,
  textContent: ''
};
const submitButton = {
  disabled: false,
  textContent: 'Entrar'
};
const formNode = {
  addEventListener(eventName, handler) {
    if (eventName === 'submit') {
      submittedHandler = handler;
    }
  },
  querySelector(selector) {
    if (selector === 'button[type="submit"]') {
      return submitButton;
    }
    return null;
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

assert(!successCalled, 'local credentials should not authenticate');
assert(storage.getItem(STORAGE_KEYS.currentSession, null)?.userId === 'user-admin', 'login should persist current session');
assert(errorNode.hidden === false, 'login should explain that central authentication is required');
assert(errorNode.textContent === 'Autenticacao central obrigatoria. Configure o Supabase.', 'login should show safe configuration error');
assert(submitButton.textContent === 'Entrar', 'login button should be restored after failed submit');

globalThis.FormData = originalFormData;

console.log('login module ok');
