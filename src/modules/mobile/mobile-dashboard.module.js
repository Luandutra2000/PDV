import { UI_EVENTS } from '../../database/schema.js';
import { on } from '../../services/event-bus.service.js';
import {
  createPeriodFilter,
  getCategoryRanking,
  getCrmSummary,
  getProductRanking,
  getSalesSeries
} from '../../services/crm-dashboard.service.js';
import { getMobileCashFlowSummary } from '../../services/mobile-cash-flow.service.js';
import { getMobileClosingSummary } from '../../services/mobile-closing.service.js';
import {
  getMobileFeedEvents,
  getMobileFeedFilters,
  getMobileFeedPeriodFilters
} from '../../services/mobile-notifications.service.js?v=20260608-14';
import { getMobileShowcaseSummary } from '../../services/mobile-showcase.service.js';
import {
  createStockLaunch,
  getProductionSalesComparison
} from '../../services/estoque.service.js';
import { getShowcaseCategories, getShowcaseProducts, getProductById, syncCatalogNow } from '../../services/product.service.js';
import { getTransactionSyncStatus } from '../../services/transaction.service.js';
import { getCatalogSyncStatus } from '../../services/product.service.js';
import { logout } from '../../services/auth.service.js';
import { hydrateOnlineOperationalData, syncOnlineOperationalData } from '../../services/online-data.service.js';
import { isSupabaseEnabled } from '../../services/app-config.service.js';
import { getThemeLabel, toggleTheme } from '../../services/theme.service.js';
import { formatCurrency } from '../../utils/currency.js';

const tabs = [
  { id: 'home', label: 'Inicio', icon: 'IN' },
  { id: 'cash', label: 'Caixa', icon: '$' },
  { id: 'showcase', label: 'Vitrine', icon: 'VT' },
  { id: 'crm', label: 'CRM', icon: 'CR' },
  { id: 'closing', label: 'Fechar', icon: 'OK' }
];

let state = {
  tab: 'home',
  filter: 'all',
  feedPeriod: 'today',
  customStart: '',
  customEnd: '',
  feedLimit: 5,
  selectedFeedEventId: '',
  syncState: 'idle',
  syncError: '',
  showcaseCategoryId: '',
  showcaseProductId: '',
  periodMenuOpen: false
};

let subscribedWorkspace = null;
let unsubscribeRealtimeRefresh = [];

export function initMobileDashboardModule(workspace) {
  workspace.dataset.activeRoute = 'mobile';
  state = {
    tab: 'home',
    filter: 'all',
    feedPeriod: 'today',
    customStart: '',
    customEnd: '',
    feedLimit: 5,
    selectedFeedEventId: '',
    syncState: 'idle',
    syncError: '',
    showcaseCategoryId: '',
    showcaseProductId: '',
    periodMenuOpen: false
  };

  render(workspace);
  bindRealtimeRefresh(workspace);
  refreshMobileData(workspace);
}

function bindEvents(workspace) {
  if (workspace.dataset.mobileDashboardBound === 'true') {
    return;
  }

  workspace.dataset.mobileDashboardBound = 'true';
  workspace.addEventListener('click', (event) => {
    const tabButton = event.target.closest('[data-mobile-tab]');
    const filterButton = event.target.closest('[data-feed-filter]');
    const periodButton = event.target.closest('[data-feed-period]');
    const loadMoreButton = event.target.closest('[data-feed-load-more]');
    const feedEventButton = event.target.closest('[data-feed-event-id]');
    const syncButton = event.target.closest('[data-mobile-sync]');
    const periodToggleButton = event.target.closest('[data-mobile-period-toggle]');
    const themeButton = event.target.closest('[data-mobile-theme]');
    const logoutButton = event.target.closest('[data-mobile-logout]');

    if (syncButton) {
      refreshMobileData(workspace, { force: true });
      return;
    }

    if (periodToggleButton) {
      state.periodMenuOpen = !state.periodMenuOpen;
      render(workspace);
      return;
    }

    if (themeButton) {
      toggleTheme();
      render(workspace);
      return;
    }

    if (logoutButton) {
      logout();
      window.location.href = window.location.pathname || './';
      return;
    }

    if (tabButton) {
      state.tab = tabButton.dataset.mobileTab;
      state.selectedFeedEventId = '';
      render(workspace);
      return;
    }

    if (filterButton) {
      state.filter = filterButton.dataset.feedFilter;
      state.feedLimit = 5;
      state.selectedFeedEventId = '';
      render(workspace);
      return;
    }

    if (periodButton) {
      state.feedPeriod = periodButton.dataset.feedPeriod;
      state.feedLimit = 5;
      state.selectedFeedEventId = '';
      state.periodMenuOpen = false;
      if (state.feedPeriod === 'custom' && !state.customStart && !state.customEnd) {
        const today = getDateInputValue(new Date());
        state.customStart = today;
        state.customEnd = today;
      }
      render(workspace);
      return;
    }

    if (loadMoreButton) {
      state.feedLimit += 5;
      render(workspace);
      return;
    }

    if (feedEventButton) {
      state.selectedFeedEventId = state.selectedFeedEventId === feedEventButton.dataset.feedEventId
        ? ''
        : feedEventButton.dataset.feedEventId;
      render(workspace);
    }
  });

  workspace.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-mobile-showcase-form]')) {
      return;
    }

    event.preventDefault();
    await saveMobileShowcaseLaunch(event.target, workspace);
  });

  workspace.addEventListener('change', (event) => {
    if (event.target.matches('[data-feed-custom-start]')) {
      state.customStart = event.target.value;
      state.feedPeriod = 'custom';
      state.feedLimit = 5;
      state.selectedFeedEventId = '';
      state.periodMenuOpen = true;
      render(workspace);
      return;
    }

    if (event.target.matches('[data-feed-custom-end]')) {
      state.customEnd = event.target.value;
      state.feedPeriod = 'custom';
      state.feedLimit = 5;
      state.selectedFeedEventId = '';
      state.periodMenuOpen = true;
      render(workspace);
      return;
    }

    if (event.target.matches('[data-mobile-showcase-category]')) {
      state.showcaseCategoryId = event.target.value;
      state.showcaseProductId = '';
      render(workspace);
      return;
    }

    if (event.target.matches('[data-mobile-showcase-product]')) {
      state.showcaseProductId = event.target.value;
      render(workspace);
    }
  });
}

function bindRealtimeRefresh(workspace) {
  if (subscribedWorkspace === workspace) {
    return;
  }

  unsubscribeRealtimeRefresh.forEach((unsubscribe) => unsubscribe());
  unsubscribeRealtimeRefresh = [
    on(UI_EVENTS.mobileFeedChanged, () => renderIfActive(workspace)),
    on(UI_EVENTS.cashSummaryChanged, () => renderIfActive(workspace)),
    on(UI_EVENTS.financialSyncStatusChanged, () => renderIfActive(workspace)),
    on(UI_EVENTS.productSyncStatusChanged, () => renderIfActive(workspace)),
    on(UI_EVENTS.showcaseDataChanged, () => renderIfActive(workspace))
  ];
  subscribedWorkspace = workspace;
}

async function refreshMobileData(workspace, { force = false } = {}) {
  state.syncState = force ? 'syncing' : state.syncState;
  state.syncError = '';
  renderIfActive(workspace);

  try {
    if (force) {
      await syncCatalogNow();
    }

    await hydrateOnlineOperationalData({ catalog: force, financial: true, showcase: true });
    state.syncState = 'synced';
  } catch (error) {
    state.syncState = 'error';
    state.syncError = error.message || 'Erro de sincronizacao';
  }

  renderIfActive(workspace);
}

function renderIfActive(workspace) {
  if (workspace.dataset.activeRoute !== 'mobile') {
    return;
  }

  render(workspace);
}

function render(workspace) {
  if (workspace.dataset.activeRoute !== 'mobile') {
    return;
  }

  const cash = getMobileCashFlowSummary({
    period: state.feedPeriod,
    customStart: state.customStart,
    customEnd: state.customEnd
  });

  workspace.innerHTML = `
    <section class="mobile-shell">
      <div class="mobile-app">
        ${renderMobileTopbar({
          period: state.feedPeriod,
          sync: getMobileSyncStatus()
        })}
        ${state.periodMenuOpen ? renderMobilePeriodPopover(state) : ''}
        ${renderTabContent(cash)}
        ${renderBottomNav()}
      </div>
    </section>
  `;

  bindEvents(workspace);
}

export function renderMobileTopbar({
  period = 'today',
  sync = getMobileSyncStatus()
} = {}) {
  return `
    <header class="mobile-topbar">
      <div>
        <h1>PDV Lanchonete</h1>
        <p>Painel do dono</p>
      </div>
      <div class="mobile-topbar__actions">
        <button class="mobile-sync-button mobile-sync-button--${sync.state}" type="button" data-mobile-sync title="${sync.title}">
          <span>${sync.icon}</span>
          <strong>${sync.label}</strong>
        </button>
        <button class="mobile-theme-button" type="button" data-mobile-theme>${getThemeLabel()}</button>
        <button class="mobile-period-pill" type="button" data-mobile-period-toggle aria-expanded="${state.periodMenuOpen ? 'true' : 'false'}">
          ${getPeriodShortLabel(period)}
        </button>
        <button class="mobile-topbar__button" type="button" data-mobile-logout>Sair</button>
      </div>
    </header>
  `;
}

function renderMobilePeriodPopover(periodState) {
  return `
    <section class="mobile-period-popover" aria-label="Filtro de periodo">
      ${renderMobilePeriodControls(periodState)}
    </section>
  `;
}

function renderTabContent(cash) {
  if (state.tab === 'cash') {
    return renderCashTab(cash);
  }

  if (state.tab === 'showcase') {
    return renderShowcaseTab();
  }

  if (state.tab === 'crm') {
    return renderCrmTab();
  }

  if (state.tab === 'closing') {
    return renderClosingTab();
  }

  return renderHomeTab(cash);
}

function renderHomeTab(cash) {
  return `
    <div class="mobile-content">
      ${renderMobilePeriodControls(state)}
      ${renderHeroCard(cash.cards[0])}
      <div class="mobile-metrics">
        ${cash.cards.slice(1).map(renderMetricCard).join('')}
      </div>
      ${renderLiveFeed()}
    </div>
  `;
}

export function renderMobilePeriodControls({ feedPeriod, customStart, customEnd }) {
  const periodFilters = getMobileFeedPeriodFilters();

  return `
    <section class="mobile-global-period" aria-label="Periodo do painel">
      <div class="mobile-feed-filters">
        ${periodFilters.map((filter) => `
          <button class="${filter.id === feedPeriod ? 'is-active' : ''}" type="button" data-feed-period="${filter.id}">
            ${filter.label}
          </button>
        `).join('')}
      </div>
      ${feedPeriod === 'custom' ? `
        <div class="mobile-period-range">
          <input class="field" type="date" data-feed-custom-start value="${customStart}">
          <input class="field" type="date" data-feed-custom-end value="${customEnd}">
        </div>
      ` : ''}
    </section>
  `;
}

function renderCashTab(cash) {
  const paymentCards = [
    { label: 'Dinheiro', value: cash.paymentTotals.dinheiro, tone: 'primary' },
    { label: 'Pix', value: cash.paymentTotals.pix, tone: 'success' },
    { label: 'Debito', value: cash.paymentTotals.debito, tone: 'info' },
    { label: 'Credito', value: cash.paymentTotals.credito, tone: 'warning' }
  ];

  return `
    <div class="mobile-content">
      <div class="mobile-metrics">
        ${cash.cards.map(renderMetricCard).join('')}
      </div>
      <section class="mobile-list-panel">
        <h2>Formas de pagamento</h2>
        ${paymentCards.map(renderCompactRow).join('')}
      </section>
    </div>
  `;
}

function renderShowcaseTab() {
  const summary = getMobileShowcaseSummary();
  const cards = [
    { label: 'Produzidos', value: summary.producedUnits, tone: 'info', isCurrency: false },
    { label: 'Vendidos', value: summary.soldUnits, tone: 'success', isCurrency: false },
    { label: 'Restantes', value: summary.remainingUnits, tone: 'warning', isCurrency: false },
    { label: 'Vitrine estimada', value: summary.estimatedValue, tone: 'warning' },
    { label: 'Valor vendido', value: summary.soldValue, tone: 'primary' }
  ];

  return `
    <div class="mobile-content">
      ${renderMobilePeriodControls(state)}
      <div class="mobile-metrics">
        ${cards.map(renderMetricCard).join('')}
      </div>
      ${renderMobileShowcaseForm(summary)}
      <section class="mobile-list-panel">
        <h2>Produtos na vitrine</h2>
        ${summary.rows.map((row) => `
          <div class="mobile-row">
            <span>${row.produtoNome}</span>
            <strong>${row.sobraQuantidade} rest. / ${formatCurrency(row.valorProduzido)}</strong>
          </div>
        `).join('') || '<p class="mobile-empty">Nenhum produto na vitrine hoje.</p>'}
      </section>
    </div>
  `;
}

function renderCrmTab() {
  const filter = getMobileCrmFilter();
  const crm = getCrmSummary(filter);
  const ranking = getProductRanking(filter);
  const categories = getCategoryRanking(filter);
  const series = getSalesSeries(filter);
  const comparison = getProductionSalesComparison(getMobilePeriodFilters());
  const best = ranking.byQuantity[0];
  const slow = ranking.byQuantity[ranking.byQuantity.length - 1];
  const cards = [
    { label: 'Total vendido', value: crm.salesTotal, tone: 'primary' },
    { label: 'Entradas', value: crm.entriesTotal, tone: 'success' },
    { label: 'Saídas', value: crm.outputsTotal, tone: 'danger' },
    { label: 'Caixa atual', value: crm.estimatedProfit, tone: 'info' },
    { label: 'Ticket medio', value: crm.ticketAverage, tone: 'warning' },
    { label: 'Comandas fechadas', value: crm.closedComandas, tone: 'success', isCurrency: false }
  ];
  const paymentRows = [
    { label: 'Dinheiro', value: crm.paymentTotals.dinheiro, tone: 'primary' },
    { label: 'Pix', value: crm.paymentTotals.pix, tone: 'success' },
    { label: 'Debito', value: crm.paymentTotals.debito, tone: 'info' },
    { label: 'Credito', value: crm.paymentTotals.credito, tone: 'warning' }
  ];

  return `
    <div class="mobile-content">
      ${renderMobilePeriodControls(state)}
      <div class="mobile-metrics">
        ${cards.map(renderMetricCard).join('')}
      </div>
      ${renderMobileSalesChart(series)}
      ${renderMobileHorizontalChart('Formas de pagamento', paymentRows)}
      ${renderMobileHorizontalChart('Produtos mais vendidos', ranking.byQuantity.slice(0, 5).map((item) => ({
        label: item.name,
        value: item.quantity,
        detail: formatCurrency(item.revenue),
        isCurrency: false,
        tone: 'primary'
      })))}
      ${renderMobileHorizontalChart('Categorias', categories.slice(0, 5).map((item) => ({
        label: item.name,
        value: item.revenue,
        detail: `${item.quantity} un.`,
        tone: 'success'
      })))}
      ${renderMobileProductionChart(comparison)}
      <section class="mobile-list-panel">
        <h2>Rankings</h2>
        ${renderTextRow('Produto mais vendido', best ? `${best.name} (${best.quantity})` : 'Sem vendas')}
        ${renderTextRow('Produto menos vendido', slow ? `${slow.name} (${slow.quantity})` : 'Sem vendas')}
        ${renderTextRow('Maior categoria', categories[0] ? `${categories[0].name} (${formatCurrency(categories[0].revenue)})` : 'Sem vendas')}
      </section>
      <section class="mobile-list-panel">
        <h2>Formas de pagamento</h2>
        ${renderCompactRow({ label: 'Dinheiro', value: crm.paymentTotals.dinheiro })}
        ${renderCompactRow({ label: 'Pix', value: crm.paymentTotals.pix })}
        ${renderCompactRow({ label: 'Debito', value: crm.paymentTotals.debito })}
        ${renderCompactRow({ label: 'Credito', value: crm.paymentTotals.credito })}
      </section>
      <section class="mobile-list-panel">
        <h2>Producao x vendido</h2>
        ${comparison.slice(0, 5).map((item) => `
          <div class="mobile-row">
            <span>${item.produtoNome}</span>
            <strong>${item.quantidadeVendida}/${item.quantidadeProduzida} - ${item.percentualVendido}%</strong>
          </div>
        `).join('') || '<p class="mobile-empty">Sem vitrine no periodo.</p>'}
      </section>
    </div>
  `;
}

function renderMobileSalesChart(series) {
  const maxSales = Math.max(...series.map((item) => item.sales), 1);

  return `
    <section class="mobile-list-panel mobile-crm-chart">
      <header class="mobile-crm-chart__header">
        <h2>Vendas por periodo</h2>
        <span>${series.length} ponto(s)</span>
      </header>
      <div class="mobile-crm-bars">
        ${series.map((item) => `
          <div class="mobile-crm-bar" style="height:${Math.max((item.sales / maxSales) * 100, 8)}%">
            <strong>${formatCurrency(item.sales)}</strong>
            <span>${formatShortDate(item.label)}</span>
          </div>
        `).join('') || '<p class="mobile-empty">Sem vendas no periodo.</p>'}
      </div>
    </section>
  `;
}

function renderMobileHorizontalChart(title, rows) {
  const maxValue = Math.max(...rows.map((row) => Number(row.value || 0)), 1);

  return `
    <section class="mobile-list-panel mobile-crm-chart">
      <header class="mobile-crm-chart__header">
        <h2>${title}</h2>
        <span>${rows.length || 0}</span>
      </header>
      <div class="mobile-crm-hbars">
        ${rows.map((row) => {
          const numericValue = Number(row.value || 0);
          const percent = Math.max((numericValue / maxValue) * 100, numericValue ? 8 : 0);
          const value = row.isCurrency === false ? row.value : formatCurrency(row.value);

          return `
            <div class="mobile-crm-hbar mobile-crm-hbar--${row.tone || 'primary'}">
              <div class="mobile-crm-hbar__label">
                <span>${row.label}</span>
                <strong>${value}</strong>
              </div>
              <div class="mobile-crm-hbar__track">
                <i style="width:${percent}%"></i>
              </div>
              ${row.detail ? `<small>${row.detail}</small>` : ''}
            </div>
          `;
        }).join('') || '<p class="mobile-empty">Sem dados no periodo.</p>'}
      </div>
    </section>
  `;
}

function renderMobileProductionChart(comparison) {
  const rows = comparison.slice(0, 5);

  return `
    <section class="mobile-list-panel mobile-crm-chart">
      <header class="mobile-crm-chart__header">
        <h2>Producao x vendido</h2>
        <span>${rows.length}</span>
      </header>
      <div class="mobile-crm-hbars">
        ${rows.map((item) => `
          <div class="mobile-crm-hbar mobile-crm-hbar--warning">
            <div class="mobile-crm-hbar__label">
              <span>${item.produtoNome}</span>
              <strong>${item.percentualVendido}%</strong>
            </div>
            <div class="mobile-crm-hbar__track">
              <i style="width:${Math.min(Math.max(item.percentualVendido, 0), 100)}%"></i>
            </div>
            <small>${item.quantidadeVendida}/${item.quantidadeProduzida} vendidos</small>
          </div>
        `).join('') || '<p class="mobile-empty">Sem vitrine no periodo.</p>'}
      </div>
    </section>
  `;
}

function renderClosingTab() {
  const closing = getMobileClosingSummary();
  const cards = [
    { label: 'Dinheiro esperado', value: closing.expectedCash, tone: 'primary' },
    { label: 'Pix esperado', value: closing.expectedPix, tone: 'success' },
    { label: 'Cartao esperado', value: closing.expectedDebit + closing.expectedCredit, tone: 'info' },
    { label: 'Diferenca', value: closing.generalDifference, tone: closing.generalDifference ? 'danger' : 'success' }
  ];

  return `
    <div class="mobile-content">
      <div class="mobile-metrics">
        ${cards.map(renderMetricCard).join('')}
      </div>
      <section class="mobile-list-panel">
        <h2>Historico de fechamentos</h2>
        ${closing.history.map((item) => `
          <div class="mobile-row">
            <span>${formatDateTime(item.closedAt || item.generatedAt)}</span>
            <strong>${formatCurrency(item.totals?.sales || 0)}</strong>
          </div>
        `).join('') || '<p class="mobile-empty">Nenhum fechamento registrado.</p>'}
      </section>
    </div>
  `;
}

function renderMobileShowcaseForm(summary) {
  const categories = getShowcaseCategories();
  const products = getMobileShowcaseProducts();
  const selectedProduct = state.showcaseProductId ? getProductById(state.showcaseProductId) : null;
  const currentRow = selectedProduct
    ? summary.rows.find((row) => row.produtoId === selectedProduct.id)
    : null;

  return `
    <section class="mobile-list-panel mobile-showcase-form-panel">
      <h2>Lancar vitrine</h2>
      <form class="mobile-showcase-form" data-mobile-showcase-form>
        <label>
          Categoria
          <select class="field" data-mobile-showcase-category name="categoryId">
            <option value="">Todas</option>
            ${categories.map((category) => `
              <option value="${category.id}" ${state.showcaseCategoryId === category.id ? 'selected' : ''}>${category.name}</option>
            `).join('')}
          </select>
        </label>
        <label>
          Produto
          <select class="field" data-mobile-showcase-product name="produtoId" required>
            <option value="">Escolha o produto</option>
            ${products.map((product) => `
              <option value="${product.id}" ${state.showcaseProductId === product.id ? 'selected' : ''}>${product.name}</option>
            `).join('')}
          </select>
        </label>
        <div class="mobile-showcase-form__grid">
          <label>
            Qtd. adicionada
            <input class="field" name="quantidade" type="number" min="1" step="1" required placeholder="0">
          </label>
          <label>
            Atual vitrine
            <input class="field" type="text" readonly value="${currentRow ? currentRow.sobraQuantidade : 0}">
          </label>
        </div>
        <div class="mobile-showcase-form__grid">
          <label>
            Valor unitario
            <input class="field" type="text" readonly value="${selectedProduct ? formatCurrency(selectedProduct.price) : formatCurrency(0)}">
          </label>
          <label>
            Estimado atual
            <input class="field" type="text" readonly value="${currentRow ? formatCurrency(currentRow.valorProduzido) : formatCurrency(0)}">
          </label>
        </div>
        <label>
          Observacao
          <input class="field" name="note" placeholder="Opcional">
        </label>
        <button class="mobile-showcase-submit" type="submit">Lancar / atualizar vitrine</button>
      </form>
    </section>
  `;
}

export function renderLiveFeed({
  filter = state.filter,
  feedPeriod = state.feedPeriod,
  customStart = state.customStart,
  customEnd = state.customEnd,
  feedLimit = state.feedLimit,
  events = null
} = {}) {
  const filters = getMobileFeedFilters();
  const allEvents = events || getMobileFeedEvents({
    filter,
    period: feedPeriod,
    customStart,
    customEnd,
    limit: Number.MAX_SAFE_INTEGER
  });
  const visibleEvents = allEvents.slice(0, feedLimit);
  const hasMore = allEvents.length > visibleEvents.length;

  return `
    <section class="mobile-feed-panel">
      <div class="mobile-section-title">
        <strong>Ao vivo</strong>
        <span class="mobile-live-dot">recebendo</span>
      </div>
      <div class="mobile-feed-filters">
        ${filters.map((item) => `
          <button class="${item.id === filter ? 'is-active' : ''}" type="button" data-feed-filter="${item.id}">
            ${item.label}
          </button>
        `).join('')}
      </div>
      <div class="mobile-live-feed">
        ${visibleEvents.map((event) => renderFeedEvent(event)).join('') || '<p class="mobile-empty">Nenhum evento neste filtro.</p>'}
      </div>
      ${hasMore ? '<button class="mobile-load-more" type="button" data-feed-load-more>Carregar mais</button>' : ''}
    </section>
  `;
}

function getDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

async function saveMobileShowcaseLaunch(form, workspace) {
  const formData = new FormData(form);
  const produtoId = String(formData.get('produtoId') || '');
  const quantidade = Number(formData.get('quantidade') || 0);
  const note = String(formData.get('note') || '').trim();

  state.syncState = 'syncing';
  state.syncError = '';
  renderIfActive(workspace);

  try {
    await hydrateOnlineOperationalData({ catalog: true, financial: false, showcase: true });
    createStockLaunch({ produtoId, quantidade, note });
    await syncOnlineOperationalData({ catalog: false, financial: false, showcase: true });
    state.syncState = 'synced';
    state.showcaseProductId = produtoId;
  } catch (error) {
    state.syncState = 'error';
    state.syncError = error.message || 'Nao foi possivel lancar vitrine.';
  }

  renderIfActive(workspace);
}

function getMobileShowcaseProducts() {
  const products = getShowcaseProducts();

  if (!state.showcaseCategoryId) {
    return products;
  }

  return products.filter((product) => product.categoryId === state.showcaseCategoryId);
}

function getMobilePeriodFilters() {
  return {
    period: state.feedPeriod,
    customStart: state.customStart,
    customEnd: state.customEnd
  };
}

function getMobileCrmFilter() {
  return createPeriodFilter(state.feedPeriod, state.customStart, state.customEnd);
}

function getMobileSyncStatus() {
  if (!isSupabaseEnabled()) {
    return {
      state: 'offline',
      icon: 'LOC',
      label: 'local',
      title: 'Modo local'
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      state: 'offline',
      icon: 'OFF',
      label: 'offline',
      title: 'Sem conexao'
    };
  }

  if (state.syncState === 'syncing') {
    return {
      state: 'syncing',
      icon: '...',
      label: 'sync',
      title: 'Sincronizando com o banco'
    };
  }

  if (state.syncState === 'error') {
    return {
      state: 'error',
      icon: '!',
      label: 'erro',
      title: state.syncError || 'Erro de sincronizacao'
    };
  }

  const financial = getTransactionSyncStatus();
  const catalog = getCatalogSyncStatus();

  if (financial.state === 'pending' || catalog.state === 'pending') {
    return {
      state: 'syncing',
      icon: '...',
      label: 'sync',
      title: 'Existem dados pendentes de sincronizacao'
    };
  }

  if (financial.state === 'error' || catalog.state === 'error') {
    return {
      state: 'error',
      icon: '!',
      label: 'erro',
      title: financial.error || catalog.error || 'Erro de sincronizacao'
    };
  }

  return {
    state: 'synced',
    icon: 'OK',
    label: 'online',
    title: 'Sincronizado com o banco'
  };
}

function getPeriodShortLabel(period) {
  const labels = {
    today: 'Hoje',
    yesterday: 'Ontem',
    month: 'Mes',
    custom: 'Periodo'
  };

  return labels[period] || 'Hoje';
}

export function renderFeedEvent(event, selectedEventId = state.selectedFeedEventId) {
  const isClickable = Boolean(event.details);
  const isOpen = isClickable && selectedEventId === event.id;

  return `
    <article class="mobile-feed-event mobile-feed-event--${event.level} ${isClickable ? 'is-clickable' : ''} ${isOpen ? 'is-open' : ''}" ${isClickable ? `data-feed-event-id="${event.id}" role="button" tabindex="0"` : ''}>
      <div class="mobile-feed-icon">${event.icon}</div>
      <div>
        <strong>${event.title}</strong>
        <p>${event.description}${event.amount ? ` - ${formatCurrency(event.amount)}` : ''}</p>
        <time>${formatRelativeTime(event.createdAt)}</time>
        ${isClickable ? `<span class="mobile-feed-hint">${isOpen ? 'Ocultar detalhes' : 'Ver detalhes da comanda'}</span>` : ''}
      </div>
      ${isOpen ? renderFeedEventDetails(event.details) : ''}
    </article>
  `;
}

function renderFeedEventDetails(details) {
  return `
    <div class="mobile-feed-detail">
      <div class="mobile-feed-detail__head">
        <strong>Comanda ${formatComandaNumber(details.comandaNumber)}</strong>
        <span>${formatCurrency(details.total)}</span>
      </div>
      <div class="mobile-feed-detail__items">
        ${details.items.map((item) => `
          <div>
            <span>${item.quantity}x ${item.name}</span>
            <strong>${formatCurrency(item.total)}</strong>
          </div>
        `).join('')}
      </div>
      <div class="mobile-feed-detail__meta">
        ${renderDetailLine('Pagamento', details.paymentLabel)}
        ${details.paymentMethod === 'dinheiro' ? renderDetailLine('Recebido', formatCurrency(details.receivedAmount)) : ''}
        ${renderDetailLine('Troco', formatCurrency(details.change))}
      </div>
    </div>
  `;
}

function renderDetailLine(label, value) {
  return `
    <div>
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderHeroCard(card) {
  return `
    <section class="mobile-hero-card">
      <span>${card.label}</span>
      <strong>${formatCurrency(card.value)}</strong>
    </section>
  `;
}

function renderMetricCard(card) {
  const value = card.isCurrency === false ? card.value : formatCurrency(card.value);

  return `
    <article class="mobile-metric mobile-metric--${card.tone}">
      <span>${card.label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function renderCompactRow(card) {
  return `
    <div class="mobile-row">
      <span>${card.label}</span>
      <strong>${formatCurrency(card.value)}</strong>
    </div>
  `;
}

function renderTextRow(label, value) {
  return `
    <div class="mobile-row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
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

  if (diffMinutes <= 0) {
    return 'agora';
  }

  if (diffMinutes === 1) {
    return '1 min';
  }

  return `${diffMinutes} min`;
}

function formatDateTime(value) {
  if (!value) {
    return 'Sem data';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) {
    return '--';
  }

  const text = String(value);
  return text.includes('-') ? text.slice(5) : text;
}

function formatComandaNumber(number) {
  return String(number || 0).padStart(4, '0');
}
