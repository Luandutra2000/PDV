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

const { renderSidebar } = await import('../src/components/sidebar.component.js');

const admin = { id: 'admin-1', name: 'Admin', role: 'admin', active: true };

const html = renderSidebar(admin, {
  nomeSistema: 'Meu Caixa',
  nomeFantasia: 'Padaria Sao Joao',
  logoUrl: 'https://example.com/logo.png'
});

assert(html.includes('Meu Caixa'), 'sidebar should render configured system name');
assert(html.includes('Padaria Sao Joao'), 'sidebar should render configured company name in footer');
assert(html.includes('https://example.com/logo.png'), 'sidebar should render configured logo');
assert(html.includes('Configurações da Empresa') || html.includes('Configuracoes da Empresa'), 'sidebar should include company settings menu item');
assert(html.includes('data-menu-id="empresa-config"'), 'company settings item should use expected route id');

const operatorHtml = renderSidebar({ id: 'op-1', role: 'operador', active: true }, {
  nomeSistema: 'Meu Caixa',
  nomeFantasia: 'Padaria Sao Joao'
});

assert(!operatorHtml.includes('data-menu-id="empresa-config"'), 'operator should not see company settings menu item');

console.log('sidebar company settings ok');
