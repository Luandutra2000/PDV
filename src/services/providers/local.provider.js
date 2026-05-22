import { STORAGE_KEYS } from '../../database/schema.js';
import { getItem, setItem } from '../storage.service.js';

const COLLECTION_KEYS = {
  products: STORAGE_KEYS.products,
  categories: STORAGE_KEYS.categories,
  transactions: STORAGE_KEYS.transactions,
  closedComandas: STORAGE_KEYS.closedComandas,
  stockLaunches: STORAGE_KEYS.stockLaunches,
  showcaseWriteOffs: STORAGE_KEYS.showcaseWriteOffs,
  cashClosings: STORAGE_KEYS.cashClosings,
  cashClosingDraft: STORAGE_KEYS.cashClosingDraft
};

export function createLocalProvider() {
  return {
    mode: 'local',
    getCollection(name, fallback = []) {
      return getItem(COLLECTION_KEYS[name], fallback);
    },
    setCollection(name, value) {
      setItem(COLLECTION_KEYS[name], value);
      return value;
    },
    getItem(name, fallback = null) {
      return getItem(COLLECTION_KEYS[name], fallback);
    },
    setItem(name, value) {
      setItem(COLLECTION_KEYS[name], value);
      return value;
    }
  };
}
