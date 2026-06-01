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
assert(header.includes('Hoje'), 'mobile topbar should keep current period badge');

console.log('mobile dashboard module ok');
