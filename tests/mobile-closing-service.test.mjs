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

const storage = await import('../src/services/storage.service.js?v=20260729-12');
const products = await import('../src/services/product.service.js?v=20260729-12');
const comandas = await import('../src/services/comanda.service.js?v=20260729-12');
const transactions = await import('../src/services/transaction.service.js?v=20260729-12');
const closing = await import('../src/services/cash-closing.service.js?v=20260729-12');
const financialSync = await import('../src/services/financial-sync.service.js?v=20260729-12');
const mobileClosing = await import('../src/services/mobile-closing.service.js?v=20260729-12');
const auth = await import('../src/services/auth.service.js?v=20260729-12');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260729-12');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260729-12');

storage.resetAppData();
seedTestAdmin(storage, STORAGE_KEYS);

const burger = products.getProductById('x-burger');
comandas.clearComanda();
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 20 });
transactions.registerCashMovement({ type: 'entrada', amount: 10, description: 'Reforco' });
transactions.registerCashMovement({ type: 'saida', amount: 5, description: 'Compra pequena' });

const draft = closing.saveClosingDraft({ countedCash: burger.price + 3 });
closing.confirmClosing(draft);

const summary = mobileClosing.getMobileClosingSummary();

assert(summary.expectedCash === burger.price + 10 - 5, 'closing should expose expected cash');
assert(summary.entriesTotal === 10, 'closing should expose entries total');
assert(summary.outputsTotal === 5, 'closing should expose outputs total');
assert(summary.cashDifference === 0, 'closing preview without counted cash should default to no current difference');
assert(summary.history.length === 1, 'closing should expose closing history');
assert(summary.formDefaults.countedCash === summary.expectedCash, 'closing should default counted cash to expected cash');
assert(summary.formDefaults.checkedPix === summary.expectedPix, 'closing should default pix counted to expected pix');
assert(summary.formDefaults.checkedCard === summary.expectedDebit + summary.expectedCredit, 'closing should default card counted to expected card');
assert(summary.history[0].statusLabel === 'Pequena diferenca', 'small difference closing should be Pequena diferenca');

const preview = mobileClosing.previewMobileClosing({
  countedCash: summary.expectedCash + 6,
  checkedPix: summary.expectedPix,
  checkedCard: summary.expectedDebit + summary.expectedCredit,
  note: 'Teste'
});
assert(preview.statusLabel === 'Grande diferenca', 'difference above five should be Grande diferenca');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon'
};
financialSync.configureFinancialSyncForTests({
  getClient: async () => ({
    from() {
      return {
        upsert() {
          return Promise.resolve({ error: new Error('offline') });
        }
      };
    }
  })
});

const historyBeforeFailedSubmit = closing.getCashClosings().length;
let failedSubmit = false;
try {
  await mobileClosing.submitMobileClosing({
    countedCash: summary.formDefaults.countedCash,
    checkedPix: summary.formDefaults.checkedPix,
    checkedCard: summary.formDefaults.checkedCard,
    note: 'Falha online'
  });
} catch (error) {
  failedSubmit = error.message.includes('offline') || error.message.includes('Supabase');
}

assert(failedSubmit, 'mobile closing should fail when Supabase write fails');
assert(closing.getCashClosings().length === historyBeforeFailedSubmit, 'failed mobile closing should not stay saved locally');

console.log('mobile closing service ok');
