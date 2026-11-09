// Regressao (QA 2026-11, BUG-002): o modal de Entrada/Saida oferecia nomes
// soltos ("Despesa operacional", "Troco", um segundo "Outros"...) que nao
// existem em financial_categories. O lancamento financeiro gerado violava a FK
// financial_transactions_category_id_fkey e travava a fila de sincronizacao.
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

const storage = await import('../src/services/storage.service.js?v=20261109-01');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20261109-01');
const financialService = await import('../src/services/financial.service.js?v=20261109-01');
const financial = await import('../src/services/financial-sync.service.js?v=20261109-01');
const showcase = await import('../src/services/showcase-sync.service.js?v=20261109-01');
const cashActions = await import('../src/components/cash-actions.component.js?v=20261109-01');
const { configureSupabaseClientForTests } = await import('../src/services/supabase-client.service.js?v=20260804-06');

const serverCategories = new Set(financialService.FINANCIAL_CATEGORY_SEED.map((category) => category.id));
const rows = { financial_transactions: [], cash_movements: [] };
const client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  from(table) {
    return {
      async upsert(list) {
        for (const row of list) {
          if (table === 'financial_transactions' && row.category_id && !serverCategories.has(row.category_id)) {
            return { error: { message: 'insert or update on table "financial_transactions" violates foreign key constraint "financial_transactions_category_id_fkey"' } };
          }
          if (table === 'financial_transactions' && row.cash_movement_id && !rows.cash_movements.some((movement) => movement.id === row.cash_movement_id)) {
            return { error: { message: 'violates foreign key constraint "financial_transactions_cash_movement_id_fkey"' } };
          }
        }
        rows[table]?.push(...list);
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
financialService.seedFinancialCategories();
const queue = () => JSON.parse(disk.get(keys.financialSyncQueue) || '[]');

// 1. O modal so oferece categorias que existem no cadastro financeiro.
for (const type of ['entrada', 'saida']) {
  const full = cashActions.renderCashMovementModal(type);
  const start = full.indexOf('name="category"');
  const markup = full.slice(start, full.indexOf('</select>', start));
  const values = [...markup.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(values.length > 0, `modal de ${type} tem categorias`);
  assert.deepEqual(values.filter((value) => !serverCategories.has(value)), [], `modal de ${type} nao oferece categoria inexistente`);
  const labels = [...markup.matchAll(/<option value="[^"]*">([^<]*)<\/option>/g)].map((match) => match[1]);
  assert.equal(new Set(labels).size, labels.length, `modal de ${type} nao repete nomes de categoria`);
}

// 2. Categoria desconhecida vinda de outro ponto nao trava a sincronizacao.
transactions.registerCashMovement({ type: 'saida', amount: 23.4, category: 'Despesa operacional', description: 'Gelo' });
await financial.flushFinancialQueue();
assert.equal(queue().length, 0, 'saida com categoria antiga deve sincronizar');
assert.equal(rows.financial_transactions.at(-1).category_id, 'outros-financeiro');
assert.equal(rows.cash_movements.at(-1).category, 'Despesa operacional', 'o movimento de caixa preserva o rotulo escolhido');

// 3. Fila antiga ja gravada com categoria invalida se recupera.
const createdAt = new Date().toISOString();
financial.prepareFinancialOperation({ action: 'saveCashMovement', movement: { id: 'saida-antiga', type: 'saida', status: 'ativa', amount: 5, category: 'Troco', description: 'Antiga', createdAt } });
financial.prepareFinancialOperation({ action: 'saveFinancialTransaction', transaction: { id: 'fin-antiga', type: 'expense', amount: 5, categoryId: 'Troco', description: 'Antiga', paymentMethod: 'dinheiro', status: 'paid', origin: 'cashier', cashMovementId: 'saida-antiga', movesCashSession: true, transactionDate: createdAt.slice(0, 10), createdAt, updatedAt: createdAt } });
await financial.flushFinancialQueue();
assert.equal(queue().length, 0, 'fila com categoria invalida deve ser destravada');
assert.equal(rows.financial_transactions.at(-1).category_id, 'outros-financeiro');

console.log('cash movement category sync ok');
