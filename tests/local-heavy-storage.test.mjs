// O historico de vendas sai do localStorage (cerca de 5 milhoes de caracteres)
// e vai para o IndexedDB: 60 dias de uma lanchonete movimentada nao cabem no
// localStorage. As leituras continuam sincronas (copia em memoria).
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
let failKey = null;
globalThis.localStorage = {
  getItem: (key) => disk.get(key) ?? null,
  setItem: (key, value) => {
    if (key === failKey) {
      const error = new Error('quota');
      error.name = 'QuotaExceededError';
      throw error;
    }
    disk.set(key, String(value));
  },
  removeItem: (key) => disk.delete(key),
  clear: () => disk.clear()
};

const local = await import('../src/services/providers/local.provider.js?v=20261123-01');

disk.set('pdv.transactions', JSON.stringify([{ id: 'sale-legacy', total: 10 }]));
disk.set('pdv.products', JSON.stringify([{ id: 'x-burger' }]));

const database = new Map();
const backend = {
  get: async (key) => (database.has(key) ? structuredClone(database.get(key)) : undefined),
  put: async (key, value) => { database.set(key, structuredClone(value)); },
  delete: async (key) => { database.delete(key); }
};

assert.equal(await local.initLocalHeavyStorage({ backend }), true);
assert.equal(local.isLocalHeavyStorageActive(), true);
assert.deepEqual(local.readLocalCache('pdv.transactions', []), [{ id: 'sale-legacy', total: 10 }], 'vendas antigas migradas');
assert.equal(disk.has('pdv.transactions'), false, 'vendas sairam do localStorage');
assert.deepEqual(database.get('pdv.transactions'), [{ id: 'sale-legacy', total: 10 }]);
assert.deepEqual(local.readLocalCache('pdv.products', []), [{ id: 'x-burger' }], 'catalogo continua no localStorage');

local.setLocalCache('pdv.transactions', [{ id: 'sale-new', total: 20 }, { id: 'sale-legacy', total: 10 }]);
assert.equal(local.readLocalCache('pdv.transactions').length, 2, 'escrita visivel na hora');
await local.whenLocalHeavyWritesSettled();
assert.equal(database.get('pdv.transactions').length, 2, 'escrita chega ao IndexedDB');
assert.equal(disk.has('pdv.transactions'), false);

// Transacao atomica: se uma gravacao no localStorage falha, o historico nao muda.
failKey = 'pdv.activeComanda';
assert.throws(() => local.runLocalTransaction(() => {
  local.setLocalCache('pdv.transactions', [{ id: 'sale-ghost' }]);
  local.setLocalCache('pdv.activeComanda', { id: 'comanda-1', items: [] });
}), /armazenamento/);
assert.equal(local.readLocalCache('pdv.transactions').length, 2, 'venda nao entra se a comanda nao foi salva');
failKey = null;

local.runLocalTransaction(() => {
  local.setLocalCache('pdv.transactions', [{ id: 'sale-3' }, ...local.readLocalCache('pdv.transactions')]);
  local.setLocalCache('pdv.activeComanda', { id: 'comanda-2', items: [] });
});
assert.equal(local.readLocalCache('pdv.transactions').length, 3);
assert.equal(JSON.parse(disk.get('pdv.activeComanda')).id, 'comanda-2');

// Recarregar a pagina: tudo volta do IndexedDB.
await local.whenLocalHeavyWritesSettled();
local.resetLocalHeavyStorageForTests();
assert.equal(local.isLocalHeavyStorageActive(), false);
await local.initLocalHeavyStorage({ backend });
assert.deepEqual(local.readLocalCache('pdv.transactions').map((item) => item.id), ['sale-3', 'sale-new', 'sale-legacy']);

const provider = local.createLocalProvider();
provider.remove('pdv.transactions');
assert.equal(local.readLocalCache('pdv.transactions', null), null);
await local.whenLocalHeavyWritesSettled();
assert.equal(database.has('pdv.transactions'), false);

console.log('local heavy storage ok');
