import { STORAGE_KEYS } from '../../database/schema.js';
import { getItem, setItem } from '../storage.service.js';

const COLLECTION_KEYS = {
  products: STORAGE_KEYS.products,
  categories: STORAGE_KEYS.categories,
  activeComanda: STORAGE_KEYS.activeComanda,
  caixa: STORAGE_KEYS.caixa,
  transactions: STORAGE_KEYS.transactions,
  closedComandas: STORAGE_KEYS.closedComandas,
  stockLaunches: STORAGE_KEYS.stockLaunches,
  hiddenStockComparisons: STORAGE_KEYS.hiddenStockComparisons,
  showcaseWriteOffs: STORAGE_KEYS.showcaseWriteOffs,
  cashClosings: STORAGE_KEYS.cashClosings,
  cashClosingDraft: STORAGE_KEYS.cashClosingDraft,
  syncQueue: STORAGE_KEYS.syncQueue
};

function getStorageKey(name) {
  const storageKey = COLLECTION_KEYS[name];

  if (!storageKey) {
    throw new Error(`Collection desconhecida: ${name}`);
  }

  return storageKey;
}

export function createLocalProvider() {
  return {
    mode: 'local',
    getCollection(name, fallback = []) {
      return getItem(getStorageKey(name), fallback);
    },
    setCollection(name, value) {
      setItem(getStorageKey(name), value);
      return value;
    },
    getItem(name, fallback = null) {
      return getItem(getStorageKey(name), fallback);
    },
    setItem(name, value) {
      setItem(getStorageKey(name), value);
      return value;
    }
  };
}
