import { hasPermission } from '../services/permission.service.js?v=20260804-03';

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
      { id: 'pessoas', label: 'Pessoas', icon: 'PS', permission: ['users.manage', 'users.edit', 'users.delete', 'permissions.manage', 'audit.view'] }
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
      { id: 'mobile', label: 'App do Dono', icon: 'AD', permission: 'owner_app.view' },
      { id: 'empresa-config', label: 'Design de Layout', icon: 'CE', permission: 'company_settings.manage' }
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
  const systemName = escapeHtml(companySettings.nomeSistema || 'Zelo PDV');
  const companyName = escapeHtml(companySettings.nomeFantasia || 'Lanchonete');
  const logo = renderLogo(companySettings.logoUrl);

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

function renderLogo(logoUrl) {
  if (!isAllowedLogoUrl(logoUrl)) {
    return '<span class="sidebar__badge">PDV</span>';
  }

  return `<img class="sidebar__logo" src="${escapeHtml(logoUrl.trim())}" alt="">`;
}

function isAllowedLogoUrl(logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') {
    return false;
  }

  const value = logoUrl.trim();
  const allowedDataImagePattern = /^data:image\/(?:png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/i;

  if (allowedDataImagePattern.test(value)) {
    return true;
  }

  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}
