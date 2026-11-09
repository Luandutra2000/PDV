// Regressao (QA 2026-11, BUG-008): com o PDV aberto em duas abas do mesmo
// aparelho, a comanda e compartilhada. A aba A mostrava 1 item (R$ 5,55) e o
// pagamento cobrava R$ 11,10 porque a aba B tinha somado outra unidade.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
const windowListeners = {};
globalThis.window = { addEventListener: (type, handler) => { (windowListeners[type] ||= []).push(handler); }, location: { href: '', pathname: '/' }, matchMedia: () => ({ matches: false }) };
globalThis.document = { documentElement: { dataset: {} }, querySelectorAll: () => [] };

const storage = await import('../src/services/storage.service.js?v=20261109-01');
const schema = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const cashSession = await import('../src/services/cash-session.service.js?v=20261109-01');
const { initVendasModule } = await import('../src/modules/vendas/vendas.module.js?v=20261109-01');

seedTestAdmin(storage, schema.STORAGE_KEYS);
cashSession.openCashSession({ openingAmount: 0 });

const panel = { innerHTML: '' };
const container = {
  innerHTML: '',
  addEventListener() {},
  querySelector(selector) {
    if (selector === '.pdv-screen') return {};
    if (selector === '[data-order-panel]') return panel;
    return null;
  }
};
initVendasModule(container);
assert.ok(windowListeners.storage?.length, 'a frente de caixa escuta alteracoes feitas em outra aba');

// Outra aba grava uma comanda com 2 unidades.
store.set(schema.STORAGE_KEYS.activeComanda, JSON.stringify({ id: 'c-148', number: 148, status: 'aberta', items: [{ productId: 'qa-ultimo-item', name: 'QA Ultimo Item', unitPrice: 5.55, quantity: 2, total: 11.1 }] }));
windowListeners.storage.forEach((handler) => handler({ key: schema.STORAGE_KEYS.activeComanda }));
assert.match(panel.innerHTML, /Receber R\$\s?11,10/, 'o painel passa a mostrar o total que sera cobrado');
console.log('vendas other tab comanda ok');
