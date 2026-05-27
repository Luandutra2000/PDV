import { UI_EVENTS } from '../../database/schema.js';
import { on } from '../../services/event-bus.service.js';
import { getCategoryRanking, getCrmSummary, getProductRanking, getSalesSeries } from '../../services/crm-dashboard.service.js';
import { createStockLaunch } from '../../services/estoque.service.js';
import { getMobileCashFlowSummary } from '../../services/mobile-cash-flow.service.js';
import { getMobileFeedEvents, getMobileFeedFilters } from '../../services/mobile-notifications.service.js';
import { getMobileShowcaseSummary } from '../../services/mobile-showcase.service.js';
import { getShowcaseProducts } from '../../services/product.service.js';
import { showNotification } from '../../services/notification.service.js';
import { getTransactions } from '../../services/transaction.service.js';
import { formatCurrency } from '../../utils/currency.js';

const MOBILE_THEME_KEY = 'pdv.mobileTheme';

const tabs = [
  { id: 'home', label: 'Inicio', icon: 'IN' },
  { id: 'cash', label: 'Caixa', icon: '$' },
  { id: 'showcase', label: 'Vitrine', icon: 'VT' },
  { id: 'history', label: 'Historico', icon: 'HT' },
  { id: 'crm', label: 'CRM', icon: 'CR' }
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

  workspace.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-mobile-showcase-form]')) {
      return;
    }

    event.preventDefault();
    const formData = new FormData(event.target);

    try {
      createStockLaunch({
        produtoId: formData.get('productId'),
        quantidade: formData.get('quantity')
      });
      showNotification({
        title: 'Vitrine lancada',
        message: 'Produto entrou na vitrine e sera sincronizado.',
        type: 'success'
      });
      render(workspace);
    } catch (error) {
      showNotification({
        title: 'Nao foi possivel lancar',
        message: error.message || 'Confira produto e quantidade.',
        type: 'danger'
      });
    }
  });
}

function bindRealtimeRefresh(workspace) {
  if (subscriptionsReady) {
    return;
  }

  on(UI_EVENTS.mobileFeedChanged, () => renderIfMobileIsVisible(workspace));
  on(UI_EVENTS.cashSummaryChanged, () => renderIfMobileIsVisible(workspace));
  subscriptionsReady = true;
}

function renderIfMobileIsVisible(workspace) {
  if (!workspace.querySelector('[data-mobile-dashboard-root]')) {
    return;
  }

  render(workspace);
}

function render(workspace) {
  const cash = getMobileCashFlowSummary();

  workspace.innerHTML = `
    <section class="mobile-shell" data-mobile-dashboard-root data-mobile-theme="${state.theme}">
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
            <button class="mobile-theme-toggle mobile-logout-button" type="button" data-action="logout" aria-label="Sair do app">
              <span>Sair</span>
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

  if (state.tab === 'history') {
    return renderHistoryTab();
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
  const products = getShowcaseProducts();
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
        <h2>Lancar na vitrine</h2>
        <form class="mobile-showcase-form" data-mobile-showcase-form>
          <label>
            Produto
            <select class="field" name="productId" required>
              <option value="">Selecione</option>
              ${products.map((product) => `
                <option value="${product.id}">${product.name}</option>
              `).join('')}
            </select>
          </label>
          <label>
            Quantidade
            <input class="field" name="quantity" type="number" min="1" step="1" placeholder="0" required>
          </label>
          <button class="button" type="submit">Lancar</button>
        </form>
      </section>
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
  const categories = getCategoryRanking();
  const salesSeries = getSalesSeries();
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
        ${renderTextRow('Total vendido', formatCurrency(crm.salesTotal))}
        ${renderTextRow('Entradas / saidas', `${formatCurrency(crm.entriesTotal)} / ${formatCurrency(crm.outputsTotal)}`)}
      </section>
      <section class="mobile-list-panel">
        <h2>Formas de pagamento</h2>
        ${renderMiniBars([
          { label: 'Dinheiro', value: crm.paymentTotals.dinheiro },
          { label: 'Pix', value: crm.paymentTotals.pix },
          { label: 'Debito', value: crm.paymentTotals.debito },
          { label: 'Credito', value: crm.paymentTotals.credito }
        ], true)}
      </section>
      <section class="mobile-list-panel">
        <h2>Produtos mais vendidos</h2>
        ${renderMiniBars(ranking.byRevenue.slice(0, 5).map((item) => ({
          label: item.name,
          value: item.revenue,
          detail: `${item.quantity} un.`
        })), true)}
      </section>
      <section class="mobile-list-panel">
        <h2>Categorias</h2>
        ${renderMiniBars(categories.slice(0, 5).map((item) => ({
          label: item.name,
          value: item.revenue,
          detail: `${item.quantity} un.`
        })), true)}
      </section>
      <section class="mobile-list-panel">
        <h2>Movimento por dia</h2>
        ${renderMiniBars(salesSeries.slice(-7).map((item) => ({
          label: formatShortDate(item.label),
          value: item.sales + item.entries - item.outputs,
          detail: formatCurrency(item.sales)
        })), true)}
      </section>
    </div>
  `;
}

function renderHistoryTab() {
  const transactions = getTransactions()
    .slice()
    .sort((a, b) => new Date(getTransactionDate(b)) - new Date(getTransactionDate(a)))
    .slice(0, 80);

  return `
    <div class="mobile-content">
      <section class="mobile-list-panel">
        <h2>Historico de transacoes</h2>
        ${transactions.map(renderHistoryRow).join('') || '<p class="mobile-empty">Nenhuma transacao registrada.</p>'}
      </section>
    </div>
  `;
}

function renderHistoryRow(transaction) {
  const isOutput = transaction.type === 'saida';
  const isCanceled = transaction.status === 'cancelada';
  const amount = Number(transaction.total || transaction.amount || 0);
  const title = getTransactionTitle(transaction);
  const detail = getTransactionDetail(transaction);
  const valueClass = isCanceled || isOutput ? 'money-negative' : 'money-positive';

  return `
    <div class="mobile-row mobile-history-row ${isCanceled ? 'is-canceled' : ''}">
      <div>
        <span>${title}${isCanceled ? ' - cancelada' : ''}</span>
        <small>${detail}</small>
      </div>
      <strong class="${valueClass}">${isOutput ? '-' : '+'} ${formatCurrency(amount)}</strong>
      <time>${formatDateTime(getTransactionDate(transaction))}</time>
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

function renderMiniBars(items, isCurrency = false) {
  if (!items.length) {
    return '<p class="mobile-empty">Sem dados ainda.</p>';
  }

  const maxValue = Math.max(...items.map((item) => Math.abs(Number(item.value || 0))), 1);

  return `
    <div class="mobile-chart-list">
      ${items.map((item) => {
        const value = Number(item.value || 0);
        const percent = Math.max((Math.abs(value) / maxValue) * 100, value ? 8 : 0);
        return `
          <div class="mobile-chart-row">
            <div class="mobile-chart-row__top">
              <span>${item.label}</span>
              <strong>${isCurrency ? formatCurrency(value) : value}</strong>
            </div>
            <div class="mobile-chart-bar">
              <span style="width: ${percent}%"></span>
            </div>
            ${item.detail ? `<small>${item.detail}</small>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function getTransactionTitle(transaction) {
  const labels = {
    venda: `Venda ${transaction.comandaNumber ? `#${String(transaction.comandaNumber).padStart(4, '0')}` : ''}`,
    entrada: 'Entrada de caixa',
    saida: 'Saida de caixa'
  };

  return labels[transaction.type] || 'Movimento';
}

function getTransactionDetail(transaction) {
  if (transaction.type === 'venda') {
    const quantity = (transaction.items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0);
    const firstItem = transaction.items?.[0]?.name || 'Venda registrada';
    return quantity ? `${quantity} item(ns) - ${firstItem}` : firstItem;
  }

  return transaction.description || transaction.category || 'Sem descricao';
}

function getTransactionDate(transaction) {
  return transaction.createdAt || transaction.closedAt || transaction.updatedAt || 0;
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
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  }).format(new Date(value));
}
