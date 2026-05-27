import { STORAGE_KEYS, SYNC_EVENTS } from '../database/schema.js';
import { on } from './event-bus.service.js';
import { getItem, setItem } from './storage.service.js';
import { flushSyncQueue } from './online-sync.service.js';

const subscribedEvents = [
  SYNC_EVENTS.saleFinished,
  SYNC_EVENTS.cashMovementRegistered,
  SYNC_EVENTS.stockLaunchCreated,
  SYNC_EVENTS.stockLaunchUpdated,
  SYNC_EVENTS.stockLaunchCanceled,
  SYNC_EVENTS.showcaseProductCleared,
  SYNC_EVENTS.showcaseWriteOffCreated,
  SYNC_EVENTS.transactionHistoryCleared
];
let initialized = false;

export function initSyncService() {
  if (initialized) {
    return;
  }

  subscribedEvents.forEach((eventName) => {
    on(eventName, (payload) => appendSyncEvent(eventName, payload));
  });

  initialized = true;
}

export function getSyncQueue() {
  return getItem(STORAGE_KEYS.syncQueue, []);
}

function appendSyncEvent(type, payload) {
  const queue = getSyncQueue();
  const syncEvent = {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };

  queue.push(syncEvent);
  setItem(STORAGE_KEYS.syncQueue, queue);
  flushSyncQueue();
}
