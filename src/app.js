import { canAccessMenu, renderSidebar } from './components/sidebar.component.js';
import { ensureSeedData } from './services/storage.service.js';
import { initHistoryStore } from './services/history-store.service.js';
import { initSyncService } from './services/sync.service.js';
import { getCaixaSummary } from './services/caixa.service.js';
import { initVendasModule } from './modules/vendas/vendas.module.js';
import { initProdutosModule } from './modules/produtos/produtos.module.js';
import { initDashboardModule } from './modules/dashboard/dashboard.module.js';
import { initEstoqueModule } from './modules/estoque/estoque.module.js';
import { initCaixaModule } from './modules/caixa/caixa.module.js';
import { initPessoasModule } from './modules/pessoas/pessoas.module.js';
import { formatCurrency } from './utils/currency.js';
import { initNotificationService } from './services/notification.service.js';
import { getThemeLabel, initTheme, toggleTheme } from './services/theme.service.js';
import { getDailyMoneySummary } from './services/transaction.service.js';
import { getDataProviderMode } from './services/app-config.service.js';
import { getCurrentUser, loadCurrentProfile, logout } from './services/auth.service.js';
import { LOCAL_PROFILE, setCurrentProfile } from './services/permission.service.js';
import { getRemoteOutboxStatus, onRemoteOutboxChange, startRemoteOutbox } from './services/remote-outbox.service.js';
import { syncProductsFromOnlineDatabase } from './services/product.service.js';
import { renderLoginModule } from './modules/auth/login.module.js';

const routes = {
  'frente-caixa': initVendasModule,
  dashboard: initDashboardModule,
  produtos: initProdutosModule,
  pessoas: initPessoasModule,
  estoque: initEstoqueModule,
  'fechar-caixa': initCaixaModule
};

async function bootstrap() {
  await initHistoryStore();
  ensureSeedData();
  initSyncService();
  initTheme();

  const app = document.getElementById('app');
  setCurrentProfile(null);

  if (getDataProviderMode() === 'supabase') {
    const user = await getCurrentUser();

    if (!user) {
      renderLoginModule(app, () => bootstrap());
      return;
    }

    try {
      setCurrentProfile(await loadCurrentProfile(user));
    } catch (error) {
      await logout().catch(() => {});
      renderLoginModule(app, () => bootstrap());
      showLoginError(app, error.message);
      return;
    }

    startRemoteOutbox();
    await syncProductsFromOnlineDatabase();
  } else {
    setCurrentProfile(LOCAL_PROFILE);
  }

  renderAppShell(app);
}

function showLoginError(app, message) {
  const error = app.querySelector('[data-login-error]');

  if (error) {
    error.hidden = false;
    error.textContent = message;
  }
}

function renderAppShell(app) {
  initNotificationService(document.querySelector('.toast-root'));

  app.innerHTML = `
    <div class="pdv-layout">
      ${renderSidebar()}
      <section class="workspace">
        <header class="topbar">
          <div class="cash-strip" aria-label="Resumo do caixa" data-cash-strip>
            ${renderCashStrip()}
          </div>
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
  initVendasModule(workspace);
  bindNavigation(app);
  bindRemoteSyncStatus(app);
}

function renderCashStrip() {
  const caixa = getCaixaSummary();
  const moneySummary = getDailyMoneySummary();

  return `
    ${renderCashMetric('Caixa atual', Number(caixa.currentAmount || 0), true)}
    ${renderCashMetric('Caixa estimado', moneySummary.expectedCash, false, 'money-warning')}
    ${renderCashMetric('Entradas', moneySummary.entriesTotal, false, 'money-positive')}
    ${renderCashMetric('Saidas', moneySummary.outputsTotal, false, 'money-negative')}
    <div class="cash-pill money-warning" data-remote-sync-status style="display: none"></div>
  `;
}

let unsubscribeRemoteStatus = null;

function bindRemoteSyncStatus(app) {
  unsubscribeRemoteStatus?.();
  const update = (status) => {
    const pill = app.querySelector('[data-remote-sync-status]');

    if (!pill) {
      return;
    }

    pill.style.display = !status.enabled || status.pending === 0 ? 'none' : '';
    pill.className = `cash-pill ${status.failing ? 'money-negative' : 'money-warning'}`;
    pill.title = status.lastError || '';
    pill.innerHTML = `<span>${status.failing ? 'Sem envio ao servidor' : 'Enviando'}:</span><strong>${status.pending} pendente(s)</strong>`;
  };

  unsubscribeRemoteStatus = onRemoteOutboxChange(update);
  update(getRemoteOutboxStatus());
}

function refreshCashStrip(app) {
  const strip = app.querySelector('[data-cash-strip]');

  if (strip) {
    strip.innerHTML = renderCashStrip();
    bindRemoteSyncStatus(app);
  }
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

const navigationBoundApps = new WeakSet();

function bindNavigation(app) {
  if (navigationBoundApps.has(app)) {
    return;
  }

  navigationBoundApps.add(app);
  app.addEventListener('click', (event) => {
    const workspace = app.querySelector('[data-workspace-body]');

    if (!workspace) {
      return;
    }

    const themeButton = event.target.closest('[data-action="toggle-theme"]');

    if (themeButton) {
      toggleTheme();
      themeButton.textContent = getThemeLabel();
      return;
    }

    if (event.target.closest('[data-action="refresh"]')) {
      refreshCashStrip(app);
      return;
    }

    const logoutButton = event.target.closest('[data-action="logout"]');

    if (logoutButton) {
      handleLogout(app);
      return;
    }

    const menuButton = event.target.closest('[data-menu-id]');

    if (!menuButton) {
      return;
    }

    if (!canAccessMenu(menuButton.dataset.menuId)) {
      return;
    }

    const route = routes[menuButton.dataset.menuId];

    app.querySelectorAll('[data-menu-id]').forEach((item) => item.classList.remove('is-active'));
    menuButton.classList.add('is-active');

    if (route) {
      route(workspace);
      return;
    }

    renderModulePlaceholder(workspace, menuButton.querySelector('.sidebar__label').textContent);
  });
}

async function handleLogout(app) {
  const { pending } = getRemoteOutboxStatus();

  if (pending && !globalThis.confirm(`Ainda ha ${pending} registro(s) nao enviados ao servidor. Eles ficam salvos neste aparelho e serao enviados no proximo login. Sair mesmo assim?`)) {
    return;
  }

  try {
    await logout();
  } finally {
    bootstrap();
  }
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

try {
  await bootstrap();
} catch (error) {
  console.error('Nao foi possivel iniciar o PDV.', error);
}
