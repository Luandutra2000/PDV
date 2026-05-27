const DEFAULT_CONFIG = {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};

export function getRuntimeConfig() {
  return {
    ...DEFAULT_CONFIG,
    ...(globalThis.__PDV_RUNTIME_CONFIG__ || {})
  };
}

export function getDataProviderMode() {
  const mode = getRuntimeConfig().dataProvider;
  return mode === 'supabase' ? 'supabase' : 'local';
}

export function isSupabaseEnabled() {
  const config = getRuntimeConfig();
  return getDataProviderMode() === 'supabase'
    && Boolean(config.supabaseUrl)
    && Boolean(config.supabaseAnonKey);
}
