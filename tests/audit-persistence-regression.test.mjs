import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../src/database/schema.js?v=20260804-06';
import { createSupabaseProvider } from '../src/services/providers/supabase.provider.js?v=20260804-06';

const store = new Map();
const localProvider = { read: (key, fallback) => store.get(key) ?? fallback, write: (key, value) => (store.set(key, value), value) };
let signedIn = true;
let fail = false;
let pauseWrite = null;
let failAfterCommit = false;
const writes = [];
const remote = new Map();
const userId = '00000000-0000-4000-8000-000000000001';
const client = {
  auth: { getSession: async () => ({ data: { session: signedIn ? { user: { id: userId } } : null } }) },
  from(table) {
    return {
      select: async () => ({ data: [...remote.values()], error: null }),
      insert: async (rows) => {
        writes.push({ table, rows });
        if (pauseWrite) await pauseWrite;
        if (fail) return { error: new Error('offline') };
        if (rows.some(row => remote.has(row.id))) return { error: { code: '23505', message: 'duplicate audit id' } };
        rows.forEach(row => remote.set(row.id, row));
        if (failAfterCommit) return { error: new Error('response lost after commit') };
        return { error: null };
      }
    };
  }
};
let provider = createSupabaseProvider({ getClient: async () => client, localProvider });
const entry = { id: 'audit-legacy-1', action: 'sale.cancel', entityType: 'sale', entityId: 'sale-1', userId, userName: 'Caixa', reason: 'Erro', metadata: {}, createdAt: '2026-09-15T10:00:00.000Z' };
provider.write(STORAGE_KEYS.auditLogs, [entry]);
await provider.flush();
assert.equal(writes.length, 1, 'a new audit must be persisted remotely');
assert.equal(writes[0].table, 'audit_logs');
assert.equal(writes[0].rows.length, 1, 'plain insert must work without audit-view permission or reading remote rows');
assert.match(writes[0].rows[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
assert.equal(writes[0].rows[0].metadata.reason, 'Erro');
provider.write(STORAGE_KEYS.auditLogs, provider.read(STORAGE_KEYS.auditLogs));
await provider.flush();
assert.equal(writes.length, 1, 'rewriting history must not resend old audits');

fail = true;
provider.write(STORAGE_KEYS.auditLogs, [{ ...entry, id: 'audit-legacy-2' }, ...provider.read(STORAGE_KEYS.auditLogs)]);
await provider.flush();
provider = createSupabaseProvider({ getClient: async () => client, localProvider });
await provider.hydrate([STORAGE_KEYS.auditLogs]);
assert.equal(provider.read(STORAGE_KEYS.auditLogs).length, 2, 'hydration must preserve offline audit');
fail = false;
await provider.flush();
assert.equal(remote.size, 2, 'pending audit must survive restart and retry');
signedIn = false;
provider.write(STORAGE_KEYS.auditLogs, [{ ...entry, id: 'audit-legacy-3' }, ...provider.read(STORAGE_KEYS.auditLogs)]);
const beforeAnonymous = writes.length;
await provider.flush();
assert.equal(writes.length, beforeAnonymous, 'no anonymous audit writes');
signedIn = true;
await provider.flush();
assert.equal(remote.size, 3, 'login should allow retry');

let release;
pauseWrite = new Promise(resolve => { release = resolve; });
provider.write(STORAGE_KEYS.auditLogs, [{ ...entry, id: 'audit-concurrent-a' }, ...provider.read(STORAGE_KEYS.auditLogs)]);
const flushing = provider.flush();
while (!writes.some(call => call.rows[0].metadata.clientAuditId === 'audit-concurrent-a')) await new Promise(resolve => setImmediate(resolve));
provider.write(STORAGE_KEYS.auditLogs, [{ ...entry, id: 'audit-concurrent-b' }, ...provider.read(STORAGE_KEYS.auditLogs)]);
pauseWrite = null;
release();
await flushing;
await provider.flush();
assert.equal(remote.size, 5, 'audit created during another send must be preserved');
assert.equal(provider.read(STORAGE_KEYS.auditLogs).filter(item => item.pendingSync).length, 0);

failAfterCommit = true;
provider.write(STORAGE_KEYS.auditLogs, [{ ...entry, id: 'audit-response-lost' }, ...provider.read(STORAGE_KEYS.auditLogs)]);
await provider.flush();
failAfterCommit = false;
provider = createSupabaseProvider({ getClient: async () => client, localProvider });
await provider.flush();
assert.equal(remote.size, 6, 'uncertain commit retry after restart must not duplicate audit');
const repeatedIds = writes.filter(call => call.rows[0].metadata.clientAuditId === 'audit-response-lost').map(call => call.rows[0].id);
assert.equal(new Set(repeatedIds).size, 1, 'legacy UUID mapping must stay stable across retries');
provider.write(STORAGE_KEYS.auditLogs, [{ ...entry, id: 'other-user', userId: 'someone-else' }, ...provider.read(STORAGE_KEYS.auditLogs)]);
await provider.flush();
assert.equal(remote.size, 6, 'must not attribute another user audit to the current session');
console.log('audit persistence regression ok');
