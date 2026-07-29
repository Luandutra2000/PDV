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

const { formatHistoryItemQuantity } = await import('../src/modules/dashboard/dashboard.module.js?v=20260729-12');

assert(formatHistoryItemQuantity({ quantity: 2 }) === '2x', 'history should show the purchased quantity when item quantity is greater than one');
assert(formatHistoryItemQuantity({ quantity: 1 }) === '1x', 'history should show one unit for single items');
assert(formatHistoryItemQuantity({}) === '1x', 'history should fall back to one unit when quantity is missing');

console.log('dashboard module ok');
