// Regressao (QA 2026-11, BUG-001): uma entrada/saida de caixa gera um
// lancamento financeiro com cash_movement_id. O banco exige que o movimento
// exista antes (FK financial_transactions_cash_movement_id_fkey). A fila e
// estritamente ordenada, entao enviar o lancamento antes do movimento travava
// todas as vendas seguintes no aparelho.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = {
  getItem: (key) => disk.get(key) ?? null,
  setItem: (key, value) => disk.set(key, String(value)),
  removeItem: (key) => disk.delete(key),
  clear: () => disk.clear()
};
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.test', supabaseAnonKey: 'public' };

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');
const financial = await import('../src/services/financial-sync.service.js?v=20260804-06');
const showcase = await import('../src/services/showcase-sync.service.js?v=20260804-06');
const { configureSupabaseClientForTests } = await import('../src/services/supabase-client.service.js?v=20260804-06');

const movements = new Set();
const writes = [];
const client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  from(table) {
    return {
      async upsert(rows) {
        for (const row of rows) {
          if (table === 'financial_transactions' && row.cash_movement_id && !movements.has(row.cash_movement_id)) {
            return { error: { message: 'insert or update on table "financial_transactions" violates foreign key constraint "financial_transactions_cash_movement_id_fkey"' } };
          }
        }
        if (table === 'cash_movements') rows.forEach((row) => movements.add(row.id));
        writes.push(table);
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) })
    };
  },
  rpc: async () => ({ data: { changed: true, changedItems: 1 }, error: null })
};
financial.configureFinancialSyncForTests({ getClient: async () => client });
showcase.configureShowcaseSyncForTests({ getClient: async () => client });
configureSupabaseClientForTests({ client });
storage.resetAppData();
seedTestAdmin(storage, keys);

const queue = () => JSON.parse(disk.get(keys.financialSyncQueue) || '[]');

// 1. Fluxo normal: o movimento precisa ir antes do lancamento vinculado.
transactions.registerCashMovement({ type: 'entrada', amount: 50, description: 'Suprimento de troco' });
await financial.flushFinancialQueue();
assert.equal(queue().length, 0, 'a entrada de caixa deve sincronizar sem travar a fila');
assert.deepEqual(writes.slice(0, 2), ['cash_movements', 'financial_transactions']);
assert.equal(financial.getFinancialSyncStatus().state, 'synced');

// 2. Filas ja gravadas na ordem antiga (aparelhos em uso) devem se recuperar.
const brokenMovement = { id: 'saida-legado', type: 'saida', status: 'ativa', amount: 5, category: 'Outros', description: 'Legado', createdAt: new Date().toISOString() };
const brokenFinance = { id: 'fin-legado', type: 'expense', amount: 5, categoryId: 'Outros', description: 'Legado', paymentMethod: 'dinheiro', status: 'paid', origin: 'cashier', cashMovementId: 'saida-legado', movesCashSession: true, transactionDate: brokenMovement.createdAt.slice(0, 10), createdAt: brokenMovement.createdAt, updatedAt: brokenMovement.createdAt };
financial.prepareFinancialOperation({ action: 'saveFinancialTransaction', transaction: brokenFinance });
financial.prepareFinancialOperation({ action: 'saveCashMovement', movement: brokenMovement });
assert.deepEqual(queue().map((op) => op.action), ['saveFinancialTransaction', 'saveCashMovement']);
await financial.flushFinancialQueue();
assert.equal(queue().length, 0, 'fila antiga com lancamento antes do movimento deve ser destravada');
assert.ok(movements.has('saida-legado'));

console.log('cash movement sync order ok');
