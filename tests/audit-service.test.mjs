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

const storage = await import('../src/services/storage.service.js');
const audit = await import('../src/services/audit.service.js');

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

console.log('audit service ok');
