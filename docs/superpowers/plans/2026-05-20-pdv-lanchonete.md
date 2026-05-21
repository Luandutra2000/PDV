# PDV Lanchonete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first functional local version of the PDV front-of-house screen with modular HTML, CSS, JavaScript, mocked data, localStorage persistence, and sync event logging.

**Architecture:** The app uses ES modules with small focused files. UI components render markup, screen modules coordinate user interaction, domain services own data changes, `storage.service.js` is the only direct localStorage access point, and `sync.service.js` records future integration events through an event bus.

**Tech Stack:** HTML, CSS, vanilla JavaScript ES modules, localStorage, no framework, no build step.

---

## File Map

- `index.html`: App shell and stylesheet/script imports.
- `src/app.js`: Application bootstrap, initializes data, sync subscriptions, sidebar, and sales screen.
- `src/database/mock-data.js`: Initial categories, products, cash state, and active comanda.
- `src/database/schema.js`: Storage keys and sync event names.
- `src/services/storage.service.js`: Safe localStorage read/write/reset helpers.
- `src/services/event-bus.service.js`: Pub/sub utility for cross-module events.
- `src/services/product.service.js`: Product filtering, category listing, and lookup.
- `src/services/comanda.service.js`: Active comanda state, add/remove/update quantity, subtotal.
- `src/services/caixa.service.js`: Initial cash summary service for top bar.
- `src/services/sync.service.js`: Subscribes to domain events and stores pending sync events.
- `src/utils/currency.js`: BRL currency formatting.
- `src/utils/dom.js`: Small DOM helpers.
- `src/components/sidebar.component.js`: Sidebar navigation markup.
- `src/components/product-card.component.js`: Product card markup.
- `src/components/order-panel.component.js`: Comanda panel markup.
- `src/modules/vendas/vendas.module.js`: Frente de Caixa screen behavior.
- `src/modules/*/*.module.js`: Placeholder initializers for future modules.
- `src/styles/*.css`: Modular CSS by responsibility.

## Task 1: Create App Shell and Styles

**Files:**
- Create: `index.html`
- Create: `src/styles/base.css`
- Create: `src/styles/layout.css`
- Create: `src/styles/sidebar.css`
- Create: `src/styles/buttons.css`
- Create: `src/styles/cards.css`
- Create: `src/styles/modal.css`
- Create: `src/styles/forms.css`
- Create: `src/styles/pdv.css`

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PDV Lanchonete</title>
  <link rel="stylesheet" href="./src/styles/base.css">
  <link rel="stylesheet" href="./src/styles/layout.css">
  <link rel="stylesheet" href="./src/styles/sidebar.css">
  <link rel="stylesheet" href="./src/styles/buttons.css">
  <link rel="stylesheet" href="./src/styles/cards.css">
  <link rel="stylesheet" href="./src/styles/modal.css">
  <link rel="stylesheet" href="./src/styles/forms.css">
  <link rel="stylesheet" href="./src/styles/pdv.css">
</head>
<body>
  <div id="app" class="app-shell"></div>
  <script type="module" src="./src/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create base CSS**

```css
:root {
  --color-bg: #f3f5f8;
  --color-surface: #ffffff;
  --color-surface-muted: #eef2f6;
  --color-border: #d9e0e8;
  --color-text: #18202b;
  --color-text-muted: #647184;
  --color-primary: #1f7ae0;
  --color-primary-strong: #155bb0;
  --color-danger: #c2413b;
  --color-success: #17824f;
  --shadow-soft: 0 12px 28px rgba(18, 31, 53, 0.08);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  font-family: Arial, Helvetica, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
}

button, input { font: inherit; }
button { cursor: pointer; }
```

- [ ] **Step 3: Create layout and component CSS**

Create focused CSS files for shell, sidebar, buttons, cards, forms, modal placeholders, and PDV-specific layout. Use the approved visual structure: left sidebar, central product grid, right comanda panel.

- [ ] **Step 4: Manual check**

Open `index.html` in a browser after later JS tasks. Expected: no missing CSS errors in console.

## Task 2: Create Data, Storage, Events, and Utilities

**Files:**
- Create: `src/database/mock-data.js`
- Create: `src/database/schema.js`
- Create: `src/services/storage.service.js`
- Create: `src/services/event-bus.service.js`
- Create: `src/utils/currency.js`
- Create: `src/utils/dom.js`

- [ ] **Step 1: Define storage keys and events**

```js
export const STORAGE_KEYS = {
  products: 'pdv.products',
  categories: 'pdv.categories',
  activeComanda: 'pdv.activeComanda',
  caixa: 'pdv.caixa',
  syncQueue: 'pdv.syncQueue'
};

export const SYNC_EVENTS = {
  comandaItemAdded: 'COMANDA_ITEM_ADDED',
  comandaItemRemoved: 'COMANDA_ITEM_REMOVED',
  comandaQuantityChanged: 'COMANDA_QUANTITY_CHANGED',
  comandaCleared: 'COMANDA_CLEARED',
  saleFinished: 'SALE_FINISHED'
};
```

- [ ] **Step 2: Create mock data**

Define categories similar to the reference screen and products with `id`, `name`, `categoryId`, `price`, `cost`, `stock`, and `active`.

- [ ] **Step 3: Create storage service**

Implement `getItem(key, fallback)`, `setItem(key, value)`, `ensureSeedData()`, and `resetAppData()`. If JSON parsing fails, return fallback and overwrite invalid values on next save.

- [ ] **Step 4: Create event bus**

Implement `on(eventName, handler)`, `off(eventName, handler)`, and `emit(eventName, payload)` using a private `Map`.

- [ ] **Step 5: Create utils**

`currency.js` exports `formatCurrency(value)` using `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

`dom.js` exports `qs(selector, root = document)`, `qsa(selector, root = document)`, and `clearElement(element)`.

## Task 3: Create Domain Services

**Files:**
- Create: `src/services/product.service.js`
- Create: `src/services/comanda.service.js`
- Create: `src/services/caixa.service.js`
- Create: `src/services/sync.service.js`

- [ ] **Step 1: Product service**

Implement `getProducts()`, `getActiveProducts()`, `getCategories()`, `getProductById(productId)`, and `searchProducts({ query, categoryId })`.

- [ ] **Step 2: Comanda service**

Implement `getActiveComanda()`, `addItem(product)`, `removeItem(productId)`, `updateQuantity(productId, quantity)`, `clearComanda()`, and `getSubtotal(comanda)`. Quantity lower than 1 removes the item.

- [ ] **Step 3: Caixa service**

Implement `getCaixaSummary()` returning the seeded cash summary for the top bar.

- [ ] **Step 4: Sync service**

Implement `initSyncService()` that subscribes to `SYNC_EVENTS`, appends events to `STORAGE_KEYS.syncQueue`, and includes `id`, `type`, `payload`, `createdAt`, and `status: 'pending'`.

## Task 4: Create Components and Modules

**Files:**
- Create: `src/components/sidebar.component.js`
- Create: `src/components/product-card.component.js`
- Create: `src/components/order-panel.component.js`
- Create: `src/modules/vendas/vendas.module.js`
- Create: placeholder module files for `caixa`, `comandas`, `produtos`, `estoque`, `relatorios`, `despesas`, `dashboard`, `pessoas`, `sync-app`.

- [ ] **Step 1: Sidebar component**

Render grouped menus exactly as approved: Frente de Caixa, Dashboard, Produtos, Pessoas, Estoque, Fechar Caixa, Fichario / Fiado, Despesas, Relatorios, Suporte.

- [ ] **Step 2: Product card component**

Render a button/card with `data-product-id`, product name, category label, price, and stock hint.

- [ ] **Step 3: Order panel component**

Render empty state when no items exist. Render rows with quantity controls, remove action, item total, subtotal, and disabled visual receive button.

- [ ] **Step 4: Vendas module**

Render the PDV screen, wire search, category filters, product card clicks, quantity controls, removal, and subtotal updates.

- [ ] **Step 5: Placeholder modules**

Each future module exports an `init<ModuleName>Module()` function that returns a small metadata object. These files keep the required structure ready without adding fake behavior.

## Task 5: Bootstrap and Verify

**Files:**
- Create: `src/app.js`

- [ ] **Step 1: Bootstrap app**

`app.js` calls `ensureSeedData()`, `initSyncService()`, renders the shell with sidebar and top bar, then calls `initVendasModule()` in the main content area.

- [ ] **Step 2: Manual browser verification**

Open `index.html`. Expected:

- Sidebar appears.
- Top bar shows current cash value.
- Frente de Caixa is visible.
- Product grid appears from mock data.
- Search filters products.
- Category filters products.
- Clicking a product adds it to the comanda.
- Plus/minus controls update quantity.
- Remove deletes item.
- Subtotal updates in BRL.
- Reload keeps active comanda.
- `localStorage.getItem('pdv.syncQueue')` contains pending sync events.

- [ ] **Step 3: Commit**

Run:

```bash
git add index.html src docs/superpowers
git commit -m "feat: add initial modular pdv"
```

Expected: commit succeeds if Git is installed. In this environment, Git may be unavailable; if so, report that commit could not be created.

## Self-Review

- Spec coverage: covered required folder structure, initial files, reference-inspired layout, sidebar, Frente de Caixa, product cards, comanda panel, add/remove/update quantity, subtotal, mocked data, localStorage, modular services, and sync queue.
- Placeholder scan: future modules are intentionally minimal but have explicit initializer behavior; no unspecified implementation remains for first delivery.
- Type consistency: service and component names are consistent across tasks.
