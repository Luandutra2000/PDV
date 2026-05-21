import { renderSidebar } from './components/sidebar.component.js';
import { ensureSeedData } from './services/storage.service.js';
import { initSyncService } from './services/sync.service.js';
import { getCaixaSummary } from './services/caixa.service.js';
import { initVendasModule } from './modules/vendas/vendas.module.js';
import { initProdutosModule } from './modules/produtos/produtos.module.js';
import { initDashboardModule } from './modules/dashboard/dashboard.module.js';
import { initEstoqueModule } from './modules/estoque/estoque.module.js';
import { initCaixaModule } from './modules/caixa/caixa.module.js';
import { formatCurrency } from './utils/currency.js';
import { initNotificationService } from './services/notification.service.js';
import { getThemeLabel, initTheme, toggleTheme } from './services/theme.service.js';

const routes = {
  'frente-caixa': initVendasModule,
  dashboard: initDashboardModule,
  produtos: initProdutosModule,
  estoque: initEstoqueModule,
  'fechar-caixa': initCaixaModule
};

function bootstrap() {
  ensureSeedData();
  initSyncService();
  initTheme();

  const app = document.getElementById('app');
  initNotificationService(document.querySelector('.toast-root'));
  const caixa = getCaixaSummary();

  app.innerHTML = `
    <div class="pdv-layout">
      ${renderSidebar()}
      <section class="workspace">
        <header class="topbar">
          <div class="cash-pill">
            <span>Caixa:</span>
            <strong>${formatCurrency(caixa.currentAmount)}</strong>
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
  bindNavigation(app, workspace);
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

    const menuButton = event.target.closest('[data-menu-id]');

    if (!menuButton) {
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
