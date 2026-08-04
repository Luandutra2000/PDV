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

globalThis.document = {
  documentElement: {
    dataset: {}
  }
};

const mobileDashboard = await import('../src/modules/mobile/mobile-dashboard.module.js?v=20260804-02');
const eventBus = await import('../src/services/event-bus.service.js?v=20260804-02');
const { UI_EVENTS } = await import('../src/database/schema.js?v=20260804-02');

const header = mobileDashboard.renderMobileTopbar({
  period: 'today',
  sync: {
    state: 'synced',
    icon: 'OK',
    label: 'online',
    title: 'Sincronizado'
  }
});

assert(header.includes('PDV Lanchonete'), 'mobile topbar should show app title');
assert(header.includes('data-mobile-sync'), 'mobile topbar should include sync button');
assert(header.includes('online'), 'mobile topbar should show sync status');
assert(header.includes('data-mobile-theme'), 'mobile topbar should include theme toggle button');
assert(header.includes('Hoje'), 'mobile topbar should show current period');
assert(header.includes('data-mobile-period-toggle'), 'mobile period pill should be a functional filter button');
assert(header.includes('data-mobile-logout'), 'mobile topbar should include logout button');
assert(header.includes('Sair'), 'mobile topbar should show exit label');
assert(!header.includes('data-mobile-exit'), 'mobile logout should not only navigate back and keep the session active');

const periodControls = mobileDashboard.renderMobilePeriodControls({
  feedPeriod: 'today',
  customStart: '',
  customEnd: ''
});

assert(periodControls.includes('data-feed-period="today"'), 'mobile period controls should include today');
assert(periodControls.includes('data-feed-period="month"'), 'mobile period controls should include month');
assert(periodControls.includes('data-feed-period="custom"'), 'mobile period controls should include custom period');

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

assert((liveFeed.match(/class="mobile-feed-event/g) || []).length === 5, 'live feed should show five events initially');
assert(liveFeed.includes('data-feed-load-more'), 'live feed should show load more button when more events exist');

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

const oldWorkspace = createWorkspace();
const currentWorkspace = createWorkspace();

mobileDashboard.initMobileDashboardModule(oldWorkspace);
mobileDashboard.initMobileDashboardModule(currentWorkspace);
currentWorkspace.innerHTML = 'stale mobile dashboard';
eventBus.emit(UI_EVENTS.mobileFeedChanged);

assert(currentWorkspace.innerHTML !== 'stale mobile dashboard', 'mobile dashboard should refresh the current workspace after remount');

currentWorkspace.dataset.activeRoute = 'frente-caixa';
currentWorkspace.innerHTML = 'frente de caixa';
eventBus.emit(UI_EVENTS.cashSummaryChanged);

assert(currentWorkspace.innerHTML === 'frente de caixa', 'mobile dashboard should not take over workspace after leaving owner app');

console.log('mobile dashboard module ok');

function createWorkspace() {
  return {
    dataset: {},
    innerHTML: '',
    addEventListener() {}
  };
}
