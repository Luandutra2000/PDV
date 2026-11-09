import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};

const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const storage = await import('../src/services/storage.service.js?v=20261109-01');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs');
const sync = await import('../src/services/showcase-sync.service.js?v=20261109-01');
const products = await import('../src/services/product.service.js?v=20261109-01');
const { initProdutosModule } = await import('../src/modules/produtos/produtos.module.js?v=20261109-01');

seedTestAdmin(storage, STORAGE_KEYS);
storage.setItem(STORAGE_KEYS.categories, [
  { id: 'lanches', name: 'Lanches', showInShowcase: true },
  { id: 'extra-x', name: 'Sobremesas', showInShowcase: false }
]);
storage.setItem(STORAGE_KEYS.products, [
  { id: 'p-ok', name: 'X-Burger', categoryId: 'lanches', price: 18.5, stock: 4, active: true },
  { id: 'p-zero', name: 'Pudim', categoryId: 'extra-x', price: 9, stock: 0, active: true },
  { id: 'p-off', name: 'Pastel antigo', categoryId: 'lanches', price: 6, stock: 0, active: false }
]);
await sync.processShowcaseProduction({ operationId: 'produce', productId: 'p-ok', quantity: 4 });

const handlers = {};
const container = { innerHTML: '', addEventListener: (event, handler) => { handlers[event] = handler; } };
initProdutosModule(container);
await new Promise((resolve) => setTimeout(resolve, 0));
const html = container.innerHTML;
const click = (dataset) => handlers.click({ target: { closest: () => ({ dataset }) } });

// Cabecalho novo
assert.match(html, /<h1[^>]*>Produtos<\/h1>/, 'screen title');
assert.match(html, /class="[^"]*\bui-head\b/, 'header uses ui-head');
assert.match(html, /Categorias, produtos, preços e o que aparece na vitrine\./, 'one-line subtitle');
assert.doesNotMatch(html, /Categorias \/ Abas|Catalogo|Gerencie categorias/, 'old headings are gone');
assert.match(html, /class="ui-btn"[^>]*data-action="new-category">Nova categoria</, 'Nova categoria is a common button');
assert.match(html, /class="ui-btn ui-btn--primary"[^>]*data-action="new-product">Novo produto</, 'Novo produto is the primary button');
assert.match(html, /class="ui-stats/, 'summary numbers use ui-stats');
assert.match(html, /Total de produtos/, 'summary numbers stay');

// Cartoes de categoria com a cor da categoria
assert.match(html, /<article class="pd-cat[^"]*" style="--c: var\(--cat-lanches\)"/, 'fixed category card carries its colour');
assert.match(html, /<article class="pd-cat[^"]*" style="--c: var\(--cat-extra-\d\)"/, 'custom category card carries an extra colour');
assert.match(html, /2 produtos/, 'category card shows the product count');
assert.match(html, /Aparece na vitrine/, 'category visible in showcase');
assert.match(html, /Oculta/, 'category hidden from showcase');
assert.match(html, /data-action="edit-category"[^>]*>Editar</, 'category Editar button');
assert.match(html, /data-action="delete-category"[^>]*>Apagar</, 'category Apagar button');

// Tabela de produtos
assert.match(html, /<table class="ui-table/, 'products table');
assert.match(html, /<span class="ui-stripe" style="--c: var\(--cat-lanches\)"><\/span><b>X-Burger<\/b>/, 'row stripe uses the category colour');
assert.match(html, /<td class="r pd-stock" data-product-stock>4<\/td>/, 'stock with units is plain');
assert.match(html, /<td class="r pd-stock is-minus" data-product-stock>0<\/td>/, 'zero stock uses the red class');
assert.match(html, /<span class="ui-pill ui-pill--ok">Ativo<\/span>/, 'active product pill');
assert.match(html, /<span class="ui-pill">Inativo<\/span>/, 'inactive product pill is neutral');
assert.match(html, /<span class="ui-pill ui-pill--ok">Aparece<\/span>/, 'product shown in showcase');
assert.match(html, /<span class="ui-pill">Oculto<\/span>/, 'product hidden from showcase');
assert.match(html, /data-products-filter/, 'search filter hook');
assert.match(html, /data-category-filter/, 'category filter hook');
assert.match(html, /data-status-filter/, 'status filter hook');

// Apagar fica no menu da linha e continua pedindo confirmacao
const menu = html.match(/<details class="pd-menu"[\s\S]*?<\/details>/);
assert.ok(menu, 'row menu exists');
assert.match(menu[0], /data-action="delete-product" data-product-id="p-ok"[^>]*>Apagar</, 'Apagar lives in the row menu');
assert.match(html, /data-action="edit-product" data-product-id="p-ok"[^>]*>Editar</, 'row Editar button');
await click({ action: 'delete-product', productId: 'p-ok' });
assert.match(container.innerHTML, /data-action="confirm-delete-product"/, 'Apagar still asks for confirmation');
assert.ok(products.getProducts().some((product) => product.id === 'p-ok'), 'requesting deletion keeps the product');
await click({ action: 'cancel-delete-catalog' });

console.log('produtos markup ok');
