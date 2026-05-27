import { UI_EVENTS } from '../../database/schema.js';
import { on } from '../../services/event-bus.service.js';
import { getCrmSummary, getProductRanking } from '../../services/crm-dashboard.service.js';
import { getMobileCashFlowSummary } from '../../services/mobile-cash-flow.service.js';
import { getMobileClosingSummary } from '../../services/mobile-closing.service.js';
import { getMobileFeedEvents, getMobileFeedFilters } from '../../services/mobile-notifications.service.js';
import { getMobileShowcaseSummary } from '../../services/mobile-showcase.service.js';
import { formatCurrency } from '../../utils/currency.js';

const MOBILE_THEME_KEY = 'pdv.mobileTheme';

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
  theme: getSavedMobileTheme()
};

let subscriptionsReady = false;

export function initMobileDashboardModule(workspace) {
  state = {
    tab: 'home',
    filter: 'all',
    theme: getSavedMobileTheme()
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
    const themeButton = event.target.closest('[data-mobile-theme-toggle]');

    if (tabButton) {
      state.tab = tabButton.dataset.mobileTab;
      render(workspace);
      return;
    }

    if (filterButton) {
      state.filter = filterButton.dataset.feedFilter;
      render(workspace);
      return;
    }

    if (themeButton) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(MOBILE_THEME_KEY, state.theme);
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
  const cash = getMobileCashFlowSummary();

  workspace.innerHTML = `
    <section class="mobile-shell" data-mobile-theme="${state.theme}">
      <div class="mobile-app">
        <header class="mobile-topbar">
          <div>
            <h1>PDV Lanchonete</h1>
            <p>Painel do dono</p>
          </div>
          <div class="mobile-topbar-actions">
            <button class="mobile-theme-toggle" type="button" data-mobile-theme-toggle aria-label="${getMobileThemeAriaLabel()}">
              <span>${state.theme === 'dark' ? 'CL' : 'ES'}</span>
            </button>
            <span>Hoje</span>
          </div>
        </header>
        ${renderTabContent(cash)}
        ${renderBottomNav()}
      </div>
    </section>
  `;

  bindEvents(workspace);
}

function getSavedMobileTheme() {
  return globalThis.localStorage?.getItem(MOBILE_THEME_KEY) || 'light';
}

function getMobileThemeAriaLabel() {
  return state.theme === 'dark' ? 'Ativar modo claro no app' : 'Ativar modo escuro no app';
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
      ${renderHeroCard(cash.cards[0])}
      <div class="mobile-metrics">
        ${cash.cards.slice(1).map(renderMetricCard).join('')}
      </div>
      ${renderLiveFeed()}
    </div>
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
