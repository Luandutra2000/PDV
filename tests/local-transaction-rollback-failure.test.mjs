import assert from 'node:assert/strict';
import { runLocalTransaction, setLocalCache, readLocalCache, deferLocalEffect } from '../src/services/providers/local.provider.js?v=20260804-06';
const disk = new Map([['first', '["old-first"]'], ['second', '["old-second"]'], ['third', '["old-third"]']]);
let rollback = false;
globalThis.localStorage = {
  getItem: key => disk.get(key) ?? null,
  setItem(key, value) {
    if (key === 'third') { rollback = true; throw new Error('commit quota'); }
    if (rollback && key === 'second') throw new Error('rollback storage failure');
    disk.set(key, value);
  },
  removeItem: key => disk.delete(key)
};
let effectRan = false;
assert.throws(() => runLocalTransaction(() => {
  setLocalCache('first', ['old-first', 'new-first']);
  setLocalCache('second', ['old-second', 'new-second']);
  setLocalCache('third', ['old-third', 'new-third']);
  deferLocalEffect(() => { effectRan = true; });
}), /reversao incompleta.*nao repita/i, 'rollback failure must identify incomplete recovery and prevent blind retry');
assert.deepEqual(readLocalCache('first'), ['old-first'], 'restore other keys even if one restoration fails');
assert.deepEqual(readLocalCache('second'), ['old-second', 'new-second'], 'failed rollback must retain persisted records');
assert.deepEqual(readLocalCache('third'), ['old-third'], 'failed commit key must stay unchanged');
assert(!effectRan, 'rollback failure must never launch post-commit effects');
console.log('local rollback failure recovery reporting ok');
