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
assert(html.includes('Design de Layout'), 'sidebar should include the approved layout menu item');
assert(html.includes('data-menu-id="empresa-config"'), 'company settings item should use expected route id');

const operatorHtml = renderSidebar({ id: 'op-1', role: 'operador', active: true }, {
  nomeSistema: 'Meu Caixa',
  nomeFantasia: 'Padaria Sao Joao'
});

assert(!operatorHtml.includes('data-menu-id="empresa-config"'), 'operator should not see company settings menu item');

const maliciousHtml = renderSidebar(admin, {
  nomeSistema: '<img src=x onerror=alert(1)>',
  nomeFantasia: '<script>alert(1)</script>',
  logoUrl: 'x" onerror="alert(1)'
});

assert(!maliciousHtml.includes('<img src=x onerror=alert(1)>'), 'sidebar should not render raw system name tags');
assert(!maliciousHtml.includes('<script>alert(1)</script>'), 'sidebar should not render raw company name scripts');
assert(!maliciousHtml.includes('onerror="alert(1)'), 'sidebar should not render injected logo attributes');
assert(
  maliciousHtml.includes('&lt;img src=x onerror=alert(1)&gt;'),
  'sidebar should escape configured system name text'
);
assert(
  maliciousHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
  'sidebar should escape configured company name text'
);
assert(maliciousHtml.includes('class="sidebar__badge"'), 'invalid logo should fall back to PDV badge');
assert(!maliciousHtml.includes('class="sidebar__logo"'), 'invalid logo should not render image tag');

console.log('sidebar company settings ok');
