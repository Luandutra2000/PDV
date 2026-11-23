import { can } from '../services/permission.service.js';

const menuGroups = [
  {
    title: 'Vendas',
    items: [
      { id: 'frente-caixa', label: 'Frente de Caixa', icon: 'FC', active: true, permission: 'cashier.access' },
      { id: 'estoque', label: 'Vitrine', icon: 'VT', permission: 'stock.view' },
      { id: 'dashboard', label: 'Historico de Transacoes', icon: 'HT', permission: 'dashboard.view' }
    ]
  },
  {
    title: 'Gestao',
    items: [
      { id: 'produtos', label: 'Produtos', icon: 'PR', permission: 'products.manage' },
      { id: 'pessoas', label: 'Pessoas', icon: 'PS', permission: 'users.manage' }
    ]
  },
  {
    title: 'Financeiro',
    items: [
      { id: 'fechar-caixa', label: 'Fechar Caixa / CRM', icon: 'CX', permission: 'cash.close' },
      { id: 'fichario-fiado', label: 'Fichario / Fiado', icon: 'FI', permission: 'dashboard.view' },
      { id: 'despesas', label: 'Despesas', icon: 'DE', permission: 'dashboard.view' }
    ]
  },
  {
    title: 'Outros',
    items: [
      { id: 'relatorios', label: 'Relatorios', icon: 'RE', permission: 'dashboard.view' }
    ]
  },
  {
    title: 'Ajuda',
    items: [
      { id: 'suporte', label: 'Suporte', icon: '?' }
    ]
  }
];

export function canAccessMenu(menuId) {
  const item = menuGroups.flatMap((group) => group.items).find((menuItem) => menuItem.id === menuId);
  return Boolean(item) && (!item.permission || can(item.permission));
}

export function renderSidebar() {
  const groups = menuGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccessMenu(item.id)) }))
    .filter((group) => group.items.length)
    .map((group) => `
    <section class="sidebar__section">
      <div class="sidebar__title">${group.title}</div>
      ${group.items.map((item) => `
        <button class="sidebar__item ${item.active ? 'is-active' : ''}" type="button" data-menu-id="${item.id}">
          <span class="sidebar__icon" aria-hidden="true">${item.icon}</span>
          <span class="sidebar__label">${item.label}</span>
        </button>
      `).join('')}
    </section>
  `).join('');

  return `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <span>Zelo</span>
        <span class="sidebar__badge">PDV</span>
      </div>
      <div class="sidebar__content">${groups}</div>
      <footer class="sidebar__footer">
        <div class="sidebar__store">Lanchonete</div>
        <button class="sidebar__exit" type="button" data-action="logout">Sair</button>
      </footer>
    </aside>
  `;
}
