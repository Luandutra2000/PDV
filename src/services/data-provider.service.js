import { getDataProviderMode, isSupabaseEnabled } from './app-config.service.js?v=20260804-04';
import { getSupabaseClient } from './supabase-client.service.js?v=20260804-04';
import { createLocalProvider } from './providers/local.provider.js?v=20260804-04';
import { createSupabaseProvider } from './providers/supabase.provider.js?v=20260804-04';

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

export async function flushDataProvider() {
  const provider = getDataProvider();

  if (typeof provider.flush === 'function') {
    await provider.flush();
  }
}

function getLocalProvider() {
  if (!localProvider) {
    localProvider = createLocalProvider();
  }

  return localProvider;
}
