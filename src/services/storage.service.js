import { mockActiveComanda, mockCaixa, mockCategories, mockProducts } from '../database/mock-data.js?v=20260804-06';
import { STORAGE_KEYS } from '../database/schema.js?v=20260804-06';
import { setLocalCache } from './providers/local.provider.js?v=20260804-06';
import { getDataProvider } from './data-provider.service.js?v=20260804-06';

export function getItem(key, fallback = null) {
  return getDataProvider().read(key, fallback);
}

export function setItem(key, value) {
  return getDataProvider().write(key, value);
}

export function ensureSeedData() {
  const users = getItem(STORAGE_KEYS.users);
  if (!Array.isArray(users)) {
    setLocalCache(STORAGE_KEYS.users, []);
  } else {
    const safeUsers = users.map(removeStoredPassword);
    if (safeUsers.some((user, index) => user !== users[index])) {
      setLocalCache(STORAGE_KEYS.users, safeUsers);
    }
  }

  if (!getItem(STORAGE_KEYS.currentSession)) {
    setLocalCache(STORAGE_KEYS.currentSession, null);
  }

  if (!getItem(STORAGE_KEYS.userPermissionOverrides)) {
    setLocalCache(STORAGE_KEYS.userPermissionOverrides, {});
  }

  if (!getItem(STORAGE_KEYS.auditLogs)) {
    setLocalCache(STORAGE_KEYS.auditLogs, []);
  }

  if (!getItem(STORAGE_KEYS.categories)) {
    setLocalCache(STORAGE_KEYS.categories, mockCategories);
  }

  if (!getItem(STORAGE_KEYS.products)) {
    setLocalCache(STORAGE_KEYS.products, getInitialProducts());
  }

  if (!getItem(STORAGE_KEYS.activeComanda)) {
    setLocalCache(STORAGE_KEYS.activeComanda, mockActiveComanda);
  }

  if (!getItem(STORAGE_KEYS.caixa)) {
    setLocalCache(STORAGE_KEYS.caixa, mockCaixa);
  }

  if (!getItem(STORAGE_KEYS.syncQueue)) {
    setLocalCache(STORAGE_KEYS.syncQueue, []);
  }

  if (!getItem(STORAGE_KEYS.transactions)) {
    setLocalCache(STORAGE_KEYS.transactions, []);
  }

  if (!getItem(STORAGE_KEYS.closedComandas)) {
    setLocalCache(STORAGE_KEYS.closedComandas, []);
  }

  if (!getItem(STORAGE_KEYS.stockLaunches)) {
    setLocalCache(STORAGE_KEYS.stockLaunches, []);
  }

  if (!getItem(STORAGE_KEYS.hiddenStockComparisons)) {
    setLocalCache(STORAGE_KEYS.hiddenStockComparisons, []);
  }

  if (!getItem(STORAGE_KEYS.cashClosings)) {
    setLocalCache(STORAGE_KEYS.cashClosings, []);
  }

  if (!getItem(STORAGE_KEYS.cashClosingDraft)) {
    setLocalCache(STORAGE_KEYS.cashClosingDraft, null);
  }

  if (!getItem(STORAGE_KEYS.showcaseWriteOffs)) {
    setLocalCache(STORAGE_KEYS.showcaseWriteOffs, []);
  }

  if (!getItem(STORAGE_KEYS.paymentAttempts)) {
    setLocalCache(STORAGE_KEYS.paymentAttempts, []);
  }

  if (!getItem(STORAGE_KEYS.kitchenOrders)) {
    setLocalCache(STORAGE_KEYS.kitchenOrders, []);
  }

  if (!getItem(STORAGE_KEYS.printJobs)) {
    setLocalCache(STORAGE_KEYS.printJobs, []);
  }
}

export function resetAppData() {
  const provider = getDataProvider();
  provider.write(STORAGE_KEYS.users, []);
  provider.write(STORAGE_KEYS.currentSession, null);
  provider.write(STORAGE_KEYS.userPermissionOverrides, {});
  provider.write(STORAGE_KEYS.auditLogs, []);
  provider.write(STORAGE_KEYS.categories, mockCategories);
  provider.write(STORAGE_KEYS.products, getInitialProducts());
  provider.write(STORAGE_KEYS.activeComanda, mockActiveComanda);
  provider.write(STORAGE_KEYS.caixa, mockCaixa);
  provider.write(STORAGE_KEYS.syncQueue, []);
  provider.write(STORAGE_KEYS.transactions, []);
  provider.write(STORAGE_KEYS.closedComandas, []);
  provider.write(STORAGE_KEYS.stockLaunches, []);
  provider.write(STORAGE_KEYS.hiddenStockComparisons, []);
  provider.write(STORAGE_KEYS.cashClosings, []);
  provider.write(STORAGE_KEYS.cashClosingDraft, null);
  provider.write(STORAGE_KEYS.showcaseWriteOffs, []);
  provider.write(STORAGE_KEYS.paymentAttempts, []);
  provider.write(STORAGE_KEYS.kitchenOrders, []);
  provider.write(STORAGE_KEYS.printJobs, []);
}

function getInitialProducts() {
  return globalThis.process?.env?.NODE_ENV === 'test' ? mockProducts : [];
}

function removeStoredPassword(user) {
  if (!user || !Object.hasOwn(user, 'password')) {
    return user;
  }
  const { password, ...safeUser } = user;
  return safeUser;
}
