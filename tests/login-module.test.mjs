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

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { renderLoginModule } = await import('../src/modules/auth/login.module.js?v=20260807-20');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');

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
const toggleNode = {
  attrs: { 'aria-label': 'Mostrar senha' },
  listeners: {},
  textContent: 'Mostrar',
  addEventListener(eventName, handler) {
    this.listeners[eventName] = handler;
  },
  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }
};
const passwordNode = { type: 'password' };
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
    if (selector === '[data-login-toggle-password]') {
      return toggleNode;
    }
    if (selector === 'input[name="password"]') {
      return passwordNode;
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

storage.setItem(STORAGE_KEYS.companySettings, {
  nomeFantasia: "Q'Del<b>icia</b> & Cia",
  nomeSistema: 'Zelo PDV',
  logoUrl: 'javascript:alert(1)'
});

let successCalled = false;
renderLoginModule(container, () => {
  successCalled = true;
});

assert(container.innerHTML.includes('Entrar no PDV'), 'login screen should render title');
assert(container.innerHTML.includes('name="username"'), 'login screen should ask for username');
const html = container.innerHTML;
for (const text of ['E-mail', 'Senha', 'Mostrar', 'Esqueceu a senha? Fale com o administrador.']) {
  assert(html.includes(text), `login screen should show "${text}"`);
}
for (const text of ['Sign in with Google', 'Entrar com Google', 'Remember me', 'Welcome Back', 'Sign up', 'Sign in', 'Forgot password', 'name="remember"', 'bubble']) {
  assert(!html.includes(text), `login screen should not contain "${text}"`);
}
assert(html.includes('type="submit"') && html.includes('data-login-form') && html.includes('data-login-error'), 'login screen should keep form hooks');
assert(html.includes('name="password"') && html.includes('data-login-toggle-password'), 'login screen should have password field and toggle');
assert(html.includes('Q&#039;Del&lt;b&gt;icia&lt;/b&gt; &amp; Cia'), 'company name should be rendered escaped');
assert(!html.includes('<b>icia'), 'company name should not inject markup');
assert(!html.includes('javascript:'), 'disallowed logo urls should not be rendered');
assert(typeof toggleNode.listeners.click === 'function', 'password toggle should bind click handler');
toggleNode.listeners.click({ preventDefault() {} });
assert(passwordNode.type === 'text' && toggleNode.attrs['aria-label'] === 'Ocultar senha' && toggleNode.textContent === 'Ocultar', 'toggle should reveal the password');
toggleNode.listeners.click({ preventDefault() {} });
assert(passwordNode.type === 'password' && toggleNode.attrs['aria-label'] === 'Mostrar senha' && toggleNode.textContent === 'Mostrar', 'toggle should hide the password again');

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
