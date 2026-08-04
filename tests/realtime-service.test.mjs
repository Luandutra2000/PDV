const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const { STORAGE_KEYS, SYNC_EVENTS, UI_EVENTS } = await import('../src/database/schema.js?v=20260804-01');
const { emit, on } = await import('../src/services/event-bus.service.js?v=20260804-01');
const realtime = await import('../src/services/realtime.service.js?v=20260804-01');

let received = null;
on(UI_EVENTS.mobileFeedChanged, (payload) => {
  received = payload;
});

realtime.initRealtimeService();
emit(SYNC_EVENTS.saleFinished, { id: 'sale-test' });

assert(received?.id === 'sale-test', 'realtime bridge should republish sale events to mobile feed updates');

received = null;
realtime.initRealtimeService();
emit(SYNC_EVENTS.cashMovementRegistered, { id: 'cash-test' });

assert(received?.id === 'cash-test', 'realtime bridge should republish cash movement events to mobile feed updates');

let externalCashUpdate = null;
let externalShowcaseUpdate = null;
on(UI_EVENTS.cashSummaryChanged, (payload) => {
  externalCashUpdate = payload;
});
on(UI_EVENTS.showcaseDataChanged, (payload) => {
  externalShowcaseUpdate = payload;
});

realtime.handleExternalStorageChange({ key: STORAGE_KEYS.transactions });
realtime.handleExternalStorageChange({ key: STORAGE_KEYS.productStock });

assert(externalCashUpdate?.type === 'external-tab-update', 'storage changes from another tab should refresh cash totals');
assert(externalShowcaseUpdate?.type === 'external-tab-update', 'storage changes from another tab should refresh showcase totals');

console.log('realtime service ok');
