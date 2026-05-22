import { DATA_PROVIDER_MODES } from '../database/schema.js';

const DEFAULT_CONFIG = {
  dataProvider: DATA_PROVIDER_MODES.local,
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
  return mode === DATA_PROVIDER_MODES.supabase
    ? DATA_PROVIDER_MODES.supabase
    : DATA_PROVIDER_MODES.local;
}

export function isSupabaseEnabled() {
  const config = getRuntimeConfig();
  return getDataProviderMode() === DATA_PROVIDER_MODES.supabase
    && Boolean(config.supabaseUrl)
    && Boolean(config.supabaseAnonKey);
}
