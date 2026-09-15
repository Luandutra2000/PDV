import assert from 'node:assert/strict';
const store = new Map();
let failKey = '';
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem(key, value) { if (key === failKey) throw new Error(`quota:${key}`); store.set(key, String(value)); },
  removeItem(key) { if (key === failKey) throw new Error(`quota:${key}`); store.delete(key); },
  clear: () => store.clear()
};
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const closing = await import('../src/services/cash-closing.service.js?v=20260804-06');
const mobile = await import('../src/services/mobile-closing.service.js?v=20260804-06');
const financial = await import('../src/services/financial-sync.service.js?v=20260804-06');
const { configureSupabaseClientForTests } = await import('../src/services/supabase-client.service.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
function reset() {
  failKey = '';
  globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'local' };
  storage.resetAppData();
  seedTestAdmin(storage, STORAGE_KEYS);
  return closing.saveClosingDraft({ countedCash: 0 });
}
let draft = reset();
failKey = STORAGE_KEYS.cashClosings;
assert.throws(() => closing.confirmClosing(draft, { sync: false }), /quota|armazenamento/);
assert.equal(closing.getCashClosings().length, 0, 'history must not mutate before durable commit');
assert.equal(closing.getCurrentClosingDraft().id, draft.id, 'pre-commit failure preserves draft');
for (const key of [STORAGE_KEYS.cashClosingDraft, STORAGE_KEYS.auditLogs]) {
  draft = reset();
  failKey = key;
  const result = closing.confirmClosing(draft, { sync: false });
  assert.equal(result.status, 'fechado');
  assert(result.warnings?.length, `secondary failure ${key} must return warning`);
  assert.equal(closing.getCashClosings().length, 1, 'confirmed local closing remains recorded');
  const retried = closing.confirmClosing(draft, { sync: false });
  assert.equal(retried.id, result.id, 'retry same draft must not duplicate closing');
  assert.equal(closing.getCashClosings().length, 1);
}
let remoteWrites = 0;
let rejectRemote = false;
const client = {
  auth: { getSession: async () => ({ data: { session: null } }) },
  from: () => ({ upsert: async () => { if (rejectRemote) return { error: new Error('remote offline') }; remoteWrites++; return { error: null }; } })
};
financial.configureFinancialSyncForTests({ getClient: async () => client });
configureSupabaseClientForTests({ client });
draft = reset();
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.test', supabaseAnonKey: 'public' };
failKey = STORAGE_KEYS.financialSyncQueue;
assert.throws(() => closing.confirmClosing(draft), /quota|armazenamento/);
assert.equal(closing.getCashClosings().length, 0, 'outbox quota must roll back closing before confirmation');
assert.equal(closing.getCurrentClosingDraft().id, draft.id);
assert.equal(remoteWrites, 0, 'failed local transaction must not send closing');
for (const key of [STORAGE_KEYS.cashClosings, STORAGE_KEYS.cashClosingDraft, STORAGE_KEYS.auditLogs]) {
  draft = reset();
  globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.test', supabaseAnonKey: 'public' };
  failKey = key;
  const before = remoteWrites;
  const result = await mobile.submitMobileClosing({ countedCash: 0 });
  assert.equal(remoteWrites, before + 1, 'remote closing must be saved once');
  assert.equal(result.status, 'fechado');
  assert(result.warnings?.length, `remote post-commit failure ${key} must return warning`);
}
draft = reset();
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.test', supabaseAnonKey: 'public' };
rejectRemote = true;
await assert.rejects(mobile.submitMobileClosing({ countedCash: 0 }), /remote offline/);
assert.equal(closing.getCurrentClosingDraft().id, draft.id, 'remote rejection must preserve draft');
assert.equal(closing.getCashClosings().length, 0);
console.log('closing post-commit regression ok');
