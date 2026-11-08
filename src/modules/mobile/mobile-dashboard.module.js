import { UI_EVENTS } from '../../database/schema.js?v=20260804-06';
import { on } from '../../services/event-bus.service.js?v=20260804-06';
import {
  createPeriodFilter,
  getCategoryRanking,
  getCrmSummary,
  getProductRanking,
  getSalesSeries
} from '../../services/crm-dashboard.service.js?v=20260804-06';
import { getMobileCashFlowSummary } from '../../services/mobile-cash-flow.service.js?v=20260804-06';
import { getMobileClosingSummary, previewMobileClosing, submitMobileClosing } from '../../services/mobile-closing.service.js?v=20260804-06';
import {
  createMobileFinancialTransaction,
  getMobileFinancialSummary,
  markMobileFinancialTransactionPaid
} from '../../services/mobile-financial.service.js?v=20260804-06';
import {
  getMobileFeedEvents,
  getMobileFeedFilters,
  getMobileFeedPeriodFilters
} from '../../services/mobile-notifications.service.js?v=20260804-06';
import { getMobileShowcaseSummary } from '../../services/mobile-showcase.service.js?v=20260804-06';
import {
  createStockLaunch,
  getProductionSalesComparison
} from '../../services/estoque.service.js?v=20260804-06';
import { getCategories, getShowcaseCategories, getShowcaseProducts, getProductById, syncCatalogNow } from '../../services/product.service.js?v=20260804-06';
import { getTransactionSyncStatus } from '../../services/transaction.service.js?v=20260804-06';
import { getCatalogSyncStatus } from '../../services/product.service.js?v=20260804-06';
import { getCashSession } from '../../services/cash-session.service.js?v=20260804-06';
import { getCurrentUser, logout } from '../../services/auth.service.js?v=20260804-06';
import { hydrateOnlineOperationalData, syncOnlineOperationalData } from '../../services/online-data.service.js?v=20260804-06';
import { isSupabaseEnabled } from '../../services/app-config.service.js?v=20260804-06';
import { loadCompanySettingsLocal } from '../../services/empresa-config.service.js?v=20260807-20';
import { getThemeLabel, toggleTheme } from '../../services/theme.service.js?v=20260807-05';
import { formatCurrency } from '../../utils/currency.js?v=20260804-06';
import { hasPermission } from '../../services/permission.service.js?v=20260804-06';
import { escapeHtml } from '../../utils/dom.js?v=20260804-06';
import { icon } from '../../components/icons.js?v=20260807-06';
import { getCategoryColorVar } from '../../utils/category-colors.js?v=20260807-07';
import { getDifferenceTone } from '../../utils/difference-tone.js?v=20260807-21';
import { isAllowedLogoUrl } from '../../utils/logo-url.js?v=20260807-11';

// Abas de baixo. "closing" (Fechar caixa) nao e aba: fica no menu do topo.
const tabs = [
  { id: 'home', label: 'Início', icon: 'home', title: 'Painel do dono' },
  { id: 'cash', label: 'Caixa', icon: 'cash', title: 'Caixa' },
  { id: 'showcase', label: 'Vitrine', icon: 'store', title: 'Vitrine' },
  { id: 'crm', label: 'CRM', icon: 'crm', title: 'CRM' },
  { id: 'finance', label: 'Financeiro', icon: 'wallet', title: 'Financeiro' }
];

const TAB_TITLES = {
  ...Object.fromEntries(tabs.map((tab) => [tab.id, tab.title])),
  closing: 'Fechar caixa'
};

const PERIOD_LABELS = {
  today: 'Hoje',
  yesterday: 'Ontem',
  month: 'Mês',
  custom: 'Período'
};

// Complemento do titulo do numero grande: "Total vendido hoje", "Saldo do mês"...
const PERIOD_PHRASES = {
  today: 'hoje',
  yesterday: 'ontem',
  month: 'no mês',
  custom: 'no período'
};

const PAYMENT_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  cartao: 'Cartão',
  boleto: 'Boleto'
};

// Ate esta quantidade a vitrine mostra "N restantes" (igual a frente de caixa e a tela Vitrine).
const LOW_STOCK_LIMIT = 3;

const MOBILE_AUTO_REFRESH_MS = 40000;

let state = createInitialState();

let subscribedWorkspace = null;
let unsubscribeRealtimeRefresh = [];
let autoRefreshTimer = null;
let autoRefreshWorkspace = null;
let focusedMobileField = false;
let pendingDeferredRender = false;

function createInitialState() {
  return {
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
    closingWarning: '',
    financeModal: '',
    financeError: '',
    periodMenuOpen: false,
    menuOpen: false
  };
}

export function initMobileDashboardModule(workspace) {
  workspace.dataset.activeRoute = 'mobile';
  state = createInitialState();

  render(workspace);
  bindRealtimeRefresh(workspace);
  bindDocumentEscape();
  bindAutoRefresh(workspace);
  refreshMobileData(workspace);
}

function bindEvents(workspace) {
  if (workspace.dataset.mobileDashboardBound === 'true') {
    return;
  }

  workspace.dataset.mobileDashboardBound = 'true';
  workspace.addEventListener('click', async (event) => {
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

    // Toque fora do menu do topo fecha o menu.
    if (state.menuOpen && !event.target.closest('[data-mobile-menu]')) {
      closeTopMenu(workspace);
    }

    if (syncButton) {
      state.menuOpen = false;
      refreshMobileData(workspace, { force: true });
      return;
    }

    if (periodToggleButton) {
      state.periodMenuOpen = !state.periodMenuOpen;
      state.menuOpen = false;
      render(workspace);
      return;
    }

    if (themeButton) {
      toggleTheme();
      render(workspace);
      return;
    }

    if (logoutButton) {
      await logout();
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
      state.menuOpen = false;
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

  // O <details> do menu nao propaga "toggle"; a captura guarda o estado para o proximo render.
  workspace.addEventListener('toggle', (event) => {
    if (typeof event.target?.matches === 'function' && event.target.matches('[data-mobile-menu]')) {
      state.menuOpen = Boolean(event.target.open);
    }
  }, true);

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

function closeTopMenu(workspace) {
  state.menuOpen = false;
  workspace.querySelector?.('[data-mobile-menu]')?.removeAttribute('open');
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
    state.syncError = error.message || 'Erro de sincronização';
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
  const view = renderTabView(cash);
  const menuFocus = getMenuFocusSelector(workspace);

  workspace.innerHTML = `
    <section class="mobile-shell own">
      <div class="own-app">
        ${renderMobileTopbar({
          tab: state.tab,
          context: view.context,
          period: state.feedPeriod,
          sync: getMobileSyncStatus()
        })}
        ${state.periodMenuOpen ? renderMobilePeriodPopover(state) : ''}
        <main class="own-body">
          ${view.html}
        </main>
        ${renderMobileBottomNav(state.tab)}
      </div>
    </section>
  `;

  bindEvents(workspace);
  restoreMenuFocus(workspace, menuFocus);
}

// O innerHTML recria o menu do topo; guarda qual item tinha foco para devolve-lo depois
// (tema, atualizacao em tempo real...). Sem foco no menu, nao mexe no foco.
const MENU_FOCUS_KEYS = ['data-mobile-period-toggle', 'data-mobile-theme', 'data-mobile-sync', 'data-mobile-tab', 'data-mobile-logout'];

function getMenuFocusSelector(workspace) {
  try {
    const active = globalThis.document?.activeElement;

    if (!active || typeof active.closest !== 'function' || !active.closest('[data-mobile-menu]')) {
      return '';
    }

    if (typeof workspace.contains === 'function' && !workspace.contains(active)) {
      return '';
    }

    const key = MENU_FOCUS_KEYS.find((name) => active.hasAttribute?.(name));
    return key ? `[${key}]` : 'summary';
  } catch (error) {
    return '';
  }
}

function restoreMenuFocus(workspace, selector) {
  if (!selector) {
    return;
  }

  try {
    const menu = workspace.querySelector?.('[data-mobile-menu]');
    const target = state.menuOpen ? menu?.querySelector(selector) : menu?.querySelector('summary');
    target?.focus?.({ preventScroll: true });
  } catch (error) {
    // Sem DOM (testes) ou elemento sumiu: segue sem foco.
  }
}

// Esc fecha o menu do topo de qualquer lugar da pagina, nao so de dentro do app.
let documentEscapeBound = false;

function bindDocumentEscape() {
  if (documentEscapeBound || typeof globalThis.document?.addEventListener !== 'function') {
    return;
  }

  documentEscapeBound = true;
  globalThis.document.addEventListener('keydown', (event) => {
    const workspace = subscribedWorkspace;

    if (event.key !== 'Escape' || !state.menuOpen || !workspace || workspace.dataset.activeRoute !== 'mobile') {
      return;
    }

    closeTopMenu(workspace);
    workspace.querySelector?.('[data-mobile-menu] summary')?.focus?.();
  });
}

export function renderMobileTopbar({
  tab = state.tab,
  context = '',
  period = state.feedPeriod,
  sync = getMobileSyncStatus()
} = {}) {
  const title = TAB_TITLES[tab] || TAB_TITLES.home;

  return `
    <header class="own-top">
      ${renderBrandMark()}
      <div class="own-top__text">
        <h1>${escapeHtml(title)}</h1>
        ${context ? `<p>${escapeHtml(context)}</p>` : ''}
      </div>
      <button class="own-live own-live--${escapeHtml(sync.state)}" type="button" data-mobile-sync title="${escapeHtml(sync.title)}">
        <i aria-hidden="true"></i>${escapeHtml(sync.label)}
      </button>
      ${renderTopMenu(period)}
    </header>
  `;
}

function renderTopMenu(period) {
  const user = getCurrentUser();
  const name = String(user?.name || '').trim();
  const initial = Array.from(name)[0]?.toLocaleUpperCase('pt-BR') || '?';

  return `
    <details class="own-menu" data-mobile-menu${state.menuOpen ? ' open' : ''}>
      <summary class="own-menu__summary" aria-label="${escapeHtml(name ? `Menu de ${name}` : 'Menu')}">
        <span class="ui-avatar">${escapeHtml(initial)}</span>
      </summary>
      <div class="ui-user__menu own-menu__list">
        <button type="button" data-mobile-period-toggle aria-expanded="${state.periodMenuOpen ? 'true' : 'false'}">Período: ${getPeriodShortLabel(period)}</button>
        <button type="button" data-mobile-theme>${escapeHtml(getThemeLabel())}</button>
        <button type="button" data-mobile-sync>Atualizar</button>
        <button type="button" data-mobile-tab="closing">${icon('cash')}Fechar caixa</button>
        <button type="button" class="is-danger" data-mobile-logout>${icon('logout')}Sair</button>
      </div>
    </details>
  `;
}

// Marca da empresa: o logo, se houver, ou a inicial do sistema (igual ao menu lateral).
function renderBrandMark() {
  let settings = {};

  try {
    settings = loadCompanySettingsLocal() || {};
  } catch (error) {
    settings = {};
  }

  if (isAllowedLogoUrl(settings.logoUrl)) {
    return `<img class="own-brand own-brand--logo" src="${escapeHtml(settings.logoUrl.trim())}" alt="">`;
  }

  const systemName = String(settings.nomeSistema || 'Zelo PDV');
  const initial = Array.from(systemName.trim())[0]?.toLocaleUpperCase('pt-BR') || 'P';
  return `<span class="own-brand" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

function renderMobilePeriodPopover(periodState) {
  return `
    <section class="own-popover" aria-label="Filtro de período">
      ${renderMobilePeriodControls(periodState)}
    </section>
  `;
}

export function renderMobileBottomNav(activeTab = state.tab) {
  return `
    <nav class="own-tabs" aria-label="Abas do app do dono">
      ${tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return `
          <button class="own-tab${isActive ? ' is-on' : ''}" type="button" data-mobile-tab="${tab.id}"${isActive ? ' aria-current="page"' : ''}>
            ${icon(tab.icon)}
            <span>${tab.label}</span>
          </button>
        `;
      }).join('')}
    </nav>
  `;
}

function renderTabView(cash) {
  if (state.tab === 'cash') {
    return renderCashTab(cash);
  }

  if (state.tab === 'showcase') {
    return renderShowcaseTab();
  }

  if (state.tab === 'crm') {
    return { context: 'Vendas e produtos', html: renderCrmTab() };
  }

  if (state.tab === 'finance') {
    return { context: getPeriodContext(), html: renderFinanceTab() };
  }

  if (state.tab === 'closing') {
    return { context: 'Conferência do caixa de hoje', html: renderClosingTab() };
  }

  return { context: formatLongDate(new Date()), html: renderHomeTab(cash) };
}

function renderHomeTab(cash) {
  // Sem comparacao com a semana anterior: o resumo do caixa nao traz esse dado.
  return `
    ${renderMobilePeriodControls(state)}
    ${renderHero(`Total vendido ${getPeriodPhrase()}`, cash.salesTotal)}
    ${renderStatGrid([
      { label: 'Caixa atual', value: cash.currentCash },
      { label: 'Vitrine', value: cash.estimatedShowcase },
      { label: 'Entradas', value: cash.entriesTotal, tone: 'plus' },
      { label: 'Saídas', value: cash.outputsTotal, tone: 'minus' }
    ])}
    ${renderLiveFeed()}
  `;
}

export function renderMobilePeriodControls({ feedPeriod, customStart, customEnd }) {
  const periodFilters = getMobileFeedPeriodFilters();

  return `
    <section class="own-period" aria-label="Período do painel">
      <div class="ui-seg own-seg" role="group" aria-label="Período">
        ${periodFilters.map((filter) => {
          const isActive = filter.id === feedPeriod;
          return `<button class="${isActive ? 'is-on' : ''}" type="button" data-feed-period="${filter.id}" aria-pressed="${isActive ? 'true' : 'false'}">${escapeHtml(PERIOD_LABELS[filter.id] || filter.label)}</button>`;
        }).join('')}
      </div>
      ${feedPeriod === 'custom' ? `
        <div class="own-range">
          <label class="own-field">
            <span>De</span>
            <input class="ui-input" type="date" data-feed-custom-start value="${escapeHtml(customStart)}">
          </label>
          <label class="own-field">
            <span>Até</span>
            <input class="ui-input" type="date" data-feed-custom-end value="${escapeHtml(customEnd)}">
          </label>
        </div>
      ` : ''}
    </section>
  `;
}

function renderCashTab(cash) {
  const session = getLocalCashSession();
  const paymentRows = [
    { label: 'Dinheiro', value: cash.paymentTotals.dinheiro },
    { label: 'Pix', value: cash.paymentTotals.pix },
    { label: 'Débito', value: cash.paymentTotals.debito },
    { label: 'Crédito', value: cash.paymentTotals.credito }
  ].map((row) => ({ ...row, value: Number(row.value || 0) }))
    .sort((left, right) => right.value - left.value);
  const movements = getMobileFeedEvents({
    filter: 'all',
    period: state.feedPeriod,
    customStart: state.customStart,
    customEnd: state.customEnd,
    limit: Number.MAX_SAFE_INTEGER
  }).filter((event) => event.kind === 'inflow' || event.kind === 'outflow');
  // O troco inicial so existe quando o caixa foi aberto neste aparelho.
  const openingNote = session ? `Troco inicial ${formatCurrency(session.openingAmount || 0)}` : '';

  return {
    context: getCashContext(session),
    html: `
      ${renderMobilePeriodControls(state)}
      ${renderHero('Caixa atual', cash.currentCash, openingNote, 'is-muted')}
      ${renderStatGrid([
        { label: 'Total vendido', value: cash.salesTotal },
        { label: 'Vitrine estimada', value: cash.estimatedShowcase },
        { label: 'Entradas', value: cash.entriesTotal, tone: 'plus' },
        { label: 'Saídas', value: cash.outputsTotal, tone: 'minus' }
      ])}
      ${renderPanel('Formas de pagamento', renderBars(paymentRows.map((row) => ({
        label: row.label,
        value: row.value,
        display: formatCurrency(row.value),
        color: 'var(--ink)'
      })), { empty: 'Sem vendas no período.' }))}
      ${renderPanel('Movimentos', movements.length ? `
        <div class="own-list">
          ${movements.slice(0, 12).map(renderMovementRow).join('')}
        </div>
      ` : '<p class="own-empty">Nenhuma entrada ou saída no período.</p>', {
        aside: movements.length ? `${movements.length}` : ''
      })}
    `
  };
}

function renderMovementRow(event) {
  return `
    <div class="own-row">
      <span class="own-row__main">
        <b>${escapeHtml(event.description || event.title)}</b>
        <small>${escapeHtml(event.title)} · ${formatEventTime(event.createdAt)}</small>
      </span>
      ${renderSignedAmount(event)}
    </div>
  `;
}

function getLocalCashSession() {
  try {
    return getCashSession();
  } catch (error) {
    return null;
  }
}

function getCashContext(session) {
  if (session?.status === 'aberto') {
    const time = formatTime(session.openedAt);
    return time === '--:--' ? 'Caixa aberto' : `Aberto às ${time}`;
  }

  if (session?.status === 'fechado') {
    return 'Caixa fechado';
  }

  return getPeriodContext();
}

function renderShowcaseTab() {
  const summary = getMobileShowcaseSummary(getMobilePeriodFilters());
  const categories = getCategories();
  const units = summary.rows.reduce((total, row) => total + Math.max(Number(row.sobraQuantidade) || 0, 0), 0);
  const outCount = summary.rows.filter((row) => Number(row.sobraQuantidade) <= 0).length;
  const lowCount = summary.rows.filter((row) => Number(row.sobraQuantidade) > 0 && Number(row.sobraQuantidade) <= LOW_STOCK_LIMIT).length;

  return {
    context: `${units} ${units === 1 ? 'unidade' : 'unidades'} na vitrine`,
    html: `
      ${renderMobilePeriodControls(state)}
      ${renderShowcaseAttention(outCount, lowCount)}
      ${renderPanel('Estoque da vitrine', renderMobileStockList(summary.rows, categories), {
        aside: summary.rows.length === 1 ? '1 produto' : `${summary.rows.length} produtos`
      })}
      ${renderStatGrid(summary.cards.map((card) => ({
        label: card.label,
        value: card.value,
        isCurrency: card.isCurrency !== false,
        tone: card.id === 'soldWithoutStock' && card.value ? 'minus' : ''
      })))}
      ${renderMobileShowcaseForm(summary)}
      ${renderPanel('Produção x vendas', summary.comparisonRows.length ? `
        <div class="own-list">
          ${summary.comparisonRows.map(renderMobileComparisonRow).join('')}
        </div>
      ` : '<p class="own-empty">Sem dados para comparar.</p>')}
      ${renderPanel('Cancelados', summary.canceledLaunches.length ? `
        <div class="own-list">
          ${summary.canceledLaunches.map(renderCanceledShowcaseLaunch).join('')}
        </div>
      ` : '<p class="own-empty">Nenhum cancelamento no período.</p>')}
    `
  };
}

function renderShowcaseAttention(outCount, lowCount) {
  const total = outCount + lowCount;

  if (!total) {
    return '';
  }

  const parts = [
    outCount ? `${outCount} ${outCount === 1 ? 'esgotado' : 'esgotados'}` : '',
    lowCount ? `${lowCount} acabando` : ''
  ].filter(Boolean);

  return `
    <section class="own-alert" role="status">
      <b>${total} ${total === 1 ? 'produto precisa' : 'produtos precisam'} de atenção</b>
      <small>${parts.join(' e ')}</small>
    </section>
  `;
}

export function renderMobileStockList(rows, categories = getCategories()) {
  if (!rows.length) {
    return '<p class="own-empty">Nada lançado na vitrine no período.</p>';
  }

  const rank = (row) => {
    const quantity = Number(row.sobraQuantidade) || 0;
    return quantity <= 0 ? 0 : quantity <= LOW_STOCK_LIMIT ? 1 : 2;
  };
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => rank(left.row) - rank(right.row) || left.index - right.index)
    .map(({ row }) => row);

  return `
    <div class="own-list">
      ${sorted.map((row) => {
        const quantity = Math.max(Number(row.sobraQuantidade) || 0, 0);
        return `
          <div class="own-row own-stock${quantity <= 0 ? ' is-out' : ''}">
            <span class="ui-stripe" style="--c: ${getCategoryColor(row.categoriaId, categories)}"></span>
            <span class="own-row__main">
              <b>${escapeHtml(row.produtoNome)}</b>
              <small>${escapeHtml(row.categoriaNome)}</small>
            </span>
            ${renderStockStatus(quantity)}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderStockStatus(quantity) {
  if (quantity <= 0) {
    return '<span class="ui-pill ui-pill--danger">Esgotado</span>';
  }

  if (quantity <= LOW_STOCK_LIMIT) {
    return `<span class="ui-pill ui-pill--warn">${quantity} ${quantity === 1 ? 'restante' : 'restantes'}</span>`;
  }

  return `<b class="own-row__value">${quantity} un.</b>`;
}

function renderMobileComparisonRow(item) {
  const isExpanded = state.expandedComparisonIds.includes(item.produtoId);

  return `
    <article class="own-compare${isExpanded ? ' is-expanded' : ''}">
      <div class="own-compare__head">
        <b>${escapeHtml(item.produtoNome)}</b>
        <small>${escapeHtml(item.categoriaNome)}</small>
      </div>
      <dl class="own-compare__nums">
        ${renderComparisonMetric('Vendido', `${item.quantidadeVendida}/${item.quantidadeProduzida}`)}
        ${renderComparisonMetric('Sobra', item.sobraQuantidade)}
        ${renderComparisonMetric('% vendido', `${item.percentualVendido}%`)}
      </dl>
      ${isExpanded ? `
        <dl class="own-compare__nums own-compare__details">
          ${renderComparisonMetric('Produzido', item.quantidadeProduzida)}
          ${renderComparisonMetric('Valor produzido', formatCurrency(item.valorProduzido))}
          ${renderComparisonMetric('Vendido', item.quantidadeVendida)}
          ${renderComparisonMetric('Valor vendido', formatCurrency(item.valorVendido))}
          ${renderComparisonMetric('Diferença', formatCurrency(item.diferencaValor))}
        </dl>
      ` : ''}
      <button class="ui-btn ui-btn--ghost ui-btn--sm own-compare__toggle" type="button" data-mobile-comparison-toggle="${escapeHtml(item.produtoId)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
        ${isExpanded ? 'Exibir menos' : 'Exibir mais'}
      </button>
    </article>
  `;
}

function renderComparisonMetric(label, value) {
  return `
    <div>
      <dt>${label}</dt>
      <dd>${value}</dd>
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
    <div class="own-row">
      <span class="own-row__main">
        <b>${escapeHtml(launch.produtoNome)}</b>
        <small>${escapeHtml(launch.categoriaNome)} · ${launch.quantidade} un. · ${formatDateTime(launch.canceledAt || launch.dataHora)}</small>
      </span>
      <span class="own-row__end">
        <b class="own-row__value">${formatCurrency(launch.valorTotal)}</b>
        <span class="ui-pill">Cancelado</span>
      </span>
    </div>
  `;
}

export function renderCrmTab() {
  const filter = getMobileCrmFilter();
  const crm = getCrmSummary(filter);
  const ranking = getProductRanking(filter);
  const categories = getCategoryRanking(filter);
  const series = getSalesSeries(filter);
  const comparison = getProductionSalesComparison(getMobilePeriodFilters());
  const allCategories = getCategories();
  const best = ranking.byQuantity[0];
  const slow = ranking.byQuantity[ranking.byQuantity.length - 1];
  const paymentRows = [
    { label: 'Dinheiro', value: crm.paymentTotals.dinheiro },
    { label: 'Pix', value: crm.paymentTotals.pix },
    { label: 'Débito', value: crm.paymentTotals.debito },
    { label: 'Crédito', value: crm.paymentTotals.credito }
  ].map((row) => ({ ...row, value: Number(row.value || 0) }))
    .sort((left, right) => right.value - left.value);

  // Sem comparacao com a semana anterior: o resumo do CRM nao traz esse dado.
  return `
    ${renderMobilePeriodControls(state)}
    ${renderHero(`Total vendido ${getPeriodPhrase()}`, crm.salesTotal, `Caixa atual ${formatCurrency(crm.estimatedProfit)}`, 'is-muted')}
    ${renderStatGrid([
      { label: 'Ticket médio', value: crm.ticketAverage },
      { label: 'Comandas', value: crm.closedComandas, isCurrency: false },
      { label: 'Entradas', value: crm.entriesTotal, tone: 'plus' },
      { label: 'Saídas', value: crm.outputsTotal, tone: 'minus' }
    ])}
    ${renderMobileSalesChart(series)}
    ${renderPanel('Formas de pagamento', renderBars(paymentRows.map((row) => ({
      label: row.label,
      value: row.value,
      display: formatCurrency(row.value),
      color: 'var(--ink)'
    })), { empty: 'Sem vendas no período.' }))}
    ${renderMobileTopProducts(ranking.byQuantity.slice(0, 5), allCategories)}
    ${renderMobileCategoryChart(categories, allCategories)}
    ${renderMobileProductionChart(comparison)}
    ${renderPanel('Destaques', `
      <div class="own-list">
        ${renderHighlightRow('Mais vendido', best ? escapeHtml(best.name) : 'Sem vendas', best ? `${best.quantity} un.` : '')}
        ${renderHighlightRow('Menos vendido', slow ? escapeHtml(slow.name) : 'Sem vendas', slow ? `${slow.quantity} un.` : '')}
        ${renderHighlightRow('Maior categoria', categories[0] ? escapeHtml(categories[0].name) : 'Sem vendas', categories[0] ? formatCurrency(categories[0].revenue) : '')}
      </div>
    `)}
  `;
}

function renderHighlightRow(label, detailHtml, valueText) {
  return `
    <div class="own-row">
      <span class="own-row__main">
        <span>${label}</span>
        <small>${detailHtml}</small>
      </span>
      ${valueText ? `<b class="own-row__value">${valueText}</b>` : ''}
    </div>
  `;
}

// Uma barra por dia do periodo; hoje (ou, sem hoje, o pico) em ambar.
export function renderMobileSalesChart(series) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const values = series.map((item) => Number(item.sales || 0));
  const maxSales = Math.max(...values, 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  let highlightIndex = series.findIndex((item) => item.label === todayKey);

  if (highlightIndex < 0 && maxSales > 0) {
    highlightIndex = values.indexOf(maxSales);
  }

  const labelStep = series.length > 10 ? Math.ceil(series.length / 7) : 1;
  const body = series.length ? `
    <div class="own-days">
      ${series.map((item, index) => {
        const isToday = item.label === todayKey;
        const value = values[index];
        const height = maxSales > 0 ? Math.max(Math.round((value / maxSales) * 100), value > 0 ? 4 : 0) : 0;
        const showLabel = isToday || index === highlightIndex || index % labelStep === 0;
        const title = `${isToday ? 'Hoje' : formatDate(item.label)}: ${formatCurrency(value)}`;

        return `
          <div class="own-day">
            <span class="own-day__bar"><i${index === highlightIndex ? ' class="is-hi"' : ''} style="height:${height}%" title="${title}"></i></span>
            <span class="own-day__label">${showLabel ? formatDayLabel(item.label, isToday, series.length <= 7) : ''}</span>
          </div>
        `;
      }).join('')}
    </div>
  ` : '<p class="own-empty">Sem vendas no período.</p>';

  return renderPanel('Vendas por dia', body, { aside: total > 0 ? formatCurrency(total) : '' });
}

export function renderMobileTopProducts(items, allCategories = getCategories()) {
  return renderPanel('Mais vendidos', renderBars(items.map((item) => ({
    label: escapeHtml(item.name),
    value: Number(item.quantity || 0),
    display: `${item.quantity} un.`,
    detail: formatCurrency(item.revenue),
    color: getCategoryColor(item.categoryId, allCategories)
  })), { empty: 'Sem vendas no período.' }));
}

export function renderMobileCategoryChart(categories, allCategories = getCategories()) {
  return renderPanel('Categorias', renderBars(categories.slice(0, 5).map((item) => ({
    label: escapeHtml(item.name),
    value: item.revenue,
    display: formatCurrency(item.revenue),
    detail: `${item.quantity} un.`,
    color: getCategoryColor(item.categoryId, allCategories)
  })), { empty: 'Sem vendas no período.' }));
}

export function renderMobileProductionChart(comparison) {
  const rows = comparison.slice(0, 5);

  return renderPanel('Produção x vendido', renderBars(rows.map((item) => ({
    label: escapeHtml(item.produtoNome),
    value: Math.min(Math.max(Number(item.percentualVendido) || 0, 0), 100),
    display: `${item.percentualVendido}%`,
    detail: `${item.quantidadeVendida}/${item.quantidadeProduzida} vendidos`,
    color: 'var(--accent)'
  })), { empty: 'Sem vitrine no período.', max: 100 }));
}

function renderClosingTab() {
  const closing = getMobileClosingSummary();
  const closingForm = getClosingFormValues(closing.formDefaults);
  const preview = previewMobileClosing(closingForm);

  return `
    ${renderClosingStats(closing, preview)}
    ${renderMobileClosingForm(closingForm)}
    ${renderMobileClosingPreview(preview)}
    ${renderPanel('Histórico de fechamentos', closing.history.length ? `
      <div class="own-list">
        ${closing.history.map(renderMobileClosingHistoryRow).join('')}
      </div>
    ` : '<p class="own-empty">Nenhum fechamento registrado.</p>')}
  `;
}

// Cartoes do fechamento. A diferenca segue a regra do Caixa: so a falta em vermelho.
export function renderClosingStats(closing, preview) {
  return renderStatGrid([
    { label: 'Dinheiro esperado', value: closing.expectedCash },
    { label: 'Pix esperado', value: closing.expectedPix },
    { label: 'Cartão esperado', value: closing.expectedCard },
    { label: 'Diferença', value: preview.differenceTotal, tone: getDifferenceTone(preview.differenceTotal) }
  ]);
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
  return renderPanel('Fechar caixa', `
    ${state.closingError ? `<p class="own-error" role="alert">${escapeHtml(state.closingError)}</p>` : ''}
    ${state.closingWarning ? `<p class="own-note" role="status">${escapeHtml(state.closingWarning)}</p>` : ''}
    <form class="own-form" data-mobile-closing-form>
      <div class="own-form__grid">
        ${renderMoneyInput('Dinheiro contado', 'countedCash', values.countedCash)}
        ${renderMoneyInput('Pix contado', 'checkedPix', values.checkedPix)}
        ${renderMoneyInput('Cartão contado', 'checkedCard', values.checkedCard)}
      </div>
      <label class="own-field">
        <span>Observação</span>
        <textarea class="ui-input own-textarea" name="note" rows="3" data-mobile-closing-field>${escapeHtml(values.note)}</textarea>
      </label>
      ${canCurrentUser('cash.close') ? '<button class="ui-btn ui-btn--primary own-submit" type="submit">Fechar caixa</button>' : ''}
    </form>
  `);
}

function renderMoneyInput(label, name, value) {
  return `
    <label class="own-field">
      <span>${label}</span>
      <input class="ui-input" name="${name}" type="number" inputmode="decimal" min="0" step="0.01" value="${formatNumberInput(value)}" data-mobile-closing-field>
    </label>
  `;
}

function renderMobileClosingPreview(preview) {
  const rows = [
    ['Dinheiro esperado', preview.payments.expectedCash],
    ['Pix esperado', preview.payments.expectedPix],
    ['Cartão esperado', preview.expectedCard],
    ['Total esperado', preview.expectedTotal],
    ['Total contado', preview.countedTotal],
    ['Diferença em dinheiro', preview.cashDifference],
    ['Diferença em Pix', preview.pixDifference || 0],
    ['Diferença em cartão', preview.cardDifference],
    ['Diferença total', preview.differenceTotal]
  ];

  return renderPanel('Resumo do fechamento', `
    <div class="own-list">
      ${rows.map(([label, value]) => renderValueRow(label, formatCurrency(value))).join('')}
    </div>
  `);
}

function renderMobileClosingHistoryRow(item) {
  return `
    <article class="own-history">
      <header class="own-history__head">
        <b>${formatDate(item.closedAt || item.generatedAt)} · ${formatTime(item.closedAt || item.generatedAt)}</b>
        <span class="ui-pill ui-pill--${getClosingStatusTone(item.statusLabel)}">${escapeHtml(formatClosingStatus(item.statusLabel))}</span>
      </header>
      <small>Por ${escapeHtml(item.userName || 'Sistema')}</small>
      <dl class="own-compare__nums">
        ${renderComparisonMetric('Esperado', formatCurrency(item.expectedTotal))}
        ${renderComparisonMetric('Contado', formatCurrency(item.countedTotal))}
        ${renderComparisonMetric('Diferença', formatCurrency(item.difference))}
      </dl>
    </article>
  `;
}

function getClosingStatusTone(statusLabel) {
  if (statusLabel === 'Conferido') {
    return 'ok';
  }

  if (statusLabel === 'Pequena diferenca') {
    return 'warn';
  }

  return 'danger';
}

function formatClosingStatus(statusLabel) {
  return statusLabel === 'Pequena diferenca' ? 'Pequena diferença' : statusLabel;
}

function renderFinanceTab() {
  const finance = getMobileFinancialSummary(getMobilePeriodFilters());
  const payables = getUniquePayables(finance.payables);
  const cards = Object.fromEntries(finance.cards.map((card) => [card.id, card]));
  const canCreateIncome = canCurrentUser('financial.income.create');
  const canCreateExpense = canCurrentUser('financial.expense.create');
  const balance = Number(cards.balance?.value || 0);

  return `
    ${renderMobilePeriodControls(state)}
    ${renderHero(`Saldo ${getPeriodPhrase()}`, balance, `Entradas ${formatCurrency(cards.entries?.value || 0)}`, 'is-plus', balance < 0 ? 'is-minus' : '')}
    ${renderStatGrid([
      { label: 'Saídas', value: cards.outputs?.value || 0, tone: 'minus' },
      { label: 'Contas a pagar', value: cards.payables?.value || 0, isCurrency: false },
      { label: 'Vencidas', value: cards.overdue?.value || 0, isCurrency: false, tone: cards.overdue?.value ? 'minus' : '' },
      { label: 'Contas pagas', value: cards.paidBills?.value || 0, isCurrency: false }
    ])}
    ${canCreateIncome || canCreateExpense || state.financeError || state.financeModal ? renderPanel('Lançar no financeiro', `
      ${state.financeError ? `<p class="own-error" role="alert">${escapeHtml(state.financeError)}</p>` : ''}
      <div class="own-actions">
        ${canCreateIncome ? '<button class="ui-btn ui-btn--sm" type="button" data-mobile-finance-action="income">+ Entrada</button>' : ''}
        ${canCreateExpense ? '<button class="ui-btn ui-btn--sm ui-btn--loss" type="button" data-mobile-finance-action="expense">− Saída</button>' : ''}
        ${canCreateExpense ? '<button class="ui-btn ui-btn--sm" type="button" data-mobile-finance-action="bill">+ Boleto</button>' : ''}
      </div>
      ${state.financeModal ? renderMobileFinanceForm(state.financeModal, finance.categories) : ''}
    `) : ''}
    ${renderPanel('Contas a pagar', payables.length ? `
      <div class="own-list">
        ${payables.map(renderMobilePayable).join('')}
      </div>
    ` : '<p class="own-empty">Nenhuma conta a pagar.</p>', { aside: payables.length ? `${payables.length}` : '' })}
    ${renderMobileFinanceCrm(finance.crm, finance.categories)}
    ${renderPanel('Movimentações financeiras', renderMobileFinanceTransactions(finance))}
  `;
}

function renderMobileFinanceTransactions(finance) {
  const transactions = finance.transactions
    .filter((transaction) => transaction.status !== 'canceled')
    .slice(0, 12);

  if (!transactions.length) {
    return '<p class="own-empty">Nenhuma movimentação financeira.</p>';
  }

  return `
    <div class="own-list">
      ${transactions.map((transaction) => renderMobileFinanceTransaction(transaction, finance.categories)).join('')}
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
  const formTitle = isBill ? 'Novo boleto' : isIncome ? 'Nova entrada' : 'Nova saída';

  return `
    <form class="own-form own-form--boxed" data-mobile-finance-form aria-label="${formTitle}">
      <input type="hidden" name="formType" value="${escapeHtml(type)}">
      <b class="own-form__title">${formTitle}</b>
      <label class="own-field">
        <span>Descrição</span>
        <input class="ui-input" name="description" required placeholder="${isIncome ? 'Ex.: Aporte do dono' : 'Ex.: Boleto do fornecedor'}">
      </label>
      <div class="own-form__grid">
        <label class="own-field">
          <span>Valor</span>
          <input class="ui-input" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required>
        </label>
        <label class="own-field">
          <span>Categoria</span>
          <select class="ui-input" name="categoryId" required>
            ${filteredCategories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      ${isBill ? `
        <div class="own-form__grid">
          <label class="own-field">
            <span>Vencimento</span>
            <input class="ui-input" name="dueDate" type="date" required>
          </label>
          <label class="own-field">
            <span>Situação</span>
            <select class="ui-input" name="status">
              <option value="pending">Pendente</option>
              <option value="paid">Pago</option>
            </select>
          </label>
        </div>
      ` : ''}
      <label class="own-field">
        <span>Observação</span>
        <textarea class="ui-input own-textarea" name="notes" rows="3"></textarea>
      </label>
      <div class="own-form__actions">
        <button class="ui-btn ui-btn--ghost" type="button" data-mobile-finance-close>Cancelar</button>
        <button class="ui-btn ui-btn--primary" type="submit">Salvar</button>
      </div>
    </form>
  `;
}

function renderMobileFinanceTransaction(transaction, categories) {
  const category = categories.find((item) => item.id === transaction.categoryId);
  const isIncome = transaction.type === 'income';

  return `
    <div class="own-row">
      <span class="own-row__main">
        <b>${escapeHtml(transaction.description)}</b>
        <small>${formatDate(transaction.transactionDate || transaction.createdAt)} · ${escapeHtml(category?.name || 'Sem categoria')} · ${formatFinanceStatus(transaction.status)}</small>
      </span>
      <b class="own-row__value ${isIncome ? 'is-plus' : 'is-minus'}">${isIncome ? '+' : '−'} ${formatCurrency(transaction.amount)}</b>
    </div>
  `;
}

function renderMobilePayable(transaction) {
  const isOverdue = transaction.status === 'overdue';

  return `
    <div class="own-row">
      <span class="own-dot" style="--c: ${isOverdue ? 'var(--red)' : 'var(--accent)'}"></span>
      <span class="own-row__main">
        <b>${escapeHtml(transaction.description)}</b>
        <small>${isOverdue ? 'Venceu em' : 'Vence em'} ${formatDate(transaction.dueDate)} · ${formatFinanceStatus(transaction.status)}</small>
      </span>
      <span class="own-row__end">
        <b class="own-row__value${isOverdue ? ' is-minus' : ''}">${formatCurrency(transaction.amount)}</b>
        ${canCurrentUser('financial.bill.pay') ? `<button class="ui-btn ui-btn--sm" type="button" data-mobile-payable-id="${escapeHtml(transaction.id)}">Pagar</button>` : ''}
      </span>
    </div>
  `;
}

function renderMobileFinanceCrm(crm, categories) {
  return [
    renderMobileCrmGroup('Saídas por categoria', crm.outputsByCategory, categories, 'var(--red)'),
    renderMobileCrmGroup('Entradas por categoria', crm.entriesByCategory, categories, 'var(--green)'),
    renderMobileCrmGroup('Pendentes por categoria', crm.pendingByCategory, categories, 'var(--accent)'),
    renderMobileCrmGroup('Gastos por forma de pagamento', crm.spendingByPaymentMethod, [], 'var(--ink)')
  ].join('');
}

function renderMobileCrmGroup(title, totals, categories, color) {
  const rows = Object.entries(totals || {}).sort((left, right) => right[1] - left[1]).slice(0, 5);

  return renderPanel(title, renderBars(rows.map(([id, value]) => ({
    label: escapeHtml(categories.find((category) => category.id === id)?.name || PAYMENT_LABELS[id] || id),
    value: Number(value || 0),
    display: formatCurrency(value),
    color
  })), { empty: 'Sem dados no período.' }));
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

  return labels[status] || escapeHtml(status || 'Pendente');
}

function renderMobileShowcaseForm(summary) {
  const categories = getShowcaseCategories();
  const products = getMobileShowcaseProducts();
  const selectedProduct = state.showcaseProductId ? getProductById(state.showcaseProductId) : null;
  const currentRow = selectedProduct
    ? summary.rows.find((row) => row.produtoId === selectedProduct.id)
    : null;

  return renderPanel('Lançar vitrine', `
    <form class="own-form" data-mobile-showcase-form>
      <label class="own-field">
        <span>Categoria</span>
        <select class="ui-input" data-mobile-showcase-category name="categoryId">
          <option value="">Todas</option>
          ${categories.map((category) => `
            <option value="${escapeHtml(category.id)}" ${state.showcaseCategoryId === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>
          `).join('')}
        </select>
      </label>
      <label class="own-field">
        <span>Produto</span>
        <select class="ui-input" data-mobile-showcase-product name="produtoId" required>
          <option value="">Escolha o produto</option>
          ${products.map((product) => `
            <option value="${escapeHtml(product.id)}" ${state.showcaseProductId === product.id ? 'selected' : ''}>${escapeHtml(product.name)}</option>
          `).join('')}
        </select>
      </label>
      <div class="own-form__grid">
        <label class="own-field">
          <span>Qtd. adicionada</span>
          <input class="ui-input" name="quantidade" type="number" inputmode="numeric" min="1" step="1" required placeholder="0">
        </label>
        <label class="own-field">
          <span>Atual na vitrine</span>
          <input class="ui-input" type="text" readonly value="${currentRow ? currentRow.sobraQuantidade : 0}">
        </label>
      </div>
      <div class="own-form__grid">
        <label class="own-field">
          <span>Valor unitário</span>
          <input class="ui-input" type="text" readonly value="${selectedProduct ? formatCurrency(selectedProduct.price) : formatCurrency(0)}">
        </label>
        <label class="own-field">
          <span>Estimado atual</span>
          <input class="ui-input" type="text" readonly value="${currentRow ? formatCurrency(currentRow.valorProduzido) : formatCurrency(0)}">
        </label>
      </div>
      <label class="own-field">
        <span>Observação</span>
        <input class="ui-input" name="note" placeholder="Opcional">
      </label>
      ${canCurrentUser('showcase.launch') ? '<button class="ui-btn ui-btn--primary own-submit" type="submit">Lançar / atualizar vitrine</button>' : ''}
    </form>
  `);
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
    <section class="own-card own-feed">
      <header class="own-card__head">
        <h2>Acontecendo agora</h2>
      </header>
      <div class="own-chips" role="group" aria-label="Filtrar eventos">
        ${filters.map((item) => {
          const isActive = item.id === filter;
          return `<button class="own-chip${isActive ? ' is-on' : ''}" type="button" data-feed-filter="${item.id}" aria-pressed="${isActive ? 'true' : 'false'}">${escapeHtml(item.label)}</button>`;
        }).join('')}
      </div>
      <div class="own-list">
        ${visibleEvents.map((event) => renderFeedEvent(event)).join('') || '<p class="own-empty">Nenhum evento neste filtro.</p>'}
      </div>
      ${hasMore ? '<button class="ui-btn ui-btn--ghost own-more" type="button" data-feed-load-more>Carregar mais</button>' : ''}
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
    state.syncError = error.message || 'Não foi possível lançar a vitrine.';
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
  state.closingWarning = '';
  renderIfActive(workspace);

  try {
    const closing = await submitMobileClosing(input);
    state.syncState = 'synced';
    state.closingForm = { countedCash: '', checkedPix: '', checkedCard: '', note: '' };
    state.closingWarning = (closing.warnings || []).join(' ');
    try {
      await hydrateOnlineOperationalData({ catalog: false, financial: true, showcase: false });
    } catch (refreshError) {
      state.syncState = 'pending';
      state.closingWarning = [state.closingWarning, 'Fechamento confirmado. Não foi possível atualizar o histórico; não confirme novamente.'].filter(Boolean).join(' ');
    }
  } catch (error) {
    state.syncState = 'error';
    state.closingError = error.message || 'Não foi possível fechar o caixa.';
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
    state.financeError = error.message || 'Não foi possível registrar o lançamento financeiro.';
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
    state.financeError = error.message || 'Não foi possível marcar a conta como paga.';
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

// Estado da sincronizacao, mostrado como o indicador "Ao vivo" do topo (toque = atualizar).
function getMobileSyncStatus() {
  if (!isSupabaseEnabled()) {
    return {
      state: 'offline',
      label: 'Modo local',
      title: 'Modo local: dados deste aparelho'
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      state: 'offline',
      label: 'Sem conexão',
      title: 'Sem conexão com a internet'
    };
  }

  if (state.syncState === 'syncing') {
    return {
      state: 'syncing',
      label: 'Atualizando',
      title: 'Sincronizando com o banco'
    };
  }

  if (state.syncState === 'error') {
    return {
      state: 'error',
      label: 'Erro',
      title: state.syncError || 'Erro de sincronização'
    };
  }

  const financial = getTransactionSyncStatus();
  const catalog = getCatalogSyncStatus();

  if (financial.state === 'pending' || catalog.state === 'pending') {
    return {
      state: 'syncing',
      label: 'Atualizando',
      title: 'Existem dados pendentes de sincronização'
    };
  }

  if (financial.state === 'error' || catalog.state === 'error') {
    return {
      state: 'error',
      label: 'Erro',
      title: financial.error || catalog.error || 'Erro de sincronização'
    };
  }

  return {
    state: 'synced',
    label: 'Ao vivo',
    title: 'Sincronizado com o banco. Toque para atualizar.'
  };
}

function getPeriodShortLabel(period) {
  return PERIOD_LABELS[period] || PERIOD_LABELS.today;
}

function getPeriodPhrase(period = state.feedPeriod) {
  return PERIOD_PHRASES[period] || PERIOD_PHRASES.today;
}

// Linha de contexto do topo para as abas que dependem do periodo.
function getPeriodContext(period = state.feedPeriod) {
  if (period === 'month') {
    return capitalize(new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date()));
  }

  if (period === 'custom') {
    const start = state.customStart ? formatShortDate(state.customStart) : '';
    const end = state.customEnd ? formatShortDate(state.customEnd) : '';
    return start && end ? `${start} a ${end}` : 'Período escolhido';
  }

  return getPeriodShortLabel(period);
}

export function renderFeedEvent(event, selectedEventId = state.selectedFeedEventId) {
  const isClickable = Boolean(event.details);
  const isOpen = isClickable && selectedEventId === event.id;
  const content = `
    <span class="own-dot" style="--c: ${getFeedTone(event)}"></span>
    <span class="own-row__main">
      <b>${escapeHtml(event.title)}</b>
      <small>${formatEventTime(event.createdAt)} · ${escapeHtml(event.description)}</small>
      ${isClickable ? `<small class="own-event__hint">${isOpen ? 'Ocultar detalhes' : 'Ver detalhes da comanda'}</small>` : ''}
    </span>
    ${event.amount ? renderSignedAmount(event) : ''}
  `;

  return `
    <article class="own-event${isOpen ? ' is-open' : ''}">
      ${isClickable
        ? `<button class="own-row own-event__main" type="button" data-feed-event-id="${escapeHtml(event.id)}" aria-expanded="${isOpen ? 'true' : 'false'}">${content}</button>`
        : `<div class="own-row own-event__main">${content}</div>`}
      ${isOpen ? renderFeedEventDetails(event.details) : ''}
    </article>
  `;
}

function getFeedTone(event) {
  if (event.kind === 'sale' || event.kind === 'inflow') {
    return 'var(--green)';
  }

  if (event.kind === 'outflow') {
    return 'var(--red)';
  }

  if (event.level === 'danger') {
    return 'var(--red)';
  }

  if (event.level === 'warning') {
    return 'var(--accent)';
  }

  return event.level === 'success' ? 'var(--green)' : 'var(--muted)';
}

function renderSignedAmount(event) {
  if (event.kind === 'outflow') {
    return `<b class="own-row__value is-minus">− ${formatCurrency(event.amount)}</b>`;
  }

  if (event.kind === 'inflow') {
    return `<b class="own-row__value is-plus">+ ${formatCurrency(event.amount)}</b>`;
  }

  return `<b class="own-row__value">${formatCurrency(event.amount)}</b>`;
}

function renderFeedEventDetails(details) {
  return `
    <div class="own-detail">
      <div class="own-detail__head">
        <b>Comanda ${formatComandaNumber(details.comandaNumber)}</b>
        <b>${formatCurrency(details.total)}</b>
      </div>
      <div class="own-detail__items">
        ${details.items.map((item) => `
          <div>
            <span>${item.quantity}x ${escapeHtml(item.name)}</span>
            <b>${formatCurrency(item.total)}</b>
          </div>
        `).join('')}
      </div>
      <div class="own-detail__meta">
        ${renderDetailLine('Pagamento', escapeHtml(details.paymentLabel))}
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
      <b>${value}</b>
    </div>
  `;
}

// Pecas de layout ------------------------------------------------------------

function renderHero(label, value, note = '', noteTone = '', valueTone = '') {
  return `
    <section class="own-hero">
      <small>${label}</small>
      <b${valueTone ? ` class="${valueTone}"` : ''}>${formatCurrency(value)}</b>
      ${note ? `<em${noteTone ? ` class="${noteTone}"` : ''}>${note}</em>` : ''}
    </section>
  `;
}

function renderStatGrid(items) {
  return `
    <div class="own-grid">
      ${items.map((item) => `
        <div class="ui-stat${item.tone ? ` is-${item.tone}` : ''}">
          <small>${item.label}</small>
          <b>${item.isCurrency === false ? item.value : formatCurrency(item.value)}</b>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPanel(title, bodyHtml, { aside = '' } = {}) {
  return `
    <section class="own-card">
      <header class="own-card__head">
        <h2>${title}</h2>
        ${aside ? `<span>${aside}</span>` : ''}
      </header>
      ${bodyHtml}
    </section>
  `;
}

// rows: { label (ja escapado), value, display, color, detail? } — detail e uma linha pequena sob a barra.
function renderBars(rows, { empty = 'Sem dados no período.', max = null } = {}) {
  if (!rows.length) {
    return `<p class="own-empty">${empty}</p>`;
  }

  const largest = max ?? Math.max(...rows.map((row) => Number(row.value || 0)), 0);

  return `
    <div class="ui-bars own-bars">
      ${rows.map((row) => {
        const value = Math.max(Number(row.value || 0), 0);
        const width = largest > 0 ? Math.min(Math.round((value / largest) * 100), 100) : 0;
        return `
          <div class="ui-bar-row">
            <span>${row.label}</span>
            <div class="track"><i style="width:${width}%;--c:${row.color}"></i></div>
            <b>${row.display}</b>
            ${row.detail ? `<small class="own-bar-detail">${row.detail}</small>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderValueRow(label, valueText) {
  return `
    <div class="own-row">
      <span class="own-row__main"><span>${label}</span></span>
      <b class="own-row__value">${valueText}</b>
    </div>
  `;
}

function getCategoryColor(categoryId, allCategories) {
  const category = allCategories.find((item) => item.id === categoryId);
  return category ? getCategoryColorVar(category, allCategories) : 'var(--muted)';
}

// Formatos -------------------------------------------------------------------

function capitalize(text) {
  return text ? text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1) : text;
}

function formatLongDate(date) {
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date).replace(/-feira$/, '');
  const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(date);
  return `${capitalize(weekday)}, ${dayMonth}`;
}

function formatDayLabel(dateKey, isToday, useWeekday) {
  if (isToday) {
    return 'Hoje';
  }

  const date = new Date(`${dateKey}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(dateKey);
  }

  if (useWeekday) {
    return capitalize(new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', ''));
  }

  return String(date.getDate());
}

// Ha poucos minutos: "agora" / "há 5 min"; hoje: a hora; antes: data e hora.
function formatEventTime(value) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return 'Sem data';
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));

  if (diffMinutes <= 0) {
    return 'agora';
  }

  if (diffMinutes < 60) {
    return `há ${diffMinutes} min`;
  }

  return date.toDateString() === new Date().toDateString() ? formatTime(value) : formatDateTime(value);
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
  return text.length === 10 && text.includes('-') ? `${text.slice(8, 10)}/${text.slice(5, 7)}` : escapeHtml(text);
}

function formatComandaNumber(number) {
  return String(number || 0).padStart(4, '0');
}
