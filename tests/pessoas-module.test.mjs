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

const storage = await import('../src/services/storage.service.js?v=20260729-13');
const auth = await import('../src/services/auth.service.js?v=20260729-13');
const { initPessoasModule } = await import('../src/modules/pessoas/pessoas.module.js?v=20260729-13');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260729-13');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260729-13');

seedTestAdmin(storage, STORAGE_KEYS);
storage.ensureSeedData();

const listeners = {};
const container = {
  innerHTML: '',
  addEventListener(eventName, handler) {
    listeners[eventName] = handler;
  },
  querySelector() {
    return null;
  }
};

initPessoasModule(container);

assert(container.innerHTML.includes('Pessoas e Permissoes'), 'people screen should render modern title');
assert(container.innerHTML.includes('Total de usuarios'), 'people screen should render summary cards');
assert(container.innerHTML.includes('data-user-modal'), 'people screen should render user modal markup');
assert(container.innerHTML.includes('data-permission-checkbox'), 'people modal should render permission checklist');
assert(container.innerHTML.includes('Gerente'), 'role select should include Gerente');
assert(container.innerHTML.includes('Operador/Caixa'), 'role select should include Operador/Caixa');
assert(container.innerHTML.includes('Financeiro/Despesas'), 'permissions should include financial group');
assert(container.innerHTML.includes('Historico de acoes'), 'people screen should render audit history section');
assert(container.innerHTML.includes('data-audit-user-filter'), 'history should expose user filter');
assert(container.innerHTML.includes('data-action="delete-user"'), 'people screen should expose user deletion');

console.log('pessoas module ok');
