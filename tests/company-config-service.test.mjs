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
const schema = await import('../src/database/schema.js?v=20260804-06');
const supabaseClient = await import('../src/services/supabase-client.service.js?v=20260804-06');
const company = await import('../src/services/empresa-config.service.js?v=20260804-06');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};
storage.setItem(schema.STORAGE_KEYS.users, [{
  id: 'user-1',
  name: 'Luan',
  username: 'luan@example.com',
  role: 'admin',
  active: true
}]);
storage.setItem(schema.STORAGE_KEYS.currentSession, { userId: 'user-1' });

const companyId = '00000000-0000-0000-0000-000000000001';
const filters = [];
supabaseClient.configureSupabaseClientForTests({
  client: {
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              filters.push({ table, column, value });
              return {
                async maybeSingle() {
                  if (table === 'profiles') {
                    return { data: { empresa_id: companyId }, error: null };
                  }
                  return {
                    data: {
                      empresa_id: companyId,
                      nome_sistema: 'Q-Delicia',
                      nome_fantasia: 'Lanchonete',
                      cor_primaria: '#eb4224',
                      cor_secundaria: '#0f172a',
                      cor_destaque: '#f97316'
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

const settings = await company.loadCompanySettings();
assert(settings.empresaId === companyId, 'company settings should resolve empresa_id from the authenticated profile');
assert(settings.nomeSistema === 'Q-Delicia', 'company settings should load the remote configuration');
assert(!filters.some((filter) => filter.value === 'local-company'), 'company settings must never query local-company as a UUID');
assert(filters.some((filter) => filter.table === 'empresa_configuracoes' && filter.value === companyId), 'company settings should scope remote data by the profile company');

console.log('company config service ok');
