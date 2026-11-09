// Regressao (QA 2026-11, BUG-004): o saldo da vitrine passa de um dia para o
// outro, mas perdas, alertas, "Vitrine estimada" e sobras do fechamento usavam
// so a producao do dia. Com 48 brigadeiros herdados, a perda de 3 era recusada
// e o App do dono avisava "restam 1".
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const estoque = await import('../src/services/estoque.service.js?v=20260804-06');
const showcase = await import('../src/services/showcase-stock.service.js?v=20260804-06');
const closing = await import('../src/services/cash-closing.service.js?v=20260804-06');
const notifications = await import('../src/services/mobile-notifications.service.js?v=20260804-06');
const { getDashboardResumo } = await import('../src/services/dashboard-resumo.service.js?v=20260804-06');
const { renderWriteOffModal } = await import('../src/components/cash-actions.component.js?v=20260807-21');

storage.resetAppData();
seedTestAdmin(storage, keys);
storage.setItem(keys.categories, [{ id: 'doces', name: 'Doces', showInShowcase: true }]);
storage.setItem(keys.products, [
  { id: 'brigadeiro', name: 'Brigadeiro', categoryId: 'doces', price: 3.75, stock: 0, active: true },
  { id: 'bolo', name: 'Bolo', categoryId: 'doces', price: 8.9, stock: 0, active: true }
]);
// Saldo herdado de ontem; nenhum lancamento hoje.
showcase.adjustShowcaseStock({ operationId: 'ontem-brigadeiro', productId: 'brigadeiro', quantityAvailable: 48 });
showcase.adjustShowcaseStock({ operationId: 'ontem-bolo', productId: 'bolo', quantityAvailable: 4 });

assert.match(renderWriteOffModal(), /value="brigadeiro"/, 'perda oferece produto com saldo herdado');
const writeOff = estoque.createShowcaseWriteOff({ productId: 'brigadeiro', quantity: 3, reason: 'consumo-interno' });
assert.equal(writeOff.quantity, 3, 'perda de estoque herdado registrada');
assert.equal(showcase.getShowcaseStockByProductId('brigadeiro').quantityAvailable, 45, 'saldo baixa 3');
assert.throws(() => estoque.createShowcaseWriteOff({ productId: 'brigadeiro', quantity: 46, reason: 'quebra' }), /maior que o estoque disponivel/);

const alerts = notifications.getMobileFeedEvents({ now: new Date() }).filter((event) => event.title === 'Produto acabando');
assert.deepEqual(alerts.map((event) => event.description), ['Bolo: restam 4 unidade(s)'], 'alerta usa o saldo real');

assert.equal(getDashboardResumo({ period: 'today' }).vitrineEstimada, Math.round((45 * 3.75 + 4 * 8.9) * 100) / 100, 'vitrine estimada usa o saldo real');

const conference = closing.buildShowcaseConference({ brigadeiro: 45 });
const row = conference.find((item) => item.productId === 'brigadeiro');
assert.equal(row.expectedLeftoverQuantity, 45, 'sobra esperada no fechamento = saldo real');
assert.equal(row.differenceQuantity, 0);
console.log('showcase inherited stock ok');
