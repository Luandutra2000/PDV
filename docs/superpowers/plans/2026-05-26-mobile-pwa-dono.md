# Mobile PWA do Dono Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile/PWA owner dashboard with live filtered event feed, cash KPIs, showcase status, CRM summary, and closing summary using the current PDV data first.

**Architecture:** Add focused mobile services that normalize existing transactions, stock, CRM, and closing data into UI-ready view models. Add a mobile module rendered by the existing app router, with one CSS file for the approved mobile design and a simple PWA shell that caches static assets only.

**Tech Stack:** JavaScript ES modules, existing localStorage services, existing event bus, plain CSS, standalone Node `.mjs` service tests, static PWA manifest/service worker.

---

## File Structure

- Create `src/services/mobile-notifications.service.js`: normalizes sales, cash movements, stock alerts, and closing alerts into feed events; sorts newest first; filters by type.
- Create `src/services/mobile-cash-flow.service.js`: builds mobile cash cards from `getDailyMoneySummary()` and payment totals.
- Create `src/services/mobile-showcase.service.js`: builds mobile showcase cards from `getStockSummary()` and `getProductionSalesComparison()`.
- Create `src/services/mobile-closing.service.js`: builds current closing preview and closing history from `cash-closing.service.js`.
- Create `src/services/realtime.service.js`: small local realtime bridge using the existing event bus; future Supabase realtime can replace this boundary.
- Create `src/modules/mobile/mobile-dashboard.module.js`: renders the mobile shell, bottom tabs, KPI cards, feed, filters, and tab bodies.
- Create `src/styles/mobile.css`: mobile/PWA visual system based on the approved mockup and current app colors.
- Modify `src/app.js`: add `mobile` route and optional direct `?view=mobile` startup.
- Modify `src/components/sidebar.component.js`: add a desktop sidebar entry to open the mobile owner panel.
- Modify `index.html`: include `src/styles/mobile.css`, `manifest.json`, and service worker registration.
- Create `manifest.json`: PWA metadata and theme color.
- Create `service-worker.js`: static cache for app shell files only.
- Create `tests/mobile-notifications-service.test.mjs`.
- Create `tests/mobile-cash-flow-service.test.mjs`.
- Create `tests/mobile-showcase-service.test.mjs`.
- Create `tests/mobile-closing-service.test.mjs`.

---

### Task 1: Mobile Notifications Service

**Files:**
- Create: `src/services/mobile-notifications.service.js`
- Test: `tests/mobile-notifications-service.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/mobile-notifications-service.test.mjs`:

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
  if (!condition) throw new Error(message);
};

const storage = await import('../src/services/storage.service.js');
const products = await import('../src/services/product.service.js');
const comandas = await import('../src/services/comanda.service.js');
const transactions = await import('../src/services/transaction.service.js');
const estoque = await import('../src/services/estoque.service.js');
const notifications = await import('../src/services/mobile-notifications.service.js');

storage.resetAppData();
const burger = products.getProductById('x-burger');
const soda = products.getProductById('refrigerante-lata');

estoque.createStockLaunch({ produtoId: burger.id, quantidade: 6 });
comandas.clearComanda();
comandas.addItem(burger);
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 40 });
transactions.registerCashMovement({ type: 'entrada', amount: 100, description: 'Troco inicial' });
transactions.registerCashMovement({ type: 'saida', amount: 85, description: 'Compra de material' });
estoque.createStockLaunch({ produtoId: soda.id, quantidade: 2 });

const events = notifications.getMobileFeedEvents({ now: new Date() });
assert(events.length >= 4, 'feed should include sales, cash movements, and stock alerts');
assert(events[0].createdAt >= events[1].createdAt, 'feed should be newest first');
assert(events.some((event) => event.kind === 'sale' && event.title === 'Venda realizada'), 'sale event should be present');
assert(events.some((event) => event.kind === 'outflow' && event.level === 'danger'), 'high outflow should be danger');
assert(events.some((event) => event.kind === 'alert' && event.title === 'Produto acabando'), 'low showcase stock alert should be present');

const saleEvents = notifications.getMobileFeedEvents({ filter: 'sales' });
assert(saleEvents.length > 0, 'sales filter should return sale events');
assert(saleEvents.every((event) => event.kind === 'sale'), 'sales filter should only return sale events');

console.log('mobile notifications service ok');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/mobile-notifications-service.test.mjs`

Expected: FAIL with a module-not-found error for `mobile-notifications.service.js`.

- [ ] **Step 3: Implement the service**

Create `src/services/mobile-notifications.service.js`:

```js
import { getProductionSalesComparison } from './estoque.service.js';
import { getTransactions } from './transaction.service.js';

const FILTERS = {
  all: () => true,
  sales: (event) => event.kind === 'sale',
  entries: (event) => event.kind === 'inflow',
  outputs: (event) => event.kind === 'outflow',
  alerts: (event) => event.kind === 'alert'
};

const HIGH_SALE_AMOUNT = 100;
const HIGH_OUTPUT_AMOUNT = 80;
const LOW_SHOWCASE_QUANTITY = 5;

export function getMobileFeedEvents({ filter = 'all', limit = 30, now = new Date() } = {}) {
  const events = [
    ...buildTransactionEvents(),
    ...buildShowcaseAlertEvents(now)
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return events.filter(FILTERS[filter] || FILTERS.all).slice(0, limit);
}

export function getMobileFeedFilters() {
  return [
    { id: 'all', label: 'Tudo' },
    { id: 'sales', label: 'Vendas' },
    { id: 'entries', label: 'Entradas' },
    { id: 'outputs', label: 'Saidas' },
    { id: 'alerts', label: 'Alertas' }
  ];
}

function buildTransactionEvents() {
  return getTransactions()
    .filter((transaction) => transaction.status !== 'cancelada')
    .map((transaction) => {
      if (transaction.type === 'venda') return buildSaleEvent(transaction);
      if (transaction.type === 'entrada') return buildCashEvent(transaction, 'inflow');
      if (transaction.type === 'saida') return buildCashEvent(transaction, 'outflow');
      return null;
    })
    .filter(Boolean);
}

function buildSaleEvent(sale) {
  const quantity = sale.items.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const firstItem = sale.items[0]?.name || 'Venda';
  return {
    id: `sale-${sale.id}`,
    kind: 'sale',
    level: Number(sale.total || 0) >= HIGH_SALE_AMOUNT ? 'success' : 'info',
    title: 'Venda realizada',
    description: `${quantity} item(ns) - ${firstItem}`,
    amount: Number(sale.total || 0),
    createdAt: sale.createdAt,
    icon: 'R$'
  };
}

function buildCashEvent(movement, kind) {
  const isOutput = kind === 'outflow';
  const amount = Number(movement.amount || 0);
  return {
    id: `${kind}-${movement.id}`,
    kind,
    level: isOutput && amount >= HIGH_OUTPUT_AMOUNT ? 'danger' : isOutput ? 'warning' : 'success',
    title: isOutput ? 'Saida de caixa' : 'Entrada de caixa',
    description: movement.description || movement.category || 'Movimento de caixa',
    amount,
    createdAt: movement.createdAt,
    icon: isOutput ? '!' : '+'
  };
}

function buildShowcaseAlertEvents(now) {
  return getProductionSalesComparison({ period: 'today' })
    .filter((item) => item.sobraQuantidade > 0 && item.sobraQuantidade <= LOW_SHOWCASE_QUANTITY)
    .map((item) => ({
      id: `showcase-low-${item.produtoId}`,
      kind: 'alert',
      level: 'danger',
      title: 'Produto acabando',
      description: `${item.produtoNome}: restam ${item.sobraQuantidade} unidade(s)`,
      amount: null,
      createdAt: now.toISOString(),
      icon: '!'
    }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/mobile-notifications-service.test.mjs`

Expected: PASS and print `mobile notifications service ok`.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/services/mobile-notifications.service.js tests/mobile-notifications-service.test.mjs
git commit -m "feat: add mobile notification feed service"
```

---

### Task 2: Mobile Summary Services

**Files:**
- Create: `src/services/mobile-cash-flow.service.js`
- Create: `src/services/mobile-showcase.service.js`
- Create: `src/services/mobile-closing.service.js`
- Test: `tests/mobile-cash-flow-service.test.mjs`
- Test: `tests/mobile-showcase-service.test.mjs`
- Test: `tests/mobile-closing-service.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/mobile-cash-flow-service.test.mjs` with seeded sale, entry, and output. Assert `getMobileCashFlowSummary()` returns `salesTotal`, `entriesTotal`, `outputsTotal`, `currentCash`, `estimatedProfit`, and `paymentTotals`.

Create `tests/mobile-showcase-service.test.mjs` with stock launches and sales. Assert `getMobileShowcaseSummary()` returns produced units, sold units, remaining units, estimated value, sold value, best seller, and low stock rows.

Create `tests/mobile-closing-service.test.mjs` with a saved closing. Assert `getMobileClosingSummary()` returns expected cash, payment totals, difference, and history.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node tests/mobile-cash-flow-service.test.mjs
node tests/mobile-showcase-service.test.mjs
node tests/mobile-closing-service.test.mjs
```

Expected: FAIL with module-not-found errors for the three new services.

- [ ] **Step 3: Implement cash flow service**

Create `src/services/mobile-cash-flow.service.js`:

```js
import { getCaixaSummary } from './caixa.service.js';
import { getDailyMoneySummary } from './transaction.service.js';

export function getMobileCashFlowSummary() {
  const caixa = getCaixaSummary();
  const summary = getDailyMoneySummary();

  return {
    salesTotal: summary.salesTotal,
    entriesTotal: summary.entriesTotal,
    outputsTotal: summary.outputsTotal,
    currentCash: Number(caixa.currentAmount || 0),
    expectedCash: summary.expectedCash,
    estimatedProfit: summary.salesTotal + summary.entriesTotal - summary.outputsTotal,
    paymentTotals: summary.paymentTotals,
    cards: [
      { id: 'sales', label: 'Total vendido', value: summary.salesTotal, tone: 'primary' },
      { id: 'entries', label: 'Entradas', value: summary.entriesTotal, tone: 'success' },
      { id: 'outputs', label: 'Saidas', value: summary.outputsTotal, tone: 'danger' },
      { id: 'cash', label: 'Saldo caixa', value: Number(caixa.currentAmount || 0), tone: 'info' },
      { id: 'profit', label: 'Lucro estimado', value: summary.salesTotal + summary.entriesTotal - summary.outputsTotal, tone: 'warning' }
    ]
  };
}
```

- [ ] **Step 4: Implement showcase service**

Create `src/services/mobile-showcase.service.js`:

```js
import { getProductionSalesComparison, getStockSummary } from './estoque.service.js';

export function getMobileShowcaseSummary() {
  const summary = getStockSummary({ period: 'today' });
  const rows = getProductionSalesComparison({ period: 'today' });
  const bestSellers = [...rows].sort((a, b) => b.quantidadeVendida - a.quantidadeVendida);
  const slowSellers = [...rows].sort((a, b) => a.percentualVendido - b.percentualVendido);

  return {
    producedUnits: summary.producedUnits,
    soldUnits: summary.soldUnits,
    remainingUnits: summary.quantityBalance,
    estimatedValue: summary.estimatedProductionValue,
    soldValue: summary.salesValue,
    valueDifference: summary.valueDifference,
    bestSeller: bestSellers[0] || null,
    slowSeller: slowSellers[0] || null,
    lowStock: rows.filter((row) => row.sobraQuantidade > 0 && row.sobraQuantidade <= 5),
    rows
  };
}
```

- [ ] **Step 5: Implement closing service**

Create `src/services/mobile-closing.service.js`:

```js
import { buildClosingSummary, getCashClosings } from './cash-closing.service.js';

export function getMobileClosingSummary() {
  const current = buildClosingSummary({});
  const history = getCashClosings();

  return {
    expectedCash: current.payments.expectedCash,
    expectedPix: current.payments.expectedPix,
    expectedDebit: current.payments.expectedDebit,
    expectedCredit: current.payments.expectedCredit,
    entriesTotal: current.totals.entries,
    outputsTotal: current.totals.outputs,
    cashDifference: current.payments.cashDifference,
    generalDifference: current.payments.generalDifference,
    history
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
node tests/mobile-cash-flow-service.test.mjs
node tests/mobile-showcase-service.test.mjs
node tests/mobile-closing-service.test.mjs
```

Expected: all PASS with `mobile ... service ok` messages.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/services/mobile-cash-flow.service.js src/services/mobile-showcase.service.js src/services/mobile-closing.service.js tests/mobile-cash-flow-service.test.mjs tests/mobile-showcase-service.test.mjs tests/mobile-closing-service.test.mjs
git commit -m "feat: add mobile summary services"
```

---

### Task 3: Realtime Bridge

**Files:**
- Create: `src/services/realtime.service.js`
- Modify: `src/database/schema.js`

- [ ] **Step 1: Add UI event name**

Modify `src/database/schema.js`:

```js
export const UI_EVENTS = {
  cashSummaryChanged: 'CASH_SUMMARY_CHANGED',
  mobileFeedChanged: 'MOBILE_FEED_CHANGED'
};
```

- [ ] **Step 2: Implement realtime bridge**

Create `src/services/realtime.service.js`:

```js
import { SYNC_EVENTS, UI_EVENTS } from '../database/schema.js';
import { emit, on } from './event-bus.service.js';

let initialized = false;

export function initRealtimeService() {
  if (initialized) return;

  on(SYNC_EVENTS.saleFinished, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.cashMovementRegistered, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));

  initialized = true;
}
```

- [ ] **Step 3: Commit**

Run:

```bash
git add src/database/schema.js src/services/realtime.service.js
git commit -m "feat: add local realtime bridge for mobile feed"
```

---

### Task 4: Mobile Dashboard Module

**Files:**
- Create: `src/modules/mobile/mobile-dashboard.module.js`
- Create: `src/styles/mobile.css`
- Modify: `src/app.js`
- Modify: `src/components/sidebar.component.js`
- Test manually in browser

- [ ] **Step 1: Add route and sidebar entry**

Modify `src/app.js` imports and routes:

```js
import { initMobileDashboardModule } from './modules/mobile/mobile-dashboard.module.js';
import { initRealtimeService } from './services/realtime.service.js';

const routes = {
  'frente-caixa': initVendasModule,
  dashboard: initDashboardModule,
  produtos: initProdutosModule,
  estoque: initEstoqueModule,
  'fechar-caixa': initCaixaModule,
  mobile: initMobileDashboardModule
};
```

Call `initRealtimeService()` inside `bootstrap()` after `initSyncService()`.

Use the initial route:

```js
const initialView = new URLSearchParams(window.location.search).get('view');
if (initialView === 'mobile') {
  initMobileDashboardModule(workspace);
} else {
  initVendasModule(workspace);
}
```

Modify `src/components/sidebar.component.js` and add this item under `Gestao` or `Outros`:

```js
{ id: 'mobile', label: 'App do Dono', icon: 'AD' }
```

- [ ] **Step 2: Implement mobile module**

Create `src/modules/mobile/mobile-dashboard.module.js`:

```js
import { UI_EVENTS } from '../../database/schema.js';
import { on } from '../../services/event-bus.service.js';
import { formatCurrency } from '../../utils/currency.js';
import { getMobileCashFlowSummary } from '../../services/mobile-cash-flow.service.js';
import { getMobileClosingSummary } from '../../services/mobile-closing.service.js';
import { getMobileFeedEvents, getMobileFeedFilters } from '../../services/mobile-notifications.service.js';
import { getMobileShowcaseSummary } from '../../services/mobile-showcase.service.js';

const tabs = [
  { id: 'home', label: 'Inicio', icon: '⌂' },
  { id: 'cash', label: 'Caixa', icon: '$' },
  { id: 'showcase', label: 'Vitrine', icon: '▦' },
  { id: 'crm', label: 'CRM', icon: '↗' },
  { id: 'closing', label: 'Fechar', icon: '✓' }
];

let state = { tab: 'home', filter: 'all' };

export function initMobileDashboardModule(workspace) {
  state = { tab: 'home', filter: 'all' };
  render(workspace);
  bindEvents(workspace);
  on(UI_EVENTS.mobileFeedChanged, () => render(workspace));
  on(UI_EVENTS.cashSummaryChanged, () => render(workspace));
}

function bindEvents(workspace) {
  workspace.addEventListener('click', (event) => {
    const tabButton = event.target.closest('[data-mobile-tab]');
    const filterButton = event.target.closest('[data-feed-filter]');

    if (tabButton) {
      state.tab = tabButton.dataset.mobileTab;
      render(workspace);
    }

    if (filterButton) {
      state.filter = filterButton.dataset.feedFilter;
      render(workspace);
    }
  });
}

function render(workspace) {
  const cash = getMobileCashFlowSummary();
  workspace.innerHTML = `
    <section class="mobile-shell">
      <div class="mobile-app">
        <header class="mobile-topbar">
          <div>
            <h1>PDV Lanchonete</h1>
            <p>Painel do dono</p>
          </div>
          <span>Hoje</span>
        </header>
        ${renderTabContent(cash)}
        ${renderBottomNav()}
      </div>
    </section>
  `;
}

function renderTabContent(cash) {
  if (state.tab === 'cash') return renderCashTab(cash);
  if (state.tab === 'showcase') return renderShowcaseTab();
  if (state.tab === 'crm') return renderCrmTab(cash);
  if (state.tab === 'closing') return renderClosingTab();
  return renderHomeTab(cash);
}

function renderHomeTab(cash) {
  return `
    <div class="mobile-content">
      ${renderHeroCard(cash.cards[0])}
      <div class="mobile-metrics">${cash.cards.slice(1).map(renderMetricCard).join('')}</div>
      ${renderLiveFeed()}
    </div>
  `;
}

function renderLiveFeed() {
  const filters = getMobileFeedFilters();
  const events = getMobileFeedEvents({ filter: state.filter });

  return `
    <section class="mobile-feed-panel">
      <div class="mobile-section-title">
        <strong>Ao vivo</strong>
        <span class="mobile-live-dot">recebendo</span>
      </div>
      <div class="mobile-feed-filters">
        ${filters.map((filter) => `
          <button class="${filter.id === state.filter ? 'is-active' : ''}" type="button" data-feed-filter="${filter.id}">
            ${filter.label}
          </button>
        `).join('')}
      </div>
      <div class="mobile-live-feed">
        ${events.map(renderFeedEvent).join('') || '<p class="mobile-empty">Nenhum evento neste filtro.</p>'}
      </div>
    </section>
  `;
}

function renderFeedEvent(event) {
  return `
    <article class="mobile-feed-event mobile-feed-event--${event.level}">
      <div class="mobile-feed-icon">${event.icon}</div>
      <div>
        <strong>${event.title}</strong>
        <p>${event.description}${event.amount ? ` - ${formatCurrency(event.amount)}` : ''}</p>
        <time>${formatRelativeTime(event.createdAt)}</time>
      </div>
    </article>
  `;
}

function renderCashTab(cash) {
  return `<div class="mobile-content"><div class="mobile-metrics">${cash.cards.map(renderMetricCard).join('')}</div></div>`;
}

function renderShowcaseTab() {
  const summary = getMobileShowcaseSummary();
  return `
    <div class="mobile-content">
      <div class="mobile-metrics">
        ${renderMetricCard({ label: 'Produzidos', value: summary.producedUnits, tone: 'info', isCurrency: false })}
        ${renderMetricCard({ label: 'Vendidos', value: summary.soldUnits, tone: 'success', isCurrency: false })}
        ${renderMetricCard({ label: 'Restantes', value: summary.remainingUnits, tone: 'warning', isCurrency: false })}
        ${renderMetricCard({ label: 'Valor vendido', value: summary.soldValue, tone: 'primary' })}
      </div>
      <section class="mobile-list-panel">
        <h2>Produtos na vitrine</h2>
        ${summary.rows.map((row) => `<div class="mobile-row"><span>${row.produtoNome}</span><strong>${row.sobraQuantidade} restantes</strong></div>`).join('')}
      </section>
    </div>
  `;
}

function renderCrmTab(cash) {
  return `
    <div class="mobile-content">
      <div class="mobile-metrics">
        ${renderMetricCard({ label: 'Ticket medio', value: cash.salesTotal ? cash.salesTotal : 0, tone: 'info' })}
        ${renderMetricCard({ label: 'Lucro estimado', value: cash.estimatedProfit, tone: 'warning' })}
      </div>
      ${renderLiveFeed()}
    </div>
  `;
}

function renderClosingTab() {
  const closing = getMobileClosingSummary();
  return `
    <div class="mobile-content">
      <div class="mobile-metrics">
        ${renderMetricCard({ label: 'Dinheiro esperado', value: closing.expectedCash, tone: 'primary' })}
        ${renderMetricCard({ label: 'Pix esperado', value: closing.expectedPix, tone: 'success' })}
        ${renderMetricCard({ label: 'Cartao esperado', value: closing.expectedDebit + closing.expectedCredit, tone: 'info' })}
        ${renderMetricCard({ label: 'Diferenca', value: closing.generalDifference, tone: closing.generalDifference ? 'danger' : 'success' })}
      </div>
    </div>
  `;
}

function renderHeroCard(card) {
  return `<section class="mobile-hero-card"><span>${card.label}</span><strong>${formatCurrency(card.value)}</strong></section>`;
}

function renderMetricCard(card) {
  const value = card.isCurrency === false ? card.value : formatCurrency(card.value);
  return `<article class="mobile-metric mobile-metric--${card.tone}"><span>${card.label}</span><strong>${value}</strong></article>`;
}

function renderBottomNav() {
  return `
    <nav class="mobile-bottom-nav" aria-label="Menu mobile">
      ${tabs.map((tab) => `
        <button class="${tab.id === state.tab ? 'is-active' : ''}" type="button" data-mobile-tab="${tab.id}">
          <span>${tab.icon}</span>
          <strong>${tab.label}</strong>
        </button>
      `).join('')}
    </nav>
  `;
}

function formatRelativeTime(value) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes <= 0) return 'agora';
  if (diffMinutes === 1) return '1 min';
  return `${diffMinutes} min`;
}
```

- [ ] **Step 3: Implement CSS**

Create `src/styles/mobile.css` based on the approved mockup: `.mobile-shell`, `.mobile-app`, `.mobile-topbar`, `.mobile-hero-card`, `.mobile-metrics`, `.mobile-metric--primary`, `.mobile-metric--success`, `.mobile-metric--danger`, `.mobile-metric--info`, `.mobile-metric--warning`, `.mobile-feed-filters`, `.mobile-feed-event`, `.mobile-bottom-nav`, and `@keyframes mobileFloatDown`.

- [ ] **Step 4: Manual browser test**

Open: `http://127.0.0.1:5500/?view=mobile`

Expected:

- Mobile dashboard renders.
- Cards use system colors.
- Feed shows newest event first.
- Filters change the visible feed.
- Bottom nav changes tabs.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/app.js src/components/sidebar.component.js src/modules/mobile/mobile-dashboard.module.js src/styles/mobile.css
git commit -m "feat: add mobile owner dashboard"
```

---

### Task 5: PWA Shell

**Files:**
- Create: `manifest.json`
- Create: `service-worker.js`
- Modify: `index.html`

- [ ] **Step 1: Add manifest**

Create `manifest.json`:

```json
{
  "name": "PDV Lanchonete",
  "short_name": "PDV Dono",
  "description": "Painel mobile do dono para acompanhar caixa e vendas.",
  "start_url": "/?view=mobile",
  "display": "standalone",
  "background_color": "#f8f2ec",
  "theme_color": "#ff6b1a",
  "icons": []
}
```

- [ ] **Step 2: Add service worker**

Create `service-worker.js`:

```js
const CACHE_NAME = 'pdv-lanchonete-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/styles/base.css',
  '/src/styles/layout.css',
  '/src/styles/sidebar.css',
  '/src/styles/buttons.css',
  '/src/styles/cards.css',
  '/src/styles/forms.css',
  '/src/styles/modal.css',
  '/src/styles/pdv.css',
  '/src/styles/mobile.css',
  '/src/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
```

- [ ] **Step 3: Register PWA in index**

Modify `index.html`:

```html
<link rel="manifest" href="./manifest.json">
<meta name="theme-color" content="#ff6b1a">
<link rel="stylesheet" href="./src/styles/mobile.css">
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js');
    });
  }
</script>
```

- [ ] **Step 4: Browser PWA smoke test**

Open: `http://127.0.0.1:5500/?view=mobile`

Expected:

- No console errors from service worker registration.
- Manifest is reachable at `http://127.0.0.1:5500/manifest.json`.
- Mobile app still loads.

- [ ] **Step 5: Commit**

Run:

```bash
git add index.html manifest.json service-worker.js
git commit -m "feat: add mobile pwa shell"
```

---

### Task 6: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run service tests**

Run:

```bash
node tests/mobile-notifications-service.test.mjs
node tests/mobile-cash-flow-service.test.mjs
node tests/mobile-showcase-service.test.mjs
node tests/mobile-closing-service.test.mjs
node tests/transaction-service.test.mjs
node tests/estoque-service.test.mjs
node tests/cash-closing-service.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 2: Browser verification**

Open:

```text
http://127.0.0.1:5500/?view=mobile
```

Expected:

- Home tab shows KPIs.
- Feed animation is visible.
- Filtering by Vendas, Entradas, Saidas, and Alertas works.
- Bottom nav changes to Caixa, Vitrine, CRM, and Fechamento.
- Layout stays readable at mobile width.

- [ ] **Step 3: Confirm git status**

Run: `git status --short`

Expected: no implementation files unstaged except intentionally ignored local server logs or mockup files.

---

## Self-Review

- Spec coverage: the plan covers mobile/PWA shell, colors, bottom nav, live newest-first feed, filters, cash, showcase, CRM-lite, closing preview, modular JS/CSS, tests, and future realtime boundary.
- Scope choice: Supabase realtime, auth, permissions, and push notifications remain out of this implementation, matching the approved spec.
- Placeholder scan: no task contains TBD/TODO placeholders.
- Type consistency: feed filter ids are `all`, `sales`, `entries`, `outputs`, and `alerts`; event kinds are `sale`, `inflow`, `outflow`, and `alert`.
