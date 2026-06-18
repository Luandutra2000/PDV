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
const supabaseClient = await import('../src/services/supabase-client.service.js');
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

const localAsyncSaved = await company.saveCompanySettings({
  nomeSistema: 'Caixa Local Async',
  nomeFantasia: 'Loja Local Async',
  corPrimaria: '#64748b',
  corSecundaria: '#475569',
  corDestaque: '#f1f5f9'
});
assert(localAsyncSaved.syncStatus === 'local-only', 'local async save should mark local-only status');

const scopedLocal = company.saveCompanySettingsLocal({
  empresaId: 'empresa-42',
  nomeSistema: 'Loja Escopada',
  nomeFantasia: 'Filial 42',
  corPrimaria: '#0f766e',
  corSecundaria: '#115e59',
  corDestaque: '#ccfbf1'
});

const loadFilters = [];
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

supabaseClient.configureSupabaseClientForTests({
  client: {
    from(tableName) {
      assert(tableName === 'empresa_configuracoes', 'load should target company settings table');
      return {
        select(columns) {
          assert(columns === '*', 'load should select all company settings columns');
          return {
            eq(column, value) {
              loadFilters.push([column, value]);
              return this;
            },
            maybeSingle() {
              return {
                data: {
                  empresa_id: 'empresa-42',
                  nome_sistema: 'Loja Remota',
                  nome_fantasia: 'Filial Remota',
                  cor_primaria: '#0f766e',
                  cor_secundaria: '#115e59',
                  cor_destaque: '#ccfbf1'
                },
                error: null
              };
            }
          };
        }
      };
    }
  }
});

try {
  const remoteLoaded = await company.loadCompanySettings();
  assert(remoteLoaded.nomeSistema === 'Loja Remota', 'supabase load should return remote settings');
  assert(
    loadFilters.some(([column, value]) => column === 'empresa_id' && value === scopedLocal.empresaId),
    'supabase load should filter by normalized local empresaId'
  );
} finally {
  supabaseClient.configureSupabaseClientForTests();
  globalThis.__PDV_RUNTIME_CONFIG__ = null;
}

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

supabaseClient.configureSupabaseClientForTests({
  client: {
    from(tableName) {
      assert(tableName === 'empresa_configuracoes', 'save should target company settings table');
      return {
        upsert() {
          return {
            select() {
              return {
                single() {
                  return { data: null, error: new Error('network down') };
                }
              };
            }
          };
        }
      };
    }
  }
});

const originalWarn = console.warn;
const warnings = [];
console.warn = (...args) => {
  warnings.push(args);
};

let fallbackSaved;
try {
  fallbackSaved = await company.saveCompanySettings({
    nomeSistema: 'Offline Caixa',
    nomeFantasia: 'Offline Loja',
    corPrimaria: '#16a34a',
    corSecundaria: '#15803d',
    corDestaque: '#dcfce7'
  });
} finally {
  console.warn = originalWarn;
  supabaseClient.configureSupabaseClientForTests();
  globalThis.__PDV_RUNTIME_CONFIG__ = null;
}

assert(fallbackSaved.nomeSistema === 'Offline Caixa', 'supabase save error should return local settings');
assert(fallbackSaved.syncStatus === 'local-only', 'supabase save error should mark local-only status');
assert(
  storage.getItem(STORAGE_KEYS.companySettings).nomeSistema === 'Offline Caixa',
  'supabase save error should persist settings locally'
);
assert(
  warnings.some(([message, error]) => message.includes('Nao foi possivel salvar configuracoes da empresa.') && error.message === 'network down'),
  'supabase save error should warn before local fallback'
);

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

supabaseClient.configureSupabaseClientForTests({
  client: {
    from(tableName) {
      assert(tableName === 'empresa_configuracoes', 'save success should target company settings table');
      return {
        upsert() {
          return {
            select() {
              return {
                single() {
                  return {
                    data: {
                      empresa_id: 'empresa-remota',
                      nome_sistema: 'Caixa Remoto',
                      nome_fantasia: 'Loja Remota',
                      cor_primaria: '#7c3aed',
                      cor_secundaria: '#6d28d9',
                      cor_destaque: '#ede9fe'
                    },
                    error: null
                  };
                }
              };
            }
          };
        }
      };
    }
  }
});

try {
  const remoteSaved = await company.saveCompanySettings({
    empresaId: 'empresa-remota',
    nomeSistema: 'Caixa Enviado',
    nomeFantasia: 'Loja Enviada',
    corPrimaria: '#7c3aed',
    corSecundaria: '#6d28d9',
    corDestaque: '#ede9fe'
  });

  assert(remoteSaved.nomeSistema === 'Caixa Remoto', 'remote save success should return remote row');
  assert(remoteSaved.syncStatus === 'synced', 'remote save success should mark synced status');
  assert(
    storage.getItem(STORAGE_KEYS.companySettings).nomeSistema === 'Caixa Remoto',
    'remote save success should persist remote row locally'
  );
} finally {
  supabaseClient.configureSupabaseClientForTests();
  globalThis.__PDV_RUNTIME_CONFIG__ = null;
}

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

supabaseClient.configureSupabaseClientForTests({
  client: {
    from(tableName) {
      assert(tableName === 'empresa_configuracoes', 'empty save should target company settings table');
      return {
        upsert() {
          return {
            select() {
              return {
                single() {
                  return { data: null, error: null };
                }
              };
            }
          };
        }
      };
    }
  }
});

try {
  const emptyRemoteSaved = await company.saveCompanySettings({
    nomeSistema: 'Caixa Sem Linha',
    nomeFantasia: 'Loja Sem Linha',
    corPrimaria: '#0891b2',
    corSecundaria: '#0e7490',
    corDestaque: '#cffafe'
  });

  assert(emptyRemoteSaved.nomeSistema === 'Caixa Sem Linha', 'empty remote save should keep validated settings');
  assert(emptyRemoteSaved.syncStatus === 'synced', 'empty remote save should still mark synced status');
} finally {
  supabaseClient.configureSupabaseClientForTests();
  globalThis.__PDV_RUNTIME_CONFIG__ = null;
}

const thrownLoadLocal = company.saveCompanySettingsLocal({
  nomeSistema: 'Caixa Load Local',
  nomeFantasia: 'Loja Load Local',
  corPrimaria: '#0ea5e9',
  corSecundaria: '#0284c7',
  corDestaque: '#e0f2fe'
});

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

supabaseClient.configureSupabaseClientForTests({
  client: {
    from() {
      throw new Error('load query exploded');
    }
  }
});

const originalWarnForThrownLoad = console.warn;
console.warn = () => {};

try {
  const thrownLoadFallback = await company.loadCompanySettings();
  assert(
    thrownLoadFallback.nomeSistema === thrownLoadLocal.nomeSistema,
    'thrown supabase load failure should return local settings'
  );
} finally {
  console.warn = originalWarnForThrownLoad;
  supabaseClient.configureSupabaseClientForTests();
  globalThis.__PDV_RUNTIME_CONFIG__ = null;
}

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

supabaseClient.configureSupabaseClientForTests({
  client: {
    from() {
      return {
        upsert() {
          throw new Error('save query exploded');
        }
      };
    }
  }
});

const originalWarnForThrownSave = console.warn;
console.warn = () => {};

try {
  const thrownSaveFallback = await company.saveCompanySettings({
    nomeSistema: 'Caixa Save Local',
    nomeFantasia: 'Loja Save Local',
    corPrimaria: '#f59e0b',
    corSecundaria: '#d97706',
    corDestaque: '#fef3c7'
  });

  assert(thrownSaveFallback.nomeSistema === 'Caixa Save Local', 'thrown supabase save failure should return local settings');
  assert(thrownSaveFallback.syncStatus === 'local-only', 'thrown supabase save failure should mark local-only status');
} finally {
  console.warn = originalWarnForThrownSave;
  supabaseClient.configureSupabaseClientForTests();
  globalThis.__PDV_RUNTIME_CONFIG__ = null;
}

console.log('empresa config service ok');
