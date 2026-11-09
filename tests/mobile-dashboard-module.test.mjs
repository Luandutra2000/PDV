const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

globalThis.localStorage = {
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {},
  clear() {}
};

globalThis.window = {
  location: {
    href: '',
    pathname: '/'
  }
};

const documentListeners = {};
globalThis.document = {
  documentElement: {
    dataset: {}
  },
  addEventListener(type, listener) {
    documentListeners[type] = listener;
  }
};

const mobileDashboard = await import('../src/modules/mobile/mobile-dashboard.module.js?v=20261109-01');
const eventBus = await import('../src/services/event-bus.service.js?v=20260804-06');
const { UI_EVENTS } = await import('../src/database/schema.js?v=20260804-06');

// Topo: marca, titulo da aba, linha de contexto, "Ao vivo" e o menu com tema, Fechar caixa e Sair.
const header = mobileDashboard.renderMobileTopbar({
  tab: 'home',
  context: 'Sexta, 7 de novembro',
  period: 'today',
  sync: {
    state: 'synced',
    label: 'Ao vivo',
    title: 'Sincronizado'
  }
});

assert(header.includes('Painel do dono'), 'mobile topbar should show the tab title');
assert(header.includes('Sexta, 7 de novembro'), 'mobile topbar should show the context line');
assert(header.includes('data-mobile-sync'), 'mobile topbar should include sync button');
assert(header.includes('Ao vivo'), 'mobile topbar should show the live indicator when synced');
assert(header.includes('<details'), 'mobile topbar actions should live in a details menu');
assert(header.includes('data-mobile-theme'), 'mobile menu should include theme toggle button');
assert(header.includes('data-mobile-period-toggle'), 'mobile menu should keep the period filter toggle');
assert(header.includes('Hoje'), 'mobile menu should show current period');
assert(header.includes('data-mobile-tab="closing"'), 'mobile menu should keep the cash closing action');
assert(header.includes('Fechar caixa'), 'mobile menu should label the cash closing action');
assert(header.includes('data-mobile-logout'), 'mobile menu should include logout button');
assert(header.includes('Sair'), 'mobile menu should show exit label');
assert(!header.includes('data-mobile-exit'), 'mobile logout should not only navigate back and keep the session active');
assert(!header.includes('PDV Lanchonete'), 'mobile topbar should not keep the old app title');

const localHeader = mobileDashboard.renderMobileTopbar();
assert(!localHeader.includes('LOC'), 'mobile topbar should not show the LOC all-caps badge');
assert(!/>\s*(OK|OFF|LOC)\s*</.test(localHeader), 'mobile topbar should not show all-caps sync codes');

// Abas embaixo: icone e nome, sem siglas.
const nav = mobileDashboard.renderMobileBottomNav('home');
['Início', 'Caixa', 'Vitrine', 'CRM', 'Financeiro'].forEach((label) => {
  assert(nav.includes(label), `mobile tabs should show ${label}`);
});
assert(nav.includes('<svg'), 'mobile tabs should use icons');
assert(nav.includes('data-mobile-tab="home"') && nav.includes('data-mobile-tab="finance"'), 'mobile tabs should keep tab ids');
assert(nav.includes('aria-current="page"'), 'active mobile tab should be marked');
['>IN<', '>FN<', '>VT<', '>CR<', '>OK<', 'Financ.'].forEach((oldText) => {
  assert(!nav.includes(oldText), `mobile tabs should not show ${oldText}`);
});

const periodControls = mobileDashboard.renderMobilePeriodControls({
  feedPeriod: 'today',
  customStart: '',
  customEnd: ''
});

assert(periodControls.includes('ui-seg'), 'mobile period controls should use the segmented control');
assert(periodControls.includes('data-feed-period="today"'), 'mobile period controls should include today');
assert(periodControls.includes('data-feed-period="month"'), 'mobile period controls should include month');
assert(periodControls.includes('data-feed-period="custom"'), 'mobile period controls should include custom period');
assert(periodControls.includes('Mês') && periodControls.includes('Período'), 'mobile period labels should be in Portuguese with accents');

const liveFeed = mobileDashboard.renderLiveFeed({
  filter: 'all',
  feedPeriod: 'today',
  customStart: '',
  customEnd: '',
  feedLimit: 5,
  events: Array.from({ length: 6 }, (_, index) => ({
    id: `event-${index}`,
    kind: 'sale',
    level: 'info',
    title: 'Venda realizada',
    description: `Evento ${index}`,
    amount: 10,
    createdAt: new Date().toISOString(),
    icon: 'R$'
  }))
});

assert(liveFeed.includes('Acontecendo agora'), 'live feed should be titled Acontecendo agora');
assert(liveFeed.includes('data-feed-filter="alerts"'), 'live feed should keep the filters');
assert((liveFeed.match(/class="own-event[ "]/g) || []).length === 5, 'live feed should show five events initially');
assert(liveFeed.includes('data-feed-load-more'), 'live feed should show load more button when more events exist');
assert(!liveFeed.includes('>R$<'), 'live feed should not show text icons');

const openedFeedEvent = mobileDashboard.renderFeedEvent({
  id: 'sale-detail',
  kind: 'sale',
  level: 'info',
  title: 'Venda realizada',
  description: '2 item(ns) - Hamburguer',
  amount: 18,
  createdAt: new Date().toISOString(),
  icon: 'R$',
  details: {
    comandaNumber: 9,
    paymentMethod: 'dinheiro',
    paymentLabel: 'Dinheiro',
    receivedAmount: 20,
    change: 2,
    total: 18,
    items: [{ name: 'Hamburguer', quantity: 2, total: 18 }]
  }
}, 'sale-detail');

assert(openedFeedEvent.includes('Comanda 0009'), 'opened mobile sale alert should show command number');
assert(openedFeedEvent.includes('2x Hamburguer'), 'opened mobile sale alert should show purchased items');
assert(openedFeedEvent.includes('Pagamento'), 'opened mobile sale alert should show payment details');
assert(openedFeedEvent.includes('Troco'), 'opened mobile sale alert should show change details');
assert(openedFeedEvent.includes('data-feed-event-id="sale-detail"'), 'sale event should stay clickable');

// CRM: Vendas por dia (hoje em destaque) e Mais vendidos na cor da categoria.
const crmTab = mobileDashboard.renderCrmTab();
assert(crmTab.includes('Vendas por dia'), 'CRM tab should show sales per day');
assert(crmTab.includes('Mais vendidos'), 'CRM tab should show best sellers');
assert(crmTab.includes('Produção x vendido'), 'CRM tab should show production x sold');
assert(crmTab.includes('Destaques'), 'CRM tab should show highlights');
assert(crmTab.includes('data-feed-period="today"'), 'CRM tab should keep the period filter');

const todayKey = new Date().toISOString().slice(0, 10);
const salesChart = mobileDashboard.renderMobileSalesChart([
  { label: '2020-01-01', sales: 40 },
  { label: todayKey, sales: 20 }
]);
assert(salesChart.includes('Vendas por dia'), 'sales chart should be titled Vendas por dia');
assert((salesChart.match(/is-hi/g) || []).length === 1, 'sales chart should highlight exactly one day');
assert(/class="is-hi"[^>]*title="Hoje/.test(salesChart), 'sales chart should highlight today');

const categories = [{ id: 'lanches', name: 'Lanches' }, { id: 'cat-nova', name: 'Doces' }];
const topProducts = mobileDashboard.renderMobileTopProducts([
  { productId: 'p1', name: 'X-Burger', categoryId: 'lanches', quantity: 8, revenue: 128 },
  { productId: 'p2', name: 'Brigadeiro <b>', categoryId: 'cat-nova', quantity: 3, revenue: 9 }
], categories);
assert(topProducts.includes('Mais vendidos'), 'top products should be titled Mais vendidos');
assert(topProducts.includes('--c:var(--cat-lanches)'), 'top products bars should use the category colour');
assert(topProducts.includes('--c:var(--cat-extra-'), 'user categories should get a stable extra colour');
assert(topProducts.includes('Brigadeiro &lt;b&gt;'), 'product names should be escaped');
assert(topProducts.includes('own-bar-detail') && topProducts.includes('128,00'), 'top products should keep the revenue per product');

const categoryChart = mobileDashboard.renderMobileCategoryChart([
  { categoryId: 'lanches', name: 'Lanches', quantity: 12, revenue: 200 }
], categories);
assert(categoryChart.includes('Categorias') && categoryChart.includes('200,00'), 'category chart should show revenue per category');
assert(categoryChart.includes('12 un.'), 'category chart should keep the units per category');
assert(categoryChart.includes('--c:var(--cat-lanches)'), 'category bars should use the category colour');

const productionChart = mobileDashboard.renderMobileProductionChart([
  { produtoId: 'p1', produtoNome: 'X-Burger', quantidadeVendida: 18, quantidadeProduzida: 20, percentualVendido: 90 }
]);
assert(productionChart.includes('Produção x vendido') && productionChart.includes('90%'), 'production chart should show the sold percentage');
assert(productionChart.includes('18/20 vendidos'), 'production chart should keep sold/produced units');

// Vitrine: faixa da categoria e quantidade ou etiqueta.
const stockList = mobileDashboard.renderMobileStockList([
  { produtoId: 'p1', produtoNome: 'X-Burger', categoriaId: 'lanches', categoriaNome: 'Lanches', sobraQuantidade: 12 },
  { produtoId: 'p2', produtoNome: 'Suco', categoriaId: 'cat-nova', categoriaNome: 'Doces', sobraQuantidade: 2 },
  { produtoId: 'p3', produtoNome: 'Pastel', categoriaId: 'lanches', categoriaNome: 'Lanches', sobraQuantidade: 0 }
], categories);
assert(stockList.includes('ui-stripe') && stockList.includes('--c: var(--cat-lanches)'), 'stock rows should show the category stripe');
assert(stockList.includes('Esgotado') && stockList.includes('2 restantes') && stockList.includes('12 un.'), 'stock rows should show quantity or status pill');

// Fechamento: diferenca com a mesma regra do Caixa (so a falta em vermelho).
const closingCards = { expectedCash: 100, expectedPix: 50, expectedCard: 30 };
for (const [differenceTotal, tone] of [[-5, 'is-minus'], [0, 'is-plus'], [5, 'is-plus']]) {
  const stats = mobileDashboard.renderClosingStats(closingCards, { differenceTotal });
  const differenceStat = stats.match(/<div class="ui-stat([^"]*)">\s*<small>Diferença<\/small>/)?.[1].trim();
  assert(differenceStat === tone, `diferenca ${differenceTotal} no app do dono deve usar ${tone} (veio "${differenceStat}")`);
}

const oldWorkspace = createWorkspace();
const currentWorkspace = createWorkspace();

mobileDashboard.initMobileDashboardModule(oldWorkspace);
mobileDashboard.initMobileDashboardModule(currentWorkspace);
assert(currentWorkspace.innerHTML.includes('mobile-shell'), 'owner app should keep the mobile-shell root used by the shell rules');

// Menu do topo: o estado aberto sobrevive ao re-render e Esc no documento fecha.
currentWorkspace.listeners.toggle({ target: { matches: () => true, open: true } });
eventBus.emit(UI_EVENTS.mobileFeedChanged);
assert(currentWorkspace.innerHTML.includes('data-mobile-menu open'), 'open top menu should stay open after a realtime re-render');
assert(typeof documentListeners.keydown === 'function', 'Escape should be handled on the document');
documentListeners.keydown({ key: 'Escape' });
eventBus.emit(UI_EVENTS.mobileFeedChanged);
assert(!currentWorkspace.innerHTML.includes('data-mobile-menu open'), 'Escape on the document should close the top menu');
currentWorkspace.innerHTML = 'stale mobile dashboard';
eventBus.emit(UI_EVENTS.mobileFeedChanged);

assert(currentWorkspace.innerHTML !== 'stale mobile dashboard', 'mobile dashboard should refresh the current workspace after remount');

currentWorkspace.dataset.activeRoute = 'frente-caixa';
currentWorkspace.innerHTML = 'frente de caixa';
eventBus.emit(UI_EVENTS.cashSummaryChanged);

assert(currentWorkspace.innerHTML === 'frente de caixa', 'mobile dashboard should not take over workspace after leaving owner app');

console.log('mobile dashboard module ok');

function createWorkspace() {
  const listeners = {};
  return {
    dataset: {},
    innerHTML: '',
    listeners,
    addEventListener(type, listener) {
      listeners[type] = listener;
    }
  };
}
