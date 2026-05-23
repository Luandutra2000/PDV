const menuGroups = [
  {
    title: 'Vendas',
    items: [
      { id: 'frente-caixa', label: 'Frente de Caixa', icon: 'FC', active: true },
      { id: 'estoque', label: 'Vitrine', icon: 'VT' },
      { id: 'dashboard', label: 'Historico de Transacoes', icon: 'HT' }
    ]
  },
  {
    title: 'Gestao',
    items: [
      { id: 'produtos', label: 'Produtos', icon: 'PR' },
      { id: 'pessoas', label: 'Pessoas', icon: 'PS' }
    ]
  },
  {
    title: 'Financeiro',
    items: [
      { id: 'fechar-caixa', label: 'Fechar Caixa / CRM', icon: 'CX' },
      { id: 'fichario-fiado', label: 'Fichario / Fiado', icon: 'FI' },
      { id: 'despesas', label: 'Despesas', icon: 'DE' }
    ]
  },
  {
    title: 'Outros',
    items: [
      { id: 'relatorios', label: 'Relatorios', icon: 'RE' }
    ]
  },
  {
    title: 'Ajuda',
    items: [
      { id: 'suporte', label: 'Suporte', icon: '?' }
    ]
  }
];

export function renderSidebar() {
  const groups = menuGroups.map((group) => `
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
