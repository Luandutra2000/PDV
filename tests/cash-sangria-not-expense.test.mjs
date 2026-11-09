// Regressao (QA 2026-11, BUG-021): a interface nao tinha sangria; a retirada
// para o cofre era registrada como Saida/despesa e o Financeiro mostrava
// R$ 500 de "Retirada do dono" e saldo negativo.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
const storage = await import('../src/services/storage.service.js?v=20261109-01');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20261109-01');
const financial = await import('../src/services/financial.service.js?v=20261109-01');
const cashActions = await import('../src/components/cash-actions.component.js?v=20261109-01');

storage.resetAppData();
seedTestAdmin(storage, keys);
const modal = cashActions.renderCashMovementModal('saida');
assert.match(modal, /<option value="sangria">Sangria/, 'modal de saida oferece sangria');
assert.match(modal, /<option value="saida">Despesa/, 'e despesa');
assert.match(cashActions.renderCashMovementModal('entrada'), /type="hidden" name="type" value="entrada"/);

transactions.registerCashMovement({ type: 'sangria', amount: 200, description: 'Sangria para o cofre' });
transactions.registerCashMovement({ type: 'saida', amount: 23.4, category: 'outros-financeiro', description: 'Gelo' });
const summary = transactions.getMoneySummary({ period: 'today' });
assert.equal(summary.outputsTotal, 223.4, 'sangria reduz o dinheiro do caixa');
const expenses = financial.getFinancialTransactions({ period: 'today' }).filter((t) => t.type === 'expense' && t.status !== 'canceled');
assert.deepEqual(expenses.map((t) => t.amount), [23.4], 'so a despesa vai para o Financeiro');
console.log('cash sangria not expense ok');

// O banco de producao recusa type 'sangria' (cash_movements_type_check): envia
// como saida com categoria 'sangria' e reconhece de volta na leitura.
const { cashMovementAdapter } = await import('../src/services/repositories/cash-movement.adapter.js?v=20261109-01');
const sangria = transactions.getTransactions().find((t) => t.type === 'sangria');
const row = cashMovementAdapter.toRow(sangria);
assert.equal(row.type, 'saida', 'servidor recebe saida');
assert.equal(row.category, 'sangria');
assert.equal(cashMovementAdapter.fromRow(row).type, 'sangria', 'leitura volta a ser sangria');
assert.equal(cashMovementAdapter.toRow({ id: 'x', type: 'saida', amount: 1, category: 'outros-financeiro' }).type, 'saida');
console.log('sangria server mapping ok');
