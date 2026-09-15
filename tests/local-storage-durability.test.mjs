import assert from 'node:assert/strict';
const disk = new Map();
globalThis.localStorage = {
  getItem: key => disk.get(key) ?? null,
  setItem: (key, value) => disk.set(key, String(value)),
  removeItem: key => disk.delete(key),
  clear: () => disk.clear()
};
const { createLocalProvider } = await import('../src/services/providers/local.provider.js?v=20260804-06');
const provider = createLocalProvider();
provider.write('pdv.transactions', [{id:'A',total:10}]);
disk.set('pdv.transactions', JSON.stringify([{id:'A',total:10},{id:'B',total:20}]));
assert.equal(provider.read('pdv.transactions').length, 2, 'other tab writes must invalidate cached values');

const pending = Array.from({length:1100},(_,i)=>({id:`operation-${i}`,details:'x'.repeat(2000)}));
provider.write('pdv.syncQueue.financial', pending);
globalThis.__PDV_MEMORY_CACHE__ = new Map();
assert.equal(provider.read('pdv.syncQueue.financial').length, 1100, 'every pending operation must survive a reload');

const oldValue = provider.read('pdv.transactions');
oldValue.push({id:'C',total:30});
const originalSet = localStorage.setItem;
localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
assert.throws(()=>provider.write('pdv.transactions',oldValue), /armazenamento/i, 'storage failure must reach the UI, never confirm success');
localStorage.setItem = originalSet;
assert.equal(provider.read('pdv.transactions').length, 2, 'failed write must not leave phantom data in memory');
globalThis.__PDV_MEMORY_CACHE__ = new Map();
assert.equal(provider.read('pdv.transactions').length, 2, 'persisted records must remain unchanged after failure');
console.log('local storage durability ok');
