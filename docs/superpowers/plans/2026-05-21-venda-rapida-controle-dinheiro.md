# Venda Rapida e Controle do Dinheiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar a velocidade da Frente de Caixa sem alterar a comanda e deixar o resumo/conferencia do dinheiro mais claros.

**Architecture:** A comanda continua sendo o estado central do pedido. Busca, favoritos, ranking, quantidade rapida e resumo financeiro ficam em services existentes; os modulos de tela apenas renderizam e disparam acoes.

**Tech Stack:** HTML, CSS modular, JavaScript ES modules, localStorage, testes `.mjs` executados com `node`.

---

## File Structure

- Modify: `src/database/mock-data.js`
  - Add optional `aliases` and `favorite` to selected mock products so the fast-sale UI has useful seed data.
- Modify: `src/services/product.service.js`
  - Preserve optional product metadata.
  - Search by product name, category name, and aliases.
  - Expose favorite products.
- Modify: `tests/product-service.test.mjs`
  - Cover aliases, category search, favorite filtering, and preservation of optional metadata.
- Modify: `src/services/comanda.service.js`
  - Add `addItemQuantity(product, quantity)` for card quick actions without changing comanda shape.
- Modify: `tests/transaction-service.test.mjs`
  - Cover quantity add behavior, daily money summary, payment totals, and cancellation exclusion.
- Modify: `src/services/transaction.service.js`
  - Add daily money summary helpers.
  - Keep canceled transactions out of active totals.
- Modify: `src/components/product-card.component.js`
  - Add compact quick quantity buttons while keeping card click as add-one behavior.
- Modify: `src/modules/vendas/vendas.module.js`
  - Render access-quick strip, special filters, manual quantity modal, and simpler payment method buttons.
- Modify: `src/modules/dashboard/dashboard.module.js`
  - Render clearer daily money summary and transaction status/type details.
- Modify: `src/modules/caixa/caixa.module.js`
  - Render a clearer money conference block in confirmation.
- Modify: `src/styles/cards.css`, `src/styles/forms.css`, `src/styles/pdv.css`
  - Style access-quick strip, quick quantity controls, payment buttons, and money summary blocks.

---

### Task 1: Product Search Metadata

**Files:**
- Modify: `src/database/mock-data.js`
- Modify: `src/services/product.service.js`
- Test: `tests/product-service.test.mjs`

- [ ] **Step 1: Add failing product-service assertions**

Append these assertions before the final `console.log` in `tests/product-service.test.mjs`:

```js
const aliasProduct = products.createProduct({
  name: 'Coxinha Especial',
  categoryId: 'lanches',
  price: 9,
  cost: 4,
  stock: 12,
  active: true,
  aliases: ['cox', 'salgado'],
  favorite: true
});

assert(products.getProductById(aliasProduct.id).aliases.includes('cox'), 'product aliases should be persisted');
assert(products.getProductById(aliasProduct.id).favorite === true, 'product favorite flag should be persisted');
assert(products.searchProducts({ query: 'cox' }).some((product) => product.id === aliasProduct.id), 'search should match aliases');
assert(products.searchProducts({ query: 'salgado' }).some((product) => product.id === aliasProduct.id), 'search should match aliases with business terms');
assert(products.searchProducts({ query: 'lanches' }).some((product) => product.id === aliasProduct.id), 'search should match category name');
assert(products.getFavoriteProducts().some((product) => product.id === aliasProduct.id), 'favorite products should be returned');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests\product-service.test.mjs
```

Expected: FAIL because `getFavoriteProducts` does not exist or aliases/favorites are not preserved.

- [ ] **Step 3: Preserve metadata and broaden search**

In `src/services/product.service.js`, update `searchProducts`, add `getFavoriteProducts`, and update `normalizeProduct`:

```js
export function searchProducts({ query = '', categoryId = 'todos' } = {}) {
  const normalizedQuery = normalizeSearchText(query);
  const categoriesById = new Map(getCategories().map((category) => [category.id, category.name]));

  return getActiveProducts().filter((product) => {
    const matchesCategory = categoryId === 'todos'
      || product.categoryId === categoryId
      || (categoryId === 'favoritos' && product.favorite);
    const categoryName = categoriesById.get(product.categoryId) || '';
    const searchableText = normalizeSearchText([
      product.name,
      categoryName,
      ...(product.aliases || [])
    ].join(' '));
    const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);

    return matchesCategory && matchesQuery;
  });
}

export function getFavoriteProducts() {
  return getActiveProducts().filter((product) => product.favorite);
}
```

```js
function normalizeProduct(product) {
  return {
    id: product.id,
    name: String(product.name || '').trim(),
    categoryId: product.categoryId || 'lanches',
    price: Number(product.price) || 0,
    cost: Number(product.cost) || 0,
    stock: Number(product.stock) || 0,
    active: Boolean(product.active),
    aliases: Array.isArray(product.aliases)
      ? product.aliases.map((alias) => String(alias).trim()).filter(Boolean)
      : [],
    favorite: Boolean(product.favorite)
  };
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
```

In `src/database/mock-data.js`, update selected products:

```js
{ id: 'x-burger', name: 'X-Burger', categoryId: 'lanches', price: 16, cost: 8.5, stock: 24, active: true, aliases: ['xb', 'hamburguer'], favorite: true },
{ id: 'batata-frita', name: 'Batata Frita', categoryId: 'porcoes', price: 14, cost: 6, stock: 18, active: true, aliases: ['batata', 'porcao'], favorite: true },
{ id: 'refrigerante-lata', name: 'Refrigerante Lata', categoryId: 'bebidas', price: 6, cost: 3.2, stock: 48, active: true, aliases: ['refri', 'lata'], favorite: true },
{ id: 'combo-casal', name: 'Combo Casal', categoryId: 'combos', price: 48, cost: 25, stock: 8, active: true, aliases: ['combo'], favorite: true },
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests\product-service.test.mjs
```

Expected: PASS and prints `product service crud ok`.

- [ ] **Step 5: Commit**

```powershell
git add src\database\mock-data.js src\services\product.service.js tests\product-service.test.mjs
git commit -m "feat: improve product search metadata"
```

---

### Task 2: Quick Quantity and Money Summary Services

**Files:**
- Modify: `src/services/comanda.service.js`
- Modify: `src/services/transaction.service.js`
- Test: `tests/transaction-service.test.mjs`

- [ ] **Step 1: Add failing service assertions**

In `tests/transaction-service.test.mjs`, import and use `addItemQuantity` by changing the comanda import usage to:

```js
const comandas = await import('../src/services/comanda.service.js');
```

Append these assertions before the final `console.log`:

```js
comandas.clearComanda();
comandas.addItemQuantity(products.getProductById('refrigerante-lata'), 5);
const quickItem = comandas.getActiveComanda().items.find((item) => item.productId === 'refrigerante-lata');
assert(quickItem.quantity === 5, 'quick quantity should add requested amount');
assert(quickItem.total === 30, 'quick quantity should calculate total');

const dailyMoney = transactions.getDailyMoneySummary();
assert(dailyMoney.salesTotal === 44, 'daily money should ignore canceled sale');
assert(dailyMoney.entriesTotal === 10, 'daily money should ignore canceled entry');
assert(dailyMoney.outputsTotal === 3, 'daily money should include active outputs');
assert(dailyMoney.expectedCash === 7, 'expected cash should be active cash sales plus entries minus outputs');
assert(dailyMoney.paymentTotals.pix === 44, 'pix total should include active pix sale');
assert(dailyMoney.paymentTotals.dinheiro === 0, 'cash sale total should ignore canceled cash sale');
assert(dailyMoney.netTotal === 51, 'net total should be sales plus entries minus outputs');
assert(dailyMoney.canceledComandas === 1, 'daily money should count canceled comandas');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: FAIL because `addItemQuantity` or `getDailyMoneySummary` does not exist.

- [ ] **Step 3: Add quantity helper**

In `src/services/comanda.service.js`, add this export after `addItem`:

```js
export function addItemQuantity(product, quantity = 1) {
  const normalizedQuantity = Number(quantity);

  if (!product) {
    console.warn('Produto inexistente. Item nao adicionado a comanda.');
    return getActiveComanda();
  }

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    throw new Error('Quantidade precisa ser maior que zero.');
  }

  const comanda = getActiveComanda();
  const existingItem = comanda.items.find((item) => item.productId === product.id);

  if (existingItem) {
    existingItem.quantity += normalizedQuantity;
    existingItem.total = existingItem.quantity * existingItem.unitPrice;
  } else {
    comanda.items.push({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: normalizedQuantity,
      total: product.price * normalizedQuantity
    });
  }

  comanda.updatedAt = new Date().toISOString();
  saveComanda(comanda);
  emit(SYNC_EVENTS.comandaItemAdded, { comandaId: comanda.id, productId: product.id, quantity: normalizedQuantity, comanda });

  return comanda;
}
```

- [ ] **Step 4: Add money summary helpers**

In `src/services/transaction.service.js`, add these exports before `getTransactionSummary`:

```js
export function getActiveTransactions() {
  return getTransactions().filter((transaction) => transaction.status !== 'cancelada');
}

export function getPaymentMethodTotals() {
  const sales = getActiveTransactions().filter((transaction) => transaction.type === 'venda');

  return {
    dinheiro: sumPaymentMethod(sales, 'dinheiro'),
    pix: sumPaymentMethod(sales, 'pix'),
    debito: sumPaymentMethod(sales, 'debito'),
    credito: sumPaymentMethod(sales, 'credito')
  };
}

export function getDailyMoneySummary() {
  const activeTransactions = getActiveTransactions();
  const entriesTotal = sumByType(activeTransactions, 'entrada');
  const salesTotal = sumByType(activeTransactions, 'venda');
  const outputsTotal = sumByType(activeTransactions, 'saida');
  const paymentTotals = getPaymentMethodTotals();

  return {
    salesTotal,
    entriesTotal,
    outputsTotal,
    paymentTotals,
    expectedCash: paymentTotals.dinheiro + entriesTotal - outputsTotal,
    netTotal: salesTotal + entriesTotal - outputsTotal,
    closedComandas: getClosedComandas().filter((comanda) => comanda.status !== 'cancelada').length,
    canceledComandas: getClosedComandas().filter((comanda) => comanda.status === 'cancelada').length
  };
}
```

Add this helper near `sumByType`:

```js
function sumPaymentMethod(sales, paymentMethod) {
  return sales
    .filter((sale) => sale.paymentMethod === paymentMethod)
    .reduce((total, sale) => total + Number(sale.total || 0), 0);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: PASS and prints `transaction service ok`.

- [ ] **Step 6: Commit**

```powershell
git add src\services\comanda.service.js src\services\transaction.service.js tests\transaction-service.test.mjs
git commit -m "feat: add quick sale service helpers"
```

---

### Task 3: Fast Sale UI

**Files:**
- Modify: `src/components/product-card.component.js`
- Modify: `src/modules/vendas/vendas.module.js`
- Modify: `src/styles/cards.css`
- Modify: `src/styles/forms.css`
- Modify: `src/styles/pdv.css`

- [ ] **Step 1: Update product card markup**

Replace `renderProductCard` in `src/components/product-card.component.js` with:

```js
import { formatCurrency } from '../utils/currency.js';

export function renderProductCard(product, categoryName = '') {
  return `
    <article class="product-card" data-product-card data-product-id="${product.id}">
      <button class="product-card__main" type="button" data-action="add-product" data-product-id="${product.id}">
        <span>
          <h3 class="product-card__name">${product.name}</h3>
          <span class="product-card__meta">${categoryName} - Estoque ${product.stock}</span>
        </span>
        <strong class="product-card__price">${formatCurrency(product.price)}</strong>
      </button>
      <div class="product-card__quick-actions" aria-label="Acoes rapidas">
        <button type="button" data-action="quick-add" data-product-id="${product.id}" data-quantity="2">+2</button>
        <button type="button" data-action="quick-add" data-product-id="${product.id}" data-quantity="5">+5</button>
        <button type="button" data-action="open-quantity" data-product-id="${product.id}">Qtd</button>
      </div>
    </article>
  `;
}
```

- [ ] **Step 2: Update vendas imports and state**

In `src/modules/vendas/vendas.module.js`, change imports:

```js
import { getActiveComanda, addItem, addItemQuantity, clearComanda, removeItem, updateQuantity } from '../../services/comanda.service.js';
import { getCategories, getFavoriteProducts, getProductById, searchProducts } from '../../services/product.service.js';
import { finalizeComandaPayment, getBestSellingProducts, registerCashMovement } from '../../services/transaction.service.js';
```

Update `state`:

```js
const state = {
  query: '',
  categoryId: 'todos',
  modal: null,
  paymentMethod: 'dinheiro',
  quantityProductId: null
};
```

- [ ] **Step 3: Render access quick strip and special filters**

In `renderScreen`, insert this line between the header and `<section class="products-panel">`:

```js
        ${renderQuickAccess()}
```

Replace `renderCategories` with:

```js
function renderCategories(container) {
  const target = qs('[data-category-tabs]', container);
  const categories = [
    { id: 'todos', name: 'Todos' },
    { id: 'mais-vendidos', name: 'Mais vendidos' },
    { id: 'favoritos', name: 'Favoritos' },
    ...getCategories().filter((category) => category.id !== 'todos')
  ];

  target.innerHTML = categories.map((category) => `
    <button
      class="category-tab ${category.id === state.categoryId ? 'is-active' : ''}"
      type="button"
      data-category-id="${category.id}"
    >
      ${category.name}
    </button>
  `).join('');
}
```

Add this function after `renderCategories`:

```js
function renderQuickAccess() {
  const favorites = getFavoriteProducts().slice(0, 4);
  const bestSellers = getBestSellingProducts().slice(0, 4)
    .map((item) => getProductById(item.productId))
    .filter(Boolean);
  const quickProducts = [...favorites, ...bestSellers]
    .filter((product, index, list) => list.findIndex((item) => item.id === product.id) === index)
    .slice(0, 6);

  if (!quickProducts.length) {
    return '';
  }

  return `
    <section class="quick-access" aria-label="Acesso rapido">
      <div class="quick-access__header">
        <strong>Acesso rapido</strong>
        <span>Favoritos e mais vendidos</span>
      </div>
      <div class="quick-access__list">
        ${quickProducts.map((product) => `
          <button class="quick-access__item" type="button" data-action="add-product" data-product-id="${product.id}">
            <span>${product.name}</span>
            <strong>${formatCurrency(product.price)}</strong>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}
```

- [ ] **Step 4: Update product filtering**

Replace `renderProducts` with:

```js
function renderProducts(container) {
  const target = qs('[data-product-grid]', container);
  const categories = getCategories();
  const products = getVisibleProducts();

  if (!products.length) {
    target.innerHTML = '<div class="empty-products">Nenhum produto encontrado.</div>';
    return;
  }

  target.innerHTML = products.map((product) => {
    const category = categories.find((item) => item.id === product.categoryId);
    return renderProductCard(product, category ? category.name : 'Sem categoria');
  }).join('');
}

function getVisibleProducts() {
  if (state.categoryId === 'mais-vendidos') {
    return getBestSellingProducts()
      .map((item) => getProductById(item.productId))
      .filter(Boolean)
      .filter((product) => !state.query || searchProducts({ query: state.query }).some((item) => item.id === product.id));
  }

  return searchProducts({ query: state.query, categoryId: state.categoryId });
}
```

- [ ] **Step 5: Update click actions**

In `bindEvents`, replace the old `productButton` block with action handling:

```js
    if (actionButton?.dataset.action === 'add-product') {
      const product = getProductById(actionButton.dataset.productId);
      addItem(product);
      renderComanda(container);
      return;
    }

    if (actionButton?.dataset.action === 'quick-add') {
      try {
        const product = getProductById(actionButton.dataset.productId);
        addItemQuantity(product, actionButton.dataset.quantity);
        renderComanda(container);
      } catch (error) {
        showNotification({
          title: 'Quantidade invalida',
          message: error.message || 'Informe uma quantidade maior que zero.',
          type: 'danger'
        });
      }
      return;
    }

    if (actionButton?.dataset.action === 'open-quantity') {
      state.modal = 'quantity';
      state.quantityProductId = actionButton.dataset.productId;
      renderModal(container);
      return;
    }
```

Keep the existing `handleOrderAction(actionButton, container);` after these early returns.

- [ ] **Step 6: Add quantity modal**

In `renderModal`, add before the payment branch:

```js
  if (state.modal === 'quantity') {
    target.innerHTML = renderQuantityModal();
    return;
  }
```

Add this function before `renderWriteOffModal`:

```js
function renderQuantityModal() {
  const product = getProductById(state.quantityProductId);

  if (!product) {
    return '';
  }

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>Adicionar quantidade</h2>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        <form class="product-form" data-quantity-form>
          <div class="payment-total">
            <span>${product.name}</span>
            <strong>${formatCurrency(product.price)}</strong>
          </div>
          <label class="stacked-label">
            Quantidade
            <input class="field" name="quantity" type="number" min="1" step="1" value="1" required>
          </label>
          <div class="form-actions">
            <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
            <button class="button" type="submit">Adicionar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
```

In submit handling, add:

```js
    if (event.target.matches('[data-quantity-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);

      try {
        addItemQuantity(getProductById(state.quantityProductId), data.get('quantity'));
        state.modal = null;
        state.quantityProductId = null;
        renderComanda(container);
        renderModal(container);
      } catch (error) {
        showNotification({
          title: 'Quantidade invalida',
          message: error.message || 'Informe uma quantidade maior que zero.',
          type: 'danger'
        });
      }
    }
```

- [ ] **Step 7: Make payment methods button-like**

In `renderPaymentModal`, change the `<fieldset class="payment-methods">` inner labels to:

```js
${['dinheiro', 'debito', 'credito', 'pix'].map((method) => `
  <label class="payment-method ${state.paymentMethod === method ? 'is-selected' : ''}">
    <input type="radio" name="paymentMethod" value="${method}" ${state.paymentMethod === method ? 'checked' : ''}>
    ${getPaymentLabel(method)}
  </label>
`).join('')}
```

- [ ] **Step 8: Add CSS**

Append to `src/styles/cards.css`:

```css
.product-card__main {
  width: 100%;
  min-height: 92px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  text-align: left;
}

.product-card__quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 12px;
}

.product-card__quick-actions button {
  min-height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font-weight: 800;
}
```

Append to `src/styles/pdv.css`:

```css
.quick-access {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}

.quick-access__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.quick-access__header span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.quick-access__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.quick-access__item {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 10px 12px;
  text-align: left;
  font-weight: 800;
}

.payment-method {
  cursor: pointer;
}

.payment-method.is-selected {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
}
```

- [ ] **Step 9: Run service tests**

Run:

```powershell
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
```

Expected: both PASS.

- [ ] **Step 10: Commit**

```powershell
git add src\components\product-card.component.js src\modules\vendas\vendas.module.js src\styles\cards.css src\styles\pdv.css
git commit -m "feat: add fast sale controls"
```

---

### Task 4: Dashboard Money Summary

**Files:**
- Modify: `src/modules/dashboard/dashboard.module.js`
- Modify: `src/styles/pdv.css`

- [ ] **Step 1: Import daily summary**

In `src/modules/dashboard/dashboard.module.js`, add `getDailyMoneySummary` to the transaction imports:

```js
  getDailyMoneySummary,
```

- [ ] **Step 2: Render clearer summary cards**

In `renderDashboard`, add:

```js
  const moneySummary = getDailyMoneySummary();
```

Replace the current `summary-grid` block with:

```js
      <div class="summary-grid money-summary-grid">
        ${renderSummaryCard('Total vendido', moneySummary.salesTotal)}
        ${renderSummaryCard('Dinheiro esperado', moneySummary.expectedCash)}
        ${renderSummaryCard('Pix', moneySummary.paymentTotals.pix)}
        ${renderSummaryCard('Debito', moneySummary.paymentTotals.debito)}
        ${renderSummaryCard('Credito', moneySummary.paymentTotals.credito)}
        ${renderSummaryCard('Entradas', moneySummary.entriesTotal)}
        ${renderSummaryCard('Saidas', moneySummary.outputsTotal)}
        ${renderSummaryCard('Saldo liquido', moneySummary.netTotal)}
        <article class="summary-card"><span>Comandas canceladas</span><strong>${moneySummary.canceledComandas}</strong></article>
      </div>
```

- [ ] **Step 3: Make transaction rows clearer**

In `renderTransactions`, replace the `<span>` inside the left `<div>` with:

```js
        <span>${transaction.status === 'cancelada' ? 'Cancelada' : getTransactionDetail(transaction)}</span>
```

Add this helper near `getMoneyTitle`:

```js
function getTransactionDetail(transaction) {
  const pieces = [
    getTransactionLabel(transaction.type),
    transaction.paymentMethod ? getPaymentLabel(transaction.paymentMethod) : '',
    transaction.description || '',
    transaction.comandaNumber ? `Comanda ${formatComandaNumber(transaction.comandaNumber)}` : ''
  ].filter(Boolean);

  return pieces.join(' - ') || 'Sem descricao';
}
```

- [ ] **Step 4: Add CSS**

Append to `src/styles/pdv.css`:

```css
.money-summary-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
```

- [ ] **Step 5: Run service tests**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src\modules\dashboard\dashboard.module.js src\styles\pdv.css
git commit -m "feat: clarify daily money dashboard"
```

---

### Task 5: Caixa Confirmation Clarity

**Files:**
- Modify: `src/modules/caixa/caixa.module.js`
- Modify: `src/styles/pdv.css`

- [ ] **Step 1: Add money conference renderer**

In `src/modules/caixa/caixa.module.js`, add this function after `renderConfirm`:

```js
function renderMoneyConference(summary) {
  const paymentRows = [
    {
      label: 'Pix',
      expected: summary.payments.expectedPix,
      checked: summary.payments.checkedPix,
      difference: summary.payments.pixDifference
    },
    {
      label: 'Debito',
      expected: summary.payments.expectedDebit,
      checked: summary.payments.checkedDebit,
      difference: summary.payments.debitDifference
    },
    {
      label: 'Credito',
      expected: summary.payments.expectedCredit,
      checked: summary.payments.checkedCredit,
      difference: summary.payments.creditDifference
    }
  ];

  return `
    <section class="manager-section money-conference">
      <header class="manager-section__header">
        <strong>Conferencia do dinheiro</strong>
        <span>Dinheiro esperado = vendas em dinheiro + entradas - saidas</span>
      </header>
      <div class="summary-grid money-summary-grid">
        ${renderSummaryCard('Vendas em dinheiro', summary.payments.expectedCash - summary.totals.entries + summary.totals.outputs)}
        ${renderSummaryCard('Entradas', summary.totals.entries)}
        ${renderSummaryCard('Saidas', summary.totals.outputs)}
        ${renderSummaryCard('Dinheiro esperado', summary.payments.expectedCash)}
        ${renderSummaryCard('Dinheiro contado', summary.payments.countedCash)}
        ${renderSummaryCard('Diferenca', summary.payments.cashDifference)}
      </div>
      <div class="payment-conference-grid">
        ${paymentRows.map((row) => `
          <article class="payment-conference-card">
            <span>${row.label}</span>
            <strong>${formatCurrency(row.expected)}</strong>
            <small>${row.checked === null ? 'Nao conferido' : `Conferido: ${formatCurrency(row.checked)}`}</small>
            <small>Diferenca: ${row.difference === null ? '-' : formatCurrency(row.difference)}</small>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}
```

- [ ] **Step 2: Use renderer in confirmation**

In `renderConfirm`, insert this line between `${renderSummary(summary)}` and the existing confirmation `manager-section`:

```js
    ${renderMoneyConference(summary)}
```

- [ ] **Step 3: Add CSS**

Append to `src/styles/pdv.css`:

```css
.money-conference {
  margin-top: 16px;
}

.payment-conference-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.payment-conference-card {
  display: grid;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 12px;
}

.payment-conference-card span,
.payment-conference-card small {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.payment-conference-card strong {
  font-size: 18px;
}
```

- [ ] **Step 4: Run cash closing tests**

Run:

```powershell
node tests\cash-closing-service.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src\modules\caixa\caixa.module.js src\styles\pdv.css
git commit -m "feat: clarify cash closing conference"
```

---

### Task 6: Full Verification

**Files:**
- Verify: `tests/product-service.test.mjs`
- Verify: `tests/transaction-service.test.mjs`
- Verify: `tests/cash-closing-service.test.mjs`
- Verify: `tests/estoque-service.test.mjs`
- Verify: browser/manual app flow

- [ ] **Step 1: Run all tests**

Run:

```powershell
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
node tests\estoque-service.test.mjs
node tests\cash-closing-service.test.mjs
```

Expected: all commands PASS.

- [ ] **Step 2: Start local server**

Run:

```powershell
$python = 'C:\Users\luand\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'; $existing = Get-NetTCPConnection -LocalPort 5500 -ErrorAction SilentlyContinue; if (-not $existing) { $p = Start-Process -FilePath $python -ArgumentList @('-m','http.server','5500','--bind','127.0.0.1') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru; $p.Id | Set-Content -LiteralPath '.local-server-5500.pid'; Start-Sleep -Seconds 2 }; try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5500/' -TimeoutSec 5).StatusCode } catch { $_.Exception.Message }
```

Expected: `200`.

- [ ] **Step 3: Manual browser verification**

Open `http://127.0.0.1:5500/` and verify:

- Frente de Caixa renders.
- Acesso rapido appears when favorites or sales exist.
- Search finds products by alias such as `refri`.
- Search finds products by category such as `bebidas`.
- Normal card click adds 1 item.
- `+2` and `+5` add the correct quantity.
- Manual quantity modal adds the typed quantity.
- Payment modal shows button-like methods and keeps total visible.
- Cash payment calculates change.
- Pix/card payment finalizes directly after selection.
- Dashboard shows daily money summary cards.
- Canceling a comanda removes it from active totals and increments canceled count.
- Fechar Caixa confirmation shows the money formula and separated Pix/Debito/Credito blocks.

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short
```

Expected: only expected local server logs or no changes. No source file should remain unstaged.

- [ ] **Step 5: Commit verification notes only if files changed**

If verification required code or doc corrections, commit them:

```powershell
git add src\database\mock-data.js src\services\product.service.js src\services\comanda.service.js src\services\transaction.service.js src\components\product-card.component.js src\modules\vendas\vendas.module.js src\modules\dashboard\dashboard.module.js src\modules\caixa\caixa.module.js src\styles\cards.css src\styles\forms.css src\styles\pdv.css tests\product-service.test.mjs tests\transaction-service.test.mjs
git commit -m "fix: polish fast sales verification"
```

If no files changed, do not create an empty commit.

---

## Self-Review

- Spec coverage:
  - Venda rapida: Tasks 1, 2, and 3 cover aliases, favorites, best-seller access, quantity quick actions, and direct payment UI.
  - Controle do dinheiro: Tasks 2, 4, and 5 cover active totals, payment method totals, daily dashboard summary, and closing conference clarity.
  - Tests and verification: Tasks 1, 2, 5, and 6 cover service tests and manual app verification.
- Placeholder scan:
  - No forbidden placeholder markers, undefined task references, or open implementation blanks are intentionally left in this plan.
- Type consistency:
  - Product metadata uses `aliases` and `favorite`.
  - Quantity helper is consistently `addItemQuantity(product, quantity)`.
  - Money helper is consistently `getDailyMoneySummary()`.
  - Payment totals use `dinheiro`, `pix`, `debito`, and `credito`.
