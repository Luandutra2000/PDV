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

const documentStyle = new Map();
globalThis.document = {
  documentElement: {
    style: {
      setProperty(name, value) {
        documentStyle.set(name, value);
      },
      removeProperty(name) {
        documentStyle.delete(name);
      }
    }
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertThrows = (callback, expectedMessage, message) => {
  try {
    callback();
  } catch (error) {
    assert(error.message.includes(expectedMessage), `${message}: got "${error.message}"`);
    return;
  }
  throw new Error(message);
};

const storage = await import('../src/services/storage.service.js');
const { STORAGE_KEYS } = await import('../src/database/schema.js');
const company = await import('../src/services/empresa-config.service.js');

storage.ensureSeedData();

const defaults = company.getDefaultCompanySettings();
assert(defaults.nomeSistema === 'Zelo PDV', 'default system name should keep current brand');
assert(defaults.nomeFantasia === 'Lanchonete', 'default store label should keep current sidebar footer');
assert(defaults.corPrimaria === '#ff6b1a', 'default primary color should match current theme');
assert(defaults.corSecundaria === '#e65b11', 'default secondary color should match current strong color');
assert(defaults.corDestaque === '#fff0e6', 'default accent color should match current soft highlight');

assertThrows(
  () => company.validateCompanySettings({ ...defaults, nomeSistema: '' }),
  'Nome do programa e obrigatorio.',
  'empty system name should fail'
);

assertThrows(
  () => company.validateCompanySettings({ ...defaults, corPrimaria: 'orange' }),
  'Cor primaria invalida.',
  'invalid primary color should fail'
);

const saved = company.saveCompanySettingsLocal({
  nomeSistema: 'Meu Caixa',
  nomeFantasia: 'Padaria Sao Joao',
  corPrimaria: '#2563eb',
  corSecundaria: '#1d4ed8',
  corDestaque: '#dbeafe',
  logoUrl: 'data:image/png;base64,abc',
  email: 'contato@example.com'
});

assert(saved.nomeSistema === 'Meu Caixa', 'save should normalize system name');
assert(saved.nomeFantasia === 'Padaria Sao Joao', 'save should normalize company name');
assert(storage.getItem(STORAGE_KEYS.companySettings).nomeSistema === 'Meu Caixa', 'settings should persist locally');

const loaded = company.loadCompanySettingsLocal();
assert(loaded.nomeSistema === 'Meu Caixa', 'load should read persisted settings');
assert(loaded.logoUrl === 'data:image/png;base64,abc', 'load should keep local logo');

company.applyCompanyIdentity(loaded);
assert(documentStyle.get('--color-primary') === '#2563eb', 'primary variable should be applied');
assert(documentStyle.get('--color-primary-strong') === '#1d4ed8', 'secondary variable should be applied');
assert(documentStyle.get('--crm-orange-soft') === '#dbeafe', 'accent variable should be applied');

const restored = company.resetCompanySettingsLocal();
assert(restored.nomeSistema === 'Zelo PDV', 'reset should restore default system name');

console.log('empresa config service ok');
