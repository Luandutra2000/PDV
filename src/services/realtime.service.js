import { SYNC_EVENTS, UI_EVENTS } from '../database/schema.js';
import { emit, on } from './event-bus.service.js';
import { isSupabaseEnabled } from './app-config.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { flushSyncQueue, loadOnlineSnapshot } from './online-sync.service.js';

let initialized = false;
let onlineInitialized = false;

export function initRealtimeService() {
  if (initialized) {
    return;
  }

  on(SYNC_EVENTS.saleFinished, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.cashMovementRegistered, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.stockLaunchCreated, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.stockLaunchUpdated, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.stockLaunchCanceled, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.showcaseProductCleared, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.showcaseWriteOffCreated, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));

  initialized = true;
}

export async function initOnlineRealtimeService() {
  if (onlineInitialized || !isSupabaseEnabled()) {
    return null;
  }

  onlineInitialized = true;
  const client = await getSupabaseClient();
  await flushSyncQueue();
  await loadOnlineSnapshot();

  return client
    .channel('pdv-owner-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, handleOnlineChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_movements' }, handleOnlineChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_production' }, handleOnlineChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'showcase_write_offs' }, handleOnlineChange)
    .subscribe();
}

function handleOnlineChange() {
  loadOnlineSnapshot().catch((error) => {
    console.warn('Nao foi possivel atualizar o snapshot online em tempo real.', error);
  });
}
