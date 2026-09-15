import assert from 'node:assert/strict';
const disk = new Map();
globalThis.localStorage = {
  getItem: (key) => disk.get(key) ?? null,
  setItem: (key, value) => disk.set(key, String(value)),
  removeItem: (key) => disk.delete(key)
};
const financial = await import('../src/services/financial-sync.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const rows = new Map(['sales', 'sale_items', 'commands', 'command_items'].map((table) => [table, new Map()]));
let loseResponse = true;
let deletes = 0;
const client = { from: (table) => ({
  async upsert(items, options) {
    if (table === 'sales' && !options?.ignoreDuplicates) return { error: { code: '42501', message: 'operator cannot update sales' } };
    for (const item of items) {
      if (!rows.get(table).has(item.id) || !options?.ignoreDuplicates) rows.get(table).set(item.id, { ...item });
    }
    return { error: table === 'sale_items' && loseResponse ? new Error('response lost after commit') : null };
  },
  delete() { return { in: async () => { deletes += 1; return { error: new Error('not permitted') }; }, eq: async () => { deletes += 1; return { error: new Error('not permitted') }; } }; }
}) };
financial.configureFinancialSyncForTests({ getClient: async () => client });
const item = { productId: 'qa', name: 'QA', quantity: 1, unitPrice: 10, total: 10 };
const sale = { id: 'immutable-sale', type: 'venda', status: 'ativa', total: 10, paymentMethod: 'pix', items: [item], createdAt: new Date().toISOString() };
const command = { id: 'immutable-command', status: 'fechada', total: 10, items: [item], createdAt: sale.createdAt };
await financial.saveSaleToSupabase({ sale, command });
assert.equal(rows.get('sales').size, 1, 'operator must be able to insert a sale without UPDATE permission');
assert.equal(rows.get('sale_items').size, 1, 'uncertain commit remains durable for retry');
assert.equal(deletes, 0, 'a failed replay must never delete committed or partial sale rows');
assert.equal(financial.getFinancialSyncStatus().pending, 1);

const canceledAt = new Date().toISOString();
rows.get('sales').get(sale.id).status = 'cancelada';
rows.get('commands').get(command.id).status = 'cancelada';
localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify([{ ...sale, status: 'cancelada', canceledAt }]));
localStorage.setItem(STORAGE_KEYS.closedComandas, JSON.stringify([{ ...command, status: 'cancelada', canceledAt }]));
loseResponse = false;
await financial.saveSaleToSupabase({ sale, command });
assert.equal(rows.get('sales').get(sale.id).status, 'cancelada');
assert.equal(rows.get('commands').get(command.id).status, 'cancelada');
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.transactions))[0].status, 'cancelada', 'retry acknowledgement preserves known cancellation');
assert.equal(JSON.parse(disk.get(STORAGE_KEYS.closedComandas))[0].status, 'cancelada');
assert.equal(financial.getFinancialSyncStatus().pending, 0);
assert.equal(deletes, 0);
for (const table of rows.values()) assert.equal(table.size, 1);
await assert.rejects(() => financial.saveSaleToSupabase({ sale: { ...sale, total: 11 }, command }), /imutavel|alterar|venda/i);
await assert.rejects(() => financial.saveSaleToSupabase({ sale: { ...sale, items: [{ ...item, productId: 'other' }] }, command }), /imutavel|alterar|venda/i);
console.log('financial immutable sale replay ok');
