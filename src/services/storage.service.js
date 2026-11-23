import { mockActiveComanda, mockCaixa, mockCategories, mockProducts } from '../database/mock-data.js';
import { STORAGE_KEYS } from '../database/schema.js';
import { isHistoryKey, isHistoryStoreActive, readHistoryValue, writeHistoryValue } from './history-store.service.js';

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizeForStorage(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[<>]/g, '')
      .replace(/javascript\s*:/gi, '');
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForStorage(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !UNSAFE_OBJECT_KEYS.has(key))
        .map(([key, item]) => [key, sanitizeForStorage(item)])
    );
  }

  return value;
}

export function getItem(key, fallback = null) {
  if (isHistoryStoreActive() && isHistoryKey(key)) {
    const value = readHistoryValue(key);
    return value === undefined ? fallback : value;
  }

  const rawValue = localStorage.getItem(key);

  if (rawValue === null) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn(`Valor local invalido para ${key}. Usando fallback.`, error);
    return fallback;
  }
}

export function setItem(key, value) {
  const sanitizedValue = sanitizeForStorage(value);

  if (isHistoryStoreActive() && isHistoryKey(key)) {
    writeHistoryValue(key, sanitizedValue);
    return sanitizedValue;
  }

  const serializedValue = JSON.stringify(sanitizedValue);

  try {
    // sanitizeForStorage removes executable markup and unsafe object keys before persistence.
    localStorage.setItem(key, serializedValue); // NOSONAR
  } catch (error) {
    if (!isQuotaError(error)) {
      throw error;
    }

    freeDisposableStorage(key);

    try {
      localStorage.setItem(key, serializedValue); // NOSONAR
    } catch (retryError) {
      if (isQuotaError(retryError)) {
        throw new Error('Armazenamento do navegador cheio. Exporte os dados e limpe o historico antigo.');
      }

      throw retryError;
    }
  }

  return sanitizedValue;
}

function isQuotaError(error) {
  return error?.name === 'QuotaExceededError'
    || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error?.code === 22
    || error?.code === 1014;
}

function freeDisposableStorage(keyBeingWritten) {
  if (keyBeingWritten === STORAGE_KEYS.syncQueue) {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.syncQueue);
    localStorage.setItem(STORAGE_KEYS.syncQueue, '[]'); // NOSONAR
  } catch {
    // Best effort: the caller retries the original write and reports a clear error.
  }
}

export function ensureSeedData() {
  if (!getItem(STORAGE_KEYS.categories)) {
    setItem(STORAGE_KEYS.categories, mockCategories);
  }

  if (!getItem(STORAGE_KEYS.products)) {
    setItem(STORAGE_KEYS.products, mockProducts);
  }

  if (!getItem(STORAGE_KEYS.activeComanda)) {
    setItem(STORAGE_KEYS.activeComanda, mockActiveComanda);
  }

  if (!getItem(STORAGE_KEYS.caixa)) {
    setItem(STORAGE_KEYS.caixa, mockCaixa);
  }

  if (!getItem(STORAGE_KEYS.syncQueue)) {
    setItem(STORAGE_KEYS.syncQueue, []);
  }

  if (!getItem(STORAGE_KEYS.transactions)) {
    setItem(STORAGE_KEYS.transactions, []);
  }

  if (!getItem(STORAGE_KEYS.closedComandas)) {
    setItem(STORAGE_KEYS.closedComandas, []);
  }

  if (!getItem(STORAGE_KEYS.stockLaunches)) {
    setItem(STORAGE_KEYS.stockLaunches, []);
  }

  if (!getItem(STORAGE_KEYS.hiddenStockComparisons)) {
    setItem(STORAGE_KEYS.hiddenStockComparisons, []);
  }

  if (!getItem(STORAGE_KEYS.cashClosings)) {
    setItem(STORAGE_KEYS.cashClosings, []);
  }

  if (!getItem(STORAGE_KEYS.cashClosingDraft)) {
    setItem(STORAGE_KEYS.cashClosingDraft, null);
  }

  if (!getItem(STORAGE_KEYS.showcaseWriteOffs)) {
    setItem(STORAGE_KEYS.showcaseWriteOffs, []);
  }
}

export function resetAppData() {
  setItem(STORAGE_KEYS.categories, mockCategories);
  setItem(STORAGE_KEYS.products, mockProducts);
  setItem(STORAGE_KEYS.activeComanda, mockActiveComanda);
  setItem(STORAGE_KEYS.caixa, mockCaixa);
  setItem(STORAGE_KEYS.syncQueue, []);
  setItem(STORAGE_KEYS.transactions, []);
  setItem(STORAGE_KEYS.closedComandas, []);
  setItem(STORAGE_KEYS.stockLaunches, []);
  setItem(STORAGE_KEYS.hiddenStockComparisons, []);
  setItem(STORAGE_KEYS.cashClosings, []);
  setItem(STORAGE_KEYS.cashClosingDraft, null);
  setItem(STORAGE_KEYS.showcaseWriteOffs, []);
}
