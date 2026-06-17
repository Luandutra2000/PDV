import assert from 'node:assert/strict';

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

globalThis.document = {
  querySelectorAll() {
    return [];
  }
};

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const storage = await import('../src/services/storage.service.js');
const { initVendasModule } = await import('../src/modules/vendas/vendas.module.js');

storage.setItem(STORAGE_KEYS.users, [{
  id: 'sales-denied',
  name: 'Caixa bloqueado',
  username: 'caixa',
  password: '1234',
  role: 'operador',
  active: true
}]);
storage.setItem(STORAGE_KEYS.currentSession, { userId: 'sales-denied', startedAt: '2026-06-15T10:00:00.000Z' });
storage.setItem(STORAGE_KEYS.userPermissionOverrides, {
  'sales-denied': {
    'sales.create': 'deny',
    'cash.movement': 'deny',
    'cash.withdrawal': 'deny',
    'stock.writeoff': 'deny',
    'cash.close': 'deny'
  }
});

const slots = new Map();
const container = {
  innerHTML: '',
  addEventListener() {},
  querySelector(selector) {
    if (!slots.has(selector)) {
      slots.set(selector, { innerHTML: '' });
    }

    return slots.get(selector);
  }
};

initVendasModule(container);

assert(!container.innerHTML.includes('data-action="open-quick-closing"'), 'denied sales user should not see quick closing');
assert(!container.innerHTML.includes('data-action="open-write-off"'), 'denied sales user should not see write-off action');
assert(!slots.get('[data-order-panel]').innerHTML.includes('data-action="open-entry"'), 'denied sales user should not see cash entry action');
assert(!slots.get('[data-order-panel]').innerHTML.includes('data-action="open-output"'), 'denied sales user should not see cash output action');
assert(!slots.get('[data-order-panel]').innerHTML.includes('data-action="open-payment"'), 'denied sales user should not see payment action');

console.log('vendas module ok');
