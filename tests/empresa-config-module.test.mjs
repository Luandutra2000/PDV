import assert from 'node:assert/strict';

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

globalThis.document = {
  documentElement: {
    style: {
      setProperty() {},
      removeProperty() {}
    }
  }
};

const workspace = {
  innerHTML: '',
  addEventListener() {}
};

const { initEmpresaConfigModule } = await import('../src/modules/empresa-config/empresa-config.module.js');
const { saveCompanySettingsLocal } = await import('../src/services/empresa-config.service.js');

initEmpresaConfigModule(workspace);

const logoFileInputPattern = /<input\b(?=[^>]*type="file")(?=[^>]*data-field="logoFile")(?=[^>]*disabled)[^>]*>/s;

assert(
  workspace.innerHTML.includes('Configurações da Empresa') || workspace.innerHTML.includes('Configuracoes da Empresa'),
  'should render company settings title'
);
assert(workspace.innerHTML.includes('Nome do programa'), 'should render system name field');
assert(
  workspace.innerHTML.includes('Cor primaria') || workspace.innerHTML.includes('Cor primária'),
  'should render primary color field'
);
assert(workspace.innerHTML.includes('data-company-preview'), 'should render company preview container');
assert(
  workspace.innerHTML.includes('Salvar configurações') || workspace.innerHTML.includes('Salvar configuracoes'),
  'should render save action'
);

assert(logoFileInputPattern.test(workspace.innerHTML), 'logo file input should exist and stay disabled until upload task');
assert(workspace.innerHTML.includes('data-action="restore-defaults"'), 'should render restore defaults action');
assert(workspace.innerHTML.includes('data-action="remove-logo"'), 'should render remove logo action');

saveCompanySettingsLocal({
  nomeSistema: '<img src=x onerror=alert(1)>',
  nomeFantasia: '<script>alert(1)</script>',
  logoUrl: 'x" onerror="alert(1)',
  corPrimaria: '#2563eb',
  corSecundaria: '#1d4ed8',
  corDestaque: '#dbeafe'
});

const maliciousWorkspace = {
  innerHTML: '',
  addEventListener() {}
};

initEmpresaConfigModule(maliciousWorkspace);

assert(!maliciousWorkspace.innerHTML.includes('<img src=x onerror=alert(1)>'), 'system name should not render raw tags');
assert(!maliciousWorkspace.innerHTML.includes('<script>alert(1)</script>'), 'company name should not render raw scripts');
assert(
  maliciousWorkspace.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'),
  'system name should render escaped text'
);
assert(
  maliciousWorkspace.innerHTML.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
  'company name should render escaped text'
);
assert(!maliciousWorkspace.innerHTML.includes('onerror="alert(1)'), 'unsafe logo URL should not render raw event attributes');
assert(!maliciousWorkspace.innerHTML.includes('class="empresa-config-logo-image"'), 'unsafe logo URL should not render image preview');
assert(maliciousWorkspace.innerHTML.includes('Sem logo'), 'unsafe logo URL should fall back to empty logo state');

console.log('empresa config module ok');
