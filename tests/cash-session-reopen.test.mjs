// Regressao (QA 2026-11): o fechamento do mesmo dia e cumulativo, mas reabrir
// o caixa substituia o troco da abertura anterior. No Dia 7 da simulacao o
// caixa abriu com R$ 150, foi fechado e reaberto com R$ 0: o segundo
// fechamento perdeu os R$ 150 que continuavam na gaveta.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
const storage = await import('../src/services/storage.service.js?v=20261109-01');
const schema = await import('../src/database/schema.js?v=20260804-06');
const cash = await import('../src/services/cash-session.service.js?v=20261109-01');

storage.ensureSeedData();
storage.setItem(schema.STORAGE_KEYS.users, [{ id: 'u1', name: 'Caixa', username: 'caixa', role: 'admin', active: true }]);
storage.setItem(schema.STORAGE_KEYS.currentSession, { userId: 'u1' });

cash.openCashSession({ openingAmount: 150 });
cash.closeCashSession({ closingId: 'closing-parcial' });
const reopened = cash.openCashSession({ openingAmount: 0 });
assert.equal(reopened.status, 'aberto');
assert.equal(reopened.openingAmount, 150, 'reabertura sem troco novo mantem o troco da abertura anterior');
assert.equal(reopened.previousClosingId, 'closing-parcial', 'a reabertura fica ligada ao fechamento anterior');

cash.closeCashSession({ closingId: 'closing-2' });
const again = cash.openCashSession({ openingAmount: 20 });
assert.equal(again.openingAmount, 170, 'troco adicional na reabertura soma ao troco do dia');
console.log('cash session reopen ok');
