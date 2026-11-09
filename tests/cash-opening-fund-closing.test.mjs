// Regressao (QA 2026-11, BUG-005): o troco inicial informado em "Abrir caixa"
// entra no dinheiro esperado do fechamento (como diz o proprio modal e como o
// App do dono ja calculava), mas a tela Caixa e o Fechamento rapido o
// ignoravam: contar a gaveta fisica gerava uma "sobra" igual ao troco inicial.
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = {
  getItem: (key) => disk.get(key) ?? null,
  setItem: (key, value) => disk.set(key, String(value)),
  removeItem: (key) => disk.delete(key),
  clear: () => disk.clear()
};

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const cashSession = await import('../src/services/cash-session.service.js?v=20260804-06');
const comanda = await import('../src/services/comanda.service.js?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');
const { buildClosingSummary } = await import('../src/services/cash-closing.service.js?v=20260804-06');
const { getMobileClosingSummary } = await import('../src/services/mobile-closing.service.js?v=20260804-06');
const { createPeriodFilter, getCrmSummary } = await import('../src/services/crm-dashboard.service.js?v=20260804-06');
const { buildCrmClosingInput } = await import('../src/modules/caixa/caixa.module.js?v=20260807-21');
const { buildQuickClosingInput } = await import('../src/modules/vendas/vendas.module.js?v=20260807-21');
const { renderFechamentoRapidoModal } = await import('../src/components/fechamento-rapido-modal.component.js?v=20260807-21');

storage.resetAppData();
seedTestAdmin(storage, keys);
cashSession.openCashSession({ openingAmount: 150 });

comanda.addItemQuantity({ id: 'qa-cafe', name: 'QA Cafe', price: 4.5 }, 3);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 20 });
transactions.registerCashMovement({ type: 'entrada', amount: 50, description: 'Suprimento' });
transactions.registerCashMovement({ type: 'saida', amount: 23.4, description: 'Gelo' });

// Gaveta fisica: 150 + 13,50 + 50 - 23,40 = 190,10
const drawer = 190.1;
const summary = getCrmSummary(createPeriodFilter('today'));

const caixa = buildClosingSummary(buildCrmClosingInput(summary, { countedCash: drawer }));
assert.equal(caixa.payments.expectedCash, drawer, 'tela Caixa: dinheiro esperado inclui o troco inicial');
assert.equal(caixa.payments.cashDifference, 0, 'tela Caixa: contagem exata nao gera diferenca');

const rapido = buildClosingSummary(buildQuickClosingInput(summary, { countedCash: drawer }));
assert.equal(rapido.payments.expectedCash, drawer, 'Fechamento rapido: dinheiro esperado inclui o troco inicial');
assert.equal(rapido.payments.cashDifference, 0);

assert.equal(getMobileClosingSummary().expectedCash, drawer, 'as tres telas de fechamento concordam');

const markup = renderFechamentoRapidoModal({
  summary,
  closingSummary: rapido,
  showcase: [],
  state: { quickClosingTab: 'resumo', quickClosing: { countedCash: '', checkedPix: '', checkedDebit: '', checkedCredit: '', leftovers: {}, note: '' } }
});
assert.match(markup, /Dinheiro esperado[\s\S]*?R\$\s?190,10/, 'o modal mostra o mesmo dinheiro esperado usado na conferencia');

// Outro periodo (ex.: Ontem) nao recebe o troco da sessao de hoje.
const ontem = buildCrmClosingInput({ paymentTotals: { dinheiro: 10 }, entriesTotal: 0, outputsTotal: 0 }, {}, { period: 'yesterday' });
assert.equal(ontem.expectedCash, 10, 'periodo diferente de hoje nao soma o troco da sessao atual');

console.log('cash opening fund closing ok');
