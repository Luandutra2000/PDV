const MEMORY_CACHE_GLOBAL = '__PDV_MEMORY_CACHE__';
const MAX_PERSISTED_VALUE_LENGTH = 2_000_000;
const LARGE_ARRAY_PERSIST_LIMIT = 1000;

function readJson(key, fallback = null) {
  const memoryCache = getMemoryCache();
  const rawValue = localStorage.getItem(key);

  if (rawValue === null) {
    memoryCache.delete(key);
    return fallback;
  }

  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  try {
    const value = JSON.parse(rawValue);
    memoryCache.set(key, value);
    return value;
  } catch (error) {
    console.warn(`Valor local invalido para ${key}. Usando fallback.`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  getMemoryCache().set(key, value);
  const serialized = serializeForLocalStorage(value);

  try {
    localStorage.setItem(key, serialized);
  } catch (error) {
    console.warn(`Limite de armazenamento local atingido para ${key}; mantendo dados completos em memoria.`, error);
  }
  return value;
}

export function createLocalProvider() {
  return {
    mode: 'local',
    read: readJson,
    write: writeJson,
    remove(key) {
      getMemoryCache().delete(key);
      localStorage.removeItem(key);
    },
    clear() {
      getMemoryCache().clear();
      localStorage.clear();
    }
  };
}

function serializeForLocalStorage(value) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= MAX_PERSISTED_VALUE_LENGTH || !Array.isArray(value)) {
    return serialized;
  }
  return JSON.stringify(value.slice(0, LARGE_ARRAY_PERSIST_LIMIT));
}

function getMemoryCache() {
  if (!(globalThis[MEMORY_CACHE_GLOBAL] instanceof Map)) {
    globalThis[MEMORY_CACHE_GLOBAL] = new Map();
  }
  return globalThis[MEMORY_CACHE_GLOBAL];
}
