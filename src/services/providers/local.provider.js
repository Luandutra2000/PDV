const MEMORY_CACHE_GLOBAL = '__PDV_MEMORY_CACHE__';
const SERIALIZED_CACHE_GLOBAL = '__PDV_SERIALIZED_CACHE__';
let transaction = null;

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
      originals.set(key, localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(value));
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
      localStorage.removeItem(key);
    },
    clear() {
      getMemoryCache().clear();
      getSerializedCache().clear();
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
