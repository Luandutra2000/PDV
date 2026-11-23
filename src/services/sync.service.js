import { STORAGE_KEYS, SYNC_EVENTS } from '../database/schema.js';
import { on } from './event-bus.service.js';
import { getItem, setItem } from './storage.service.js';

// Local activity log only. Durable upload of sales and cash data goes through
// remote-outbox.service.js, so this log is capped to protect browser storage.
export const SYNC_QUEUE_LIMIT = 200;

const subscribedEvents = Object.values(SYNC_EVENTS);
let initialized = false;

export function initSyncService() {
  if (initialized) {
    return;
  }

  trimSyncQueue();

  subscribedEvents.forEach((eventName) => {
    on(eventName, (payload) => appendSyncEvent(eventName, payload));
  });

  initialized = true;
}

export function getSyncQueue() {
  const queue = getItem(STORAGE_KEYS.syncQueue, []);
  return Array.isArray(queue) ? queue : [];
}

function trimSyncQueue() {
  const queue = getSyncQueue();

  if (queue.length > SYNC_QUEUE_LIMIT) {
    setItem(STORAGE_KEYS.syncQueue, queue.slice(-SYNC_QUEUE_LIMIT));
  }
}

function compactPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const { comanda, items, ...rest } = payload;
  return rest;
}

function appendSyncEvent(type, payload) {
  const queue = getSyncQueue();
  const randomValue = globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
  const syncEvent = {
    id: `${type}-${Date.now()}-${randomValue}`,
    type,
    payload: compactPayload(payload),
    createdAt: new Date().toISOString(),
    status: 'pending'
  };

  queue.push(syncEvent);
  setItem(STORAGE_KEYS.syncQueue, queue.slice(-SYNC_QUEUE_LIMIT));
}
