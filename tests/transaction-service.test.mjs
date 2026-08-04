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

const assertThrows = (callback, expectedMessage, message) => {
  try {
    callback();
  } catch (error) {
    assert(
      error.message.includes(expectedMessage),
      `${message}: expected "${expectedMessage}", got "${error.message}"`
    );
    return;
  }

  throw new Error(message);
};

const storage = await import('../src/services/storage.service.js?v=20260804-03');
const schema = await import('../src/database/schema.js?v=20260804-03');
const products = await import('../src/services/product.service.js?v=20260804-03');
const comandas = await import('../src/services/comanda.service.js?v=20260804-03');
const auth = await import('../src/services/auth.service.js?v=20260804-03');
const permissions = await import('../src/services/permission.service.js?v=20260804-03');
const audit = await import('../src/services/audit.service.js?v=20260804-03');
const financial = await import('../src/services/financial-sync.service.js?v=20260804-03');
const transactions = await import('../src/services/transaction.service.js?v=20260804-03');
const { seedTestAdmin, setTestUserSession } = await import('./test-auth-fixture.mjs?v=20260804-03');

seedTestAdmin(storage, schema.STORAGE_KEYS);
storage.ensureSeedData();
const adminSession = { user: auth.getCurrentUser() };
comandas.clearComanda();
comandas.addItem(products.getProductById('x-burger'));
comandas.addItem(products.getProductById('x-burger'));

const sale = transactions.finalizeComandaPayment({
  paymentMethod: 'dinheiro',
  receivedAmount: 40
});

assert(sale.total === 32, 'sale total should match comanda subtotal');
assert(sale.change === 8, 'cash payment should calculate change');
assert(sale.paymentMethod === 'dinheiro', 'sale should keep payment method');
assert(sale.comandaNumber === 1, 'sale should store comanda number');
assert(sale.items.length === 1, 'sale should store sold items');
assert(sale.createdBy === adminSession.user.id, 'sale should store logged user id');
assert(sale.userName === adminSession.user.name, 'sale should store logged user name');
assert(comandas.getActiveComanda().items.length === 0, 'comanda should be cleared after payment');
assert(comandas.getActiveComanda().number === 2, 'active comanda should advance after payment');

comandas.addItem(products.getProductById('batata-frita'));
comandas.addItem(products.getProductById('batata-frita'));
comandas.addItem(products.getProductById('x-burger'));
transactions.finalizeComandaPayment({
  paymentMethod: 'pix',
  receivedAmount: 0
});

const bestSellers = transactions.getBestSellingProducts();
assert(bestSellers[0].productId === 'x-burger', 'best seller should be x-burger by quantity');
assert(bestSellers[0].quantity === 3, 'best seller should sum quantities across comandas');
assert(transactions.getBestSellingProducts({ categoryId: 'porcoes' })[0].productId === 'batata-frita', 'category filter should work');

transactions.registerCashMovement({
  type: 'entrada',
  amount: 10,
  description: 'Reforco de caixa'
});

transactions.registerCashMovement({
  type: 'saida',
  amount: 3,
  description: 'Compra pequena'
});

const summary = transactions.getTransactionSummary();
const entryMovement = transactions.getTransactions().find((transaction) => transaction.description === 'Reforco de caixa');
const entryAudit = audit.getAuditLogs().find((entry) => entry.action === 'cash.movement' && entry.entityId === entryMovement.id);

assert(summary.salesTotal === 76, 'summary should include sales total');
assert(summary.entriesTotal === 10, 'summary should include entries');
assert(summary.outputsTotal === 3, 'summary should include outputs');
assert(summary.closedComandas === 2, 'summary should count closed comandas');
assert(entryMovement.userId === adminSession.user.id, 'cash movement should store logged user id');
assert(entryMovement.userName === adminSession.user.name, 'cash movement should prefer logged user name');
assert(entryAudit.reason === 'Reforco de caixa', 'cash movement audit should store description as reason');
assert(entryAudit.metadata.type === 'entrada', 'cash movement audit should store type');
assert(entryAudit.metadata.amount === 10, 'cash movement audit should store amount');
assert(entryAudit.metadata.category === 'sem-categoria', 'cash movement audit should store category');

transactions.cancelClosedComanda(sale.comandaId, { reason: 'Cliente desistiu' });
const canceledSummary = transactions.getTransactionSummary();
const canceledSale = transactions.getTransactions().find((transaction) => transaction.comandaId === sale.comandaId);
const canceledComanda = transactions.getClosedComandas().find((comanda) => comanda.id === sale.comandaId);

assert(canceledSummary.salesTotal === 44, 'canceling comanda should remove only that sale total');
assert(canceledSummary.closedComandas === 1, 'canceling comanda should remove closed comanda from active count');
assert(canceledSale.status === 'cancelada', 'canceling comanda should mark sale as canceled');
assert(canceledComanda.status === 'cancelada', 'canceling comanda should keep canceled comanda registered');
assert(canceledSale.cancelReason === 'Cliente desistiu', 'canceling comanda should store sale cancel reason');
assert(canceledComanda.canceledBy === adminSession.user.id, 'canceling comanda should store canceling user id');
assert(canceledComanda.canceledByName === adminSession.user.name, 'canceling comanda should store canceling user name');

const entrada = transactions.registerCashMovement({
  type: 'entrada',
  amount: 5,
  description: 'Teste cancelamento'
});
let missingReasonBlocked = false;
try {
  transactions.cancelTransaction(entrada.id);
} catch (error) {
  missingReasonBlocked = error.message === 'Informe o motivo do cancelamento.';
}
assert(missingReasonBlocked, 'canceling transaction should require reason');

transactions.cancelTransaction(entrada.id, { reason: 'Lancamento duplicado' });
const canceledMovement = transactions.getTransactions().find((transaction) => transaction.id === entrada.id);
const cancelAudit = audit.getAuditLogs().find((entry) => entry.action === 'transaction.cancel' && entry.entityId === entrada.id);

assert(canceledMovement.status === 'cancelada', 'canceling movement should mark transaction as canceled');
assert(canceledMovement.cancelReason === 'Lancamento duplicado', 'canceling movement should store reason');
assert(cancelAudit.reason === 'Lancamento duplicado', 'cancel audit should store reason');

comandas.clearComanda();
comandas.addItemQuantity(products.getProductById('refrigerante-lata'), 5);
const quickItem = comandas.getActiveComanda().items.find((item) => item.productId === 'refrigerante-lata');
assert(quickItem.quantity === 5, 'quick quantity should add requested amount');
assert(quickItem.total === 30, 'quick quantity should calculate total');

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayIso = yesterday.toISOString();

storage.setItem(schema.STORAGE_KEYS.transactions, [
  ...transactions.getTransactions(),
  {
    id: 'sale-yesterday',
    type: 'venda',
    status: 'ativa',
    total: 100,
    paymentMethod: 'dinheiro',
    createdAt: yesterdayIso
  },
  {
    id: 'entry-yesterday',
    type: 'entrada',
    status: 'ativa',
    amount: 20,
    createdAt: yesterdayIso
  },
  {
    id: 'output-yesterday',
    type: 'saida',
    status: 'ativa',
    amount: 4,
    createdAt: yesterdayIso
  }
]);

storage.setItem(schema.STORAGE_KEYS.closedComandas, [
  ...transactions.getClosedComandas(),
  {
    id: 'closed-yesterday',
    status: 'fechada',
    closedAt: yesterdayIso
  },
  {
    id: 'canceled-yesterday',
    status: 'cancelada',
    closedAt: yesterdayIso
  }
]);

const dailyMoney = transactions.getDailyMoneySummary();
assert(dailyMoney.salesTotal === 44, 'daily money should ignore canceled sale');
assert(dailyMoney.entriesTotal === 10, 'daily money should ignore canceled entry');
assert(dailyMoney.outputsTotal === 3, 'daily money should include active outputs');
assert(dailyMoney.expectedCash === 7, 'expected cash should be active cash sales plus entries minus outputs');
assert(dailyMoney.paymentTotals.pix === 44, 'pix total should include active pix sale');
assert(dailyMoney.paymentTotals.dinheiro === 0, 'cash sale total should ignore canceled cash sale');
assert(dailyMoney.netTotal === 51, 'net total should be sales plus entries minus outputs');
assert(dailyMoney.closedComandas === 1, 'daily money should ignore previous-day closed comandas');
assert(dailyMoney.canceledComandas === 1, 'daily money should count canceled comandas');

const allPeriodMoney = transactions.getMoneySummary({ period: 'all' });
assert(allPeriodMoney.salesTotal === 144, 'all period money should include previous-day sales');
assert(allPeriodMoney.entriesTotal === 30, 'all period money should include previous-day entries');
assert(allPeriodMoney.outputsTotal === 7, 'all period money should include previous-day outputs');
assert(allPeriodMoney.expectedCash === 123, 'all period expected cash should include previous-day cash movement');
assert(allPeriodMoney.closedComandas === 2, 'all period money should include previous-day closed comandas');
assert(allPeriodMoney.canceledComandas === 2, 'all period money should include previous-day canceled comandas');

const transactionCanceledSale = transactions.finalizeComandaPayment({
  paymentMethod: 'pix'
});
transactions.cancelTransaction(transactionCanceledSale.id, { reason: 'Venda lancada em duplicidade' });
const canceledByTransaction = transactions.getTransactions().find((transaction) => transaction.id === transactionCanceledSale.id);
const comandaCanceledByTransaction = transactions.getClosedComandas().find((comanda) => comanda.id === transactionCanceledSale.comandaId);
const transactionCanceledSummary = transactions.getTransactionSummary();
const saleCancelAudit = audit.getAuditLogs().find((entry) => entry.action === 'transaction.cancel' && entry.entityId === transactionCanceledSale.id);

assert(canceledByTransaction.status === 'cancelada', 'canceling sale transaction should mark transaction as canceled');
assert(comandaCanceledByTransaction.status === 'cancelada', 'canceling sale transaction should mark matching closed comanda as canceled');
assert(transactionCanceledSummary.closedComandas === 2, 'canceling sale transaction should remove matching closed comanda from active count');
assert(saleCancelAudit.metadata.comandaId === transactionCanceledSale.comandaId, 'sale transaction cancel audit should include comanda id');

const categorizedEntry = transactions.registerCashMovement({
  type: 'entrada',
  amount: 30,
  category: 'reforco-caixa',
  description: 'Troco inicial',
  userName: 'Administrador'
});

assert(categorizedEntry.category === 'reforco-caixa', 'cash entry should store category');
assert(categorizedEntry.userName === 'Administrador', 'cash entry should store responsible user');

const categorizedOutput = transactions.registerCashMovement({
  type: 'saida',
  amount: 12,
  category: 'compra-ingredientes',
  description: 'Compra de queijo',
  userName: 'Administrador'
});

assert(categorizedOutput.category === 'compra-ingredientes', 'cash output should store category');
assert(categorizedOutput.userName === 'Administrador', 'cash output should store responsible user');

const linkedMovement = transactions.registerCashMovement({
  type: 'saida',
  amount: 100,
  category: 'compra-materiais',
  description: 'Retirada para pagar fornecedor',
  createFinancialTransaction: true
});
const financialTransactions = JSON.parse(localStorage.getItem('pdv.financialTransactions'));
const linkedFinancial = financialTransactions.find((transaction) => transaction.cashMovementId === linkedMovement.id);

assert(linkedFinancial, 'cash movement should create linked financial transaction');
assert(linkedFinancial.description === 'Retirada para pagar fornecedor', 'linked financial transaction should keep description');
assert(linkedFinancial.type === 'expense', 'linked cash output should be financial expense');
assert(linkedFinancial.status === 'paid', 'linked financial transaction should be paid');
assert(linkedFinancial.movesCashSession === true, 'linked financial transaction should mark cash session movement');
assertThrows(
  () => transactions.registerCashMovement({ type: 'entrada', amount: 10, category: 'reforco-caixa', description: '' }),
  'Descricao obrigatoria.',
  'cash movement without description should throw'
);

const outputsBeforeSangria = transactions.getTransactionSummary().outputsTotal;
const sangria = transactions.registerCashMovement({
  type: 'sangria',
  amount: 7,
  category: 'retirada-caixa',
  description: 'Retirada parcial'
});
const sangriaSummary = transactions.getTransactionSummary();

assert(sangria.type === 'sangria', 'sangria should be accepted as movement type');
assert(sangriaSummary.outputsTotal === outputsBeforeSangria + 7, 'sangria should reduce expected cash as an outflow');

const saleAudit = audit.getAuditLogs().find((entry) => entry.action === 'sale.create' && entry.entityId === sale.id);
assert(saleAudit.userId === adminSession.user.id, 'sale audit should store logged user id');
assert(saleAudit.metadata.total === 32, 'sale audit should store total');
assert(saleAudit.metadata.paymentMethod === 'dinheiro', 'sale audit should store payment method');

const operator = {
  id: 'operator-test',
  name: 'Operador Teste',
  username: 'operador-teste',
  role: 'operator',
  active: true
};
permissions.setUserPermissionOverride(operator.id, 'sales.cancel', 'deny');
setTestUserSession(storage, schema.STORAGE_KEYS, operator);

let deniedCancelBlocked = false;
try {
  transactions.cancelTransaction(categorizedOutput.id, { reason: 'Sem permissao' });
} catch (error) {
  deniedCancelBlocked = error.message === 'Usuario sem permissao para esta acao.';
}
assert(deniedCancelBlocked, 'user without sales.cancel should not cancel transaction');

const uncategorized = transactions.getTransactions().find((transaction) => transaction.id === entrada.id);
assert((uncategorized.category || 'sem-categoria') === 'sem-categoria', 'old movements should remain compatible without category');

const failingFinancialClient = {
  from() {
    return {
      upsert() {
        return Promise.resolve({ error: new Error('offline') });
      },
      update() {
        return {
          eq() {
            return Promise.resolve({ error: new Error('offline') });
          }
        };
      }
    };
  }
};

const localRuntimeConfig = { dataProvider: 'local' };
const supabaseRuntimeConfig = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

storage.setItem(schema.STORAGE_KEYS.financialSyncQueue, []);
globalThis.__PDV_RUNTIME_CONFIG__ = localRuntimeConfig;
setTestUserSession(storage, schema.STORAGE_KEYS, adminSession.user);
globalThis.__PDV_RUNTIME_CONFIG__ = supabaseRuntimeConfig;
financial.configureFinancialSyncForTests({ getClient: async () => failingFinancialClient });
comandas.clearComanda();
comandas.addItem(products.getProductById('x-burger'));

const supabaseSale = transactions.finalizeComandaPayment({
  paymentMethod: 'pix'
});
globalThis.__PDV_RUNTIME_CONFIG__ = localRuntimeConfig;
await waitForAsyncSync();

let financialQueue = storage.getItem(schema.STORAGE_KEYS.financialSyncQueue, []);
assert(financialQueue.length === 1, 'supabase sale failure should queue one financial operation');
assert(financialQueue[0].action === 'saveSale', 'supabase sale failure should queue saveSale');
assert(financialQueue[0].sale.id === supabaseSale.id, 'supabase queued sale should keep sale id');
assert(financialQueue[0].command.id === supabaseSale.comandaId, 'supabase queued sale should include closed comanda');
globalThis.__PDV_RUNTIME_CONFIG__ = supabaseRuntimeConfig;
assert(transactions.getTransactionSyncStatus().state === 'pending', 'supabase queued sale should expose pending sync status');

const supabaseMovement = transactions.registerCashMovement({
  type: 'entrada',
  amount: 15,
  category: 'troco',
  description: 'Teste fila Supabase'
});
globalThis.__PDV_RUNTIME_CONFIG__ = localRuntimeConfig;
await waitForAsyncSync();

financialQueue = storage.getItem(schema.STORAGE_KEYS.financialSyncQueue, []);
assert(financialQueue.length === 3, 'supabase cash movement failure should append cash and finance queue operations');
assert(financialQueue.some((operation) => operation.action === 'saveCashMovement' && operation.movement.id === supabaseMovement.id), 'supabase cash movement failure should queue saveCashMovement');
assert(
  financialQueue.some((operation) => operation.action === 'saveFinancialTransaction' && operation.transaction.cashMovementId === supabaseMovement.id),
  'supabase cash movement failure should queue linked financial transaction'
);
globalThis.__PDV_RUNTIME_CONFIG__ = localRuntimeConfig;

console.log('transaction service ok');

function waitForAsyncSync() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
