import { hasPermission } from '../services/permission.service.js?v=20260804-06';
import { icon } from './icons.js?v=20260807-06';

const menuItems = [
  { id: 'frente-caixa', label: 'Vender', icon: 'sell', permission: 'sales.access' },
  { id: 'estoque', label: 'Vitrine', icon: 'store', permission: 'showcase.access' },
  { id: 'dashboard', label: 'Histórico', icon: 'hist', permission: 'reports.view' },
  { id: 'produtos', label: 'Produtos', icon: 'box', permission: 'products.manage' },
  { id: 'pessoas', label: 'Pessoas', icon: 'people', permission: ['users.manage', 'users.edit', 'users.delete', 'permissions.manage', 'audit.view'] },
  { id: 'fechar-caixa', label: 'Caixa', icon: 'cash', permission: 'cash.close' },
  { id: 'despesas', label: 'Financeiro', icon: 'wallet', permission: 'financial.expense.access' },
  { id: 'relatorios', label: 'Relatórios', icon: 'chart', permission: 'reports.view' },
  { id: 'mobile', label: 'App do dono', icon: 'phone', permission: 'owner_app.view' },
  { id: 'empresa-config', label: 'Empresa', icon: 'gear', permission: 'company_settings.manage' }
];

const supportItem = { id: 'suporte', label: 'Suporte', icon: 'help' };

export function renderSidebar(currentUser, companySettings = {}) {
  const systemName = String(companySettings.nomeSistema || 'Zelo PDV');
  const companyName = String(companySettings.nomeFantasia || 'Lanchonete');
  const brand = renderBrand(companySettings.logoUrl, systemName);

  const items = menuItems
    .filter((item) => hasAnyPermission(currentUser, item.permission))
    .map((item) => renderNavItem(item))
    .join('');

  return `
    <nav class="rail" aria-label="Menu principal ${escapeHtml(companyName)}">
      <div class="rail__brand" title="${escapeHtml(systemName)}">${brand}</div>
      ${items}
      ${renderNavItem(supportItem, 'rail__nav--footer')}
    </nav>
  `;
}

function renderNavItem(item, extraClass = '') {
  return `
    <button class="rail__nav${extraClass ? ` ${extraClass}` : ''}" type="button" data-menu-id="${item.id}">
      ${icon(item.icon)}
      <span class="nav__label">${item.label}</span>
    </button>
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

function renderBrand(logoUrl, systemName) {
  if (!isAllowedLogoUrl(logoUrl)) {
    const initial = Array.from(systemName.trim())[0]?.toLocaleUpperCase('pt-BR') || 'P';
    return `<span class="rail__badge">${escapeHtml(initial)}</span>`;
  }

  return `<img class="rail__logo" src="${escapeHtml(logoUrl.trim())}" alt="">`;
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
