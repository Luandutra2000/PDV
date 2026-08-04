const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const storage = await import('../src/services/storage.service.js?v=20260804-01');
const auth = await import('../src/services/auth.service.js?v=20260804-01');
const audit = await import('../src/services/audit.service.js?v=20260804-01');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-01');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-01');

seedTestAdmin(storage, STORAGE_KEYS);
storage.ensureSeedData();

const entry = audit.recordAudit({
  action: 'sale.cancel',
  entityType: 'sale',
  entityId: 'sale-1',
  user: { id: 'operator-1', name: 'Caixa 1' },
  reason: 'Cliente desistiu',
  metadata: { total: 32 }
});

assert(entry.id, 'audit entry should have id');
assert(entry.userName === 'Caixa 1', 'audit should store user name');
assert(entry.reason === 'Cliente desistiu', 'audit should store reason');
assert(entry.metadata.total === 32, 'audit should store metadata');
assert(audit.getAuditLogs()[0].action === 'sale.cancel', 'new audit should be first');

const currentUserEntry = audit.recordAudit({
  action: 'cash.open',
  entityType: 'cash-register'
});

assert(currentUserEntry.userId === 'user-admin', 'audit should default to current user id');
assert(currentUserEntry.userName === 'Administrador', 'audit should default to current user name');
assert(!Object.hasOwn(currentUserEntry, 'password'), 'audit entry should not expose user password');
assert(!Object.hasOwn(currentUserEntry, 'user'), 'audit entry should not expose raw user');
assert(!Object.hasOwn(currentUserEntry.metadata, 'password'), 'audit metadata should not expose user password');

auth.logout();

const systemEntry = audit.recordAudit({
  action: 'system.sync',
  entityType: 'sync'
});

assert(systemEntry.userId === '', 'audit should store empty user id without current user');
assert(systemEntry.userName === 'Sistema', 'audit should fall back to Sistema without current user');

const firstMultiWriteEntry = audit.recordAudit({
  action: 'sale.update',
  entityType: 'sale',
  entityId: 'sale-2'
});

const secondMultiWriteEntry = audit.recordAudit({
  action: 'sale.refund',
  entityType: 'sale',
  entityId: 'sale-2'
});

const logsAfterMultipleWrites = audit.getAuditLogs();
assert(logsAfterMultipleWrites[0].id === secondMultiWriteEntry.id, 'second audit should be first after multiple writes');
assert(logsAfterMultipleWrites[1].id === firstMultiWriteEntry.id, 'previous audit should move to second after multiple writes');

const metadataFallbackEntry = audit.recordAudit({
  action: 'sale.note',
  entityType: 'sale',
  metadata: 'invalid'
});

assert(
  metadataFallbackEntry.metadata && typeof metadataFallbackEntry.metadata === 'object' && !Array.isArray(metadataFallbackEntry.metadata),
  'audit metadata should fall back to an object'
);

let requiredFieldsRejected = false;
try {
  audit.recordAudit({ action: '', entityType: 'sale' });
} catch (error) {
  requiredFieldsRejected = error.message === 'Acao e tipo da entidade sao obrigatorios.';
}

assert(requiredFieldsRejected, 'audit should reject empty required fields');

let missingArgumentsRejected = false;
try {
  audit.recordAudit();
} catch (error) {
  missingArgumentsRejected = error.message === 'Acao e tipo da entidade sao obrigatorios.';
}

assert(missingArgumentsRejected, 'audit should reject missing arguments with service validation error');

console.log('audit service ok');
