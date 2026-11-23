// Cada evento em tempo real fazia todos os aparelhos baixarem de novo a janela
// inteira de 60 dias (vendas, itens, comandas, caixa, vitrine): o trafego do
// Supabase crescia a cada dia. Agora o evento le so as linhas que mudaram.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = {
  getItem: (key) => disk.get(key) ?? null,
  setItem: (key, value) => disk.set(key, String(value)),
  removeItem: (key) => disk.delete(key),
  clear: () => disk.clear()
};
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-test-key' };

const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { setLocalCache, readLocalCache } = await import('../src/services/providers/local.provider.js?v=20261123-02');
const financialSync = await import('../src/services/financial-sync.service.js?v=20261123-03');
const showcaseSync = await import('../src/services/showcase-sync.service.js?v=20261123-03');

const now = new Date().toISOString();
const server = {
  sales: [{ id: 'sale-new', status: 'ativa', total: 7, payment_method: 'pix', received_amount: 7, change_amount: 0, created_at: now }],
  sale_items: [{ id: 'item-new', sale_id: 'sale-new', product_id: 'quibe', name: 'Quibe', quantity: 1, unit_price: 7, total: 7 }],
  product_stock: [{ id: 'stock-quibe', product_id: 'quibe', quantity_available: 9, updated_at: now }],
  showcase_movements: [{ id: 'mov-new', product_id: 'quibe', movement_type: 'saida_venda', quantity: 1, sale_id: 'sale-new', created_at: now }]
};

// --- financeiro: cliente REST (selectRange) ---
const restCalls = [];
financialSync.configureFinancialSyncForTests({
  getClient: () => ({
    from(table) {
      return {
        async selectRange(columns, from, to, options = {}) {
          restCalls.push({ table, filters: options.filters || [] });
          const inFilter = (options.filters || []).find((filter) => filter.op === 'in');
          const wanted = inFilter ? inFilter.value.slice(1, -1).split(',').map((value) => JSON.parse(value)) : null;
          const column = inFilter?.column || 'id';
          const rows = (server[table] || []).filter((row) => !wanted || wanted.includes(row[column]));
          return { data: rows, error: null };
        }
      };
    }
  })
});

setLocalCache(keys.transactions, [{ id: 'sale-old', type: 'venda', total: 10, status: 'ativa', createdAt: now, items: [] }]);
await financialSync.hydrateFinancialData({ includePending: true, changes: [{ table: 'sale_items', row: { sale_id: 'sale-new' } }] });

assert.deepEqual([...new Set(restCalls.map((call) => call.table))].sort(), ['sale_items', 'sales'], 'so vendas e itens foram lidos');
assert.ok(restCalls.every((call) => call.filters.some((filter) => filter.op === 'in')), 'leitura por id, sem a janela inteira');
const transactions = readLocalCache(keys.transactions, []);
assert.deepEqual(transactions.map((item) => item.id).sort(), ['sale-new', 'sale-old'], 'venda nova entra e as antigas ficam');
assert.equal(transactions.find((item) => item.id === 'sale-new').items[0].productId, 'quibe');
assert.equal(financialSync.getFinancialSyncStatus().error, '', 'tabelas nao lidas nao contam como erro');

restCalls.length = 0;
await financialSync.hydrateFinancialData({ includePending: true, changes: [{ table: 'tabela_desconhecida', row: {} }] });
assert.ok(restCalls.some((call) => call.table === 'financial_transactions'), 'evento nao identificado faz a leitura completa');
assert.ok(restCalls.every((call) => !call.filters.some((filter) => filter.op === 'in')));

// --- vitrine: cliente supabase-js (select().in()) ---
const jsCalls = [];
showcaseSync.configureShowcaseSyncForTests({
  getClient: async () => ({
    from(table) {
      return {
        select() {
          return {
            async in(column, values) {
              jsCalls.push({ table, column, values });
              return { data: (server[table] || []).filter((row) => values.includes(row[column])), error: null };
            },
            order() {
              return { range: async () => { jsCalls.push({ table, full: true }); return { data: server[table] || [], error: null }; } };
            }
          };
        }
      };
    }
  })
});

setLocalCache(keys.productStock, [{ id: 'stock-coxinha', productId: 'coxinha', quantityAvailable: 5 }, { id: 'stock-quibe', productId: 'quibe', quantityAvailable: 10 }]);
setLocalCache(keys.showcaseMovements, [{ id: 'mov-old', productId: 'coxinha', createdAt: now }]);
setLocalCache(keys.outOfStockSales, []);
await showcaseSync.hydrateShowcaseData({ changes: [{ table: 'showcase_movements', row: { id: 'mov-new', product_id: 'quibe', sale_id: 'sale-new' } }] });

assert.ok(jsCalls.every((call) => !call.full), 'vitrine nao relida inteira');
assert.deepEqual(jsCalls.map((call) => `${call.table}.${call.column}`).sort(), ['product_stock.product_id', 'showcase_movements.id']);
const stock = readLocalCache(keys.productStock, []);
assert.equal(stock.find((row) => row.productId === 'quibe').quantityAvailable, 9, 'saldo do produto atualizado');
assert.equal(stock.find((row) => row.productId === 'coxinha').quantityAvailable, 5, 'saldo dos outros produtos fica');
assert.deepEqual(readLocalCache(keys.showcaseMovements, []).map((row) => row.id).sort(), ['mov-new', 'mov-old']);

console.log('realtime delta sync ok');
