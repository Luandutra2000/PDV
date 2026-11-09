// Regressao (QA 2026-11, BUG-003): depois de abrir Produtos, cada venda
// (evento de estoque da vitrine) redesenhava a tela Produtos dentro da area de
// trabalho, por cima da Frente de caixa, e apagava a confirmacao da venda.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};
const { STORAGE_KEYS, UI_EVENTS } = await import('../src/database/schema.js?v=20260804-06');
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { emit } = await import('../src/services/event-bus.service.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs');
const sync = await import('../src/services/showcase-sync.service.js?v=20260804-06');
const { initProdutosModule } = await import('../src/modules/produtos/produtos.module.js?v=20260807-21');

seedTestAdmin(storage, STORAGE_KEYS);
storage.setItem(STORAGE_KEYS.categories, [{ id: 'qa', name: 'QA', showInShowcase: true }]);
storage.setItem(STORAGE_KEYS.products, [{ id: 'qa-produto', name: 'QA produto', categoryId: 'qa', price: 7.5, stock: 10, active: true }]);
await sync.processShowcaseProduction({ operationId: 'produce', productId: 'qa-produto', quantity: 10 });

const container = { innerHTML: '', addEventListener() {} };
initProdutosModule(container);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(container.innerHTML, /data-produtos-screen/, 'Produtos renderiza enquanto ativa');

// O operador volta para a Frente de caixa (mesmo container de trabalho).
const frenteDeCaixa = '<section class="pdv-screen fc">Frente de caixa<div class="sale-success-modal">Troco R$ 3,50</div></section>';
container.innerHTML = frenteDeCaixa;

await sync.processShowcaseSale({ operationId: 'sale', saleId: 'sale', items: [{ productId: 'qa-produto', unitPrice: 7.5, quantity: 1 }] });
emit(UI_EVENTS.productCatalogChanged, {});
emit(UI_EVENTS.productSyncStatusChanged, { state: 'synced' });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(container.innerHTML, frenteDeCaixa, 'eventos de catalogo/estoque nao podem trocar a tela ativa');

// Carregamento assincrono iniciado em Produtos tambem nao pode sobrescrever outra tela.
initProdutosModule(container);
container.innerHTML = frenteDeCaixa;
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(container.innerHTML, frenteDeCaixa, 'carregamento atrasado do catalogo nao pode trocar a tela ativa');

console.log('produtos inactive route ok');
