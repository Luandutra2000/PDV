import './config/runtime-config.js?v=20260804-05';
import { renderSidebar } from './components/sidebar.component.js?v=20260804-05';
import { ensureSeedData } from './services/storage.service.js?v=20260804-05';
import { hydrateDataProvider } from './services/data-provider.service.js?v=20260804-05';
import { loadCategories, loadProducts, startCatalogRealtime, syncCatalogNow } from './services/product.service.js?v=20260804-05';
import { hydrateFinancialData, startFinancialRealtime } from './services/financial-sync.service.js?v=20260804-05';
import { isSupabaseEnabled } from './services/app-config.service.js?v=20260804-05';
import { hydrateOnlineOperationalData } from './services/online-data.service.js?v=20260804-05';
import { getDashboardResumo } from './services/dashboard-resumo.service.js?v=20260804-05';
import { initSyncService } from './services/sync.service.js?v=20260804-05';
import { initVendasModule } from './modules/vendas/vendas.module.js?v=20260804-05';
import { initProdutosModule } from './modules/produtos/produtos.module.js?v=20260804-05';
import { initDashboardModule } from './modules/dashboard/dashboard.module.js?v=20260804-05';
import { initEstoqueModule } from './modules/estoque/estoque.module.js?v=20260804-05';
import { initCaixaModule } from './modules/caixa/caixa.module.js?v=20260804-05';
import { initMobileDashboardModule } from './modules/mobile/mobile-dashboard.module.js?v=20260804-05';
import { initPessoasModule } from './modules/pessoas/pessoas.module.js?v=20260804-05';
import { initDespesasModule } from './modules/despesas/despesas.module.js?v=20260804-05';
import { initEmpresaConfigModule } from './modules/empresa-config/empresa-config.module.js?v=20260804-05';
import { initRelatoriosModule } from './modules/relatorios/relatorios.module.js?v=20260804-05';
import { formatCurrency } from './utils/currency.js?v=20260804-05';
import { initNotificationService } from './services/notification.service.js?v=20260804-05';
import { initRealtimeService } from './services/realtime.service.js?v=20260804-05';
import { getThemeLabel, initTheme, toggleTheme } from './services/theme.service.js?v=20260804-05';
import { getDailyMoneySummary } from './services/transaction.service.js?v=20260804-05';
import { getCurrentUser, login, logout, restoreSupabaseSession } from './services/auth.service.js?v=20260804-05';
import { hasPermission } from './services/permission.service.js?v=20260804-05';
import { applyCompanyIdentity, loadCompanySettings, loadCompanySettingsLocal } from './services/empresa-config.service.js?v=20260804-05';
import { renderLoginModule } from './modules/auth/login.module.js?v=20260804-05';
import { on } from './services/event-bus.service.js?v=20260804-05';
import { UI_EVENTS } from './database/schema.js?v=20260804-05';
import { escapeHtml } from './utils/dom.js?v=20260804-05';

const routes = {
  'frente-caixa': initVendasModule,
  dashboard: initDashboardModule,
  produtos: initProdutosModule,
  estoque: initEstoqueModule,
  'fechar-caixa': initCaixaModule,
  relatorios: initRelatoriosModule,
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
let sessionRestorePromise = null;

async function bootstrap({ skipFreshLoginCheck = false } = {}) {
  ensureSeedData();
  initTheme();
  if (!skipFreshLoginCheck) {
    ensureFreshLoginAfterAuthUpdate();
  }

  const app = document.getElementById('app');

  const legacyLoginError = removeLegacyCredentialsFromUrl();
  const currentUser = getCurrentUser();

  if (!currentUser) {
    renderLoginModule(
      app,
      () => bootstrap({ skipFreshLoginCheck: true }),
      legacyLoginError ? { message: legacyLoginError } : {}
    );
    restoreSessionInBackground(app);
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
            <span class="current-user">${escapeHtml(currentUser.name)}</span>
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

function restoreSessionInBackground(app) {
  if (!isSupabaseEnabled() || sessionRestorePromise) {
    return sessionRestorePromise;
  }

  sessionRestorePromise = restoreSupabaseSession()
    .then((restoredUser) => {
      if (restoredUser && document.getElementById('app') === app) {
        return bootstrap({ skipFreshLoginCheck: true });
      }
      return null;
    })
    .catch((error) => {
      console.warn('Nao foi possivel restaurar a sessao autenticada.', error);
      return null;
    })
    .finally(() => {
      sessionRestorePromise = null;
    });

  return sessionRestorePromise;
}

function removeLegacyCredentialsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const hasLegacyCredentials = params.has('username') || params.has('password');

  if (!hasLegacyCredentials) {
    return '';
  }

  params.delete('username');
  params.delete('password');
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  return 'Por seguranca, informe suas credenciais na tela de login.';
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
