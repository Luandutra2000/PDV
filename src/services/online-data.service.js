import { STORAGE_KEYS } from '../database/schema.js?v=20260804-01';
import { isSupabaseEnabled } from './app-config.service.js?v=20260804-01';
import { hydrateDataProvider } from './data-provider.service.js?v=20260804-01';
import { flushDataProvider } from './data-provider.service.js?v=20260804-01';
import { syncCatalogNow } from './product.service.js?v=20260804-01';
import { flushFinancialQueue, hydrateFinancialData } from './financial-sync.service.js?v=20260804-01';
import { flushShowcaseQueue, getShowcaseSyncStatus, hydrateShowcaseData } from './showcase-sync.service.js?v=20260804-01';

const OPERATIONAL_KEYS = [
  STORAGE_KEYS.stockLaunches,
  STORAGE_KEYS.showcaseWriteOffs
];

export async function hydrateOnlineOperationalData({ catalog = false, financial = true, showcase = true } = {}) {
  if (!isSupabaseEnabled()) {
    return;
  }

  if (catalog) {
    await syncCatalogNow();
  }

  if (showcase) {
    await hydrateDataProvider(OPERATIONAL_KEYS);
    await flushShowcaseQueue();
    if (getShowcaseSyncStatus().pending === 0) {
      await hydrateShowcaseData();
    }
  }

  if (financial) {
    await hydrateFinancialData({ includePending: true });
    await flushFinancialQueue();
    await hydrateFinancialData({ includePending: true });
  }
}

export async function syncOnlineOperationalData(options = {}) {
  await flushDataProvider();
  await hydrateOnlineOperationalData(options);
}
