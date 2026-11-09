// Regressao (QA 2026-11, BUG-024): durante a queda de conexao a Frente de caixa
// nao avisava que as vendas estavam so no aparelho.
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { renderCashSessionStatus } = await import('../src/components/topbar.component.js?v=20261109-01');
assert.doesNotMatch(renderCashSessionStatus({ open: true }), /pendente/, 'sem pendencia nao mostra aviso');
assert.match(renderCashSessionStatus({ open: true }, { pendingSync: 1 }), /ui-status--pending[^>]*role="status"[^>]*>1 envio pendente</);
assert.match(renderCashSessionStatus({ open: false }, { pendingSync: 3 }), />3 envios pendentes</);
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
assert.match(app, /on\(UI_EVENTS\.financialSyncStatusChanged, \(\) => renderCashSessionIndicator\(app\)\)/, 'atualiza ao mudar a fila financeira');
assert.match(app, /on\(UI_EVENTS\.showcaseSyncStatusChanged, \(\) => renderCashSessionIndicator\(app\)\)/, 'atualiza ao mudar a fila da vitrine');
console.log('sync pending indicator ok');
