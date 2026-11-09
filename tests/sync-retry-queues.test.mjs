// Regressao (QA 2026-11, BUG-007): depois de uma queda de conexao a fila da
// vitrine ficava pendente ate a proxima venda. O botao Atualizar so reenviava
// a fila financeira e a nova tentativa periodica so reenviava a auditoria.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const appSource = fs.readFileSync(new URL('../src/app.js?v=20261109-01', import.meta.url), 'utf8');

assert.match(appSource, /import \{[^}]*flushShowcaseQueue[^}]*\} from '\.\/services\/showcase-sync\.service\.js/, 'app importa o envio da fila da vitrine');
const refreshBlock = appSource.match(/data-action="refresh"[\s\S]*?activeRouteInitializer/)?.[0] || '';
assert.match(refreshBlock, /flushFinancialQueue\(\)/, 'Atualizar reenvia a fila financeira');
assert.match(refreshBlock, /flushShowcaseQueue\(\)/, 'Atualizar reenvia a fila da vitrine');
const retryBlock = appSource.match(/const retryPendingSync = [\s\S]*?window\.setInterval\(retryPendingSync, 30000\)/)?.[0] || '';
assert.match(retryBlock, /flushDataProvider\(\)/, 'nova tentativa periodica reenvia a auditoria');
assert.match(retryBlock, /flushFinancialQueue\(\)/, 'nova tentativa periodica reenvia a fila financeira');
assert.match(retryBlock, /flushShowcaseQueue\(\)/, 'nova tentativa periodica reenvia a fila da vitrine');
assert.match(retryBlock, /addEventListener\('online', retryPendingSync\)/, 'a volta da conexao dispara nova tentativa');

console.log('sync retry queues ok');
