import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

globalThis.FormData = class TestFormData {
  constructor(form) {
    this.fields = form.fields || {};
  }

  get(name) {
    return this.fields[name] ?? '';
  }
};

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const { initEmpresaConfigModule } = await import('../src/modules/empresa-config/empresa-config.module.js');
const {
  getDefaultCompanySettings,
  loadCompanySettingsLocal,
  saveCompanySettingsLocal
} = await import('../src/services/empresa-config.service.js');

const logoFileInputPattern = /<input\b(?=[^>]*type="file")(?=[^>]*data-field="logoFile")(?=[^>]*disabled)[^>]*>/s;
const empresaConfigCss = readFileSync(new URL('../src/styles/empresa-config.css', import.meta.url), 'utf8');

function createWorkspace() {
  const listeners = {};
  const errorTarget = {
    hidden: true,
    textContent: ''
  };

  return {
    innerHTML: '',
    listeners,
    errorTarget,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelector(selector) {
      return selector === '[data-company-settings-error]' ? errorTarget : null;
    }
  };
}

function createForm(fields) {
  return {
    fields,
    matches(selector) {
      return selector === '[data-company-settings-form]';
    }
  };
}

function createActionTarget(action, scoped = true) {
  return {
    dataset: { action },
    closest(selector) {
      if (selector === '[data-action]') {
        return this;
      }

      if (selector === '[data-empresa-config-screen]') {
        return scoped ? { dataset: {} } : null;
      }

      return null;
    }
  };
}

function getStoredCompanySettings() {
  return JSON.parse(store.get(STORAGE_KEYS.companySettings));
}

function getValidFormFields(overrides = {}) {
  return {
    nomeSistema: 'Caixa Teste',
    nomeFantasia: 'Loja Teste',
    razaoSocial: 'Loja Teste LTDA',
    cnpj: '12345678000199',
    telefone: '1133334444',
    whatsapp: '11999998888',
    email: 'contato@example.com',
    endereco: 'Rua Teste, 123',
    corPrimaria: '#2563eb',
    corSecundaria: '#1d4ed8',
    corDestaque: '#dbeafe',
    ...overrides
  };
}

async function dispatchSubmit(workspace, fields) {
  let prevented = false;
  await workspace.listeners.submit({
    target: createForm(fields),
    preventDefault() {
      prevented = true;
    }
  });
  return prevented;
}

async function dispatchClick(workspace, action, scoped = true) {
  await workspace.listeners.click({
    target: createActionTarget(action, scoped)
  });
}

store.clear();
const workspace = createWorkspace();
initEmpresaConfigModule(workspace);

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
assert(
  /\.empresa-config-preview__brand\s*{[^}]*min-width:\s*0;/s.test(empresaConfigCss),
  'preview brand row should be allowed to shrink inside the preview card'
);
assert(
  /\.empresa-config-preview__brand\s*>\s*div\s*{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s.test(empresaConfigCss),
  'preview brand text container should clip long company names'
);
assert(
  /\.empresa-config-preview__brand\s+(?:strong|span),[\s\S]*?\.empresa-config-preview__brand\s+(?:strong|span)\s*{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s.test(empresaConfigCss),
  'preview brand text should truncate instead of overflowing'
);

store.clear();
saveCompanySettingsLocal({
  nomeSistema: '<img src=x onerror=alert(1)>',
  nomeFantasia: '<script>alert(1)</script>',
  logoUrl: 'x" onerror="alert(1)',
  corPrimaria: '#2563eb',
  corSecundaria: '#1d4ed8',
  corDestaque: '#dbeafe'
});

const maliciousWorkspace = createWorkspace();
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

store.clear();
const submitWorkspace = createWorkspace();
initEmpresaConfigModule(submitWorkspace);
const submitPrevented = await dispatchSubmit(submitWorkspace, getValidFormFields());
const submittedSettings = getStoredCompanySettings();
assert(submitPrevented, 'submit handler should prevent default form submission');
assert(submittedSettings.nomeSistema === 'Caixa Teste', 'submit should persist system name through real service');
assert(submittedSettings.nomeFantasia === 'Loja Teste', 'submit should persist company name through real service');
assert(submittedSettings.logoUrl === '', 'submit should not imply file input handling or alter logo URL');

store.clear();
saveCompanySettingsLocal({
  ...getDefaultCompanySettings(),
  nomeSistema: 'Com Logo',
  nomeFantasia: 'Loja Com Logo',
  logoUrl: 'https://example.com/logo.png'
});
const removeWorkspace = createWorkspace();
initEmpresaConfigModule(removeWorkspace);
await dispatchClick(removeWorkspace, 'remove-logo');
assert(getStoredCompanySettings().logoUrl === '', 'remove-logo action should persist an empty logo URL');

store.clear();
saveCompanySettingsLocal({
  id: 'settings-42',
  empresaId: 'empresa-42',
  nomeSistema: 'Marca Editada',
  nomeFantasia: 'Loja Editada',
  logoUrl: 'https://example.com/logo.png',
  corPrimaria: '#111111',
  corSecundaria: '#222222',
  corDestaque: '#333333'
});
const restoreWorkspace = createWorkspace();
initEmpresaConfigModule(restoreWorkspace);
await dispatchClick(restoreWorkspace, 'restore-defaults');
const restoredSettings = loadCompanySettingsLocal();
assert(restoredSettings.nomeSistema === 'Zelo PDV', 'restore-defaults should restore default system name through async save path');
assert(restoredSettings.nomeFantasia === 'Lanchonete', 'restore-defaults should restore configurable defaults');
assert(restoredSettings.id === 'settings-42', 'restore-defaults should preserve current settings id');
assert(restoredSettings.empresaId === 'empresa-42', 'restore-defaults should preserve current empresaId');

store.clear();
saveCompanySettingsLocal({
  ...getDefaultCompanySettings(),
  logoUrl: 'https://example.com/logo.png'
});
const unrelatedWorkspace = createWorkspace();
initEmpresaConfigModule(unrelatedWorkspace);
await dispatchClick(unrelatedWorkspace, 'remove-logo', false);
assert(
  getStoredCompanySettings().logoUrl === 'https://example.com/logo.png',
  'unscoped workspace actions should not trigger company settings handlers'
);

store.clear();
const errorWorkspace = createWorkspace();
initEmpresaConfigModule(errorWorkspace);
await dispatchSubmit(errorWorkspace, getValidFormFields({ nomeSistema: '' }));
assert(errorWorkspace.errorTarget.hidden === false, 'validation error should show the existing error area');
assert(
  errorWorkspace.errorTarget.textContent.includes('Nome do programa'),
  'validation error should be written to the existing error area'
);

console.log('empresa config module ok');
