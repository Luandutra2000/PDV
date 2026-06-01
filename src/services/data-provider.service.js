import { getDataProviderMode, isSupabaseEnabled } from './app-config.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { createLocalProvider } from './providers/local.provider.js';
import { createSupabaseProvider } from './providers/supabase.provider.js';

let localProvider;
let supabaseProvider;

export function getDataProvider() {
  const mode = getDataProviderMode();

  if (mode === 'supabase' && isSupabaseEnabled()) {
    if (!supabaseProvider) {
      supabaseProvider = createSupabaseProvider({
        getClient: getSupabaseClient,
        localProvider: getLocalProvider()
      });
    }

    return supabaseProvider;
  }

  return getLocalProvider();
}

export async function hydrateDataProvider(keys) {
  const provider = getDataProvider();

  if (typeof provider.hydrate === 'function') {
    await provider.hydrate(keys);
  }
}

function getLocalProvider() {
  if (!localProvider) {
    localProvider = createLocalProvider();
  }

  return localProvider;
}
