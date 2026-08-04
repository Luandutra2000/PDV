import { STORAGE_KEYS, SYNC_EVENTS, UI_EVENTS } from '../database/schema.js?v=20260804-05';
import { isSupabaseEnabled } from './app-config.service.js?v=20260804-05';
import { emit, on } from './event-bus.service.js?v=20260804-05';
import { startShowcaseRealtime } from './showcase-sync.service.js?v=20260804-05';

let initialized = false;
const CASH_STORAGE_KEYS = new Set([
  STORAGE_KEYS.transactions,
  STORAGE_KEYS.closedComandas,
  STORAGE_KEYS.financialTransactions,
  STORAGE_KEYS.cashClosings
]);
const SHOWCASE_STORAGE_KEYS = new Set([
  STORAGE_KEYS.productStock,
  STORAGE_KEYS.showcaseMovements,
  STORAGE_KEYS.outOfStockSales,
  STORAGE_KEYS.stockLaunches,
  STORAGE_KEYS.showcaseWriteOffs
]);

export function initRealtimeService() {
  if (initialized) {
    return;
  }

  on(SYNC_EVENTS.saleFinished, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.cashMovementRegistered, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));

  globalThis.addEventListener?.('storage', handleExternalStorageChange);

  if (isSupabaseEnabled()) {
    startShowcaseRealtime();
  }

  initialized = true;
}

export function handleExternalStorageChange(event = {}) {
  const key = event.key || '';

  if (CASH_STORAGE_KEYS.has(key)) {
    emit(UI_EVENTS.cashSummaryChanged, { type: 'external-tab-update', key });
    emit(UI_EVENTS.financialDataChanged, { type: 'external-tab-update', key });
  }

  if (SHOWCASE_STORAGE_KEYS.has(key)) {
    emit(UI_EVENTS.showcaseStockChanged, { type: 'external-tab-update', key });
    emit(UI_EVENTS.showcaseDataChanged, { type: 'external-tab-update', key });
  }
}
