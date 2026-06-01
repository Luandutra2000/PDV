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

const mobileDashboard = await import('../src/modules/mobile/mobile-dashboard.module.js');

const header = mobileDashboard.renderMobileTopbar('Modo claro');

assert(header.includes('PDV Lanchonete'), 'mobile topbar should show app title');
assert(header.includes('data-mobile-theme'), 'mobile topbar should include light/dark toggle');
assert(header.includes('Modo claro'), 'mobile topbar should show current theme action label');
assert(header.includes('data-mobile-exit'), 'mobile topbar should include exit button');
assert(header.includes('Sair'), 'mobile topbar should show exit label');
assert(!header.includes('<span>Hoje</span>'), 'mobile topbar should not duplicate the period filter badge');

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

console.log('mobile dashboard module ok');
