// Regressao (QA 2026-11, BUG-029): o motivo do cancelamento de movimento era
// pedido por window.prompt e o erro de Abrir caixa por window.alert: dialogos
// nativos travam a tela e fogem do visual do sistema.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboard = read('src/modules/dashboard/dashboard.module.js');
assert.doesNotMatch(dashboard, /window\.prompt/, 'cancelamento de movimento sem prompt nativo');
assert.match(dashboard, /data-cancel-transaction-reason/, 'motivo pedido em modal do sistema');
assert.match(dashboard, /data-action="confirm-cancel-transaction"/);
const app = read('src/app.js');
assert.doesNotMatch(app, /window\.alert/, 'abrir caixa sem alert nativo');
assert.match(app, /data-open-cash-error/, 'erro aparece dentro do modal');
console.log('no native dialogs ok');
