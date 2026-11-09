const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

// Intl usa espaco inseparavel entre "R$" e o valor; normaliza para comparar.
const plain = (html) => html.replaceAll('\u00a0', ' ');

const storage = await import('../src/services/storage.service.js?v=20261109-01');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const { renderSidebar } = await import('../src/components/sidebar.component.js?v=20261109-01');
const { icon } = await import('../src/components/icons.js?v=20260807-06');
const { renderCashKpis, renderCashSessionStatus, renderUserMenu } = await import('../src/components/topbar.component.js?v=20261109-01');

seedTestAdmin(storage, STORAGE_KEYS);
storage.ensureSeedData();

const adminUser = { id: 'user-admin', name: 'Administrador', role: 'admin', active: true };
const operadorUser = { id: 'user-operador', name: 'Operador', role: 'operador', active: true };

// Icones
const iconNames = ['sell', 'store', 'hist', 'box', 'people', 'cash', 'wallet', 'chart', 'phone', 'gear', 'help', 'home', 'pix', 'card', 'search', 'crm', 'logout'];
iconNames.forEach((name) => {
  const svg = icon(name);
  assert(svg.startsWith('<svg') && svg.includes('aria-hidden="true"'), `icon(${name}) deve ser um svg com aria-hidden`);
  assert(svg.includes('stroke="currentColor"'), `icon(${name}) deve ser em traco`);
});
assert(icon('inexistente') === '', 'icone desconhecido deve devolver string vazia');

// Menu lateral
const adminMenu = renderSidebar(adminUser, {});
assert(adminMenu.includes('data-menu-id="fechar-caixa"'), 'admin deve ver fechar-caixa');
assert(adminMenu.includes('>Caixa<'), 'item fechar-caixa deve chamar-se Caixa');
assert(!adminMenu.includes('Fechar Caixa / CRM'), 'rotulo antigo Fechar Caixa / CRM nao deve existir');
assert(!adminMenu.includes('sidebar__title'), 'titulos de grupo saem do menu');
assert(!adminMenu.includes('data-action="logout"'), 'Sair vive so no menu do usuario');
assert(adminMenu.includes('data-menu-id="suporte"'), 'Suporte fica no rodape');
assert(adminMenu.includes('<svg'), 'itens do menu devem ter icone svg');
const order = ['frente-caixa', 'estoque', 'dashboard', 'produtos', 'pessoas', 'fechar-caixa', 'despesas', 'relatorios', 'mobile', 'empresa-config', 'suporte'];
const positions = order.map((id) => adminMenu.indexOf(`data-menu-id="${id}"`));
assert(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])), 'ordem do menu deve ser mantida');

const operadorMenu = renderSidebar(operadorUser, {});
assert(!operadorMenu.includes('data-menu-id="despesas"'), 'operador nao ve despesas');
assert(!operadorMenu.includes('data-menu-id="fechar-caixa"'), 'operador nao ve fechar-caixa');

// Indicadores do caixa
const kpis = plain(renderCashKpis({ caixaAtual: 332, vitrineEstimada: 1486, totalVendido: 212, entradas: 50, saidas: 30 }));
assert(kpis.includes('R$ 1.486,00'), 'kpis devem formatar a vitrine estimada');
assert(kpis.includes('is-minus'), 'saidas usam is-minus');
assert(kpis.includes('is-plus'), 'entradas usam is-plus');
assert((kpis.match(/class="ui-kpi[" ]/g) || []).length === 5, 'devem ser cinco kpis');

// Status do caixa
const closedStatus = renderCashSessionStatus({ open: false });
assert(closedStatus.includes('Caixa fechado'), 'caixa fechado mostra o estado');
assert(closedStatus.includes('Abrir caixa') && closedStatus.includes('data-action="open-cash-session"'), 'caixa fechado oferece Abrir caixa');
assert(closedStatus.includes('ui-btn--ok'), 'Abrir caixa usa ui-btn--ok');
const openStatus = renderCashSessionStatus({ open: true });
assert(openStatus.includes('Caixa aberto') && openStatus.includes('Fechar caixa') && openStatus.includes('data-action="go-to-cash-closing"'), 'caixa aberto oferece Fechar caixa');

// Menu do usuario
const userMenu = renderUserMenu({ name: 'Luan' }, 'Modo escuro');
assert(userMenu.includes('data-action="toggle-theme"') && userMenu.includes('Modo escuro'), 'menu do usuario traz o tema');
assert(userMenu.includes('data-action="refresh"') && userMenu.includes('Atualizar'), 'menu do usuario traz Atualizar');
assert(userMenu.includes('data-action="logout"') && userMenu.includes('Sair'), 'menu do usuario traz Sair');
assert(userMenu.includes('<details'), 'menu do usuario e um details');
assert(userMenu.includes('>L<') && userMenu.includes('Luan'), 'avatar com a inicial e o nome');
assert(renderUserMenu({ name: '<b>x</b>' }, 'Modo escuro').includes('&lt;b&gt;'), 'nome do usuario deve ser escapado');

// CSS: rail/top so somem dentro das media queries do app do dono (desktop mantem o menu).
const { readFile } = await import('node:fs/promises');
const css = await readFile(new URL('../src/styles/components.css', import.meta.url), 'utf8');
function stripMediaBlocks(source) {
  let output = '';
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf('@media', index);
    if (start === -1) {
      output += source.slice(index);
      break;
    }
    output += source.slice(index, start);
    let depth = 0;
    let cursor = source.indexOf('{', start);
    do {
      depth += source[cursor] === '{' ? 1 : source[cursor] === '}' ? -1 : 0;
      cursor += 1;
    } while (depth > 0 && cursor < source.length);
    index = cursor;
  }
  return output;
}
const outsideMedia = stripMediaBlocks(css);
assert(!/is-mobile-owner[^{]*\.(rail|top)\b/.test(outsideMedia), 'regra que esconde rail/top no app do dono deve ficar dentro de @media');
assert(!/:has\(\.mobile-shell\)[^{]*\.(rail|top)\b/.test(outsideMedia), 'regra :has(.mobile-shell) que esconde rail/top deve ficar dentro de @media');
assert(css.includes('@media (max-width: 900px), (pointer: coarse)') && css.includes('@media (max-width: 760px)'), 'condicoes das media queries legadas devem ser preservadas');

// Foco visivel nos campos igual ao dos botoes: contorno de 2px em --ink (o ambar nao tem contraste no claro).
const { readdir } = await import('node:fs/promises');
const stylesDir = new URL('../src/styles/', import.meta.url);
const allCss = (await Promise.all((await readdir(stylesDir)).filter((file) => file.endsWith('.css'))
  .map(async (file) => [file, await readFile(new URL(file, stylesDir), 'utf8')])));
const inkOutline = /outline:\s*2px solid var\(--ink\);\s*outline-offset:\s*[12]px/;
const ruleFor = (source, selector) => source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] || '';
assert(inkOutline.test(ruleFor(css, '.ui-input:focus-visible')), '.ui-input:focus-visible usa contorno --ink');
const formsCss = allCss.find(([file]) => file === 'forms.css')[1];
assert(inkOutline.test(ruleFor(formsCss, '.field:focus-visible')), '.field:focus-visible usa contorno --ink');
const modalBCss = allCss.find(([file]) => file === 'modal-b.css')[1];
assert(inkOutline.test(ruleFor(modalBCss, '.app-shell .modal-backdrop .modal:not(.sale-success-modal) textarea:focus-visible')), 'campos dos modais usam contorno --ink');
for (const [file, source] of allCss) {
  assert(!/outline:\s*2px solid var\(--accent\)/.test(source), `${file}: foco nao usa contorno ambar`);
  assert(!/(\.field|select|textarea|input|\.ui-input)[^{,]*:focus(-visible)?[^{]*\{[^}]*outline:\s*(none|0)/.test(source), `${file}: foco de campo nao remove o contorno`);
}

console.log('shell-components tests passed');
