const store = new Map();

globalThis.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const storage = await import('../src/services/storage.service.js?v=20260804-04');
const schema = await import('../src/database/schema.js?v=20260804-04');
const products = await import('../src/services/product.service.js?v=20260804-04');
const comandas = await import('../src/services/comanda.service.js?v=20260804-04');
const transactions = await import('../src/services/transaction.service.js?v=20260804-04');
const crm = await import('../src/services/crm-dashboard.service.js?v=20260804-04');
const reconciliation = await import('../src/services/reconciliation.service.js?v=20260804-04');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-04');

storage.resetAppData();
seedTestAdmin(storage, schema.STORAGE_KEYS);

transactions.registerCashMovement({
  type: 'entrada',
  amount: 100,
  description: 'Abertura'
});

const burger = products.getProductById('x-burger');
const soda = products.getProductById('refrigerante-lata');

comandas.clearComanda();
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 20 });

comandas.addItem(soda);
transactions.finalizeComandaPayment({
  paymentMethod: 'pix'
});

transactions.registerCashMovement({
  type: 'sangria',
  amount: 30,
  description: 'Retirada'
});

const localSales = transactions.getTransactions().filter((item) => item.type === 'venda' && item.status !== 'cancelada');
const localCommands = transactions.getClosedComandas().filter((item) => item.status !== 'cancelada');
const remote = {
  sales: localSales.map((sale) => ({
    id: sale.id,
    status: sale.status,
    total: sale.total,
    paymentMethod: sale.paymentMethod
  })),
  commands: localCommands.map((command) => ({
    id: command.id,
    status: command.status,
    total: command.total,
    paymentMethod: command.paymentMethod
  })),
  saleItems: localSales.flatMap((sale) => sale.items.map((item) => ({
    saleId: sale.id,
    productId: item.productId,
    quantity: item.quantity,
    total: item.total
  })))
};

const healthy = reconciliation.reconcileOperations({ period: 'today', remote });
assert(healthy.ok, `consistent operation should reconcile: ${JSON.stringify(healthy.issues)}`);
assert(healthy.totals.sales === 22, 'reconciliation should total cash and Pix sales');
assert(healthy.totals.payments.dinheiro === 16, 'cash payment total should reconcile');
assert(healthy.totals.payments.pix === 6, 'Pix payment total should reconcile');
assert(healthy.totals.expectedCash === 86, 'cash should include opening, cash sale and withdrawal');
assert(healthy.totals.soldUnits === 2, 'sold quantity should reconcile from sale items');

const crmSummary = crm.getCrmSummary(crm.createPeriodFilter());
assert(crmSummary.outputsTotal === 30, 'CRM should include sangria as cash outflow');
assert(crmSummary.estimatedProfit === 92, 'CRM net total should include sales, opening and sangria');

const pixOnly = reconciliation.reconcileOperations({ period: 'today', paymentMethod: 'pix' });
assert(pixOnly.ok, 'payment-method filter should remain internally consistent');
assert(pixOnly.totals.sales === 6 && pixOnly.totals.salesCount === 1, 'Pix filter should isolate one sale');

const burgerOnly = reconciliation.reconcileOperations({ period: 'today', productId: burger.id });
assert(burgerOnly.ok, 'product filter should remain internally consistent');
assert(burgerOnly.totals.sales === 16 && burgerOnly.totals.soldUnits === 1, 'product filter should isolate burger totals');

const corruptedCommands = transactions.getClosedComandas().map((command, index) => (
  index === 0 ? { ...command, total: command.total + 1 } : command
));
storage.setItem(schema.STORAGE_KEYS.closedComandas, corruptedCommands);
const corrupted = reconciliation.reconcileOperations({ period: 'today' });
assert(!corrupted.ok, 'local divergence should fail reconciliation');
assert(corrupted.issues.some((item) => item.code === 'sale_command_total'), 'command total mismatch should identify the affected sale');

storage.setItem(schema.STORAGE_KEYS.closedComandas, localCommands);
const remoteMissingSale = reconciliation.reconcileOperations({
  period: 'today',
  remote: { sales: remote.sales.slice(1), commands: remote.commands }
});
assert(!remoteMissingSale.ok, 'missing remote record should fail reconciliation');
assert(remoteMissingSale.issues.some((item) => item.code === 'remote_missing_sale'), 'missing remote sale should be reported');

console.log('Reconciliation service tests passed.');
