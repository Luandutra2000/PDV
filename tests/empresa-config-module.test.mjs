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

console.log('empresa config module ok');
