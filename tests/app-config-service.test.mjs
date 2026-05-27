const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};

const config = await import('../src/services/app-config.service.js');

assert(config.getDataProviderMode() === 'local', 'default provider should be local');
assert(config.isSupabaseEnabled() === false, 'supabase should be disabled without URL and key');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-anon-key'
};

assert(config.getDataProviderMode() === 'supabase', 'provider should read runtime config');
assert(config.isSupabaseEnabled() === true, 'supabase should be enabled with URL and key');

console.log('app config service ok');
