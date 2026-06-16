# Produtos Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign only the Produtos tab into a dashboard-style management screen while preserving current product/category CRUD, Supabase-backed data, permissions behavior, and the best-selling-products CRM.

**Architecture:** Keep the redesign inside `src/modules/produtos/produtos.module.js` and `src/styles/pdv.css`, following the existing plain JavaScript module pattern. Add small render/helper functions for summaries, alerts, filters, product/category cards, and CRM sections; only touch `src/services/transaction.service.js` for the isolated 7-day and 30-day period support used by the existing ranking API.

**Tech Stack:** JavaScript ES Modules, HTML template strings, CSS modules loaded by `index.html`, Node `.mjs` service tests, local dev server via `scripts/start-server.cmd`.

---

## File Structure

- Modify `src/modules/produtos/produtos.module.js`: owns Produtos tab state, rendering, filters, modals, and click/change/submit handlers.
- Modify `src/services/transaction.service.js`: add `last7` and `last30` period support to `isInPeriod`.
- Modify `src/styles/pdv.css`: add Produtos-specific dashboard, cards, alerts, filters, product/category cards, CRM ranking, and responsive styles.
- Modify `tests/transaction-service.test.mjs`: add assertions that `getBestSellingProducts` includes sales in the last 7/30 days and excludes older sales.
- Optional manual verification only: no database or migration files are changed.

## Task 1: Add CRM Period Test Coverage

**Files:**
- Modify: `tests/transaction-service.test.mjs`

- [ ] **Step 1: Add period fixture assertions near the existing best seller assertions**

After the existing assertions:

```js
assert(bestSellers[0].productId === 'x-burger', 'best seller should be x-burger by quantity');
assert(bestSellers[0].quantity === 3, 'best seller should sum quantities across comandas');
assert(transactions.getBestSellingProducts({ categoryId: 'porcoes' })[0].productId === 'batata-frita', 'category filter should work');
```

add:

```js
const eightDaysAgo = new Date();
eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

const thirtyOneDaysAgo = new Date();
thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

storage.setItem(schema.STORAGE_KEYS.transactions, [
  ...transactions.getTransactions(),
  {
    id: 'sale-eight-days-ago',
    type: 'venda',
    status: 'ativa',
    items: [
      {
        productId: 'refrigerante-lata',
        name: 'Refrigerante Lata',
        quantity: 4,
        total: 24
      }
    ],
    total: 24,
    createdAt: eightDaysAgo.toISOString()
  },
  {
    id: 'sale-thirty-one-days-ago',
    type: 'venda',
    status: 'ativa',
    items: [
      {
        productId: 'batata-frita',
        name: 'Batata Frita',
        quantity: 9,
        total: 108
      }
    ],
    total: 108,
    createdAt: thirtyOneDaysAgo.toISOString()
  }
]);

const last7Ranking = transactions.getBestSellingProducts({ period: 'last7' });
const last30Ranking = transactions.getBestSellingProducts({ period: 'last30' });

assert(!last7Ranking.some((item) => item.productId === 'refrigerante-lata'), 'last7 ranking should exclude sales older than 7 days');
assert(last30Ranking.some((item) => item.productId === 'refrigerante-lata'), 'last30 ranking should include sales within 30 days');
assert(!last30Ranking.some((item) => item.productId === 'batata-frita' && item.quantity >= 9), 'last30 ranking should exclude sales older than 30 days');
```

- [ ] **Step 2: Run test to verify it fails before implementation**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: fail on `last30 ranking should include sales within 30 days`, because unknown periods currently fall back to today.

- [ ] **Step 3: Commit only if this task is intentionally kept separate**

Do not commit a permanently failing test by itself unless the session policy explicitly allows red commits. Prefer continuing directly to Task 2 and committing both test and implementation together.

## Task 2: Add Last 7 and Last 30 Day Period Support

**Files:**
- Modify: `src/services/transaction.service.js`
- Test: `tests/transaction-service.test.mjs`

- [ ] **Step 1: Update `isInPeriod`**

In `src/services/transaction.service.js`, add this block after the `yesterday` branch and before the `month` branch:

```js
  if (period === 'last7' || period === 'last30') {
    const days = period === 'last7' ? 7 : 30;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    return date >= start && date <= now;
  }
```

- [ ] **Step 2: Run transaction tests**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: `transaction service ok`

- [ ] **Step 3: Commit**

Run:

```powershell
git add src/services/transaction.service.js tests/transaction-service.test.mjs
git commit -m "test: cover product crm rolling periods"
```

Expected: commit succeeds with only those two files.

## Task 3: Add Produtos State and Data Helpers

**Files:**
- Modify: `src/modules/produtos/produtos.module.js`

- [ ] **Step 1: Extend `productState`**

Add `statusFilter` after `categoryFilter`:

```js
  statusFilter: 'todos',
```

- [ ] **Step 2: Add helper functions before `renderProdutosScreen`**

Add:

```js
function getCategoriesById() {
  return new Map(getVisibleCategories().map((category) => [category.id, category]));
}

function isProductInShowcase(product, categoriesById = getCategoriesById()) {
  const category = categoriesById.get(product.categoryId);
  return Boolean(product.active && category?.showInShowcase);
}

function getProductDashboardMetrics() {
  const products = getProducts();
  const categories = getVisibleCategories();
  const categoriesById = getCategoriesById();
  const activeProducts = products.filter((product) => product.active);
  const showcaseProducts = products.filter((product) => isProductInShowcase(product, categoriesById));
  const todayRanking = getBestSellingProducts({ period: 'today' });
  const selectedRanking = getFilteredBestSellers();
  const topProduct = selectedRanking[0] || null;

  return {
    products,
    categories,
    categoriesById,
    activeProducts,
    showcaseProducts,
    topProduct,
    todayRanking
  };
}

function getProductAlerts(metrics = getProductDashboardMetrics()) {
  const { products, categoriesById, showcaseProducts, todayRanking } = metrics;
  const categoryIds = new Set(categoriesById.keys());
  const withoutCategory = products.filter((product) => !categoryIds.has(product.categoryId));
  const withoutPrice = products.filter((product) => Number(product.price || 0) <= 0);
  const inactive = products.filter((product) => !product.active);
  const outOfShowcase = products.filter((product) => !isProductInShowcase(product, categoriesById));
  const zeroStock = products.filter((product) => Number(product.stock || 0) <= 0);
  const soldWithoutStock = todayRanking.filter((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    return product && Number(product.stock || 0) <= 0;
  });

  return [
    { key: 'without-price', label: 'produtos sem preco', count: withoutPrice.length, tone: 'danger' },
    { key: 'out-showcase', label: 'produtos fora da vitrine', count: outOfShowcase.length, tone: 'warning' },
    { key: 'zero-stock', label: 'produtos com estoque zerado', count: zeroStock.length, tone: 'danger' },
    { key: 'inactive', label: 'produtos inativos', count: inactive.length, tone: 'muted' },
    { key: 'without-category', label: 'produtos sem categoria', count: withoutCategory.length, tone: 'warning' },
    { key: 'today-best', label: 'produtos vendidos hoje', count: todayRanking.length, tone: 'success' },
    { key: 'sold-without-stock', label: 'vendas sem estoque', count: soldWithoutStock.length, tone: 'danger' },
    { key: 'showcase', label: 'produtos na vitrine', count: showcaseProducts.length, tone: 'success' }
  ].filter((item) => item.count > 0);
}
```

- [ ] **Step 3: Update `getFilteredProducts`**

Replace the return filter body with:

```js
  const categoriesById = getCategoriesById();

  return getProducts().filter((product) => {
    const matchesQuery = !normalizedQuery || product.name.toLowerCase().includes(normalizedQuery);
    const matchesCategory = productState.categoryFilter === 'todos' || product.categoryId === productState.categoryFilter;
    const inShowcase = isProductInShowcase(product, categoriesById);
    const matchesStatus = productState.statusFilter === 'todos'
      || (productState.statusFilter === 'active' && product.active)
      || (productState.statusFilter === 'inactive' && !product.active)
      || (productState.statusFilter === 'showcase' && inShowcase)
      || (productState.statusFilter === 'out-showcase' && !inShowcase);

    return matchesQuery && matchesCategory && matchesStatus;
  });
```

- [ ] **Step 4: Add status filter event handler**

In the `change` listener, after the category filter block, add:

```js
    if (event.target.matches('[data-status-filter]')) {
      productState.statusFilter = event.target.value;
      renderProdutosScreen(container);
    }
```

- [ ] **Step 5: Run product and transaction tests**

Run:

```powershell
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
```

Expected:

```text
product service crud ok
transaction service ok
```

Do not commit yet; Task 4 uses these helpers.

## Task 4: Redesign Produtos Render Structure

**Files:**
- Modify: `src/modules/produtos/produtos.module.js`

- [ ] **Step 1: Replace the body of `renderProdutosScreen`**

Use this structure:

```js
function renderProdutosScreen(container) {
  const metrics = getProductDashboardMetrics();

  container.innerHTML = `
    <section class="module-screen products-module products-dashboard">
      <header class="products-hero">
        <div>
          <span class="products-hero__eyebrow">Catalogo</span>
          <h1 class="pdv-title">Produtos</h1>
          <p class="module-subtitle">Gerencie categorias, produtos, precos e exibicao na vitrine.</p>
        </div>
        <div class="header-actions products-hero__actions">
          <button class="button button--ghost" type="button" data-action="new-category">+ Nova categoria</button>
          <button class="button" type="button" data-action="new-product">+ Novo produto</button>
        </div>
      </header>

      ${renderSyncStatus()}
      ${productState.loading ? '<div class="empty-products">Carregando produtos e categorias...</div>' : ''}
      ${productState.error ? `<div class="form-error">${productState.error}</div>` : ''}
      ${renderProductSummaryCards(metrics)}
      ${renderProductAlerts(metrics)}

      <section class="manager-section products-section">
        <header class="manager-section__header products-section__header">
          <div>
            <strong>Categorias / Abas</strong>
            <span>Organize as abas que aparecem no caixa e na vitrine.</span>
          </div>
          <span>${metrics.categories.length} categorias</span>
        </header>
        <div class="category-card-grid">
          ${renderCategoryRows()}
        </div>
      </section>

      <section class="manager-section products-section">
        <header class="manager-section__header products-section__header">
          <div>
            <strong>Produtos cadastrados</strong>
            <span>Filtre, edite e acompanhe os itens do catalogo.</span>
          </div>
          <span>${getFilteredProducts().length} produtos</span>
        </header>
        ${renderProductFilters()}
        <div class="product-card-grid">
          ${renderProductRows()}
        </div>
      </section>

      <section class="manager-section products-section product-crm-section">
        <header class="manager-section__header products-section__header">
          <div>
            <strong>CRM de produtos</strong>
            <span>Ranking de vendas por quantidade e faturamento.</span>
          </div>
          <span>${renderBestSellerSummary()}</span>
        </header>
        ${renderBestSellerFilters()}
        ${renderBestSellers()}
      </section>

      ${productState.modal === 'product' ? renderProductModal() : ''}
      ${productState.modal === 'category' ? renderCategoryModal() : ''}
    </section>
  `;
}
```

- [ ] **Step 2: Add summary, alerts, and filter renderers before `renderCategoryRows`**

Add:

```js
function renderProductSummaryCards(metrics = getProductDashboardMetrics()) {
  const bestSellerLabel = metrics.topProduct
    ? `${metrics.topProduct.name} (${metrics.topProduct.quantity})`
    : 'Sem vendas';

  const cards = [
    ['Total de produtos', metrics.products.length],
    ['Total de categorias', metrics.categories.length],
    ['Produtos ativos', metrics.activeProducts.length],
    ['Na vitrine', metrics.showcaseProducts.length],
    ['Produto mais vendido', bestSellerLabel]
  ];

  return `
    <section class="product-summary-grid" aria-label="Resumo de produtos">
      ${cards.map(([label, value]) => `
        <article class="product-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `).join('')}
    </section>
  `;
}

function renderProductAlerts(metrics = getProductDashboardMetrics()) {
  const alerts = getProductAlerts(metrics);

  if (!alerts.length) {
    return '';
  }

  return `
    <section class="product-alert-grid" aria-label="Alertas do catalogo">
      ${alerts.map((alert) => `
        <article class="product-alert product-alert--${alert.tone}">
          <strong>${alert.count}</strong>
          <span>${alert.label}</span>
        </article>
      `).join('')}
    </section>
  `;
}

function renderProductFilters() {
  return `
    <div class="products-filter-row products-filter-row--three">
      <input class="field" type="search" placeholder="Buscar produto por nome..." value="${productState.query}" data-products-filter>
      <select class="field" data-category-filter>
        <option value="todos" ${productState.categoryFilter === 'todos' ? 'selected' : ''}>Todas as categorias</option>
        ${getVisibleCategories().map((category) => `
          <option value="${category.id}" ${productState.categoryFilter === category.id ? 'selected' : ''}>${category.name}</option>
        `).join('')}
      </select>
      <select class="field" data-status-filter>
        <option value="todos" ${productState.statusFilter === 'todos' ? 'selected' : ''}>Todos os status</option>
        <option value="active" ${productState.statusFilter === 'active' ? 'selected' : ''}>Ativo</option>
        <option value="inactive" ${productState.statusFilter === 'inactive' ? 'selected' : ''}>Inativo</option>
        <option value="showcase" ${productState.statusFilter === 'showcase' ? 'selected' : ''}>Aparece na vitrine</option>
        <option value="out-showcase" ${productState.statusFilter === 'out-showcase' ? 'selected' : ''}>Nao aparece na vitrine</option>
      </select>
    </div>
  `;
}

function renderBestSellerFilters() {
  return `
    <div class="products-filter-row products-filter-row--crm">
      <select class="field" data-best-seller-period-filter>
        ${renderBestSellerPeriodOptions()}
      </select>
      <select class="field" data-best-seller-category-filter>
        <option value="todos" ${productState.bestSellerCategoryFilter === 'todos' ? 'selected' : ''}>Todas as categorias</option>
        ${getVisibleCategories().map((category) => `
          <option value="${category.id}" ${productState.bestSellerCategoryFilter === category.id ? 'selected' : ''}>${category.name}</option>
        `).join('')}
      </select>
    </div>
    ${productState.bestSellerPeriod === 'custom' ? `
      <div class="products-filter-row products-filter-row--custom">
        <input class="field" type="date" value="${productState.bestSellerCustomStart}" data-best-seller-custom-start aria-label="Data inicial">
        <input class="field" type="date" value="${productState.bestSellerCustomEnd}" data-best-seller-custom-end aria-label="Data final">
      </div>
    ` : ''}
  `;
}
```

- [ ] **Step 3: Run quick syntax check through tests**

Run:

```powershell
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
```

Expected:

```text
product service crud ok
transaction service ok
```

Do not commit yet; Task 5 completes the renderers.

## Task 5: Convert Category and Product Rows to Cards

**Files:**
- Modify: `src/modules/produtos/produtos.module.js`

- [ ] **Step 1: Replace `renderCategoryRows`**

Use:

```js
function renderCategoryRows() {
  const categories = getVisibleCategories();

  if (!categories.length) {
    return '<div class="empty-products">Nenhuma categoria cadastrada no banco.</div>';
  }

  return categories.map((category) => {
    const productCount = getProducts().filter((product) => product.categoryId === category.id).length;
    const activeClass = productState.categoryFilter === category.id ? ' is-active' : '';

    return `
      <article class="category-manager-card${activeClass}">
        <div class="category-manager-card__body">
          <strong>${category.name}</strong>
          <span>${productCount} produtos</span>
          <small>${category.showInShowcase ? 'Aparece na vitrine' : 'Nao aparece na vitrine'}</small>
        </div>
        <div class="row-actions category-manager-card__actions">
          <button class="button button--ghost button--small" type="button" data-action="edit-category" data-category-id="${category.id}">Editar</button>
          <button class="button button--danger button--small" type="button" data-action="delete-category" data-category-id="${category.id}">Apagar</button>
        </div>
      </article>
    `;
  }).join('');
}
```

- [ ] **Step 2: Replace `renderProductRows`**

Use:

```js
function renderProductRows() {
  const products = getFilteredProducts();
  const categoriesById = getCategoriesById();

  if (!products.length) {
    return '<div class="empty-products">Nenhum produto encontrado com os filtros atuais.</div>';
  }

  return products.map((product) => {
    const category = categoriesById.get(product.categoryId);
    const inShowcase = isProductInShowcase(product, categoriesById);

    return `
      <article class="product-manager-card">
        <header class="product-manager-card__header">
          <div>
            <strong>${product.name}</strong>
            <span>${category ? category.name : 'Sem categoria'}</span>
          </div>
          <strong class="product-manager-card__price">${formatCurrency(product.price)}</strong>
        </header>
        <div class="product-manager-card__meta">
          <span>Estoque: ${Number(product.stock || 0)}</span>
          <span class="${product.active ? 'badge badge--success' : 'badge badge--muted'}">${product.active ? 'Ativo' : 'Inativo'}</span>
          ${inShowcase ? '<span class="badge badge--primary">Na vitrine</span>' : '<span class="badge badge--muted">Fora da vitrine</span>'}
        </div>
        <div class="row-actions product-manager-card__actions">
          <button class="button button--ghost button--small" type="button" data-action="edit-product" data-product-id="${product.id}">Editar</button>
          <button class="button button--danger button--small" type="button" data-action="delete-product" data-product-id="${product.id}">Apagar</button>
        </div>
      </article>
    `;
  }).join('');
}
```

- [ ] **Step 3: Run tests**

Run:

```powershell
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
```

Expected:

```text
product service crud ok
transaction service ok
```

Do not commit yet; Task 6 completes CRM rendering.

## Task 6: Improve CRM Ranking Rendering

**Files:**
- Modify: `src/modules/produtos/produtos.module.js`

- [ ] **Step 1: Replace `renderBestSellers`**

Use:

```js
function renderBestSellers() {
  const bestSellers = getFilteredBestSellers();

  if (!bestSellers.length) {
    return '<div class="empty-products product-empty-large">Nenhuma venda no periodo.</div>';
  }

  const mostSold = bestSellers.slice(0, 6);
  const leastSold = [...bestSellers]
    .sort((a, b) => {
      if (a.quantity !== b.quantity) {
        return a.quantity - b.quantity;
      }

      return a.revenue - b.revenue;
    })
    .slice(0, 6);

  return `
    <div class="product-crm-grid">
      ${renderBestSellerRanking('Mais vendidos', mostSold, 'quantity')}
      ${renderBestSellerRanking('Menos vendidos', leastSold, 'quantity')}
    </div>
  `;
}

function renderBestSellerRanking(title, rows, metric) {
  const maxQuantity = Math.max(...rows.map((item) => item.quantity), 1);

  return `
    <section class="product-ranking-panel">
      <header>
        <h3>${title}</h3>
        <span>${rows.length} produtos</span>
      </header>
      <div class="product-ranking-list">
        ${rows.map((item, index) => {
          const percent = Math.max((item[metric] / maxQuantity) * 100, 8);

          return `
            <article class="product-ranking-row">
              <div class="product-ranking-row__info">
                <strong>${index + 1}. ${item.name}</strong>
                <span>${item.quantity} vendidos - ${formatCurrency(item.revenue)}</span>
              </div>
              <div class="best-seller-bar" aria-label="${item.name}: ${item.quantity}">
                <span style="width: ${percent}%"></span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}
```

- [ ] **Step 2: Replace `renderBestSellerPeriodOptions` options**

Use:

```js
  const options = [
    ['today', 'Hoje'],
    ['yesterday', 'Ontem'],
    ['last7', '7 dias'],
    ['last30', '30 dias'],
    ['month', 'Este mes'],
    ['year', 'Este ano'],
    ['all', 'Todo periodo'],
    ['custom', 'Personalizado']
  ];
```

- [ ] **Step 3: Run tests**

Run:

```powershell
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
```

Expected:

```text
product service crud ok
transaction service ok
```

Do not commit yet; Task 7 adds styles.

## Task 7: Add Produtos Dashboard Styles

**Files:**
- Modify: `src/styles/pdv.css`

- [ ] **Step 1: Add styles after the existing `.products-module` rule**

Add:

```css
.products-dashboard {
  gap: 18px;
}

.products-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 20px;
  border: 1px solid rgba(238, 224, 214, 0.9);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: var(--shadow-soft);
}

.products-hero__eyebrow {
  display: inline-flex;
  margin-bottom: 6px;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.products-hero__actions {
  justify-content: flex-end;
}

.product-summary-grid,
.product-alert-grid,
.category-card-grid,
.product-card-grid,
.product-crm-grid {
  display: grid;
  gap: 12px;
}

.product-summary-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.product-summary-card,
.product-alert,
.category-manager-card,
.product-manager-card,
.product-ranking-panel {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--shadow-soft);
}

.product-summary-card {
  display: grid;
  gap: 8px;
  min-height: 92px;
  padding: 16px;
}

.product-summary-card span,
.product-alert span,
.category-manager-card span,
.category-manager-card small,
.product-manager-card span,
.product-ranking-panel header span,
.product-ranking-row__info span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.product-summary-card strong {
  font-size: 20px;
  line-height: 1.15;
}

.product-alert-grid {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.product-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 10px 12px;
}

.product-alert strong {
  color: var(--color-text);
  font-size: 18px;
}

.product-alert--danger {
  border-color: rgba(194, 65, 59, 0.28);
  background: #fff1f1;
}

.product-alert--warning {
  border-color: rgba(255, 107, 26, 0.28);
  background: var(--crm-orange-soft);
}

.product-alert--success {
  border-color: rgba(23, 130, 79, 0.25);
  background: #e8f6ef;
}

.product-alert--muted {
  background: var(--color-surface-muted);
}

.products-section__header {
  align-items: flex-start;
}

.products-section__header div {
  display: grid;
  gap: 4px;
}

.category-card-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  padding: 12px;
}

.category-manager-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.category-manager-card.is-active {
  border-color: var(--color-primary);
  background: var(--crm-orange-soft);
}

.category-manager-card__body {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.category-manager-card__actions,
.product-manager-card__actions {
  flex-wrap: nowrap;
}

.products-filter-row--three {
  grid-template-columns: minmax(220px, 1fr) minmax(180px, 240px) minmax(180px, 240px);
}

.products-filter-row--crm,
.products-filter-row--custom {
  grid-template-columns: repeat(2, minmax(180px, 240px));
  justify-content: start;
}

.product-card-grid {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  padding: 12px;
}

.product-manager-card {
  display: grid;
  gap: 14px;
  padding: 14px;
}

.product-manager-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.product-manager-card__header div {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.product-manager-card__price {
  color: var(--color-primary);
  white-space: nowrap;
}

.product-manager-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 900;
}

.badge--primary {
  border-color: rgba(255, 107, 26, 0.25);
  background: var(--crm-orange-soft);
  color: var(--color-primary);
}

.badge--success {
  border-color: rgba(23, 130, 79, 0.25);
  background: #e8f6ef;
  color: var(--color-success);
}

.badge--muted {
  color: var(--color-text-muted);
}

.product-crm-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 12px;
}

.product-ranking-panel {
  min-width: 0;
  padding: 16px;
}

.product-ranking-panel header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.product-ranking-panel h3 {
  margin: 0;
  font-size: 16px;
}

.product-ranking-list,
.product-ranking-row,
.product-ranking-row__info {
  display: grid;
  gap: 10px;
}
```

- [ ] **Step 2: Extend mobile media query**

Inside `@media (max-width: 760px)`, add these selectors to the existing responsive lists:

```css
  .products-hero,
  .product-manager-card__header,
  .category-manager-card {
    align-items: stretch;
    flex-direction: column;
  }

  .product-summary-grid,
  .products-filter-row--three,
  .products-filter-row--crm,
  .products-filter-row--custom,
  .product-crm-grid {
    grid-template-columns: 1fr;
  }

  .products-hero__actions,
  .category-manager-card__actions,
  .product-manager-card__actions {
    justify-content: stretch;
  }

  .category-manager-card__actions .button,
  .product-manager-card__actions .button {
    flex: 1;
  }
```

- [ ] **Step 3: Run tests**

Run:

```powershell
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
```

Expected:

```text
product service crud ok
transaction service ok
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add src/modules/produtos/produtos.module.js src/styles/pdv.css src/services/transaction.service.js tests/transaction-service.test.mjs
git commit -m "style: redesign produtos dashboard"
```

Expected: commit succeeds with only Produtos module, PDV styles, transaction service, and transaction test.

## Task 8: Browser Verification and Regression Checks

**Files:**
- Verify only unless a defect is found.

- [ ] **Step 1: Start local server**

Run:

```powershell
scripts\start-server.cmd
```

Expected: local server available at `http://127.0.0.1:5500/`.

- [ ] **Step 2: Open the app and verify Produtos manually**

In the browser:

1. Log in with the existing admin credentials used by the project.
2. Open **Produtos**.
3. Confirm the hero title/subtitle and both creation buttons are visible.
4. Confirm summary cards render.
5. Confirm alert chips render only when counts are nonzero.
6. Filter by product name.
7. Filter by category.
8. Filter by status: Ativo, Inativo, Aparece na vitrine, Nao aparece na vitrine.
9. Open **+ Nova categoria**, save a category, edit it, then delete it.
10. Open **+ Novo produto**, save a product, edit it, then delete it.
11. Confirm CRM rankings still show quantity and revenue.
12. Switch CRM period to Hoje, Ontem, 7 dias, 30 dias, and Personalizado.

- [ ] **Step 3: Verify protected non-scope areas**

In the browser:

1. Open Frente de Caixa and confirm product cards still load.
2. Open Vitrine/Estoque sections that exist in this base and confirm no blank screen.
3. Reload the app and confirm the PWA shell still opens.

- [ ] **Step 4: Run broader test subset**

Run:

```powershell
node tests\product-service.test.mjs
node tests\product-adapters.test.mjs
node tests\transaction-service.test.mjs
node tests\showcase-stock-service.test.mjs
node tests\showcase-sync-service.test.mjs
```

Expected:

```text
product service crud ok
product adapters ok
transaction service ok
showcase stock service ok
showcase sync service ok
```

- [ ] **Step 5: Update cache/version only if deploying from this branch**

If this branch will be deployed immediately, update `index.html` and `service-worker.js` version strings in a separate deployment commit. Use the current base values as reference:

```text
pdv-v51
app.js?v=20260616-04
```

For implementation-only verification without deployment, do not touch cache or app version files.

## Task 9: Final Status

**Files:**
- No code changes unless verification finds defects.

- [ ] **Step 1: Check git status**

Run:

```powershell
git status --short --branch
```

Expected: branch `codex/showcase-stock-sync` with no uncommitted implementation changes.

- [ ] **Step 2: Summarize changed files**

Report:

```text
Modified:
- src/modules/produtos/produtos.module.js
- src/styles/pdv.css
- src/services/transaction.service.js
- tests/transaction-service.test.mjs

Not changed:
- Supabase migrations
- Frente de Caixa module
- Vitrine/App modules
- Database schema
```

- [ ] **Step 3: Mention verification results**

Report the exact tests and browser flows that passed. If any manual check was not possible, name it clearly and explain why.
