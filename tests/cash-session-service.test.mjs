const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const schema = await import('../src/database/schema.js?v=20260804-06');
const auth = await import('../src/services/auth.service.js?v=20260804-06');
const cash = await import('../src/services/cash-session.service.js?v=20260804-06');

storage.ensureSeedData();
storage.setItem(schema.STORAGE_KEYS.users, [{ id: 'u1', name: 'Caixa', username: 'caixa', role: 'admin', active: true }]);
storage.setItem(schema.STORAGE_KEYS.currentSession, { userId: 'u1' });
assert(!cash.isCashSessionOpen(), 'caixa deve iniciar fechado');
let blocked = false;
try { cash.assertCashSessionOpen(); } catch (error) { blocked = /Abra o caixa/.test(error.message); }
assert(blocked, 'venda deve ser bloqueada antes da abertura');

const opened = cash.openCashSession({ openingAmount: 100 });
assert(opened.status === 'aberto' && opened.openingAmount === 100, 'abertura deve guardar dinheiro inicial');
assert(cash.isCashSessionOpen(), 'caixa deve ficar aberto');
const closed = cash.closeCashSession({ closingId: 'closing-1' });
assert(closed.status === 'fechado' && closed.closingId === 'closing-1', 'fechamento deve encerrar a sessao');
assert(!cash.isCashSessionOpen(), 'caixa fechado nao aceita nova venda');

console.log('cash session service ok');
