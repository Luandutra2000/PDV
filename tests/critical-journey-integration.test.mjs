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

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};

const storage = await import('../src/services/storage.service.js?v=20260804-01');
const auth = await import('../src/services/auth.service.js?v=20260804-01');
const supabaseClient = await import('../src/services/supabase-client.service.js?v=20260804-01');
const products = await import('../src/services/product.service.js?v=20260804-01');
const comandas = await import('../src/services/comanda.service.js?v=20260804-01');
const transactions = await import('../src/services/transaction.service.js?v=20260804-01');
const estoque = await import('../src/services/estoque.service.js?v=20260804-01');
const closing = await import('../src/services/cash-closing.service.js?v=20260804-01');
const audit = await import('../src/services/audit.service.js?v=20260804-01');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-01');

storage.resetAppData();
storage.ensureSeedData();

// 1. Login central: a senha existe apenas no corpo enviado ao Supabase.
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

let centralSession = null;
supabaseClient.configureSupabaseClientForTests({
  client: {
    auth: {
      async setSession(session) {
        centralSession = session;
      }
    },
    from(table) {
      return {
        select() {
          return {
            eq() {
              if (table === 'profiles') {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        id: 'journey-admin',
                        name: 'Administrador Jornada',
                        role_id: 'admin',
                        is_active: true,
                        empresa_id: 'empresa-qa'
                      },
                      error: null
                    };
                  }
                };
              }
              return Promise.resolve({ data: [], error: null });
            }
          };
        }
      };
    }
  }
});

globalThis.fetch = async () => ({
  ok: true,
  async json() {
    return {
      user: {
        id: 'journey-admin',
        email: 'admin@pdv.test',
        user_metadata: {
          name: 'Administrador Jornada',
          role: 'admin'
        }
      },
      access_token: 'journey-access-token',
      refresh_token: 'journey-refresh-token'
    };
  }
});

await auth.login({
  username: 'admin@pdv.test',
  password: 'senha-transmitida-ao-provedor'
});

assert(centralSession.access_token === 'journey-access-token', 'central login should establish SDK session');
assert(auth.getCurrentUser()?.id === 'journey-admin', 'central login should identify the operator');
assert(
  storage.getItem(STORAGE_KEYS.users, []).every((user) => !Object.hasOwn(user, 'password')),
  'central login should not cache plaintext passwords'
);

// The remaining journey uses the isolated local provider while preserving the
// authenticated profile, avoiding network writes in this integration test.
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};
delete globalThis.fetch;

// 2. Open the cash session with R$ 100 and prepare ten units for sale.
const opening = transactions.registerCashMovement({
  type: 'entrada',
  amount: 100,
  category: 'abertura-caixa',
  description: 'Abertura do caixa'
});
assert(opening.amount === 100, 'cash session should open with R$ 100');

const burger = products.getProductById('x-burger');
estoque.createStockLaunch({
  produtoId: burger.id,
  quantidade: 10,
  note: 'Producao inicial'
});

// 3. Sell two units in cash and reconcile total, receipt, change and stock.
comandas.clearComanda();
comandas.addItem(burger);
comandas.addItem(burger);
const canceledSale = transactions.finalizeComandaPayment({
  paymentMethod: 'dinheiro',
  receivedAmount: 50
});

assert(canceledSale.total === 32, 'two burgers should total R$ 32');
assert(canceledSale.receivedAmount === 50, 'sale should preserve received cash');
assert(canceledSale.change === 18, 'sale should calculate R$ 18 change');

let burgerStock = estoque.getProductionSalesComparison()
  .find((item) => item.produtoId === burger.id);
assert(burgerStock.quantidadeVendida === 2, 'sale should consume two produced units');
assert(burgerStock.sobraQuantidade === 8, 'stock should show eight remaining units');

// 4. Cancel the sale twice and prove that stock and money are restored once.
transactions.cancelTransaction(canceledSale.id, { reason: 'Cliente desistiu' });
transactions.cancelTransaction(canceledSale.id, { reason: 'Repeticao segura' });

burgerStock = estoque.getProductionSalesComparison()
  .find((item) => item.produtoId === burger.id);
assert(burgerStock.quantidadeVendida === 0, 'canceled sale should no longer consume stock');
assert(burgerStock.sobraQuantidade === 10, 'cancellation should restore stock exactly once');

const afterCancellation = transactions.getMoneySummary({ period: 'today' });
assert(afterCancellation.salesTotal === 0, 'canceled sale should not remain in revenue');
assert(afterCancellation.expectedCash === 100, 'canceled sale should not change opening cash');
assert(
  transactions.getTransactions().filter((item) => item.id === canceledSale.id).length === 1,
  'repeated cancellation should not duplicate the sale'
);

// 5. Complete a valid sale, perform a sangria and close the cash session.
comandas.clearComanda();
comandas.addItem(burger);
const validSale = transactions.finalizeComandaPayment({
  paymentMethod: 'dinheiro',
  receivedAmount: 20
});
assert(validSale.total === 16 && validSale.change === 4, 'valid sale should total R$ 16 with R$ 4 change');

const withdrawal = transactions.registerCashMovement({
  type: 'sangria',
  amount: 30,
  category: 'retirada-caixa',
  description: 'Sangria operacional'
});
assert(withdrawal.amount === 30, 'cash withdrawal should be registered');

const money = transactions.getMoneySummary({ period: 'today' });
assert(money.salesTotal === 16, 'summary should include only the active sale');
assert(money.entriesTotal === 100, 'summary should include opening cash');
assert(money.outputsTotal === 30, 'summary should treat sangria as cash outflow');
assert(money.expectedCash === 86, 'expected cash should be 100 + 16 - 30');

burgerStock = estoque.getProductionSalesComparison()
  .find((item) => item.produtoId === burger.id);
assert(burgerStock.quantidadeVendida === 1, 'only the valid sale should consume stock');
assert(burgerStock.sobraQuantidade === 9, 'nine produced units should remain');

const draft = closing.saveClosingDraft({
  countedCash: 86,
  checkedPix: 0,
  checkedDebit: 0,
  checkedCredit: 0,
  leftovers: {
    [burger.id]: 9
  },
  differences: []
});
const confirmed = closing.confirmClosing(draft, { sync: false });

assert(confirmed.status === 'fechado', 'cash closing should be confirmed');
assert(confirmed.totals.expectedCash === 86, 'closing should reconcile expected cash');
assert(confirmed.totals.countedCash === 86, 'closing should preserve counted cash');
assert(confirmed.totals.cashDifference === 0, 'closing should have no cash difference');
assert(confirmed.totals.sales === 16, 'closing should include only active sales');
assert(confirmed.totals.entries === 100, 'closing should include opening entry');
assert(confirmed.totals.outputs === 30, 'closing should include sangria');
assert(closing.getCashClosings().length === 1, 'closing should be stored once');

const actions = audit.getAuditLogs().map((entry) => entry.action);
assert(actions.includes('sale.create'), 'journey should audit sales');
assert(actions.includes('transaction.cancel'), 'journey should audit cancellation');
assert(actions.includes('cash.movement'), 'journey should audit cash movements');
assert(actions.includes('cash.close'), 'journey should audit closing');

supabaseClient.configureSupabaseClientForTests();
globalThis.__PDV_RUNTIME_CONFIG__ = null;

console.log('critical journey integration ok');
