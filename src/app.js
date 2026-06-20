import './config/runtime-config.js';
import { renderSidebar } from './components/sidebar.component.js?v=20260526-03';
import { ensureSeedData } from './services/storage.service.js';
import { hydrateDataProvider } from './services/data-provider.service.js';
import { loadCategories, loadProducts, startCatalogRealtime, syncCatalogNow } from './services/product.service.js';
import { hydrateFinancialData, startFinancialRealtime } from './services/financial-sync.service.js';
import { isSupabaseEnabled } from './services/app-config.service.js';
import { hydrateOnlineOperationalData } from './services/online-data.service.js';
import { getDashboardResumo } from './services/dashboard-resumo.service.js';
import { initSyncService } from './services/sync.service.js';
import { initVendasModule } from './modules/vendas/vendas.module.js';
import { initProdutosModule } from './modules/produtos/produtos.module.js';
import { initDashboardModule } from './modules/dashboard/dashboard.module.js';
import { initEstoqueModule } from './modules/estoque/estoque.module.js';
import { initCaixaModule } from './modules/caixa/caixa.module.js';
import { initMobileDashboardModule } from './modules/mobile/mobile-dashboard.module.js?v=20260608-15';
import { initPessoasModule } from './modules/pessoas/pessoas.module.js';
import { initDespesasModule } from './modules/despesas/despesas.module.js';
import { initEmpresaConfigModule } from './modules/empresa-config/empresa-config.module.js';
import { formatCurrency } from './utils/currency.js';
import { initNotificationService } from './services/notification.service.js';
import { initRealtimeService } from './services/realtime.service.js';
import { getThemeLabel, initTheme, toggleTheme } from './services/theme.service.js';
import { getDailyMoneySummary } from './services/transaction.service.js';
import { getCurrentUser, login, logout } from './services/auth.service.js';
import { hasPermission } from './services/permission.service.js';
import { applyCompanyIdentity, loadCompanySettings, loadCompanySettingsLocal } from './services/empresa-config.service.js';
import { renderLoginModule } from './modules/auth/login.module.js';
import { on } from './services/event-bus.service.js';
import { UI_EVENTS } from './database/schema.js';

const routes = {
  'frente-caixa': initVendasModule,
  dashboard: initDashboardModule,
  produtos: initProdutosModule,
  estoque: initEstoqueModule,
  'fechar-caixa': initCaixaModule,
  relatorios: renderRelatoriosModule,
  mobile: initMobileDashboardModule,
  pessoas: initPessoasModule,
  despesas: initDespesasModule,
  'empresa-config': initEmpresaConfigModule
};

const routePermissions = {
  'frente-caixa': 'sales.access',
  dashboard: 'reports.view',
  produtos: 'products.manage',
  estoque: 'showcase.access',
  'fechar-caixa': 'cash.close',
  relatorios: 'reports.view',
  mobile: 'owner_app.view',
  pessoas: ['users.manage', 'users.edit', 'users.delete', 'permissions.manage', 'audit.view'],
  despesas: 'financial.expense.access',
  'empresa-config': 'company_settings.manage'
};

const AUTH_SESSION_VERSION = '20260620-02-company-profile';

async function bootstrap({ skipFreshLoginCheck = false } = {}) {
  ensureSeedData();
  initTheme();
  if (!skipFreshLoginCheck) {
    ensureFreshLoginAfterAuthUpdate();
  }

  const app = document.getElementById('app');

  const queryLoginResult = await loginFromQueryString(app);
  const currentUser = queryLoginResult?.user || getCurrentUser();

  if (!currentUser) {
    renderLoginModule(app, () => bootstrap({ skipFreshLoginCheck: true }), queryLoginResult?.error ? { message: queryLoginResult.error } : {});
    return;
  }

  try {
    await Promise.all([loadCategories(), loadProducts()]);
    await startCatalogRealtime();
    if (isSupabaseEnabled()) {
      await syncCatalogNow();
      await hydrateOnlineOperationalData({ catalog: false, financial: true, showcase: true });
      await startFinancialRealtime();
    }
    await hydrateDataProvider();
  } catch (error) {
    renderLoginModule(app, () => bootstrap({ skipFreshLoginCheck: true }), {
      message: error.message || 'Nao foi possivel carregar os dados online.'
    });
    return;
  }

  initSyncService();
  initRealtimeService();
  initNotificationService(document.querySelector('.toast-root'));
  const companySettings = loadCompanySettingsLocal();
  applyCompanyIdentity(companySettings);

  app.innerHTML = `
    <div class="pdv-layout">
      ${renderSidebar(currentUser, companySettings)}
      <section class="workspace">
        <header class="topbar">
          <div class="cash-strip" aria-label="Resumo do caixa" data-cash-strip></div>
          <div class="header-actions">
            <span class="current-user">${currentUser.name}</span>
            ${hasPermission(currentUser, 'owner_app.view') ? '<button class="button" type="button" data-action="open-mobile">App do Dono</button>' : ''}
            <button class="button button--ghost" type="button" data-action="toggle-theme">${getThemeLabel()}</button>
            <button class="button button--ghost" type="button" data-action="refresh">Atualizar</button>
          </div>
        </header>
        <div class="workspace-body" data-workspace-body></div>
      </section>
    </div>
  `;

  const workspace = app.querySelector('[data-workspace-body]');
  const initialView = getAuthorizedInitialView(currentUser);
  renderCashStrip(app);
  workspace.dataset.activeRoute = initialView;
  setRouteShellMode(app, initialView);
  routes[initialView](workspace);
  setActiveMenu(app, initialView);
  bindNavigation(app, workspace);
  bindCashUpdates(app);
  bindCompanySettingsUpdates(app, workspace);
  refreshCompanySettingsAsync(app, workspace);
}

function getInitialView() {
  const requestedView = new URLSearchParams(window.location.search).get('view');

  if (requestedView) {
    return requestedView;
  }

  return window.matchMedia('(max-width: 760px)').matches ? 'mobile' : '';
}

function getAuthorizedInitialView(currentUser) {
  const requestedView = getInitialView();

  if (routes[requestedView] && canAccessRoute(currentUser, requestedView)) {
    return requestedView;
  }

  return Object.keys(routes).find((routeId) => canAccessRoute(currentUser, routeId)) || 'frente-caixa';
}

function canAccessRoute(currentUser, routeId) {
  const permission = routePermissions[routeId];
  return hasAnyPermission(currentUser, permission);
}

function hasAnyPermission(currentUser, permission) {
  if (!permission) {
    return true;
  }

  if (Array.isArray(permission)) {
    return permission.some((permissionId) => hasPermission(currentUser, permissionId));
  }

  return hasPermission(currentUser, permission);
}

function renderCashStrip(root = document) {
  const target = root.querySelector('[data-cash-strip]');

  if (!target) {
    return;
  }

  const resumo = getDashboardResumo({ period: 'today' });

  target.innerHTML = `
    ${renderCashMetric('Caixa atual', resumo.caixaAtual, false, 'money-info')}
    ${renderCashMetric('Vitrine estimada', resumo.vitrineEstimada, false, 'money-warning')}
    ${renderCashMetric('Total vendido', resumo.totalVendido, false, 'money-primary')}
    ${renderCashMetric('Entradas', resumo.entradas, false, 'money-positive')}
    ${renderCashMetric('Saídas', resumo.saidas, false, 'money-negative')}
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

function bindCompanySettingsUpdates(app, workspace) {
  on(UI_EVENTS.companySettingsChanged, (settings) => {
    applyCompanyIdentity(settings);
    refreshSidebar(app, workspace, settings);
  });
}

function refreshCompanySettingsAsync(app, workspace) {
  loadCompanySettings()
    .then((settings) => {
      applyCompanyIdentity(settings);
      refreshSidebar(app, workspace, settings);
    })
    .catch((error) => {
      console.warn('Nao foi possivel atualizar a identidade da empresa.', error);
    });
}

function refreshSidebar(app, workspace, settings) {
  const currentSidebar = app.querySelector('.sidebar');

  if (!currentSidebar) {
    return;
  }

  const activeRoute = workspace?.dataset.activeRoute || '';
  currentSidebar.outerHTML = renderSidebar(getCurrentUser(), settings);

  if (activeRoute) {
    setActiveMenu(app, activeRoute);
  }
}

bootstrap();

async function loginFromQueryString(app) {
  const params = new URLSearchParams(window.location.search);
  const username = params.get('username');
  const password = params.get('password');

  if (!username && !password) {
    return null;
  }

  window.history.replaceState(null, '', window.location.pathname);

  if (!username || !password) {
    return { error: 'Informe usuario e senha.' };
  }

  try {
    return await login({ username, password });
  } catch (error) {
    return { error: error.message || 'Usuario ou senha invalidos.' };
  }
}

function ensureFreshLoginAfterAuthUpdate() {
  try {
    if (window.localStorage.getItem('pdv.authSessionVersion') === AUTH_SESSION_VERSION) {
      return;
    }

    logout();
    window.localStorage.setItem('pdv.authSessionVersion', AUTH_SESSION_VERSION);
  } catch (error) {
    console.warn('Nao foi possivel renovar a sessao local.', error);
  }
}

function bindNavigation(app, workspace) {
  app.addEventListener('click', (event) => {
    const themeButton = event.target.closest('[data-action="toggle-theme"]');

    if (themeButton) {
      toggleTheme();
      themeButton.textContent = getThemeLabel();
      return;
    }

    if (event.target.closest('[data-action="logout"]')) {
      logout();
      bootstrap();
      return;
    }

    if (event.target.closest('[data-action="open-mobile"]')) {
      if (!canAccessRoute(getCurrentUser(), 'mobile')) {
        renderPermissionDenied(workspace);
        return;
      }

      setActiveMenu(app, 'mobile');
      workspace.dataset.activeRoute = 'mobile';
      setRouteShellMode(app, 'mobile');
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

    if (!canAccessRoute(getCurrentUser(), menuButton.dataset.menuId)) {
      renderPermissionDenied(workspace);
      return;
    }

    setActiveMenu(app, menuButton.dataset.menuId);
    workspace.dataset.activeRoute = menuButton.dataset.menuId;
    setRouteShellMode(app, menuButton.dataset.menuId);

    if (route) {
      route(workspace);
      return;
    }

    renderModulePlaceholder(workspace, menuButton.querySelector('.sidebar__label').textContent);
  });
}

function setRouteShellMode(app, routeId) {
  app.classList.toggle('is-mobile-owner', routeId === 'mobile');
}

function renderPermissionDenied(workspace) {
  workspace.innerHTML = `
    <section class="module-screen">
      <header class="module-header">
        <h1 class="pdv-title">Acesso bloqueado</h1>
      </header>
      <div class="empty-products">Usuario sem permissao para acessar esta area.</div>
    </section>
  `;
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
