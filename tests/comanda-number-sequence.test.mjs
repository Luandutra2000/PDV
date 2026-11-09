// Regressao (QA 2026-11, BUG-020): a numeracao da comanda e por aparelho e
// recomecava em 1 em um aparelho novo, repetindo numeros ja usados.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const comanda = await import('../src/services/comanda.service.js?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');

storage.resetAppData();
seedTestAdmin(storage, keys);
// Historico sincronizado de outro aparelho: comandas ate a 414.
storage.setItem(keys.closedComandas, [{ id: 'c-414', number: 414, status: 'fechada', items: [] }, { id: 'c-90', number: 90, status: 'fechada', items: [] }]);
storage.setItem(keys.activeComanda, null);
disk.delete(keys.activeComanda);
assert.equal(comanda.getActiveComanda().number, 415, 'aparelho novo continua depois do maior numero conhecido');
comanda.addItem({ id: 'a', name: 'A', price: 1 });
const sale = transactions.finalizeComandaPayment({ paymentMethod: 'pix' });
assert.equal(sale.comandaNumber, 415);
storage.setItem(keys.closedComandas, [...storage.getItem(keys.closedComandas, []), { id: 'c-500', number: 500, status: 'fechada', items: [] }]);
comanda.addItem({ id: 'a', name: 'A', price: 1 });
assert.equal(transactions.finalizeComandaPayment({ paymentMethod: 'pix' }).comandaNumber, 416);
assert.equal(comanda.getActiveComanda().number, 501, 'apos sincronizar a 500 de outro aparelho, a proxima e 501');
console.log('comanda number sequence ok');
