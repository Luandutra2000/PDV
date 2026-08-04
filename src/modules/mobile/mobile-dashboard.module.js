import { UI_EVENTS } from '../../database/schema.js?v=20260804-03';
import { on } from '../../services/event-bus.service.js?v=20260804-03';
import {
  createPeriodFilter,
  getCategoryRanking,
  getCrmSummary,
  getProductRanking,
  getSalesSeries
} from '../../services/crm-dashboard.service.js?v=20260804-03';
import { getMobileCashFlowSummary } from '../../services/mobile-cash-flow.service.js?v=20260804-03';
import { getMobileClosingSummary, previewMobileClosing, submitMobileClosing } from '../../services/mobile-closing.service.js?v=20260804-03';
import {
  createMobileFinancialTransaction,
  getMobileFinancialSummary,
  markMobileFinancialTransactionPaid
} from '../../services/mobile-financial.service.js?v=20260804-03';
import {
  getMobileFeedEvents,
  getMobileFeedFilters,
  getMobileFeedPeriodFilters
} from '../../services/mobile-notifications.service.js?v=20260804-03';
import { getMobileShowcaseSummary } from '../../services/mobile-showcase.service.js?v=20260804-03';
import {
  createStockLaunch,
  getProductionSalesComparison
} from '../../services/estoque.service.js?v=20260804-03';
import { getShowcaseCategories, getShowcaseProducts, getProductById, syncCatalogNow } from '../../services/product.service.js?v=20260804-03';
import { getTransactionSyncStatus } from '../../services/transaction.service.js?v=20260804-03';
import { getCatalogSyncStatus } from '../../services/product.service.js?v=20260804-03';
import { getCurrentUser, logout } from '../../services/auth.service.js?v=20260804-03';
import { hydrateOnlineOperationalData, syncOnlineOperationalData } from '../../services/online-data.service.js?v=20260804-03';
import { isSupabaseEnabled } from '../../services/app-config.service.js?v=20260804-03';
import { getThemeLabel, toggleTheme } from '../../services/theme.service.js?v=20260804-03';
import { formatCurrency } from '../../utils/currency.js?v=20260804-03';
import { hasPermission } from '../../services/permission.service.js?v=20260804-03';
import { escapeHtml } from '../../utils/dom.js?v=20260804-03';

const tabs = [
  { id: 'home', label: 'Inicio', icon: 'IN' },
  { id: 'cash', label: 'Caixa', icon: '$' },
  { id: 'showcase', label: 'Vitrine', icon: 'VT' },
  { id: 'crm', label: 'CRM', icon: 'CR' },
  { id: 'finance', label: 'Financ.', icon: 'FN' },
  { id: 'closing', label: 'Fechar', icon: 'OK' }
];

const MOBILE_AUTO_REFRESH_MS = 40000;

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
  expandedComparisonIds: [],
  closingForm: { countedCash: '', checkedPix: '', checkedCard: '', note: '' },
  closingError: '',
  financeModal: '',
  financeError: '',
  periodMenuOpen: false
};

let subscribedWorkspace = null;
let unsubscribeRealtimeRefresh = [];
let autoRefreshTimer = null;
let autoRefreshWorkspace = null;
let focusedMobileField = false;
let pendingDeferredRender = false;

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
    expandedComparisonIds: [],
    closingForm: { countedCash: '', checkedPix: '', checkedCard: '', note: '' },
    closingError: '',
    financeModal: '',
    financeError: '',
    periodMenuOpen: false
  };

  render(workspace);
  bindRealtimeRefresh(workspace);
  bindAutoRefresh(workspace);
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
    const financeActionButton = event.target.closest('[data-mobile-finance-action]');
    const financeCloseButton = event.target.closest('[data-mobile-finance-close]');
    const payableButton = event.target.closest('[data-mobile-payable-id]');
    const comparisonToggleButton = event.target.closest('[data-mobile-comparison-toggle]');

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

    if (financeActionButton) {
      state.financeModal = financeActionButton.dataset.mobileFinanceAction;
      state.financeError = '';
      render(workspace);
      return;
    }

    if (financeCloseButton) {
      state.financeModal = '';
      state.financeError = '';
      render(workspace);
      return;
    }

    if (payableButton) {
      payMobileBill(payableButton.dataset.mobilePayableId, workspace);
      return;
    }

    if (comparisonToggleButton) {
      toggleMobileComparison(comparisonToggleButton.dataset.mobileComparisonToggle);
      render(workspace);
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
    if (event.target.matches('[data-mobile-showcase-form]')) {
      event.preventDefault();
      await saveMobileShowcaseLaunch(event.target, workspace);
      return;
    }

    if (event.target.matches('[data-mobile-closing-form]')) {
      event.preventDefault();
      await saveMobileClosing(event.target, workspace);
      return;
    }

    if (event.target.matches('[data-mobile-finance-form]')) {
      event.preventDefault();
      await saveMobileFinance(event.target, workspace);
    }
  });

  workspace.addEventListener('change', (event) => {
    if (event.target.matches('[data-mobile-closing-field]')) {
      state.closingForm = {
        ...state.closingForm,
        [event.target.name]: event.target.value
      };
      state.closingError = '';
      render(workspace);
      return;
    }

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

  workspace.addEventListener('focusin', (event) => {
    if (isEditableMobileTarget(event.target)) {
      focusedMobileField = true;
    }
  });

  workspace.addEventListener('focusout', () => {
    setTimeout(() => {
      focusedMobileField = Boolean(getFocusedMobileField(workspace));

      if (!focusedMobileField && pendingDeferredRender) {
        pendingDeferredRender = false;
        renderIfActive(workspace);
      }
    }, 0);
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

function bindAutoRefresh(workspace) {
  if (autoRefreshWorkspace === workspace && autoRefreshTimer) {
    return;
  }

  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }

  autoRefreshWorkspace = workspace;
  autoRefreshTimer = setInterval(() => {
    refreshMobileData(workspace, { automatic: true });
  }, MOBILE_AUTO_REFRESH_MS);

  if (typeof autoRefreshTimer.unref === 'function') {
    autoRefreshTimer.unref();
  }
}

async function refreshMobileData(workspace, { force = false, automatic = false } = {}) {
  state.syncState = force ? 'syncing' : state.syncState;
  state.syncError = '';
  renderIfActive(workspace, { deferWhileEditing: automatic });

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

  renderIfActive(workspace, { deferWhileEditing: automatic });
}

function renderIfActive(workspace, { deferWhileEditing = false } = {}) {
  if (workspace.dataset.activeRoute !== 'mobile') {
    return;
  }

  if (deferWhileEditing && isMobileFormEditing(workspace)) {
    pendingDeferredRender = true;
    return;
  }

  render(workspace);
}

function isMobileFormEditing(workspace) {
  return focusedMobileField || Boolean(getFocusedMobileField(workspace));
}

function getFocusedMobileField(workspace) {
  try {
    const focused = workspace.querySelector?.(':focus') || globalThis.document?.activeElement;
    return isEditableMobileTarget(focused) ? focused : null;
  } catch (error) {
    return focusedMobileField ? {} : null;
  }
}

function isEditableMobileTarget(target) {
  if (!target) {
    return false;
  }

  const tagName = String(target.tagName || '').toLowerCase();
  return tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || target.isContentEditable === true
    || typeof target.matches === 'function' && target.matches('input, textarea, select, [contenteditable="true"]');
}

function canCurrentUser(permissionId) {
  return hasPermission(getCurrentUser(), permissionId);
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

  if (state.tab === 'finance') {
    return renderFinanceTab();
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
  const summary = getMobileShowcaseSummary(getMobilePeriodFilters());

  return `
    <div class="mobile-content">
      ${renderMobilePeriodControls(state)}
      <div class="mobile-metrics">
        ${summary.cards.map(renderMetricCard).join('')}
      </div>
      ${renderMobileShowcaseForm(summary)}
      <section class="mobile-list-panel">
        <h2>Comparativo producao x vendas</h2>
        ${summary.comparisonRows.map(renderMobileComparisonRow).join('') || '<p class="mobile-empty">Sem dados para comparar.</p>'}
      </section>
      <section class="mobile-list-panel">
        <h2>Cancelados</h2>
        ${summary.canceledLaunches.map(renderCanceledShowcaseLaunch).join('') || '<p class="mobile-empty">Nenhum cancelamento no periodo.</p>'}
      </section>
    </div>
  `;
}

function renderMobileComparisonRow(item) {
  const isExpanded = state.expandedComparisonIds.includes(item.produtoId);

  return `
    <article class="mobile-comparison-row ${isExpanded ? 'is-expanded' : ''}">
      <header>
        <strong>${escapeHtml(item.produtoNome)}</strong>
        <span>${escapeHtml(item.categoriaNome)}</span>
      </header>
      <div class="mobile-comparison-summary">
        <div>
          <span>Vendido</span>
          <strong>${item.quantidadeVendida}/${item.quantidadeProduzida}</strong>
        </div>
        <div>
          <span>Sobra</span>
          <strong>${item.sobraQuantidade}</strong>
        </div>
        <div>
          <span>% vendido</span>
          <strong>${item.percentualVendido}%</strong>
        </div>
      </div>
      ${isExpanded ? `
        <div class="mobile-comparison-details">
          ${renderComparisonMetric('Produzido', item.quantidadeProduzida)}
          ${renderComparisonMetric('Valor produzido', formatCurrency(item.valorProduzido))}
          ${renderComparisonMetric('Vendido', item.quantidadeVendida)}
          ${renderComparisonMetric('Valor vendido', formatCurrency(item.valorVendido))}
          ${renderComparisonMetric('Diferenca', formatCurrency(item.diferencaValor))}
        </div>
      ` : ''}
      <button class="mobile-comparison-toggle" type="button" data-mobile-comparison-toggle="${item.produtoId}" aria-expanded="${isExpanded ? 'true' : 'false'}">
        ${isExpanded ? 'Exibir menos' : 'Exibir mais'}
      </button>
    </article>
  `;
}

function renderComparisonMetric(label, value) {
  return `
    <div>
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function toggleMobileComparison(productId) {
  if (!productId) {
    return;
  }

  state.expandedComparisonIds = state.expandedComparisonIds.includes(productId)
    ? state.expandedComparisonIds.filter((id) => id !== productId)
    : [...state.expandedComparisonIds, productId];
}

function renderCanceledShowcaseLaunch(launch) {
  return `
    <article class="mobile-canceled-card">
      <header>
        <strong>${escapeHtml(launch.produtoNome)}</strong>
        <span>Cancelado</span>
      </header>
      <p>${escapeHtml(launch.categoriaNome)} - ${launch.quantidade} un. - ${formatDateTime(launch.canceledAt || launch.dataHora)}</p>
      <strong>${formatCurrency(launch.valorTotal)}</strong>
    </article>
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
            <span>${escapeHtml(item.produtoNome)}</span>
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
              <span>${escapeHtml(item.produtoNome)}</span>
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
  const closingForm = getClosingFormValues(closing.formDefaults);
  const preview = previewMobileClosing(closingForm);
  const cards = [
    { label: 'Dinheiro esperado', value: closing.expectedCash, tone: 'primary' },
    { label: 'Pix esperado', value: closing.expectedPix, tone: 'success' },
    { label: 'Cartao esperado', value: closing.expectedCard, tone: 'info' },
    { label: 'Diferenca', value: preview.differenceTotal, tone: preview.differenceTotal ? 'danger' : 'success' }
  ];

  return `
    <div class="mobile-content">
      <div class="mobile-metrics">
        ${cards.map(renderMetricCard).join('')}
      </div>
      ${renderMobileClosingForm(closingForm)}
      ${renderMobileClosingPreview(preview)}
      <section class="mobile-list-panel">
        <h2>Historico de fechamentos</h2>
        ${closing.history.map(renderMobileClosingHistoryRow).join('') || '<p class="mobile-empty">Nenhum fechamento registrado.</p>'}
      </section>
    </div>
  `;
}

function getClosingFormValues(defaults) {
  return {
    countedCash: state.closingForm.countedCash === '' ? defaults.countedCash : state.closingForm.countedCash,
    checkedPix: state.closingForm.checkedPix === '' ? defaults.checkedPix : state.closingForm.checkedPix,
    checkedCard: state.closingForm.checkedCard === '' ? defaults.checkedCard : state.closingForm.checkedCard,
    note: state.closingForm.note || ''
  };
}

function renderMobileClosingForm(values) {
  return `
    <section class="mobile-list-panel">
      <h2>Fechar caixa</h2>
      ${state.closingError ? `<p class="mobile-error">${state.closingError}</p>` : ''}
      <form class="mobile-closing-form" data-mobile-closing-form>
        <div class="mobile-form-grid">
          ${renderMoneyInput('Dinheiro contado', 'countedCash', values.countedCash)}
          ${renderMoneyInput('Pix contado', 'checkedPix', values.checkedPix)}
          ${renderMoneyInput('Cartao contado', 'checkedCard', values.checkedCard)}
        </div>
        <label>
          Observacao
          <textarea class="field" name="note" rows="3" data-mobile-closing-field>${escapeHtml(values.note)}</textarea>
        </label>
        ${canCurrentUser('cash.close') ? '<button class="mobile-showcase-submit" type="submit">Fechar Caixa</button>' : ''}
      </form>
    </section>
  `;
}

function renderMoneyInput(label, name, value) {
  return `
    <label>
      ${label}
      <input class="field" name="${name}" type="number" min="0" step="0.01" value="${formatNumberInput(value)}" data-mobile-closing-field>
    </label>
  `;
}

function renderMobileClosingPreview(preview) {
  const rows = [
    ['Dinheiro esperado', preview.payments.expectedCash],
    ['Pix esperado', preview.payments.expectedPix],
    ['Cartao esperado', preview.expectedCard],
    ['Total esperado', preview.expectedTotal],
    ['Total contado', preview.countedTotal],
    ['Dif. dinheiro', preview.cashDifference],
    ['Dif. pix', preview.pixDifference || 0],
    ['Dif. cartao', preview.cardDifference],
    ['Dif. total', preview.differenceTotal]
  ];

  return `
    <section class="mobile-list-panel">
      <h2>Resumo do fechamento</h2>
      ${rows.map(([label, value]) => renderCompactRow({ label, value })).join('')}
    </section>
  `;
}

function renderMobileClosingHistoryRow(item) {
  return `
    <article class="mobile-closing-history">
      <header>
        <strong>${formatDate(item.closedAt || item.generatedAt)}</strong>
        <span class="mobile-status-badge mobile-status-badge--${getClosingStatusTone(item.statusLabel)}">${item.statusLabel}</span>
      </header>
      ${renderTextRow('Hora', formatTime(item.closedAt || item.generatedAt))}
      ${renderTextRow('Usuario', item.userName || 'Sistema')}
      ${renderCompactRow({ label: 'Valor esperado', value: item.expectedTotal })}
      ${renderCompactRow({ label: 'Valor contado', value: item.countedTotal })}
      ${renderCompactRow({ label: 'Diferenca', value: item.difference })}
    </article>
  `;
}

function getClosingStatusTone(statusLabel) {
  if (statusLabel === 'Conferido') {
    return 'success';
  }

  if (statusLabel === 'Pequena diferenca') {
    return 'warning';
  }

  return 'danger';
}

function renderFinanceTab() {
  const finance = getMobileFinancialSummary(getMobilePeriodFilters());
  const payables = getUniquePayables(finance.payables);
  const canCreateIncome = canCurrentUser('financial.income.create');
  const canCreateExpense = canCurrentUser('financial.expense.create');

  return `
    <div class="mobile-content">
      ${renderMobilePeriodControls(state)}
      <div class="mobile-metrics">
        ${finance.cards.map(renderMetricCard).join('')}
      </div>
      <section class="mobile-list-panel">
        <h2>Financeiro</h2>
        ${state.financeError ? `<p class="mobile-error">${state.financeError}</p>` : ''}
        <div class="mobile-finance-actions">
          ${canCreateIncome ? '<button type="button" data-mobile-finance-action="income">+ Entrada</button>' : ''}
          ${canCreateExpense ? '<button type="button" data-mobile-finance-action="expense">- Saida</button>' : ''}
          ${canCreateExpense ? '<button type="button" data-mobile-finance-action="bill">+ Boleto</button>' : ''}
        </div>
        ${state.financeModal ? renderMobileFinanceForm(state.financeModal, finance.categories) : ''}
      </section>
      <section class="mobile-list-panel">
        <h2>Movimentacoes financeiras</h2>
        ${finance.transactions.filter((transaction) => transaction.status !== 'canceled').slice(0, 12).map((transaction) => renderMobileFinanceTransaction(transaction, finance.categories)).join('') || '<p class="mobile-empty">Nenhuma movimentacao financeira.</p>'}
      </section>
      <section class="mobile-list-panel">
        <h2>Contas a pagar</h2>
        ${payables.map(renderMobilePayable).join('') || '<p class="mobile-empty">Nenhuma conta a pagar.</p>'}
      </section>
      <section class="mobile-list-panel">
        <h2>Mini CRM financeiro</h2>
        ${renderMobileFinanceCrm(finance.crm, finance.categories)}
      </section>
    </div>
  `;
}

function renderMobileFinanceForm(type, categories) {
  const isBill = type === 'bill';
  const isIncome = type === 'income';
  const filteredCategories = categories.filter((category) => (
    isBill
      ? category.type === 'expense' || category.type === 'both'
      : category.type === (isIncome ? 'income' : 'expense') || category.type === 'both'
  ));

  return `
    <form class="mobile-finance-form" data-mobile-finance-form>
      <input type="hidden" name="formType" value="${type}">
      <label>
        Descricao
        <input class="field" name="description" required placeholder="${isIncome ? 'Ex: Aporte do dono' : 'Ex: Boleto fornecedor'}">
      </label>
      <div class="mobile-form-grid">
        <label>
          Valor
          <input class="field" name="amount" type="number" min="0.01" step="0.01" required>
        </label>
        <label>
          Categoria
          <select class="field" name="categoryId" required>
            ${filteredCategories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      ${isBill ? `
        <div class="mobile-form-grid">
          <label>
            Vencimento
            <input class="field" name="dueDate" type="date" required>
          </label>
          <label>
            Status
            <select class="field" name="status">
              <option value="pending">Pendente</option>
              <option value="paid">Pago</option>
            </select>
          </label>
        </div>
      ` : ''}
      <label>
        Observacao
        <textarea class="field" name="notes" rows="3"></textarea>
      </label>
      <div class="mobile-finance-form__actions">
        <button type="button" data-mobile-finance-close>Cancelar</button>
        <button type="submit">Salvar</button>
      </div>
    </form>
  `;
}

function renderMobileFinanceTransaction(transaction, categories) {
  const category = categories.find((item) => item.id === transaction.categoryId);
  const isIncome = transaction.type === 'income';

  return `
    <article class="mobile-finance-row">
      <div>
        <strong>${escapeHtml(transaction.description)}</strong>
        <span>${formatDate(transaction.transactionDate || transaction.createdAt)} - ${escapeHtml(category?.name || 'Sem categoria')} - ${formatFinanceStatus(transaction.status)}</span>
      </div>
      <strong class="${isIncome ? 'money-positive' : 'money-negative'}">${isIncome ? '+' : '-'} ${formatCurrency(transaction.amount)}</strong>
    </article>
  `;
}

function renderMobilePayable(transaction) {
  return `
    <article class="mobile-finance-row">
      <div>
        <strong>${escapeHtml(transaction.description)}</strong>
        <span>${formatFinanceStatus(transaction.status)} - Venc. ${formatDate(transaction.dueDate)}</span>
      </div>
      <div class="mobile-finance-row__actions">
        <strong class="money-negative">${formatCurrency(transaction.amount)}</strong>
        ${canCurrentUser('financial.bill.pay') ? `<button type="button" data-mobile-payable-id="${transaction.id}">Pagar</button>` : ''}
      </div>
    </article>
  `;
}

function renderMobileFinanceCrm(crm, categories) {
  return [
    renderMobileCrmGroup('Saidas por categoria', crm.outputsByCategory, categories),
    renderMobileCrmGroup('Entradas por categoria', crm.entriesByCategory, categories),
    renderMobileCrmGroup('Pendentes por categoria', crm.pendingByCategory, categories),
    renderMobileCrmGroup('Gastos por pagamento', crm.spendingByPaymentMethod, [])
  ].join('');
}

function renderMobileCrmGroup(title, totals, categories) {
  const rows = Object.entries(totals || {}).sort((left, right) => right[1] - left[1]).slice(0, 5);

  return `
    <div class="mobile-finance-crm-group">
      <strong>${title}</strong>
      ${rows.map(([id, value]) => renderCompactRow({
        label: categories.find((category) => category.id === id)?.name || id,
        value
      })).join('') || '<p class="mobile-empty">Sem dados.</p>'}
    </div>
  `;
}

function getUniquePayables(payables) {
  return [...payables.overdue, ...payables.upcoming, ...payables.pending]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
}

function formatFinanceStatus(status) {
  const labels = {
    paid: 'Pago',
    pending: 'Pendente',
    overdue: 'Vencida',
    canceled: 'Cancelada'
  };

  return labels[status] || status || 'Pendente';
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
              <option value="${escapeHtml(category.id)}" ${state.showcaseCategoryId === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>
            `).join('')}
          </select>
        </label>
        <label>
          Produto
          <select class="field" data-mobile-showcase-product name="produtoId" required>
            <option value="">Escolha o produto</option>
            ${products.map((product) => `
              <option value="${escapeHtml(product.id)}" ${state.showcaseProductId === product.id ? 'selected' : ''}>${escapeHtml(product.name)}</option>
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
        ${canCurrentUser('showcase.launch') ? '<button class="mobile-showcase-submit" type="submit">Lancar / atualizar vitrine</button>' : ''}
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

async function saveMobileClosing(form, workspace) {
  const formData = new FormData(form);
  const input = {
    countedCash: formData.get('countedCash'),
    checkedPix: formData.get('checkedPix'),
    checkedCard: formData.get('checkedCard'),
    note: formData.get('note')
  };

  state.syncState = 'syncing';
  state.closingError = '';
  renderIfActive(workspace);

  try {
    await submitMobileClosing(input);
    await hydrateOnlineOperationalData({ catalog: false, financial: true, showcase: false });
    state.syncState = 'synced';
    state.closingForm = { countedCash: '', checkedPix: '', checkedCard: '', note: '' };
  } catch (error) {
    state.syncState = 'error';
    state.closingError = error.message || 'Nao foi possivel fechar o caixa.';
    state.syncError = state.closingError;
  }

  renderIfActive(workspace);
}

async function saveMobileFinance(form, workspace) {
  const formData = new FormData(form);
  const formType = String(formData.get('formType') || '');
  const isBill = formType === 'bill';
  const isIncome = formType === 'income';

  state.syncState = 'syncing';
  state.financeError = '';
  renderIfActive(workspace);

  try {
    await createMobileFinancialTransaction({
      type: isIncome ? 'income' : 'expense',
      description: formData.get('description'),
      amount: formData.get('amount'),
      categoryId: formData.get('categoryId'),
      paymentMethod: isBill ? 'boleto' : 'dinheiro',
      status: isBill ? formData.get('status') : 'paid',
      transactionDate: new Date().toISOString().slice(0, 10),
      dueDate: formData.get('dueDate') || '',
      notes: formData.get('notes') || '',
      movesCashSession: false
    });
    await hydrateOnlineOperationalData({ catalog: false, financial: true, showcase: false });
    state.financeModal = '';
    state.syncState = 'synced';
  } catch (error) {
    state.syncState = 'error';
    state.financeError = error.message || 'Nao foi possivel registrar o lancamento financeiro.';
    state.syncError = state.financeError;
  }

  renderIfActive(workspace);
}

async function payMobileBill(transactionId, workspace) {
  state.syncState = 'syncing';
  state.financeError = '';
  renderIfActive(workspace);

  try {
    await markMobileFinancialTransactionPaid(transactionId, { paymentMethod: 'boleto' });
    await hydrateOnlineOperationalData({ catalog: false, financial: true, showcase: false });
    state.syncState = 'synced';
  } catch (error) {
    state.syncState = 'error';
    state.financeError = error.message || 'Nao foi possivel marcar a conta como paga.';
    state.syncError = state.financeError;
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
        <strong>${escapeHtml(event.title)}</strong>
        <p>${escapeHtml(event.description)}${event.amount ? ` - ${formatCurrency(event.amount)}` : ''}</p>
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
            <span>${item.quantity}x ${escapeHtml(item.name)}</span>
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

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(String(value).length === 10 ? `${value}T12:00:00` : value));
}

function formatTime(value) {
  if (!value) {
    return '--:--';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatNumberInput(value) {
  return Number(value || 0).toFixed(2);
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
