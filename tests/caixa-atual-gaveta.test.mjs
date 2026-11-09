// Regressao (QA 2026-11, BUG-012): "Caixa atual" somava Pix e cartoes
// (R$ 1.414,35 exibido com R$ 759,70 na gaveta).
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
const disk = new Map();
globalThis.localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k), clear: () => disk.clear() };
const storage = await import('../src/services/storage.service.js?v=20261109-01');
const { STORAGE_KEYS: keys } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const cashSession = await import('../src/services/cash-session.service.js?v=20261109-01');
const comanda = await import('../src/services/comanda.service.js?v=20261109-01');
const transactions = await import('../src/services/transaction.service.js?v=20261109-01');
const { getDashboardResumo } = await import('../src/services/dashboard-resumo.service.js?v=20261109-01');

storage.resetAppData();
seedTestAdmin(storage, keys);
cashSession.openCashSession({ openingAmount: 150 });
comanda.addItemQuantity({ id: 'a', name: 'A', price: 100 }, 1);
transactions.finalizeComandaPayment({ paymentMethod: 'pix' });
comanda.addItemQuantity({ id: 'b', name: 'B', price: 20 }, 1);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 50 });
transactions.registerCashMovement({ type: 'saida', amount: 12.3, description: 'Guardanapos' });

const resumo = getDashboardResumo({ period: 'today' });
assert.equal(resumo.totalVendido, 120);
assert.equal(resumo.caixaAtual, 157.7, 'gaveta = troco 150 + dinheiro 20 - saida 12,30 (Pix fora)');

const modal = fs.readFileSync(new URL('../src/components/fechamento-rapido-modal.component.js', import.meta.url), 'utf8');
assert.match(modal, /\['Caixa atual', formatCurrency\(closingSummary\.payments\?\.expectedCash/, 'Fechamento rapido mostra a gaveta em Caixa atual');
console.log('caixa atual gaveta ok');
