// Cada aparelho guarda so os ultimos 60 dias: antes a sincronizacao baixava o
// historico inteiro do servidor a cada atualizacao e o armazenamento do
// navegador (cerca de 5 milhoes de caracteres) lotava em poucas semanas.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = {
  getItem: (key) => disk.get(key) ?? null,
  setItem: (key, value) => disk.set(key, String(value)),
  removeItem: (key) => disk.delete(key),
  clear: () => disk.clear()
};
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-test-key'
};

const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const windowService = await import('../src/services/history-window.service.js?v=20261123-01');
const financialSync = await import('../src/services/financial-sync.service.js?v=20261123-02');
const retention = await import('../src/services/history-retention.service.js?v=20261123-02');
const archive = await import('../src/services/history-archive.store.js?v=20261123-01');
const crm = await import('../src/services/crm-dashboard.service.js?v=20261123-02');
const { setLocalCache, readLocalCache } = await import('../src/services/providers/local.provider.js?v=20261123-02');

const DAY = 24 * 60 * 60 * 1000;
const cutoff = windowService.getHistoryCutoff();
const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();

// 1. Leitura do servidor limitada a janela, com ordem estavel na paginacao.
const salesQuery = windowService.getHistoryQuery('sales');
assert.deepEqual(salesQuery.filters, [{ column: 'created_at', op: 'gte', value: cutoff.toISOString() }]);
assert.equal(salesQuery.selectSuffix, '');
const itemsQuery = windowService.getHistoryQuery('sale_items');
assert.equal(itemsQuery.selectSuffix, ',sales!inner(created_at)', 'itens seguem a data da venda');
assert.equal(itemsQuery.filters[0].column, 'sales.created_at');
assert.equal(windowService.getHistoryQuery('product_stock'), null, 'saldo da vitrine vem sempre completo');
assert.equal(windowService.getHistoryQuery('financial_transactions'), null, 'contas do financeiro vem sempre completas');
const rangeQuery = windowService.getHistoryQuery('cash_movements', { since: '2026-01-01T00:00:00.000Z', until: '2026-02-01T00:00:00.000Z' });
assert.deepEqual(rangeQuery.filters.map((filter) => filter.op), ['gte', 'lt']);

const calls = [];
const serverRows = {
  sales: [
    { id: 'sale-old', status: 'ativa', total: 30, payment_method: 'dinheiro', received_amount: 30, change_amount: 0, created_at: daysAgo(90) }
  ],
  sale_items: [
    { id: 'item-old', sale_id: 'sale-old', product_id: 'x-burger', name: 'X-Burger', quantity: 2, unit_price: 15, total: 30 }
  ]
};
financialSync.configureFinancialSyncForTests({
  getClient: () => ({
    from(table) {
      return {
        async selectRange(columns, from, to, options = {}) {
          calls.push({ table, columns, options });
          return { data: options.filters?.some((filter) => filter.op === 'lt') ? (serverRows[table] || []) : [], error: null };
        }
      };
    }
  })
});

await financialSync.hydrateFinancialData();
const salesCall = calls.find((call) => call.table === 'sales');
assert.equal(salesCall.options.order, 'id.asc', 'paginacao com ordem estavel');
assert.equal(salesCall.options.filters[0].value, cutoff.toISOString(), 'vendas so da janela de 60 dias');
assert.match(calls.find((call) => call.table === 'sale_items').columns, /sales!inner\(created_at\)$/);
assert.equal(calls.find((call) => call.table === 'financial_transactions').options.filters.length, 0);

// 2. Limpeza local: some o que ja esta no servidor e passou da janela.
setLocalCache(keys.transactions, [
  { id: 'recent', type: 'venda', total: 10, createdAt: daysAgo(3) },
  { id: 'old', type: 'venda', total: 10, createdAt: daysAgo(75) },
  { id: 'old-pending', type: 'venda', total: 10, createdAt: daysAgo(75), syncPending: true }
]);
setLocalCache(keys.showcaseMovements, [{ id: 'mov-old', createdAt: daysAgo(80) }, { id: 'mov-new', createdAt: daysAgo(1) }]);
setLocalCache(keys.auditLogs, [{ id: 'audit-old', createdAt: daysAgo(70), pendingSync: true }, { id: 'audit-sent', createdAt: daysAgo(70), pendingSync: false }]);

setLocalCache(keys.financialSyncQueue, [{ action: 'saveSale', sale: { id: 'x' } }]);
assert.equal(retention.pruneLocalHistory().skipped, 'pending-sync', 'com envio pendente nada e apagado');
assert.equal(readLocalCache(keys.transactions).length, 3);
setLocalCache(keys.financialSyncQueue, []);

const result = retention.pruneLocalHistory();
assert.equal(result.pruned, 3);
assert.deepEqual(readLocalCache(keys.transactions).map((item) => item.id), ['recent', 'old-pending']);
assert.deepEqual(readLocalCache(keys.showcaseMovements).map((item) => item.id), ['mov-new']);
assert.deepEqual(readLocalCache(keys.auditLogs).map((item) => item.id), ['audit-old'], 'auditoria ainda nao enviada fica');

// 3. Relatorio de periodo antigo consulta o servidor e nao grava no aparelho.
const start = new Date(Date.now() - 100 * DAY);
const end = new Date();
const filter = { period: 'custom', start, end };
assert.equal(retention.needsArchivedHistory(start), true);
const before = crm.getCrmSummary(filter).salesTotal;
const state = await retention.loadArchivedHistory({ since: start, until: end });
assert.equal(state.status, 'ready');
assert.equal(archive.getArchivedTransactions().length, 1);
assert.equal(crm.getCrmSummary(filter).salesTotal, before + 30, 'relatorio soma a venda antiga do servidor');
assert.equal(readLocalCache(keys.transactions).some((item) => item.id === 'sale-old'), false, 'historico antigo fica so na memoria');
const archivedCall = calls.filter((call) => call.table === 'sales').at(-1);
assert.deepEqual(archivedCall.options.filters.map((item) => item.op), ['gte', 'lt']);
assert.equal(archivedCall.options.filters[1].value, cutoff.toISOString(), 'consulta so o que esta fora da janela local');

// 4. Sem modo online nada e limpo (nao ha copia no servidor).
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'local' };
assert.equal(retention.pruneLocalHistory().skipped, 'offline-mode');
assert.equal(windowService.getHistoryQuery('sales'), null);

console.log('history retention ok');
