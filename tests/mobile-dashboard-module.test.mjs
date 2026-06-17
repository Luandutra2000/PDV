const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

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

const mobileDashboard = await import('../src/modules/mobile/mobile-dashboard.module.js');
const eventBus = await import('../src/services/event-bus.service.js');
const { STORAGE_KEYS, UI_EVENTS } = await import('../src/database/schema.js');
const storage = await import('../src/services/storage.service.js');

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

store.clear();
storage.setItem(STORAGE_KEYS.users, [{
  id: 'owner-denied',
  name: 'Dono restrito',
  username: 'dono',
  password: '1234',
  role: 'dono',
  active: true
}]);
storage.setItem(STORAGE_KEYS.currentSession, { userId: 'owner-denied', startedAt: '2026-06-15T10:00:00.000Z' });
storage.setItem(STORAGE_KEYS.userPermissionOverrides, {
  'owner-denied': {
    'financial.income.create': 'deny',
    'financial.expense.create': 'deny',
    'financial.bill.pay': 'deny',
    'cash.close': 'deny',
    'showcase.launch': 'deny',
    'showcase.edit': 'deny'
  }
});
storage.setItem(STORAGE_KEYS.financialTransactions, [{
  id: 'mobile-payable',
  type: 'expense',
  description: 'Conta mobile',
  amount: 100,
  paymentMethod: 'boleto',
  status: 'pending',
  transactionDate: '2026-06-15',
  dueDate: '2026-06-20'
}]);

const deniedWorkspace = createWorkspace();
mobileDashboard.initMobileDashboardModule(deniedWorkspace);

clickMobileTab(deniedWorkspace, 'finance');
assert(!deniedWorkspace.innerHTML.includes('data-mobile-finance-action="income"'), 'denied mobile user should not see income action');
assert(!deniedWorkspace.innerHTML.includes('data-mobile-finance-action="expense"'), 'denied mobile user should not see expense action');
assert(!deniedWorkspace.innerHTML.includes('data-mobile-finance-action="bill"'), 'denied mobile user should not see bill action');
assert(!deniedWorkspace.innerHTML.includes('data-mobile-payable-id="mobile-payable"'), 'denied mobile user should not see payable action');

clickMobileTab(deniedWorkspace, 'closing');
assert(!deniedWorkspace.innerHTML.includes('Fechar Caixa'), 'denied mobile user should not see closing submit');

clickMobileTab(deniedWorkspace, 'showcase');
assert(!deniedWorkspace.innerHTML.includes('Lancar / atualizar vitrine'), 'denied mobile user should not see showcase submit');

console.log('mobile dashboard module ok');

function createWorkspace() {
  return {
    dataset: {},
    innerHTML: '',
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    },
    querySelector() {
      return null;
    }
  };
}

function clickMobileTab(workspace, tab) {
  workspace.listeners.click[0]({
    target: {
      closest(selector) {
        if (selector === '[data-mobile-tab]') {
          return { dataset: { mobileTab: tab } };
        }

        return null;
      }
    }
  });
}
