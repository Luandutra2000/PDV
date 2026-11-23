import { STORAGE_KEYS } from '../database/schema.js';

// Large, ever-growing collections live in IndexedDB (hundreds of MB available)
// instead of localStorage (about 5 MB). Reads stay synchronous through an
// in-memory cache loaded once at startup; writes update the cache immediately
// and are persisted in the background.
export const HISTORY_KEYS = new Set([
  STORAGE_KEYS.transactions,
  STORAGE_KEYS.closedComandas,
  STORAGE_KEYS.cashClosings,
  STORAGE_KEYS.stockLaunches,
  STORAGE_KEYS.showcaseWriteOffs
]);

const DB_NAME = 'pdv-history';
const STORE_NAME = 'collections';
const CHANNEL_NAME = 'pdv-history';

const cache = new Map();
let backend = null;
let channel = null;
let pendingWrites = Promise.resolve();

export function isHistoryStoreActive() {
  return backend !== null;
}

export function isHistoryKey(key) {
  return HISTORY_KEYS.has(key);
}

export async function initHistoryStore({ backend: customBackend, storage = globalThis.localStorage } = {}) {
  if (backend) {
    return true;
  }

  const selectedBackend = customBackend || await openIndexedDbBackend();

  if (!selectedBackend) {
    return false;
  }

  for (const key of HISTORY_KEYS) {
    let value = await selectedBackend.get(key);

    if (value === undefined) {
      value = readLegacyValue(storage, key);

      if (value !== undefined) {
        await selectedBackend.put(key, value);
      }
    }

    if (value !== undefined) {
      cache.set(key, value);
    }

    storage?.removeItem?.(key);
  }

  backend = selectedBackend;
  listenToOtherTabs();
  return true;
}

export function readHistoryValue(key) {
  if (!cache.has(key)) {
    return undefined;
  }

  return structuredClone(cache.get(key));
}

export function writeHistoryValue(key, value) {
  cache.set(key, structuredClone(value));
  channel?.postMessage({ key, value });
  persist(key, value);
}

export function whenHistoryWritesSettled() {
  return pendingWrites;
}

export function resetHistoryStoreForTests() {
  cache.clear();
  backend = null;
  channel?.close?.();
  channel = null;
  pendingWrites = Promise.resolve();
}

let pendingWriteCount = 0;

function persist(key, value) {
  const currentBackend = backend;
  pendingWriteCount += 1;
  pendingWrites = pendingWrites
    .then(() => currentBackend.put(key, value))
    .catch((error) => {
      console.error(`Nao foi possivel salvar ${key} no banco local do navegador.`, error);
    })
    .finally(() => {
      pendingWriteCount -= 1;
    });
}

// A write usually commits in about a millisecond; if the page is closed in that
// window the browser asks for confirmation instead of silently dropping it.
globalThis.addEventListener?.('beforeunload', (event) => {
  if (pendingWriteCount > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
});

function readLegacyValue(storage, key) {
  const rawValue = storage?.getItem?.(key);

  if (rawValue === null || rawValue === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return undefined;
  }
}

function listenToOtherTabs() {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.unref?.();
  channel.addEventListener('message', (event) => {
    const { key, value } = event.data || {};

    if (isHistoryKey(key)) {
      cache.set(key, value);
    }
  });
}

async function openIndexedDbBackend() {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const run = (mode, action) => new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    return {
      get: (key) => run('readonly', (store) => store.get(key)),
      put: (key, value) => run('readwrite', (store) => store.put(value, key))
    };
  } catch (error) {
    console.error('IndexedDB indisponivel. Usando armazenamento local simples.', error);
    return null;
  }
}
