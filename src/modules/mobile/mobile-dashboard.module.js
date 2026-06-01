import { UI_EVENTS } from '../../database/schema.js';
import { on } from '../../services/event-bus.service.js';
import { getCrmSummary, getProductRanking } from '../../services/crm-dashboard.service.js';
import { getMobileCashFlowSummary } from '../../services/mobile-cash-flow.service.js';
import { getMobileClosingSummary } from '../../services/mobile-closing.service.js';
import {
  getMobileFeedEvents,
  getMobileFeedFilters,
  getMobileFeedPeriodFilters
} from '../../services/mobile-notifications.service.js?v=20260601-04';
import { getMobileShowcaseSummary } from '../../services/mobile-showcase.service.js';
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
  feedLimit: 5
};

let subscriptionsReady = false;

export function initMobileDashboardModule(workspace) {
  state = {
    tab: 'home',
    filter: 'all',
    feedPeriod: 'today',
    customStart: '',
    customEnd: '',
    feedLimit: 5
  };

  render(workspace);
  bindRealtimeRefresh(workspace);
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
    const themeButton = event.target.closest('[data-mobile-theme]');
    const exitButton = event.target.closest('[data-mobile-exit]');

    if (themeButton) {
      toggleTheme();
      themeButton.textContent = getThemeLabel();
      return;
    }

    if (exitButton) {
      window.location.href = window.location.pathname || './';
      return;
    }

    if (tabButton) {
      state.tab = tabButton.dataset.mobileTab;
      render(workspace);
      return;
    }

    if (filterButton) {
      state.filter = filterButton.dataset.feedFilter;
      state.feedLimit = 5;
      render(workspace);
      return;
    }

    if (periodButton) {
      state.feedPeriod = periodButton.dataset.feedPeriod;
      state.feedLimit = 5;
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
    }
  });

  workspace.addEventListener('change', (event) => {
    if (event.target.matches('[data-feed-custom-start]')) {
      state.customStart = event.target.value;
      state.feedPeriod = 'custom';
      state.feedLimit = 5;
      render(workspace);
      return;
    }

    if (event.target.matches('[data-feed-custom-end]')) {
      state.customEnd = event.target.value;
      state.feedPeriod = 'custom';
      state.feedLimit = 5;
      render(workspace);
    }
  });
}

function bindRealtimeRefresh(workspace) {
  if (subscriptionsReady) {
    return;
  }

  on(UI_EVENTS.mobileFeedChanged, () => render(workspace));
  on(UI_EVENTS.cashSummaryChanged, () => render(workspace));
  subscriptionsReady = true;
}

function render(workspace) {
  const cash = getMobileCashFlowSummary({
    period: state.feedPeriod,
    customStart: state.customStart,
    customEnd: state.customEnd
  });

  workspace.innerHTML = `
    <section class="mobile-shell">
      <div class="mobile-app">
        ${renderMobileTopbar(getThemeLabel())}
        ${renderTabContent(cash)}
        ${renderBottomNav()}
      </div>
    </section>
  `;

  bindEvents(workspace);
}

export function renderMobileTopbar(themeLabel = getThemeLabel()) {
  return `
    <header class="mobile-topbar">
      <div>
        <h1>PDV Lanchonete</h1>
        <p>Painel do dono</p>
      </div>
      <div class="mobile-topbar__actions">
        <button class="mobile-topbar__button" type="button" data-mobile-theme>${themeLabel}</button>
        <button class="mobile-topbar__button" type="button" data-mobile-exit>Sair</button>
      </div>
    </header>
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
    { label: 'Valor vendido', value: summary.soldValue, tone: 'primary' }
  ];

  return `
    <div class="mobile-content">
      <div class="mobile-metrics">
        ${cards.map(renderMetricCard).join('')}
      </div>
      <section class="mobile-list-panel">
        <h2>Produtos na vitrine</h2>
        ${summary.rows.map((row) => `
          <div class="mobile-row">
            <span>${row.produtoNome}</span>
            <strong>${row.sobraQuantidade} restantes</strong>
          </div>
        `).join('') || '<p class="mobile-empty">Nenhum produto na vitrine hoje.</p>'}
      </section>
    </div>
  `;
}

function renderCrmTab() {
  const crm = getCrmSummary();
  const ranking = getProductRanking();
  const best = ranking.byQuantity[0];
  const slow = ranking.byQuantity[ranking.byQuantity.length - 1];
  const cards = [
    { label: 'Comandas abertas', value: crm.openComandas, tone: 'info', isCurrency: false },
    { label: 'Comandas fechadas', value: crm.closedComandas, tone: 'success', isCurrency: false },
    { label: 'Ticket medio', value: crm.ticketAverage, tone: 'primary' },
    { label: 'Lucro estimado', value: crm.estimatedProfit, tone: 'warning' }
  ];

  return `
    <div class="mobile-content">
      <div class="mobile-metrics">
        ${cards.map(renderMetricCard).join('')}
      </div>
      <section class="mobile-list-panel">
        <h2>Resumo CRM</h2>
        ${renderTextRow('Produto mais vendido', best ? `${best.name} (${best.quantity})` : 'Sem vendas')}
        ${renderTextRow('Produto menos vendido', slow ? `${slow.name} (${slow.quantity})` : 'Sem vendas')}
      </section>
    </div>
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
        ${visibleEvents.map(renderFeedEvent).join('') || '<p class="mobile-empty">Nenhum evento neste filtro.</p>'}
      </div>
      ${hasMore ? '<button class="mobile-load-more" type="button" data-feed-load-more>Carregar mais</button>' : ''}
    </section>
  `;
}

function getDateInputValue(date) {
  return date.toISOString().slice(0, 10);
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
