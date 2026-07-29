import { mockActiveComanda, mockCaixa, mockCategories, mockProducts } from '../database/mock-data.js';
import { STORAGE_KEYS } from '../database/schema.js';

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
  localStorage.setItem(key, JSON.stringify(sanitizedValue));
  return sanitizedValue;
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
