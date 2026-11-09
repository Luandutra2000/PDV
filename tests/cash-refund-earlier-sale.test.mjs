// Regressao (QA 2026-11, BUG-019): venda em dinheiro de ontem (R$ 22,80)
// cancelada hoje. O dinheiro sai da gaveta hoje, mas o esperado de hoje nao
// descontava a devolucao: o fechamento acusava falta de R$ 22,80.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const cashSession = await import('../src/services/cash-session.service.js?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');
const { buildClosingSummary } = await import('../src/services/cash-closing.service.js?v=20260804-06');
const { getMobileClosingSummary } = await import('../src/services/mobile-closing.service.js?v=20260804-06');
const { createPeriodFilter, getCrmSummary } = await import('../src/services/crm-dashboard.service.js?v=20260804-06');
const { buildCrmClosingInput } = await import('../src/modules/caixa/caixa.module.js?v=20260807-21');
const { buildQuickClosingInput } = await import('../src/modules/vendas/vendas.module.js?v=20260807-21');

storage.resetAppData();
seedTestAdmin(storage, keys);
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(17, 30, 0, 0);
storage.setItem(keys.transactions, [{ id: 'sale-ontem', type: 'venda', status: 'ativa', comandaId: 'cmd-ontem', comandaNumber: 70, items: [{ productId: 'misto', name: 'Misto', quantity: 1, unitPrice: 22.8, total: 22.8 }], total: 22.8, paymentMethod: 'dinheiro', receivedAmount: 25, change: 2.2, createdAt: yesterday.toISOString() }]);
storage.setItem(keys.closedComandas, [{ id: 'cmd-ontem', number: 70, status: 'fechada', items: [], total: 22.8, paymentMethod: 'dinheiro', closedAt: yesterday.toISOString() }]);

cashSession.openCashSession({ openingAmount: 150 });
transactions.cancelClosedComanda('cmd-ontem', { reason: 'Cliente devolveu' });

assert.equal(transactions.getCashRefundsOfEarlierSales(createPeriodFilter('today')), 22.8, 'devolucao do dia identificada');
const drawer = 150 - 22.8;
const summary = getCrmSummary(createPeriodFilter('today'));
assert.equal(buildClosingSummary(buildCrmClosingInput(summary, { countedCash: drawer })).payments.cashDifference, 0, 'tela Caixa desconta a devolucao');
assert.equal(buildClosingSummary(buildQuickClosingInput(summary, { countedCash: drawer })).payments.cashDifference, 0, 'fechamento rapido desconta a devolucao');
assert.equal(getMobileClosingSummary().expectedCash, drawer, 'App do dono desconta a devolucao');
assert.equal(transactions.getCashRefundsOfEarlierSales(createPeriodFilter('yesterday')), 0, 'o dia da venda nao recebe a devolucao');
console.log('cash refund earlier sale ok');
