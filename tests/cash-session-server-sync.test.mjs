// Regressao (QA 2026-11, BUG-011): a sessao de caixa (troco inicial) existia
// so no aparelho; cash_sessions ficava vazia e o App do dono em outro
// aparelho calculava o fechamento sem o troco.
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.test', supabaseAnonKey: 'public' };

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const { configureSupabaseClientForTests } = await import('../src/services/supabase-client.service.js?v=20260804-06');
const cash = await import('../src/services/cash-session.service.js?v=20260804-06');

const server = [];
const query = () => {
  const q = { gte: () => q, lt: () => q, order: () => q, limit: async () => ({ data: [...server].sort((a, b) => b.opened_at.localeCompare(a.opened_at)).slice(0, 1), error: null }) };
  return q;
};
const client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
  from: (table) => ({
    upsert: async (rows) => { if (table === 'cash_sessions') rows.forEach((row) => { const i = server.findIndex((r) => r.id === row.id); if (i >= 0) server[i] = row; else server.push(row); }); return { error: null }; },
    insert: async () => ({ error: null }),
    select: () => query()
  })
};
configureSupabaseClientForTests({ client });
storage.resetAppData();
seedTestAdmin(storage, keys);

const opened = cash.openCashSession({ openingAmount: 150 });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(server.length, 1, 'abertura vai para o servidor');
assert.equal(server[0].initial_amount, 150);
assert.equal(server[0].status, 'aberto');

// Outro aparelho (sem sessao local) adota a sessao do dia.
disk.delete(keys.cashSession);
globalThis.__PDV_MEMORY_CACHE__?.clear?.();
assert.equal(cash.getCashSession(), null);
const adopted = await cash.hydrateCashSessionFromServer();
assert.equal(adopted.id, opened.id, 'outro aparelho ve a sessao aberta');
assert.equal(adopted.openingAmount, 150, 'e o troco inicial');

// Fechamento em um aparelho chega ao servidor.
cash.closeCashSession({ closingId: 'closing-1' });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(server[0].status, 'fechado');

const migration = fs.readFileSync(new URL('../supabase/migrations/202611090002_cash_sessions_for_cashiers.sql', import.meta.url), 'utf8');
assert.match(migration, /current_profile_has_permission\('sales\.access'\)/, 'migracao libera quem opera o caixa');
console.log('cash session server sync ok');
