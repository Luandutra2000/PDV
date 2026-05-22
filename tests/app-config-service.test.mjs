const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

delete globalThis.__PDV_RUNTIME_CONFIG__;

const config = await import('../src/services/app-config.service.js');

assert(config.getDataProviderMode() === 'local', 'missing runtime config should default provider to local');
assert(config.isSupabaseEnabled() === false, 'missing runtime config should disable supabase');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};

assert(config.getDataProviderMode() === 'local', 'default provider should be local');
assert(config.isSupabaseEnabled() === false, 'supabase should be disabled without URL and key');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'invalid',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-anon-key'
};

assert(config.getDataProviderMode() === 'local', 'invalid provider should fall back to local');
assert(config.isSupabaseEnabled() === false, 'invalid provider should not enable supabase');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: '',
  supabaseAnonKey: 'public-anon-key'
};

assert(config.getDataProviderMode() === 'supabase', 'supabase mode should be read even without URL');
assert(config.isSupabaseEnabled() === false, 'supabase should be disabled without URL');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: ''
};

assert(config.getDataProviderMode() === 'supabase', 'supabase mode should be read even without key');
assert(config.isSupabaseEnabled() === false, 'supabase should be disabled without key');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-anon-key'
};

assert(config.getDataProviderMode() === 'supabase', 'provider should read runtime config');
assert(config.isSupabaseEnabled() === true, 'supabase should be enabled with URL and key');

console.log('app config service ok');
