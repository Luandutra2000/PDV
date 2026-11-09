// Regressao (QA 2026-11, BUG-015): uma atualizacao em tempo real que buscou o
// servidor antes do cancelamento chegar la sobrescrevia a venda cancelada no
// aparelho com o status antigo "ativa" por cerca de 1 s (medido: c -> a -> c).
// Nesse intervalo os totais e um fechamento contariam a venda cancelada.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.test', supabaseAnonKey: 'public' };

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const financial = await import('../src/services/financial-sync.service.js?v=20260804-06');
const { configureSupabaseClientForTests } = await import('../src/services/supabase-client.service.js?v=20260804-06');

storage.resetAppData();
seedTestAdmin(storage, keys);

const createdAt = new Date().toISOString();
const staleServerRows = {
  sales: [{ id: 'sale-1', status: 'ativa', command_id: 'cmd-1', command_number: 414, total: 3, payment_method: 'pix', received_amount: 3, change_amount: 0, created_at: createdAt, canceled_at: null }],
  sale_items: [{ id: 'sale-1-agua', sale_id: 'sale-1', product_id: 'agua', name: 'Agua', quantity: 1, unit_price: 3, total: 3 }],
  commands: [{ id: 'cmd-1', number: 414, status: 'fechada', total: 3, payment_method: 'pix', created_at: createdAt, closed_at: createdAt }],
  command_items: []
};
const client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  from(table) {
    const rows = staleServerRows[table] || [];
    return {
      select: () => ({ range: async () => ({ data: rows, error: null }) }),
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null })
    };
  }
};
financial.configureFinancialSyncForTests({ getClient: async () => client });
configureSupabaseClientForTests({ client });

// O aparelho ja cancelou (e enviou) a venda; a leitura remota foi feita antes.
const canceledAt = new Date(Date.now() + 1000).toISOString();
storage.setItem(keys.transactions, [{ id: 'sale-1', type: 'venda', status: 'cancelada', canceledAt, cancelReason: 'Cliente desistiu', comandaId: 'cmd-1', comandaNumber: 414, total: 3, paymentMethod: 'pix', items: [], createdAt }]);
storage.setItem(keys.closedComandas, [{ id: 'cmd-1', number: 414, status: 'cancelada', canceledAt, cancelReason: 'Cliente desistiu', total: 3, items: [], createdAt, closedAt: createdAt }]);

await financial.hydrateFinancialData();

const sale = storage.getItem(keys.transactions, []).find((item) => item.id === 'sale-1');
const command = storage.getItem(keys.closedComandas, []).find((item) => item.id === 'cmd-1');
assert.equal(sale.status, 'cancelada', 'leitura remota defasada nao pode reativar a venda cancelada');
assert.equal(sale.cancelReason, 'Cliente desistiu');
assert.equal(command.status, 'cancelada', 'nem a comanda cancelada');
console.log('cancel stale hydrate ok');
