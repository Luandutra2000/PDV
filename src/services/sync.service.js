import { STORAGE_KEYS, SYNC_EVENTS } from '../database/schema.js?v=20260804-01';
import { on } from './event-bus.service.js?v=20260804-01';
import { getItem, setItem } from './storage.service.js?v=20260804-01';

const subscribedEvents = Object.values(SYNC_EVENTS);
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
}
