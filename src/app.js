import { renderSidebar } from './components/sidebar.component.js';
import { ensureSeedData } from './services/storage.service.js';
import { initSyncService } from './services/sync.service.js';
import { getCaixaSummary } from './services/caixa.service.js';
import { initVendasModule } from './modules/vendas/vendas.module.js';
import { initProdutosModule } from './modules/produtos/produtos.module.js';
import { initDashboardModule } from './modules/dashboard/dashboard.module.js';
import { initEstoqueModule } from './modules/estoque/estoque.module.js';
import { initCaixaModule } from './modules/caixa/caixa.module.js';
import { initMobileDashboardModule } from './modules/mobile/mobile-dashboard.module.js';
import { formatCurrency } from './utils/currency.js';
import { initNotificationService } from './services/notification.service.js';
import { initRealtimeService } from './services/realtime.service.js';
import { getThemeLabel, initTheme, toggleTheme } from './services/theme.service.js';
import { getDailyMoneySummary } from './services/transaction.service.js';
import { on } from './services/event-bus.service.js';
import { UI_EVENTS } from './database/schema.js';

const routes = {
  'frente-caixa': initVendasModule,
  dashboard: initDashboardModule,
  produtos: initProdutosModule,
  estoque: initEstoqueModule,
  'fechar-caixa': initCaixaModule,
  mobile: initMobileDashboardModule
};

function bootstrap() {
  ensureSeedData();
  initSyncService();
  initRealtimeService();
  initTheme();

  const app = document.getElementById('app');
  initNotificationService(document.querySelector('.toast-root'));

  app.innerHTML = `
    <div class="pdv-layout">
      ${renderSidebar()}
      <section class="workspace">
        <header class="topbar">
          <div class="cash-strip" aria-label="Resumo do caixa" data-cash-strip></div>
          <div class="header-actions">
            <button class="button button--ghost" type="button" data-action="toggle-theme">${getThemeLabel()}</button>
            <button class="button button--ghost" type="button" data-action="refresh">Atualizar</button>
          </div>
        </header>
        <div class="workspace-body" data-workspace-body></div>
      </section>
    </div>
  `;

  const workspace = app.querySelector('[data-workspace-body]');
  const initialView = new URLSearchParams(window.location.search).get('view');
  renderCashStrip(app);
  if (initialView === 'mobile') {
    initMobileDashboardModule(workspace);
    setActiveMenu(app, 'mobile');
  } else {
    initVendasModule(workspace);
  }
  bindNavigation(app, workspace);
  bindCashUpdates(app);
}

function renderCashStrip(root = document) {
  const target = root.querySelector('[data-cash-strip]');

  if (!target) {
    return;
  }

  const caixa = getCaixaSummary();
  const moneySummary = getDailyMoneySummary();
  const estimatedCash = moneySummary.expectedCash;
  const currentCash = Number(caixa.currentAmount || 0);

  target.innerHTML = `
    ${renderCashMetric('Caixa atual', currentCash, true)}
    ${renderCashMetric('Caixa estimado', estimatedCash, false, 'money-warning')}
    ${renderCashMetric('Entradas', moneySummary.entriesTotal, false, 'money-positive')}
    ${renderCashMetric('Saidas', moneySummary.outputsTotal, false, 'money-negative')}
  `;
}

function renderCashMetric(label, value, signed = false, fixedClass = '') {
  const amount = Number(value || 0);
  const stateClass = fixedClass || (signed && amount < 0 ? 'money-negative' : 'money-positive');

  return `
    <div class="cash-pill ${stateClass}">
      <span>${label}:</span>
      <strong>${formatCurrency(amount)}</strong>
    </div>
  `;
}

function bindCashUpdates(app) {
  on(UI_EVENTS.cashSummaryChanged, () => renderCashStrip(app));
}

bootstrap();

function bindNavigation(app, workspace) {
  app.addEventListener('click', (event) => {
    const themeButton = event.target.closest('[data-action="toggle-theme"]');

    if (themeButton) {
      toggleTheme();
      themeButton.textContent = getThemeLabel();
      return;
    }

    if (event.target.closest('[data-action="refresh"]')) {
      renderCashStrip(app);
      return;
    }

    const menuButton = event.target.closest('[data-menu-id]');

    if (!menuButton) {
      return;
    }

    const route = routes[menuButton.dataset.menuId];

    setActiveMenu(app, menuButton.dataset.menuId);

    if (route) {
      route(workspace);
      return;
    }

    renderModulePlaceholder(workspace, menuButton.querySelector('.sidebar__label').textContent);
  });
}

function setActiveMenu(app, menuId) {
  app.querySelectorAll('[data-menu-id]').forEach((item) => item.classList.remove('is-active'));
  app.querySelector(`[data-menu-id="${menuId}"]`)?.classList.add('is-active');
}

function renderModulePlaceholder(workspace, label) {
  workspace.innerHTML = `
    <section class="module-screen">
      <header class="module-header">
        <h1 class="pdv-title">${label}</h1>
      </header>
      <div class="empty-products">Modulo preparado para a proxima etapa.</div>
    </section>
  `;
}
