import './config/runtime-config.js';
import { renderSidebar } from './components/sidebar.component.js?v=20260526-03';
import { ensureSeedData } from './services/storage.service.js';
import { initSyncService } from './services/sync.service.js';
import { getCaixaSummary } from './services/caixa.service.js';
import { initVendasModule } from './modules/vendas/vendas.module.js';
import { initProdutosModule } from './modules/produtos/produtos.module.js';
import { initDashboardModule } from './modules/dashboard/dashboard.module.js';
import { initEstoqueModule } from './modules/estoque/estoque.module.js';
import { initCaixaModule } from './modules/caixa/caixa.module.js';
import { initPessoasModule } from './modules/pessoas/pessoas.module.js';
import { initMobileDashboardModule } from './modules/mobile/mobile-dashboard.module.js';
import { formatCurrency } from './utils/currency.js';
import { initNotificationService } from './services/notification.service.js';
import { initRealtimeService } from './services/realtime.service.js';
import { getThemeLabel, initTheme, toggleTheme } from './services/theme.service.js';
import { getDailyMoneySummary } from './services/transaction.service.js';
import { getDataProviderMode } from './services/app-config.service.js';
import { getCurrentUser, logout } from './services/auth.service.js';
import { syncProductsFromOnlineDatabase } from './services/product.service.js';
import { renderLoginModule } from './modules/auth/login.module.js';
import { on } from './services/event-bus.service.js';
import { UI_EVENTS } from './database/schema.js';

const routes = {
  'frente-caixa': initVendasModule,
  dashboard: initDashboardModule,
  produtos: initProdutosModule,
  pessoas: initPessoasModule,
  estoque: initEstoqueModule,
  'fechar-caixa': initCaixaModule,
  relatorios: renderRelatoriosModule,
  mobile: initMobileDashboardModule
};

async function bootstrap() {
  ensureSeedData();
  initSyncService();
  initRealtimeService();
  initTheme();

  const app = document.getElementById('app');

  if (getDataProviderMode() === 'supabase') {
    const user = await getCurrentUser();

    if (!user) {
      renderLoginModule(app, () => bootstrap());
      return;
    }

    await syncProductsFromOnlineDatabase();
  }

  renderAppShell(app);
}

function renderAppShell(app) {
  initNotificationService(document.querySelector('.toast-root'));

  app.innerHTML = `
    <div class="pdv-layout">
      ${renderSidebar()}
      <section class="workspace">
        <header class="topbar">
          <div class="cash-strip" aria-label="Resumo do caixa" data-cash-strip></div>
          <div class="header-actions">
            <button class="button" type="button" data-action="open-mobile">App do Dono</button>
            <button class="button button--ghost" type="button" data-action="toggle-theme">${getThemeLabel()}</button>
            <button class="button button--ghost" type="button" data-action="refresh">Atualizar</button>
          </div>
        </header>
        <div class="workspace-body" data-workspace-body></div>
      </section>
    </div>
  `;

  const workspace = app.querySelector('[data-workspace-body]');
  const initialView = getInitialView();

  renderCashStrip(app);

  if (routes[initialView]) {
    routes[initialView](workspace);
    setActiveMenu(app, initialView);
  } else {
    initVendasModule(workspace);
  }

  bindNavigation(app, workspace);
  bindCashUpdates(app);
}

function getInitialView() {
  const requestedView = new URLSearchParams(window.location.search).get('view');

  if (requestedView) {
    return requestedView;
  }

  return window.matchMedia('(max-width: 760px)').matches ? 'mobile' : '';
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

    const logoutButton = event.target.closest('[data-action="logout"]');

    if (logoutButton) {
      handleLogout(app);
      return;
    }

    if (event.target.closest('[data-action="open-mobile"]')) {
      setActiveMenu(app, 'mobile');
      initMobileDashboardModule(workspace);
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

async function handleLogout(app) {
  try {
    await logout();
  } finally {
    bootstrap();
  }
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

function renderRelatoriosModule(workspace) {
  workspace.innerHTML = `
    <section class="module-screen">
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Relatorios</h1>
          <p class="module-subtitle">Acompanhe a operacao e abra o painel mobile do dono.</p>
        </div>
      </header>
      <div class="report-actions">
        <button class="report-action-card" type="button" data-menu-id="mobile">
          <span class="report-action-card__icon">AD</span>
          <span>
            <strong>App do Dono</strong>
            <small>Dashboard mobile com vendas, caixa, vitrine, CRM e feed ao vivo.</small>
          </span>
        </button>
      </div>
    </section>
  `;
}
