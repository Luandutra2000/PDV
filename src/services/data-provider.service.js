import { DATA_PROVIDER_MODES } from '../database/schema.js';
import { getDataProviderMode } from './app-config.service.js';
import { createLocalProvider } from './providers/local.provider.js';

let activeProvider = null;

export function getDataProvider() {
  if (activeProvider) {
    return activeProvider;
  }

  const mode = getDataProviderMode();
  activeProvider = createLocalProvider();

  if (mode === DATA_PROVIDER_MODES.supabase) {
    activeProvider = createLocalProvider();
  }

  return activeProvider;
}

export function setDataProviderForTests(provider) {
  activeProvider = provider;
}

export function resetDataProviderForTests() {
  activeProvider = null;
}
