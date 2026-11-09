// Regressao (QA 2026-11, BUG-014): "Movimentacoes recentes" mostrava codigos
// crus: "dinheiro" no lugar da descricao da venda e "outros-financeiro" como
// categoria de uma saida.
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const comanda = await import('../src/services/comanda.service.js?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');
const crm = await import('../src/services/crm-dashboard.service.js?v=20260804-06');
storage.resetAppData();
seedTestAdmin(storage, keys);
comanda.addItem({ id: 'qa-cafe', name: 'QA Cafe', price: 4.5 });
const sale = transactions.finalizeComandaPayment({ paymentMethod: 'debito' });
const movement = crm.getFinancialMovements(crm.createPeriodFilter('today')).find((item) => item.id === sale.id);
assert.equal(movement.description, `Comanda ${String(sale.comandaNumber).padStart(4, '0')}`, 'venda aparece pela comanda');
assert.equal(movement.category, 'debito', 'a categoria continua sendo a forma de pagamento');

const source = fs.readFileSync(new URL('../src/modules/relatorios/relatorios.module.js', import.meta.url), 'utf8');
assert.match(source, /financialNames\.get\(item\.category\)/, 'categoria financeira mostra o nome cadastrado');
console.log('relatorios movement labels ok');
