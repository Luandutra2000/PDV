import { DATA_PROVIDER_MODES } from '../database/schema.js';
import { getDataProviderMode } from './app-config.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { createLocalProvider } from './providers/local.provider.js';
import { createSupabaseProvider } from './providers/supabase.provider.js';

let activeProvider = null;

const PROVIDER_FACTORIES = {
  [DATA_PROVIDER_MODES.local]: createLocalProvider,
  [DATA_PROVIDER_MODES.supabase]: createLocalProvider
};

export async function getAsyncDataProvider() {
  if (activeProvider) {
    return activeProvider;
  }

  const mode = getDataProviderMode();

  if (mode === DATA_PROVIDER_MODES.supabase) {
    activeProvider = createSupabaseProvider(await getSupabaseClient());
    return activeProvider;
  }

  activeProvider = createLocalProvider();
  return activeProvider;
}

export function getDataProvider() {
  if (activeProvider) {
    return activeProvider;
  }

  activeProvider = PROVIDER_FACTORIES[getDataProviderMode()]();
  return activeProvider;
}

export function setDataProviderForTests(provider) {
  activeProvider = provider;
}

export function resetDataProviderForTests() {
  activeProvider = null;
}
