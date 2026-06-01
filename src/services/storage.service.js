import { mockActiveComanda, mockCaixa, mockCategories, mockProducts } from '../database/mock-data.js';
import { STORAGE_KEYS } from '../database/schema.js';
import { getDataProvider } from './data-provider.service.js';

export function getItem(key, fallback = null) {
  return getDataProvider().read(key, fallback);
}

export function setItem(key, value) {
  return getDataProvider().write(key, value);
}

export function ensureSeedData() {
  const users = getItem(STORAGE_KEYS.users);
  if (!users) {
    setItem(STORAGE_KEYS.users, [createDefaultAdminUser()]);
  } else {
    const seededUsers = ensureUsableAdmin(users);
    if (seededUsers !== users) {
      setItem(STORAGE_KEYS.users, seededUsers);
    }
  }

  if (!getItem(STORAGE_KEYS.currentSession)) {
    setItem(STORAGE_KEYS.currentSession, null);
  }

  if (!getItem(STORAGE_KEYS.userPermissionOverrides)) {
    setItem(STORAGE_KEYS.userPermissionOverrides, {});
  }

  if (!getItem(STORAGE_KEYS.auditLogs)) {
    setItem(STORAGE_KEYS.auditLogs, []);
  }

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
  const provider = getDataProvider();
  provider.write(STORAGE_KEYS.users, [createDefaultAdminUser()]);
  provider.write(STORAGE_KEYS.currentSession, null);
  provider.write(STORAGE_KEYS.userPermissionOverrides, {});
  provider.write(STORAGE_KEYS.auditLogs, []);
  provider.write(STORAGE_KEYS.categories, mockCategories);
  provider.write(STORAGE_KEYS.products, mockProducts);
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
}

function createDefaultAdminUser() {
  const now = new Date().toISOString();
  return {
    id: 'user-admin',
    name: 'Administrador',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    active: true,
    createdAt: now,
    updatedAt: now
  };
}

function ensureUsableAdmin(users) {
  if (users.some((user) => user.role === 'admin' && user.active === true)) {
    return users;
  }

  const now = new Date().toISOString();
  const existingAdmin = users.find((user) => user.role === 'admin');
  if (existingAdmin) {
    return users.map((user) => (
      user.id === existingAdmin.id
        ? { ...user, active: true, updatedAt: now }
        : user
    ));
  }

  const adminUsernameUser = users.find((user) => user.username === 'admin');
  if (adminUsernameUser) {
    return users.map((user) => (
      user.id === adminUsernameUser.id
        ? { ...user, role: 'admin', active: true, updatedAt: now }
        : user
    ));
  }

  return [...users, createDefaultAdminUser()];
}
