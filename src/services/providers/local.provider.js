const MEMORY_CACHE_GLOBAL = '__PDV_MEMORY_CACHE__';
const SERIALIZED_CACHE_GLOBAL = '__PDV_SERIALIZED_CACHE__';
const HEAVY_STORE_GLOBAL = '__PDV_HEAVY_STORE__';
let transaction = null;

// Collections that grow with every sale live in IndexedDB (hundreds of MB)
// instead of localStorage (about 5 million characters): 60 days of a busy
// snack bar do not fit in localStorage. Reads stay synchronous through an
// in-memory copy loaded once at startup; writes are saved in the background.
export const HEAVY_STORAGE_KEYS = Object.freeze([
  'pdv.transactions',
  'pdv.closedComandas',
  'pdv.cashClosings',
  'pdv.showcaseMovements',
  'pdv.outOfStockSales',
  'pdv.auditLogs'
]);
const HEAVY_DB_NAME = 'pdv-local-history';
const HEAVY_DB_STORE = 'collections';
const HEAVY_CHANNEL_NAME = 'pdv-local-history';

// Synchronous operations commit together; a quota failure restores earlier keys.
// Network work must be deferred until the complete local write has succeeded.
export function runLocalTransaction(callback) {
  if (transaction) return callback();
  const pending = { values: new Map(), effects: [] };
  transaction = pending;
  let result;
  let committing = false;
  const originals = new Map();
  try {
    result = callback();
    if (result?.then) throw new Error('A gravacao local deve ser sincrona.');
    committing = true;
    for (const [key, value] of pending.values) {
      if (isHeavyKeyActive(key)) continue;
      originals.set(key, localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(value));
    }
    // In-memory writes cannot fail, so they only happen once every
    // localStorage write above succeeded: the transaction stays atomic.
    for (const [key, value] of pending.values) {
      if (isHeavyKeyActive(key)) writeHeavyValue(key, value);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const [key, raw] of [...originals].reverse()) {
      try {
        if (localStorage.getItem(key) === raw) continue;
        if (raw === null) localStorage.removeItem(key);
        else localStorage.setItem(key, raw);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      throw new Error('Falha de armazenamento com reversao incompleta. Nao repita a operacao: preserve os dados deste aparelho e solicite suporte para conferir o historico.', {
        cause: new AggregateError([error, ...rollbackErrors], 'Falhas ao gravar e reverter dados locais.')
      });
    }
    if (committing) throw new Error('Nao foi possivel salvar no armazenamento deste aparelho. Exporte um backup e libere espaco antes de continuar.', { cause: error });
    throw error;
  } finally {
    transaction = null;
    getMemoryCache().clear();
    getSerializedCache().clear();
  }
  for (const effect of pending.effects) runCommittedEffect(effect);
  return result;
}

export function deferLocalEffect(callback) {
  if (transaction) transaction.effects.push(callback);
  else runCommittedEffect(callback);
}

function runCommittedEffect(callback) {
  try {
    const result = callback();
    if (result?.then) Promise.resolve(result).catch((error) => console.warn('Dados salvos; falha em uma atualizacao secundaria.', error));
  } catch (error) {
    console.warn('Dados salvos; falha em uma atualizacao secundaria.', error);
  }
}

export function readLocalCache(key, fallback = null) {
  if (transaction?.values.has(key)) return transaction.values.get(key);
  if (isHeavyKeyActive(key)) {
    const values = getHeavyStore().values;
    return values.has(key) ? values.get(key) : fallback;
  }
  const memoryCache = getMemoryCache();
  if (!globalThis.localStorage) {
    return memoryCache.has(key) ? memoryCache.get(key) : fallback;
  }
  const rawValue = localStorage.getItem(key);

  if (rawValue === null) {
    memoryCache.delete(key);
    getSerializedCache().delete(key);
    return fallback;
  }

  if (memoryCache.has(key) && getSerializedCache().get(key) === rawValue) {
    return memoryCache.get(key);
  }

  try {
    const value = JSON.parse(rawValue);
    memoryCache.set(key, value);
    getSerializedCache().set(key, rawValue);
    return value;
  } catch (error) {
    console.warn(`Valor local invalido para ${key}. Usando fallback.`, error);
    return fallback;
  }
}

export function setLocalCache(key, value) {
  const serialized = JSON.stringify(value);
  if (transaction) {
    transaction.values.set(key, JSON.parse(serialized));
    return value;
  }
  if (isHeavyKeyActive(key)) {
    writeHeavyValue(key, JSON.parse(serialized));
    return value;
  }
  try {
    localStorage.setItem(key, serialized);
  } catch (error) {
    // Callers may mutate objects returned by read before writing. Discard that
    // reference on failure so subsequent reads return the persisted version.
    getMemoryCache().delete(key);
    getSerializedCache().delete(key);
    throw new Error('Nao foi possivel salvar no armazenamento deste aparelho. Exporte um backup e libere espaco antes de continuar.', { cause: error });
  }
  getMemoryCache().set(key, value);
  getSerializedCache().set(key, serialized);
  return value;
}

export function createLocalProvider() {
  return {
    mode: 'local',
    read: readLocalCache,
    write: setLocalCache,
    remove(key) {
      getMemoryCache().delete(key);
      getSerializedCache().delete(key);
      if (isHeavyKeyActive(key)) {
        removeHeavyValue(key);
        return;
      }
      localStorage.removeItem(key);
    },
    clear() {
      getMemoryCache().clear();
      getSerializedCache().clear();
      HEAVY_STORAGE_KEYS.forEach((key) => {
        if (isHeavyKeyActive(key)) removeHeavyValue(key);
      });
      localStorage.clear();
    }
  };
}

function getSerializedCache() {
  if (!(globalThis[SERIALIZED_CACHE_GLOBAL] instanceof Map)) {
    globalThis[SERIALIZED_CACHE_GLOBAL] = new Map();
  }
  return globalThis[SERIALIZED_CACHE_GLOBAL];
}

function getMemoryCache() {
  if (!(globalThis[MEMORY_CACHE_GLOBAL] instanceof Map)) {
    globalThis[MEMORY_CACHE_GLOBAL] = new Map();
  }
  return globalThis[MEMORY_CACHE_GLOBAL];
}

// Opens IndexedDB, moves the heavy collections out of localStorage (once) and
// loads them in memory. Must run before the app reads any data. Without
// IndexedDB (tests in Node, very old browsers) localStorage keeps being used.
export async function initLocalHeavyStorage({ backend: customBackend } = {}) {
  const store = getHeavyStore();

  if (store.active) {
    return true;
  }

  const backend = customBackend || await openHeavyDatabase();

  if (!backend) {
    return false;
  }

  for (const key of HEAVY_STORAGE_KEYS) {
    let value = await backend.get(key);

    if (value === undefined) {
      value = readLegacyLocalValue(key);

      if (value !== undefined) {
        await backend.put(key, value);
      }
    }

    if (value !== undefined) {
      store.values.set(key, value);
    }

    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // The copy in IndexedDB is the source of truth from now on.
    }
  }

  store.backend = backend;
  store.active = true;
  listenToOtherTabs(store);
  guardPendingWritesOnUnload(store);
  return true;
}

export function isLocalHeavyStorageActive() {
  return getHeavyStore().active;
}

export function whenLocalHeavyWritesSettled() {
  return getHeavyStore().chain;
}

export function resetLocalHeavyStorageForTests() {
  getHeavyStore().channel?.close?.();
  globalThis[HEAVY_STORE_GLOBAL] = undefined;
}

function isHeavyKeyActive(key) {
  return getHeavyStore().active && HEAVY_STORAGE_KEYS.includes(key);
}

function writeHeavyValue(key, value) {
  const store = getHeavyStore();
  store.values.set(key, value);
  getMemoryCache().delete(key);
  getSerializedCache().delete(key);
  store.channel?.postMessage({ type: 'set', key, value });
  persistHeavy(store, (backend) => backend.put(key, value), key);
}

function removeHeavyValue(key) {
  const store = getHeavyStore();
  store.values.delete(key);
  store.channel?.postMessage({ type: 'delete', key });
  persistHeavy(store, (backend) => backend.delete(key), key);
}

function persistHeavy(store, operation, key) {
  const backend = store.backend;
  store.pendingWrites += 1;
  store.chain = store.chain
    .then(() => operation(backend))
    .catch((error) => {
      store.lastError = error;
      console.error(`Nao foi possivel salvar ${key} no banco local do navegador.`, error);
    })
    .finally(() => {
      store.pendingWrites -= 1;
    });
}

function readLegacyLocalValue(key) {
  const rawValue = globalThis.localStorage?.getItem(key);

  if (rawValue === null || rawValue === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return undefined;
  }
}

// Another tab of the same device saved a heavy collection: use its value, so
// this tab does not write an older copy over it.
function listenToOtherTabs(store) {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  store.channel = new BroadcastChannel(HEAVY_CHANNEL_NAME);
  store.channel.unref?.();
  store.channel.addEventListener('message', (event) => {
    const { type, key, value } = event.data || {};

    if (!HEAVY_STORAGE_KEYS.includes(key)) {
      return;
    }

    if (type === 'delete') {
      store.values.delete(key);
    } else {
      store.values.set(key, value);
    }
  });
}

// A write takes about a millisecond; closing the page inside that window asks
// for confirmation instead of silently losing it.
function guardPendingWritesOnUnload(store) {
  globalThis.addEventListener?.('beforeunload', (event) => {
    if (store.pendingWrites > 0) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

async function openHeavyDatabase() {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(HEAVY_DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(HEAVY_DB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const run = (mode, action) => new Promise((resolve, reject) => {
      const tx = db.transaction(HEAVY_DB_STORE, mode);
      const request = action(tx.objectStore(HEAVY_DB_STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    return {
      get: (key) => run('readonly', (objectStore) => objectStore.get(key)),
      put: (key, value) => run('readwrite', (objectStore) => objectStore.put(value, key)),
      delete: (key) => run('readwrite', (objectStore) => objectStore.delete(key))
    };
  } catch (error) {
    console.error('IndexedDB indisponivel neste navegador; o historico continua no armazenamento simples.', error);
    return null;
  }
}

function getHeavyStore() {
  if (!globalThis[HEAVY_STORE_GLOBAL]) {
    globalThis[HEAVY_STORE_GLOBAL] = {
      active: false,
      backend: null,
      channel: null,
      values: new Map(),
      chain: Promise.resolve(),
      pendingWrites: 0,
      lastError: null
    };
  }

  return globalThis[HEAVY_STORE_GLOBAL];
}
