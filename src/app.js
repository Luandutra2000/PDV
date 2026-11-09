import './config/runtime-config.js?v=20260807-02';
import { renderSidebar } from './components/sidebar.component.js?v=20261109-01';
import { renderCashKpis, renderCashSessionStatus, renderUserMenu } from './components/topbar.component.js?v=20261109-01';
import { ensureSeedData } from './services/storage.service.js?v=20261109-01';
import { hydrateDataProvider } from './services/data-provider.service.js?v=20261109-01';
import { flushDataProvider } from './services/data-provider.service.js?v=20261109-01';
import { loadCategories, loadProducts, startCatalogRealtime, syncCatalogNow } from './services/product.service.js?v=20261109-01';
import { flushFinancialQueue, getFinancialSyncStatus, hydrateFinancialData, startFinancialRealtime } from './services/financial-sync.service.js?v=20261109-01';
import { isSupabaseEnabled } from './services/app-config.service.js?v=20260804-06';
import { hydrateOnlineOperationalData } from './services/online-data.service.js?v=20261109-01';
import { flushShowcaseQueue, getShowcaseSyncStatus } from './services/showcase-sync.service.js?v=20261109-01';
import { getDashboardResumo } from './services/dashboard-resumo.service.js?v=20261109-01';
import { initVendasModule } from './modules/vendas/vendas.module.js?v=20261109-01';
import { initProdutosModule } from './modules/produtos/produtos.module.js?v=20261109-01';
import { initDashboardModule } from './modules/dashboard/dashboard.module.js?v=20261109-01';
import { initEstoqueModule } from './modules/estoque/estoque.module.js?v=20261109-01';
import { initCaixaModule } from './modules/caixa/caixa.module.js?v=20261109-01';
import { initMobileDashboardModule } from './modules/mobile/mobile-dashboard.module.js?v=20261109-01';
import { initPessoasModule } from './modules/pessoas/pessoas.module.js?v=20261109-01';
import { initDespesasModule } from './modules/despesas/despesas.module.js?v=20261109-01';
import { initEmpresaConfigModule } from './modules/empresa-config/empresa-config.module.js?v=20261109-01';
import { initRelatoriosModule } from './modules/relatorios/relatorios.module.js?v=20261109-01';
import { initSyncAppModule } from './modules/sync-app/sync-app.module.js?v=20261109-01';
import { initNotificationService } from './services/notification.service.js?v=20260804-06';
import { initRealtimeService } from './services/realtime.service.js?v=20261109-01';
import { getThemeLabel, initTheme, toggleTheme } from './services/theme.service.js?v=20260807-05';
import { getDailyMoneySummary } from './services/transaction.service.js?v=20261109-01';
import { getCurrentUser, login, logout, restoreSupabaseSession } from './services/auth.service.js?v=20261109-01';
import { hasPermission } from './services/permission.service.js?v=20261109-01';
import { applyCompanyIdentity, loadCompanySettings, loadCompanySettingsLocal } from './services/empresa-config.service.js?v=20261109-01';
import { renderLoginModule } from './modules/auth/login.module.js?v=20261109-01';
import { on } from './services/event-bus.service.js?v=20260804-06';
import { UI_EVENTS } from './database/schema.js?v=20260804-06';
import { getCashSessionStatus, openCashSession } from './services/cash-session.service.js?v=20261109-01';

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
  'empresa-config': initEmpresaConfigModule,
  suporte: initSyncAppModule
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
let auditRetryStarted = false;

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
    await flushDataProvider();
  } catch (error) {
    renderLoginModule(app, () => bootstrap({ skipFreshLoginCheck: true }), {
      message: error.message || 'Nao foi possivel carregar os dados online.'
    });
    return;
  }

  if (!auditRetryStarted) {
    // Nova tentativa para tudo que ficou pendente (auditoria, financeiro e
    // vitrine): sem isso a vitrine so sincronizava na venda seguinte.
    const retryPendingSync = () => {
      if (!getCurrentUser()) return;
      flushDataProvider().catch((error) => console.warn('Falha ao reenviar auditoria.', error));
      if (isSupabaseEnabled()) {
        flushFinancialQueue()
          .then(() => flushShowcaseQueue())
          .catch((error) => console.warn('Falha ao reenviar pendencias.', error));
      }
    };
    window.addEventListener('online', retryPendingSync);
    window.setInterval(retryPendingSync, 30000);
    auditRetryStarted = true;
  }
  initRealtimeService();
  initNotificationService(document.querySelector('.toast-root'));
  const companySettings = loadCompanySettingsLocal();
  applyCompanyIdentity(companySettings);

  app.innerHTML = `
    <div class="pdv-layout">
      ${renderSidebar(currentUser, companySettings)}
      <section class="workspace">
        <header class="top">
          <div class="ui-kpis" aria-label="Resumo do caixa" data-cash-strip></div>
          <div class="ui-session" data-cash-session-indicator></div>
          ${renderUserMenu(currentUser, getThemeLabel())}
        </header>
        <div class="workspace-body" data-workspace-body></div>
        <div data-global-modal></div>
      </section>
    </div>
  `;

  const workspace = app.querySelector('[data-workspace-body]');
  const initialView = getAuthorizedInitialView(currentUser);
  renderCashStrip(app);
  renderCashSessionIndicator(app);
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

  target.innerHTML = renderCashKpis(resumo);
}

function bindCashUpdates(app) {
  on(UI_EVENTS.cashSummaryChanged, () => renderCashStrip(app));
  on(UI_EVENTS.financialSyncStatusChanged, () => renderCashSessionIndicator(app));
  on(UI_EVENTS.showcaseSyncStatusChanged, () => renderCashSessionIndicator(app));
  on(UI_EVENTS.cashSessionChanged, () => {
    renderCashSessionIndicator(app);
    const workspace = app.querySelector('[data-workspace-body]');
    if (workspace?.dataset.activeRoute === 'frente-caixa') routes['frente-caixa'](workspace);
  });
}

function renderCashSessionIndicator(root = document) {
  const target = root.querySelector('[data-cash-session-indicator]');
  if (!target) return;
  target.innerHTML = renderCashSessionStatus(getCashSessionStatus(), { pendingSync: getPendingSyncCount() });
}

function getPendingSyncCount() {
  if (!isSupabaseEnabled()) return 0;
  return (Number(getFinancialSyncStatus().pending) || 0) + (Number(getShowcaseSyncStatus().pending) || 0);
}

function renderOpenCashSessionModal(app) {
  const target = app.querySelector('[data-global-modal]');
  if (!target) return;
  target.innerHTML = `
    <div class="modal-backdrop is-open">
      <section class="modal modal--small" role="dialog" aria-modal="true" aria-labelledby="open-cash-title">
        <header class="modal__header"><div><h2 id="open-cash-title">Abrir caixa</h2><p>Informe o dinheiro disponível para troco no início do dia.</p></div><button class="icon-button" type="button" data-action="close-cash-session-modal" aria-label="Fechar">X</button></header>
        <form class="product-form" data-open-cash-form>
          <label class="stacked-label">Dinheiro inicial<input class="field" name="openingAmount" type="number" min="0" step="0.01" value="0" required></label>
          <p class="modal-text">Esse valor entra no dinheiro esperado do fechamento, mas não é registrado como venda. Ao reabrir no mesmo dia, informe só o troco adicional: o da abertura anterior continua contando.</p>
          <p class="form-error" data-open-cash-error role="alert" hidden></p>
          <footer class="form-actions"><button class="button button--ghost" type="button" data-action="close-cash-session-modal">Cancelar</button><button class="button button--success" type="submit">Abrir caixa</button></footer>
        </form>
      </section>
    </div>`;
  target.querySelector('[name="openingAmount"]')?.select?.();
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
  const currentSidebar = app.querySelector('.rail');

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
  app.addEventListener('click', async (event) => {
    closeUserMenuIfNeeded(app, event);

    const themeButton = event.target.closest('[data-action="toggle-theme"]');

    if (themeButton) {
      toggleTheme();
      themeButton.textContent = getThemeLabel();
      return;
    }

    if (event.target.closest('[data-action="logout"]')) {
      await logout();
      await bootstrap();
      return;
    }

    if (event.target.closest('[data-action="refresh"]')) {
      await flushDataProvider();
      await flushFinancialQueue();
      if (isSupabaseEnabled()) await flushShowcaseQueue();
      const activeRoute = workspace.dataset.activeRoute;
      const activeRouteInitializer = routes[activeRoute];

      if (activeRouteInitializer) {
        setRouteShellMode(app, activeRoute);
        activeRouteInitializer(workspace);
      } else {
        renderCashStrip(app);
      }
      return;
    }

    if (event.target.closest('[data-action="open-cash-session"]')) {
      renderOpenCashSessionModal(app);
      return;
    }

    if (event.target.closest('[data-action="close-cash-session-modal"]')) {
      app.querySelector('[data-global-modal]').innerHTML = '';
      return;
    }

    if (event.target.closest('[data-action="go-to-cash-closing"]')) {
      const workspace = app.querySelector('[data-workspace-body]');
      if (workspace) {
        setActiveMenu(app, 'fechar-caixa');
        workspace.dataset.activeRoute = 'fechar-caixa';
        setRouteShellMode(app, 'fechar-caixa');
        routes['fechar-caixa'](workspace);
      }
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

    renderModulePlaceholder(workspace, menuButton.querySelector('.nav__label').textContent);
  });

  app.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-open-cash-form]')) return;
    event.preventDefault();
    try {
      openCashSession({ openingAmount: new FormData(event.target).get('openingAmount') });
      app.querySelector('[data-global-modal]').innerHTML = '';
    } catch (error) {
      // Erro dentro do modal, no lugar do alert nativo que travava a tela.
      const message = event.target.querySelector('[data-open-cash-error]');
      if (message) {
        message.textContent = error.message || 'Não foi possível abrir o caixa.';
        message.hidden = false;
      }
    }
  });
}

function closeUserMenuIfNeeded(app, event) {
  const openMenu = app.querySelector('.ui-user[open]');

  if (!openMenu) {
    return;
  }

  const clickedInsideMenu = Boolean(event.target.closest('.ui-user'));
  const clickedAction = Boolean(event.target.closest('.ui-user [data-action]'));

  if (!clickedInsideMenu || clickedAction) {
    openMenu.open = false;
  }
}

function setRouteShellMode(app, routeId) {
  app.classList.toggle('is-mobile-owner', routeId === 'mobile');
}

function renderPermissionDenied(workspace) {
  workspace.innerHTML = `
    <section class="ui-screen app-placeholder">
      <h1 class="app-placeholder__title">Acesso bloqueado</h1>
      <div class="ui-panel app-placeholder__note">Usuário sem permissão para acessar esta área.</div>
    </section>
  `;
}

function setActiveMenu(app, menuId) {
  app.querySelectorAll('[data-menu-id]').forEach((item) => item.classList.remove('is-active'));
  app.querySelector(`[data-menu-id="${menuId}"]`)?.classList.add('is-active');
}

function renderModulePlaceholder(workspace, label) {
  workspace.innerHTML = `
    <section class="ui-screen app-placeholder">
      <h1 class="app-placeholder__title">${label}</h1>
      <div class="ui-panel app-placeholder__note">Módulo preparado para a próxima etapa.</div>
    </section>
  `;
}
