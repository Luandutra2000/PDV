const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const auth = await import('../src/services/auth.service.js');
const { renderLoginModule } = await import('../src/modules/auth/login.module.js');

auth.setAuthClientForTests({
  async signInWithPassword() {
    return { data: { user: { id: 'user-1' } }, error: null };
  }
});

const listeners = new Map();
const container = {
  html: '',
  set innerHTML(value) {
    this.html = value;
  },
  get innerHTML() {
    return this.html;
  },
  querySelector(selector) {
    return {
      addEventListener(event, callback) {
        listeners.set(`${selector}:${event}`, callback);
      },
      hidden: true,
      textContent: ''
    };
  }
};

renderLoginModule(container, () => {});

assert(container.innerHTML.includes('class="login-screen"'), 'login should render dedicated screen');
assert(container.innerHTML.includes('class="login-card"'), 'login should render translucent card wrapper');
assert(container.innerHTML.includes('Zelo Lanchonete'), 'login should render store context');
assert(listeners.has('[data-login-form]:submit'), 'login should bind submit handler');

console.log('login module ok');
