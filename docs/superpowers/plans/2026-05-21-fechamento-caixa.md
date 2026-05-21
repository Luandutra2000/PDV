# Fechamento de Caixa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guided cash closing flow that reconciles sales, payment methods, showcase stock, write-offs, leftovers, differences, and closing history.

**Architecture:** Keep domain math in services and keep modules focused on rendering and event wiring. `estoque.service.js` owns showcase launches and write-offs, `cash-closing.service.js` owns closing summaries/history, and `caixa.module.js` renders the guided workflow and history using existing CSS patterns.

**Tech Stack:** Vanilla ES modules, HTML/CSS, localStorage via `storage.service.js`, Node `.mjs` service tests.

---

## File Map

- Modify `src/database/schema.js`: add storage keys for closings, closing draft, and showcase write-offs.
- Modify `src/services/storage.service.js`: seed/reset the new localStorage arrays.
- Modify `src/services/estoque.service.js`: add vitrine write-off creation, validation, summaries, and comparison fields.
- Create `src/services/cash-closing.service.js`: calculate payment/vitrine closing data, save draft, confirm closing, read history, and find sales after closing.
- Modify `src/modules/vendas/vendas.module.js`: replace item-avulso action with Perda / Consumo modal.
- Modify `src/components/product-card.component.js`: remove or stop using item-avulso card if it only exists for the old button/card flow.
- Modify `src/modules/caixa/caixa.module.js`: replace placeholder with Fechamento atual and Historico UI.
- Modify `src/app.js`: map `fechar-caixa` to `initCaixaModule`.
- Modify `src/styles/pdv.css`: add focused styles for closing workflow, history table, and write-off modal pieces.
- Test `tests/estoque-service.test.mjs`: cover write-offs.
- Create `tests/cash-closing-service.test.mjs`: cover closing calculations/history.

## Task 1: Storage Keys and Showcase Write-Offs

**Files:**
- Modify: `src/database/schema.js`
- Modify: `src/services/storage.service.js`
- Modify: `src/services/estoque.service.js`
- Modify: `tests/estoque-service.test.mjs`

- [ ] **Step 1: Add failing write-off tests**

Append this block to `tests/estoque-service.test.mjs` after the existing hidden-product assertions and before `console.log('estoque service ok');`:

```js
storage.resetAppData();
const writeOffProduct = products.getProductById('x-burger');
estoque.createStockLaunch({
  produtoId: writeOffProduct.id,
  quantidade: 5
});

const todayProducts = estoque.getTodayShowcaseProducts();
assert(todayProducts.some((item) => item.id === writeOffProduct.id), 'today showcase products should include launched products');

const writeOff = estoque.createShowcaseWriteOff({
  productId: writeOffProduct.id,
  quantity: 2,
  reason: 'consumo-interno',
  note: ''
});

assert(writeOff.productId === writeOffProduct.id, 'write-off should store product id');
assert(writeOff.quantity === 2, 'write-off should store quantity');
assert(writeOff.unitValue === writeOffProduct.price, 'write-off should store current product price');
assert(writeOff.totalValue === writeOffProduct.price * 2, 'write-off should calculate total estimated value');

const writeOffSummary = estoque.getShowcaseWriteOffSummary();
assert(writeOffSummary.get(writeOffProduct.id).quantity === 2, 'write-off summary should group quantity by product');
assert(writeOffSummary.get(writeOffProduct.id).totalValue === writeOffProduct.price * 2, 'write-off summary should group value by product');

const comparisonWithWriteOff = estoque.getProductionSalesComparison();
assert(comparisonWithWriteOff[0].quantidadeBaixada === 2, 'comparison should include write-off quantity');
assert(comparisonWithWriteOff[0].valorBaixado === writeOffProduct.price * 2, 'comparison should include write-off value');
assert(comparisonWithWriteOff[0].sobraQuantidade === 3, 'comparison should subtract write-offs from leftover');

let rejectedMissingLaunch = false;
try {
  estoque.createShowcaseWriteOff({
    productId: 'agua',
    quantity: 1,
    reason: 'quebra'
  });
} catch (error) {
  rejectedMissingLaunch = error.message === 'Produto sem lancamento de vitrine no periodo.';
}
assert(rejectedMissingLaunch, 'write-off should reject product without showcase launch today');

let rejectedTooLarge = false;
try {
  estoque.createShowcaseWriteOff({
    productId: writeOffProduct.id,
    quantity: 10,
    reason: 'quebra'
  });
} catch (error) {
  rejectedTooLarge = error.message === 'Quantidade maior que a sobra disponivel na vitrine.';
}
assert(rejectedTooLarge, 'write-off should reject quantity greater than available showcase leftover');
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
node tests\estoque-service.test.mjs
```

Expected: fail with `estoque.getTodayShowcaseProducts is not a function`.

- [ ] **Step 3: Add storage keys**

Update `src/database/schema.js`:

```js
export const STORAGE_KEYS = {
  products: 'pdv.products',
  categories: 'pdv.categories',
  activeComanda: 'pdv.activeComanda',
  caixa: 'pdv.caixa',
  transactions: 'pdv.transactions',
  closedComandas: 'pdv.closedComandas',
  stockLaunches: 'pdv.stockLaunches',
  hiddenStockComparisons: 'pdv.hiddenStockComparisons',
  cashClosings: 'pdv.cashClosings',
  cashClosingDraft: 'pdv.cashClosingDraft',
  showcaseWriteOffs: 'pdv.showcaseWriteOffs',
  syncQueue: 'pdv.syncQueue'
};
```

Keep `SYNC_EVENTS` unchanged in this task.

- [ ] **Step 4: Seed and reset new keys**

In `src/services/storage.service.js`, add these checks to `ensureSeedData()` after `hiddenStockComparisons`:

```js
  if (!getItem(STORAGE_KEYS.cashClosings)) {
    setItem(STORAGE_KEYS.cashClosings, []);
  }

  if (!getItem(STORAGE_KEYS.cashClosingDraft)) {
    setItem(STORAGE_KEYS.cashClosingDraft, null);
  }

  if (!getItem(STORAGE_KEYS.showcaseWriteOffs)) {
    setItem(STORAGE_KEYS.showcaseWriteOffs, []);
  }
```

Add these lines to `resetAppData()`:

```js
  setItem(STORAGE_KEYS.cashClosings, []);
  setItem(STORAGE_KEYS.cashClosingDraft, null);
  setItem(STORAGE_KEYS.showcaseWriteOffs, []);
```

- [ ] **Step 5: Add write-off service functions**

In `src/services/estoque.service.js`, add these exports after `cancelStockLaunch`:

```js
export function getTodayShowcaseProducts() {
  const productIds = new Set(getActiveLaunches({ period: 'today' }).map((launch) => launch.produtoId));
  return getProducts().filter((product) => productIds.has(product.id));
}

export function createShowcaseWriteOff({ productId, quantity, reason, note = '' }) {
  const product = getProductById(productId);
  const normalizedQuantity = Number(quantity) || 0;
  const normalizedReason = String(reason || '').trim();

  if (!product) {
    throw new Error('Produto nao encontrado.');
  }

  if (normalizedQuantity <= 0) {
    throw new Error('Quantidade precisa ser maior que zero.');
  }

  if (!normalizedReason) {
    throw new Error('Motivo obrigatorio.');
  }

  const comparison = getProductionSalesComparison({ period: 'today' }).find((item) => item.produtoId === product.id);

  if (!comparison) {
    throw new Error('Produto sem lancamento de vitrine no periodo.');
  }

  if (normalizedQuantity > comparison.sobraQuantidade) {
    throw new Error('Quantidade maior que a sobra disponivel na vitrine.');
  }

  const category = getCategories().find((item) => item.id === product.categoryId);
  const unitValue = Number(product.price) || 0;
  const writeOff = {
    id: createId('writeoff'),
    productId: product.id,
    productName: product.name,
    categoryId: product.categoryId,
    categoryName: category ? category.name : 'Sem categoria',
    quantity: normalizedQuantity,
    unitValue,
    totalValue: normalizedQuantity * unitValue,
    reason: normalizedReason,
    note: String(note || '').trim(),
    createdAt: new Date().toISOString(),
    status: 'ativa'
  };

  const writeOffs = getItem(STORAGE_KEYS.showcaseWriteOffs, []);
  writeOffs.unshift(writeOff);
  setItem(STORAGE_KEYS.showcaseWriteOffs, writeOffs);

  return writeOff;
}

export function getShowcaseWriteOffs(filters = {}) {
  return getItem(STORAGE_KEYS.showcaseWriteOffs, []).filter((writeOff) => {
    const matchesStatus = writeOff.status !== 'cancelada';
    const matchesPeriod = isInPeriod(writeOff.createdAt, filters.period || 'today', filters);
    const productFilter = new Set(filters.productIds || []);
    const categoryFilter = new Set(filters.categoryIds || []);
    const matchesProduct = !productFilter.size || productFilter.has(writeOff.productId);
    const matchesCategory = !categoryFilter.size || categoryFilter.has(writeOff.categoryId);

    return matchesStatus && matchesPeriod && matchesProduct && matchesCategory;
  });
}

export function getShowcaseWriteOffSummary(filters = {}) {
  const summary = new Map();

  getShowcaseWriteOffs(filters).forEach((writeOff) => {
    const current = summary.get(writeOff.productId) || {
      quantity: 0,
      totalValue: 0,
      reasons: {}
    };

    current.quantity += writeOff.quantity;
    current.totalValue += writeOff.totalValue;
    current.reasons[writeOff.reason] = (current.reasons[writeOff.reason] || 0) + writeOff.quantity;
    summary.set(writeOff.productId, current);
  });

  return summary;
}
```

- [ ] **Step 6: Include write-offs in comparison and summary**

In `getStockSummary(filters = {})`, add:

```js
  const writeOffs = getShowcaseWriteOffs(filters);
  const writeOffUnits = writeOffs.reduce((total, writeOff) => total + writeOff.quantity, 0);
  const writeOffValue = writeOffs.reduce((total, writeOff) => total + writeOff.totalValue, 0);
```

Return these fields and subtract write-offs from `quantityBalance` and `valueDifference`:

```js
    writeOffUnits,
    writeOffValue,
    valueDifference: estimatedProductionValue - salesValue - writeOffValue,
    quantityBalance: producedUnits - soldUnits - writeOffUnits
```

In `getProductionSalesComparison(filters = {})`, add before the `return Array.from(productIds)` line:

```js
  const writeOffsByProduct = getShowcaseWriteOffSummary(filters);
```

Inside the mapped object, add:

```js
    const writeOff = writeOffsByProduct.get(produtoId) || { quantity: 0, totalValue: 0 };
```

Return:

```js
      quantidadeBaixada: writeOff.quantity,
      valorBaixado: writeOff.totalValue,
      sobraQuantidade: producedQuantity - sold.quantity - writeOff.quantity,
      diferencaValor: producedValue - sold.value - writeOff.totalValue,
```

Replace the old `sobraQuantidade` and `diferencaValor` lines with these.

- [ ] **Step 7: Run estoque test**

Run:

```powershell
node tests\estoque-service.test.mjs
```

Expected: `estoque service ok`.

## Task 2: Cash Closing Service

**Files:**
- Create: `src/services/cash-closing.service.js`
- Create: `tests/cash-closing-service.test.mjs`

- [ ] **Step 1: Create failing cash closing test**

Create `tests/cash-closing-service.test.mjs`:

```js
const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const storage = await import('../src/services/storage.service.js');
const products = await import('../src/services/product.service.js');
const comandas = await import('../src/services/comanda.service.js');
const transactions = await import('../src/services/transaction.service.js');
const estoque = await import('../src/services/estoque.service.js');
const closing = await import('../src/services/cash-closing.service.js');

storage.ensureSeedData();

const burger = products.getProductById('x-burger');
const soda = products.getProductById('refrigerante-lata');

estoque.createStockLaunch({ produtoId: burger.id, quantidade: 10 });
estoque.createStockLaunch({ produtoId: soda.id, quantidade: 5 });

comandas.clearComanda();
comandas.addItem(burger);
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 40 });

comandas.addItem(soda);
transactions.finalizeComandaPayment({ paymentMethod: 'pix' });

transactions.registerCashMovement({
  type: 'entrada',
  amount: 20,
  description: 'Reforco'
});

transactions.registerCashMovement({
  type: 'saida',
  amount: 5,
  description: 'Compra pequena'
});

estoque.createShowcaseWriteOff({
  productId: burger.id,
  quantity: 1,
  reason: 'consumo-interno'
});

const summary = closing.buildClosingSummary({
  countedCash: 45,
  checkedPix: ''
});

assert(summary.payments.expectedCash === 47, 'expected cash should include cash sales plus entries minus outputs');
assert(summary.payments.countedCash === 45, 'counted cash should come from input');
assert(summary.payments.cashDifference === -2, 'cash difference should compare counted and expected cash');
assert(summary.payments.expectedPix === 6, 'expected pix should include pix sales');
assert(summary.payments.checkedPix === null, 'blank pix check should be null');
assert(summary.payments.generalDifference === -2, 'general difference should use expected values for unchecked optional methods');

const burgerRow = summary.showcase.find((item) => item.productId === burger.id);
assert(burgerRow.producedQuantity === 10, 'showcase should include produced quantity');
assert(burgerRow.soldQuantity === 2, 'showcase should include sold quantity');
assert(burgerRow.writeOffQuantity === 1, 'showcase should include write-off quantity');
assert(burgerRow.expectedLeftoverQuantity === 7, 'showcase should calculate expected leftover');

const draft = closing.saveClosingDraft({
  countedCash: 45,
  leftovers: {
    [burger.id]: 7,
    [soda.id]: 4
  },
  differences: [
    {
      scope: 'payment',
      referenceId: 'dinheiro',
      reason: 'erro-caixa',
      note: 'Faltou dinheiro',
      amount: -2
    }
  ]
});
assert(draft.status === 'rascunho', 'draft should be saved as draft');

const confirmed = closing.confirmClosing(draft);
assert(confirmed.status === 'fechado', 'confirmed closing should be closed');
assert(closing.getCashClosings().length === 1, 'closing history should include confirmed closing');

comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 20 });

const afterClosing = closing.getSalesAfterClosing(confirmed);
assert(afterClosing.length === 1, 'sales after closing should be listed separately');
assert(closing.getCashClosings()[0].totals.sales === confirmed.totals.sales, 'confirmed closing totals should not change after later sale');

console.log('cash closing service ok');
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
node tests\cash-closing-service.test.mjs
```

Expected: fail with module not found for `cash-closing.service.js`.

- [ ] **Step 3: Implement cash closing service**

Create `src/services/cash-closing.service.js`:

```js
import { STORAGE_KEYS } from '../database/schema.js';
import { getProductionSalesComparison } from './estoque.service.js';
import { getItem, setItem } from './storage.service.js';
import { getTransactions } from './transaction.service.js';

export function buildClosingSummary(input = {}) {
  const payments = buildPaymentConference(input);
  const showcase = buildShowcaseConference(input.leftovers || {});
  const transactions = getClosingTransactions();
  const sales = transactions.filter((transaction) => transaction.type === 'venda');
  const entries = transactions.filter((transaction) => transaction.type === 'entrada');
  const outputs = transactions.filter((transaction) => transaction.type === 'saida');

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      sales: sumTransactions(sales),
      entries: sumTransactions(entries),
      outputs: sumTransactions(outputs),
      closedComandas: sales.length
    },
    payments,
    showcase
  };
}

export function buildPaymentConference(input = {}) {
  const transactions = getClosingTransactions();
  const sales = transactions.filter((transaction) => transaction.type === 'venda');
  const entriesTotal = sumTransactions(transactions.filter((transaction) => transaction.type === 'entrada'));
  const outputsTotal = sumTransactions(transactions.filter((transaction) => transaction.type === 'saida'));
  const expectedCash = sumPayment(sales, 'dinheiro') + entriesTotal - outputsTotal;
  const expectedPix = sumPayment(sales, 'pix');
  const expectedDebit = sumPayment(sales, 'debito');
  const expectedCredit = sumPayment(sales, 'credito');
  const countedCash = normalizeRequiredNumber(input.countedCash);
  const checkedPix = normalizeOptionalNumber(input.checkedPix);
  const checkedDebit = normalizeOptionalNumber(input.checkedDebit);
  const checkedCredit = normalizeOptionalNumber(input.checkedCredit);
  const comparableExpected = expectedCash + expectedPix + expectedDebit + expectedCredit;
  const comparableActual = countedCash
    + (checkedPix ?? expectedPix)
    + (checkedDebit ?? expectedDebit)
    + (checkedCredit ?? expectedCredit);

  return {
    expectedCash,
    countedCash,
    cashDifference: countedCash - expectedCash,
    expectedPix,
    checkedPix,
    pixDifference: checkedPix === null ? null : checkedPix - expectedPix,
    expectedDebit,
    checkedDebit,
    debitDifference: checkedDebit === null ? null : checkedDebit - expectedDebit,
    expectedCredit,
    checkedCredit,
    creditDifference: checkedCredit === null ? null : checkedCredit - expectedCredit,
    expectedTotal: comparableExpected,
    actualComparableTotal: comparableActual,
    generalDifference: comparableActual - comparableExpected
  };
}

export function buildShowcaseConference(leftovers = {}) {
  return getProductionSalesComparison({ period: 'today' }).map((item) => {
    const countedLeftoverQuantity = normalizeOptionalNumber(leftovers[item.produtoId]);
    const expectedLeftoverQuantity = item.sobraQuantidade;
    const differenceQuantity = countedLeftoverQuantity === null
      ? null
      : expectedLeftoverQuantity - countedLeftoverQuantity;

    return {
      productId: item.produtoId,
      productName: item.produtoNome,
      categoryId: item.categoriaId,
      categoryName: item.categoriaNome,
      producedQuantity: item.quantidadeProduzida,
      soldQuantity: item.quantidadeVendida,
      writeOffQuantity: item.quantidadeBaixada || 0,
      writeOffValue: item.valorBaixado || 0,
      expectedLeftoverQuantity,
      countedLeftoverQuantity,
      differenceQuantity,
      estimatedDifferenceValue: differenceQuantity === null
        ? null
        : differenceQuantity * getUnitValue(item)
    };
  });
}

export function saveClosingDraft(input = {}) {
  const summary = buildClosingSummary(input);
  const draft = {
    id: input.id || createId('closing-draft'),
    status: 'rascunho',
    ...summary,
    differences: input.differences || [],
    input,
    updatedAt: new Date().toISOString()
  };

  setItem(STORAGE_KEYS.cashClosingDraft, draft);
  return draft;
}

export function getCurrentClosingDraft() {
  return getItem(STORAGE_KEYS.cashClosingDraft, null);
}

export function confirmClosing(draft) {
  if (!draft || !draft.payments) {
    throw new Error('Rascunho de fechamento invalido.');
  }

  if (!Number.isFinite(Number(draft.payments.countedCash))) {
    throw new Error('Dinheiro contado obrigatorio.');
  }

  const missingReason = (draft.differences || []).some((difference) => (
    !difference.reason || (difference.reason === 'outro' && !difference.note)
  ));

  if (missingReason) {
    throw new Error('Toda divergencia precisa de motivo.');
  }

  const closedAt = new Date().toISOString();
  const closing = {
    ...draft,
    id: createId('closing'),
    status: 'fechado',
    totals: {
      ...draft.totals,
      expectedCash: draft.payments.expectedCash,
      countedCash: draft.payments.countedCash,
      cashDifference: draft.payments.cashDifference,
      expectedPix: draft.payments.expectedPix,
      checkedPix: draft.payments.checkedPix,
      expectedDebit: draft.payments.expectedDebit,
      checkedDebit: draft.payments.checkedDebit,
      expectedCredit: draft.payments.expectedCredit,
      checkedCredit: draft.payments.checkedCredit,
      generalDifference: draft.payments.generalDifference
    },
    closedAt,
    createdAt: closedAt,
    updatedAt: closedAt
  };

  const closings = getCashClosings();
  closings.unshift(closing);
  setItem(STORAGE_KEYS.cashClosings, closings);
  setItem(STORAGE_KEYS.cashClosingDraft, null);

  return closing;
}

export function getCashClosings() {
  return getItem(STORAGE_KEYS.cashClosings, []);
}

export function getCashClosingById(closingId) {
  return getCashClosings().find((closing) => closing.id === closingId) || null;
}

export function getSalesAfterClosing(closing) {
  if (!closing?.closedAt) {
    return [];
  }

  const closedAt = new Date(closing.closedAt);
  return getTransactions().filter((transaction) => (
    transaction.type === 'venda'
      && transaction.status !== 'cancelada'
      && new Date(transaction.createdAt) > closedAt
  ));
}

function getClosingTransactions() {
  return getTransactions().filter((transaction) => transaction.status !== 'cancelada');
}

function sumPayment(sales, paymentMethod) {
  return sales
    .filter((sale) => sale.paymentMethod === paymentMethod)
    .reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function sumTransactions(transactions) {
  return transactions.reduce((total, transaction) => total + Number(transaction.total || transaction.amount || 0), 0);
}

function normalizeRequiredNumber(value) {
  return Number(value) || 0;
}

function normalizeOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getUnitValue(item) {
  if (item.quantidadeProduzida <= 0) {
    return 0;
  }

  return item.valorProduzido / item.quantidadeProduzida;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
```

- [ ] **Step 4: Run cash closing test**

Run:

```powershell
node tests\cash-closing-service.test.mjs
```

Expected: `cash closing service ok`.

## Task 3: Perda / Consumo in Frente de Caixa

**Files:**
- Modify: `src/modules/vendas/vendas.module.js`
- Modify: `src/components/product-card.component.js`

- [ ] **Step 1: Update imports**

In `src/modules/vendas/vendas.module.js`, change the product-card import to remove `renderItemAvulsoCard`:

```js
import { renderProductCard } from '../../components/product-card.component.js';
```

Add estoque imports:

```js
import { createShowcaseWriteOff, getTodayShowcaseProducts } from '../../services/estoque.service.js';
```

- [ ] **Step 2: Replace the toolbar button**

In `renderScreen`, replace:

```html
<button class="button" type="button" data-action="item-avulso">+ Novo Item Avulso</button>
```

with:

```html
<button class="button button--danger" type="button" data-action="open-write-off">Perda / Consumo</button>
```

- [ ] **Step 3: Stop rendering the item-avulso card**

In `renderProducts`, replace the `target.innerHTML` assignment with:

```js
  target.innerHTML = products.map((product) => {
    const category = categories.find((item) => item.id === product.categoryId);
    return renderProductCard(product, category ? category.name : 'Sem categoria');
  }).join('');
```

- [ ] **Step 4: Add modal state handling**

In `handleOrderAction`, replace the old `item-avulso` block with:

```js
  if (action === 'open-write-off') {
    state.modal = 'write-off';
  }
```

Add submit handling inside the existing `submit` listener, after the cash form block:

```js
    if (event.target.matches('[data-write-off-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);

      try {
        createShowcaseWriteOff({
          productId: data.get('productId'),
          quantity: data.get('quantity'),
          reason: data.get('reason'),
          note: data.get('note')
        });
        showNotification({
          title: 'Baixa registrada',
          message: 'Perda ou consumo entrou na conferencia da vitrine.',
          type: 'success'
        });
        state.modal = null;
        renderModal(container);
      } catch (error) {
        showNotification({
          title: 'Nao foi possivel registrar',
          message: error.message || 'Confira produto, quantidade e motivo.',
          type: 'danger'
        });
      }
    }
```

- [ ] **Step 5: Render write-off modal**

In `renderModal`, add before the cash movement modal fallback:

```js
  if (state.modal === 'write-off') {
    target.innerHTML = renderWriteOffModal();
    return;
  }
```

Add this function near the other modal render functions:

```js
function renderWriteOffModal() {
  const showcaseProducts = getTodayShowcaseProducts();

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>Perda / Consumo</h2>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        ${showcaseProducts.length ? `
          <form class="product-form" data-write-off-form>
            <label class="stacked-label">
              Produto da vitrine
              <select class="field" name="productId" required>
                ${showcaseProducts.map((product) => `
                  <option value="${product.id}">${product.name} - ${formatCurrency(product.price)}</option>
                `).join('')}
              </select>
            </label>
            <label class="stacked-label">
              Quantidade
              <input class="field" name="quantity" type="number" min="1" step="1" required>
            </label>
            <label class="stacked-label">
              Motivo
              <select class="field" name="reason" required>
                <option value="quebra">Quebra</option>
                <option value="consumo-interno">Consumo interno</option>
                <option value="cortesia">Cortesia</option>
                <option value="vencido">Vencido</option>
                <option value="erro-lancamento">Erro de lancamento</option>
                <option value="outro">Outro</option>
              </select>
            </label>
            <label class="stacked-label">
              Observacao
              <input class="field" name="note" placeholder="Opcional">
            </label>
            <div class="form-actions">
              <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
              <button class="button button--danger" type="submit">Registrar baixa</button>
            </div>
          </form>
        ` : `
          <div class="product-form">
            <p class="modal-text">Nenhum produto foi lancado na vitrine hoje. Lance estoque antes de registrar perda ou consumo.</p>
            <div class="form-actions">
              <button class="button" type="button" data-action="close-modal">Entendi</button>
            </div>
          </div>
        `}
      </div>
    </div>
  `;
}
```

- [ ] **Step 6: Remove unused item-avulso renderer**

In `src/components/product-card.component.js`, delete the `renderItemAvulsoCard` export if no other file imports it. If the file contains only that export plus `renderProductCard`, keep `renderProductCard` unchanged.

- [ ] **Step 7: Run service tests**

Run:

```powershell
node tests\estoque-service.test.mjs
node tests\transaction-service.test.mjs
node tests\cash-closing-service.test.mjs
```

Expected: `estoque service ok`, `transaction service ok`, `cash closing service ok`.

## Task 4: Caixa Module Guided UI and History

**Files:**
- Modify: `src/modules/caixa/caixa.module.js`
- Modify: `src/app.js`
- Modify: `src/styles/pdv.css`

- [ ] **Step 1: Map Fechar Caixa route**

In `src/app.js`, add:

```js
import { initCaixaModule } from './modules/caixa/caixa.module.js';
```

Update `routes`:

```js
const routes = {
  'frente-caixa': initVendasModule,
  dashboard: initDashboardModule,
  produtos: initProdutosModule,
  estoque: initEstoqueModule,
  'fechar-caixa': initCaixaModule
};
```

- [ ] **Step 2: Replace caixa placeholder with UI skeleton**

Replace `src/modules/caixa/caixa.module.js` with:

```js
import {
  buildClosingSummary,
  confirmClosing,
  getCashClosings,
  getSalesAfterClosing,
  saveClosingDraft
} from '../../services/cash-closing.service.js';
import { formatCurrency } from '../../utils/currency.js';
import { showNotification } from '../../services/notification.service.js';

const caixaState = {
  tab: 'current',
  step: 'summary',
  countedCash: '',
  checkedPix: '',
  checkedDebit: '',
  checkedCredit: '',
  leftovers: {},
  differences: []
};
const boundContainers = new WeakSet();

export function initCaixaModule(container) {
  renderCaixa(container);

  if (!boundContainers.has(container)) {
    bindCaixaEvents(container);
    boundContainers.add(container);
  }
}

function renderCaixa(container) {
  const summary = buildClosingSummary({
    countedCash: caixaState.countedCash,
    checkedPix: caixaState.checkedPix,
    checkedDebit: caixaState.checkedDebit,
    checkedCredit: caixaState.checkedCredit,
    leftovers: caixaState.leftovers
  });

  container.innerHTML = `
    <section class="module-screen products-module" data-caixa-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Fechar Caixa</h1>
          <p class="module-subtitle">Confira pagamentos, vitrine, sobras e divergencias antes de salvar.</p>
        </div>
        <div class="header-actions">
          <button class="button ${caixaState.tab === 'current' ? '' : 'button--ghost'}" type="button" data-caixa-tab="current">Fechamento atual</button>
          <button class="button ${caixaState.tab === 'history' ? '' : 'button--ghost'}" type="button" data-caixa-tab="history">Historico</button>
        </div>
      </header>

      ${caixaState.tab === 'current' ? renderCurrentClosing(summary) : renderClosingHistory()}
    </section>
  `;
}

function bindCaixaEvents(container) {
  container.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-caixa-tab]');
    const step = event.target.closest('[data-caixa-step]');
    const action = event.target.closest('[data-action]');

    if (tab) {
      caixaState.tab = tab.dataset.caixaTab;
      renderCaixa(container);
      return;
    }

    if (step) {
      caixaState.step = step.dataset.caixaStep;
      renderCaixa(container);
      return;
    }

    if (action?.dataset.action === 'save-closing-draft') {
      const draft = saveClosingDraft(readClosingInput(container));
      showNotification({
        title: 'Rascunho salvo',
        message: `Fechamento atualizado as ${new Date(draft.updatedAt).toLocaleTimeString('pt-BR')}.`,
        type: 'success'
      });
      renderCaixa(container);
      return;
    }

    if (action?.dataset.action === 'confirm-closing') {
      try {
        const draft = saveClosingDraft(readClosingInput(container));
        confirmClosing(draft);
        showNotification({
          title: 'Caixa fechado',
          message: 'Fechamento salvo no historico.',
          type: 'success'
        });
        caixaState.tab = 'history';
        renderCaixa(container);
      } catch (error) {
        showNotification({
          title: 'Nao foi possivel fechar',
          message: error.message || 'Confira os campos obrigatorios.',
          type: 'danger'
        });
      }
    }
  });

  container.addEventListener('input', (event) => {
    if (event.target.matches('[data-payment-input]')) {
      caixaState[event.target.dataset.paymentInput] = event.target.value;
      renderCaixa(container);
    }

    if (event.target.matches('[data-leftover-input]')) {
      caixaState.leftovers[event.target.dataset.productId] = event.target.value;
      renderCaixa(container);
    }
  });
}

function renderCurrentClosing(summary) {
  return `
    <div class="closing-layout">
      <aside class="closing-steps">
        ${renderStepButton('summary', '1. Resumo do dia')}
        ${renderStepButton('payments', '2. Pagamentos')}
        ${renderStepButton('showcase', '3. Vitrine / salgados')}
        ${renderStepButton('differences', '4. Divergencias')}
        ${renderStepButton('confirm', '5. Confirmar')}
      </aside>
      <div class="closing-content">
        ${renderStepContent(summary)}
      </div>
    </div>
  `;
}

function renderStepButton(step, label) {
  return `<button class="closing-step ${caixaState.step === step ? 'is-active' : ''}" type="button" data-caixa-step="${step}">${label}</button>`;
}

function renderStepContent(summary) {
  if (caixaState.step === 'payments') return renderPayments(summary);
  if (caixaState.step === 'showcase') return renderShowcase(summary);
  if (caixaState.step === 'differences') return renderDifferences(summary);
  if (caixaState.step === 'confirm') return renderConfirm(summary);
  return renderSummary(summary);
}

function renderSummary(summary) {
  return `
    <div class="summary-grid">
      ${renderSummaryCard('Total vendido', summary.totals.sales)}
      ${renderSummaryCard('Dinheiro esperado', summary.payments.expectedCash)}
      ${renderSummaryCard('Entradas', summary.totals.entries)}
      ${renderSummaryCard('Saidas', summary.totals.outputs)}
    </div>
  `;
}

function renderPayments(summary) {
  return `
    <section class="manager-section">
      <header class="manager-section__header"><strong>Conferencia de pagamentos</strong></header>
      <div class="closing-form-grid">
        ${renderPaymentField('countedCash', 'Dinheiro contado', summary.payments.expectedCash, true)}
        ${renderPaymentField('checkedPix', 'Pix conferido', summary.payments.expectedPix)}
        ${renderPaymentField('checkedDebit', 'Debito conferido', summary.payments.expectedDebit)}
        ${renderPaymentField('checkedCredit', 'Credito conferido', summary.payments.expectedCredit)}
      </div>
    </section>
  `;
}

function renderPaymentField(name, label, expected, required = false) {
  return `
    <label class="stacked-label closing-field">
      ${label}
      <span>Esperado: ${formatCurrency(expected)}</span>
      <input class="field" data-payment-input="${name}" type="number" min="0" step="0.01" value="${caixaState[name]}" ${required ? 'required' : ''}>
    </label>
  `;
}

function renderShowcase(summary) {
  if (!summary.showcase.length) {
    return '<div class="empty-products product-empty-large">NENHUM PRODUTO LANCADO NA VITRINE HOJE</div>';
  }

  return `
    <section class="manager-section">
      <header class="manager-section__header"><strong>Vitrine / salgados</strong></header>
      <div class="comparison-table">
        <table>
          <thead><tr><th>Produto</th><th>Produzido</th><th>Vendido</th><th>Baixado</th><th>Sobra esperada</th><th>Sobra contada</th><th>Diferenca</th></tr></thead>
          <tbody>
            ${summary.showcase.map((item) => `
              <tr>
                <td><strong>${item.productName}</strong></td>
                <td>${item.producedQuantity}</td>
                <td>${item.soldQuantity}</td>
                <td>${item.writeOffQuantity}</td>
                <td>${item.expectedLeftoverQuantity}</td>
                <td><input class="field closing-small-input" data-leftover-input data-product-id="${item.productId}" type="number" min="0" step="1" value="${caixaState.leftovers[item.productId] || ''}"></td>
                <td>${item.differenceQuantity === null ? '-' : item.differenceQuantity}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDifferences(summary) {
  const paymentDifference = summary.payments.cashDifference;
  const showcaseDifferences = summary.showcase.filter((item) => item.differenceQuantity);

  return `
    <section class="manager-section">
      <header class="manager-section__header"><strong>Divergencias</strong></header>
      <div class="manager-list">
        ${paymentDifference ? `<article class="manager-row"><div><strong>Dinheiro</strong><span>Diferenca: ${formatCurrency(paymentDifference)}</span></div></article>` : ''}
        ${showcaseDifferences.map((item) => `<article class="manager-row"><div><strong>${item.productName}</strong><span>Diferenca: ${item.differenceQuantity} unidade(s)</span></div></article>`).join('')}
        ${!paymentDifference && !showcaseDifferences.length ? '<div class="empty-products">Nenhuma divergencia encontrada.</div>' : ''}
      </div>
    </section>
  `;
}

function renderConfirm(summary) {
  return `
    ${renderSummary(summary)}
    <section class="manager-section">
      <header class="manager-section__header"><strong>Confirmar fechamento</strong></header>
      <div class="manager-list">
        <article class="manager-row"><div><strong>Diferenca geral</strong><span>${formatCurrency(summary.payments.generalDifference)}</span></div></article>
      </div>
      <div class="form-actions closing-actions">
        <button class="button button--ghost" type="button" data-action="save-closing-draft">Salvar rascunho</button>
        <button class="button" type="button" data-action="confirm-closing">Confirmar fechamento</button>
      </div>
    </section>
  `;
}

function renderClosingHistory() {
  const closings = getCashClosings();

  if (!closings.length) {
    return '<div class="empty-products product-empty-large">NENHUM FECHAMENTO SALVO</div>';
  }

  return `
    <section class="manager-section">
      <header class="manager-section__header"><strong>Historico de caixa</strong><span>${closings.length} fechamento(s)</span></header>
      <div class="manager-list">
        ${closings.map((closing) => {
          const afterClosing = getSalesAfterClosing(closing);
          return `
            <article class="manager-row closing-history-row">
              <div>
                <strong>${formatDate(closing.closedAt)}</strong>
                <span>Vendas: ${formatCurrency(closing.totals.sales)} - Diferenca: ${formatCurrency(closing.totals.generalDifference || 0)}${afterClosing.length ? ` - ${afterClosing.length} venda(s) apos fechamento` : ''}</span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderSummaryCard(label, value) {
  return `<article class="summary-card"><span>${label}</span><strong>${formatCurrency(value)}</strong></article>`;
}

function readClosingInput() {
  return {
    countedCash: caixaState.countedCash,
    checkedPix: caixaState.checkedPix,
    checkedDebit: caixaState.checkedDebit,
    checkedCredit: caixaState.checkedCredit,
    leftovers: caixaState.leftovers,
    differences: caixaState.differences
  };
}

function formatDate(value) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
```

- [ ] **Step 3: Add closing styles**

Append to `src/styles/pdv.css`:

```css
.closing-layout {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 16px;
}

.closing-steps {
  display: grid;
  gap: 8px;
  align-self: start;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.closing-step {
  min-height: 44px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-muted);
  font-weight: 800;
  text-align: left;
}

.closing-step.is-active {
  background: var(--color-surface-muted);
  color: var(--color-primary);
}

.closing-content {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.closing-form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
}

.closing-field span {
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 800;
}

.closing-small-input {
  width: 96px;
}

.closing-actions {
  padding: 16px;
}

.closing-history-row {
  align-items: flex-start;
}

@media (max-width: 900px) {
  .closing-layout,
  .closing-form-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
node tests\estoque-service.test.mjs
node tests\transaction-service.test.mjs
node tests\cash-closing-service.test.mjs
```

Expected all three ok messages.

## Task 5: Manual Browser Verification

**Files:**
- No planned code edits.

- [ ] **Step 1: Start local app server**

Run the existing local server script:

```powershell
.\scripts\start-server.cmd
```

Expected: app available on its configured local URL. If the script does not print the URL, try `http://127.0.0.1:8080/` because this project has previously used that port.

- [ ] **Step 2: Verify Perda / Consumo path**

Manual steps:

1. Open the app.
2. Go to `Estoque`.
3. Launch vitrine stock for `X-Burger` with quantity `5`.
4. Go to `Frente de Caixa`.
5. Confirm the old `Novo Item Avulso` button is gone.
6. Click `Perda / Consumo`.
7. Select `X-Burger`, quantity `1`, reason `Consumo interno`.
8. Save.

Expected: success notification and no sale added to the comanda.

- [ ] **Step 3: Verify closing path**

Manual steps:

1. Sell two `X-Burger` items in money.
2. Sell one item in Pix.
3. Go to `Fechar Caixa`.
4. Confirm the route opens the real closing screen.
5. In `Pagamentos`, enter counted cash lower than expected.
6. In `Vitrine / salgados`, enter counted leftovers.
7. Open `Confirmar` and save the closing.
8. Go to `Historico`.

Expected: closing appears in history with total sales and cash difference.

- [ ] **Step 4: Verify sale after closing**

Manual steps:

1. Return to `Frente de Caixa`.
2. Complete one more sale.
3. Return to `Fechar Caixa > Historico`.

Expected: the saved closing still has the same totals, and the history row indicates sale(s) after closing.

## Self-Review

- Spec coverage: The plan covers guided closing, payment separation, general total, showcase/salgado reconciliation, write-offs from Frente de Caixa, history, sales after closing, persistence, and tests.
- Placeholder scan: No TBD/TODO/fill-later steps remain. Steps include concrete paths, commands, expected results, and code blocks for code edits.
- Type consistency: The plan consistently uses `cashClosings`, `cashClosingDraft`, `showcaseWriteOffs`, `createShowcaseWriteOff`, `getTodayShowcaseProducts`, `buildClosingSummary`, `saveClosingDraft`, and `confirmClosing`.
- Scope note: Full Ajuda/Suporte tutorial, employee tracking, reopening closings, and printing/export remain intentionally outside this implementation plan.
