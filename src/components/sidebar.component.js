import { hasPermission } from '../services/permission.service.js';

const menuGroups = [
  {
    title: 'Vendas',
    items: [
      { id: 'frente-caixa', label: 'Frente de Caixa', icon: 'FC', permission: 'sales.access' },
      { id: 'estoque', label: 'Vitrine', icon: 'VT', permission: 'showcase.access' },
      { id: 'dashboard', label: 'Historico de Transacoes', icon: 'HT', permission: 'reports.view' }
    ]
  },
  {
    title: 'Gestao',
    items: [
      { id: 'produtos', label: 'Produtos', icon: 'PR', permission: 'products.manage' },
      { id: 'pessoas', label: 'Pessoas', icon: 'PS', permission: ['users.manage', 'users.edit', 'users.delete', 'permissions.manage', 'audit.view'] },
      { id: 'empresa-config', label: 'Configurações da Empresa', icon: 'CE', permission: 'company_settings.manage' }
    ]
  },
  {
    title: 'Financeiro',
    items: [
      { id: 'fechar-caixa', label: 'Fechar Caixa / CRM', icon: 'CX', permission: 'cash.close' },
      { id: 'despesas', label: 'Financeiro', icon: 'FI', permission: 'financial.expense.access' }
    ]
  },
  {
    title: 'Outros',
    items: [
      { id: 'relatorios', label: 'Relatorios', icon: 'RE', permission: 'reports.view' },
      { id: 'mobile', label: 'App do Dono', icon: 'AD', permission: 'owner_app.view' }
    ]
  },
  {
    title: 'Ajuda',
    items: [
      { id: 'suporte', label: 'Suporte', icon: '?' }
    ]
  }
];

export function renderSidebar(currentUser, companySettings = {}) {
  const systemName = companySettings.nomeSistema || 'Zelo PDV';
  const companyName = companySettings.nomeFantasia || 'Lanchonete';
  const logo = companySettings.logoUrl
    ? `<img class="sidebar__logo" src="${companySettings.logoUrl}" alt="">`
    : '<span class="sidebar__badge">PDV</span>';

  const visibleGroups = menuGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasAnyPermission(currentUser, item.permission))
  })).filter((group) => group.items.length);

  const groups = visibleGroups.map((group) => `
    <section class="sidebar__section">
      <div class="sidebar__title">${group.title}</div>
      ${group.items.map((item) => `
        <button class="sidebar__item" type="button" data-menu-id="${item.id}">
          <span class="sidebar__icon" aria-hidden="true">${item.icon}</span>
          <span class="sidebar__label">${item.label}</span>
        </button>
      `).join('')}
    </section>
  `).join('');

  return `
    <aside class="sidebar">
      <div class="sidebar__brand">
        ${logo}
        <span class="sidebar__brand-name">${systemName}</span>
      </div>
      <div class="sidebar__content">${groups}</div>
      <footer class="sidebar__footer">
        <div class="sidebar__store">${companyName}</div>
        <button class="sidebar__exit" type="button" data-action="logout">Sair</button>
      </footer>
    </aside>
  `;
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
