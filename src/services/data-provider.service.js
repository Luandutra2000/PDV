import { DATA_PROVIDER_MODES } from '../database/schema.js';
import { getDataProviderMode } from './app-config.service.js';
import { createLocalProvider } from './providers/local.provider.js';

let activeProvider = null;

const PROVIDER_FACTORIES = {
  [DATA_PROVIDER_MODES.local]: createLocalProvider,
  [DATA_PROVIDER_MODES.supabase]: createLocalProvider
};

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
