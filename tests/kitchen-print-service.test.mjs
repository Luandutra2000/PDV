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

const storage = await import('../src/services/storage.service.js?v=20260804-05');
const schema = await import('../src/database/schema.js?v=20260804-05');
const products = await import('../src/services/product.service.js?v=20260804-05');
const comandas = await import('../src/services/comanda.service.js?v=20260804-05');
const transactions = await import('../src/services/transaction.service.js?v=20260804-05');
const kitchen = await import('../src/services/kitchen-print.service.js?v=20260804-05');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-05');

storage.resetAppData();
seedTestAdmin(storage, schema.STORAGE_KEYS);
comandas.clearComanda();
comandas.addItem(products.getProductById('x-burger'));

const sale = transactions.finalizeComandaPayment({
  paymentMethod: 'dinheiro',
  receivedAmount: 20
});

assert(kitchen.getKitchenOrders().length === 0, 'sale should not send an order to kitchen automatically');
kitchen.enqueueConfirmedSale(sale);
const originalOrder = kitchen.getKitchenOrders()[0];
const originalJob = kitchen.getPrintJobs()[0];
assert(kitchen.getKitchenOrders().length === 1, 'confirmed sale should create one kitchen order');
assert(originalOrder.saleId === sale.id, 'kitchen order should reference sale');
assert(originalOrder.status === kitchen.KITCHEN_STATUSES.pending, 'new kitchen order should be pending');
assert(kitchen.getPrintJobs().length === 1, 'confirmed sale should create one print job');
assert(originalJob.copyType === 'original', 'automatic print should be marked original');

kitchen.enqueueConfirmedSale(sale);
assert(kitchen.getKitchenOrders().length === 1, 'repeated sale event must not duplicate kitchen order');
assert(kitchen.getPrintJobs().length === 1, 'repeated sale event must not duplicate automatic print');

let printerCalls = 0;
try {
  await kitchen.processPrintJob(originalJob.id, async () => {
    printerCalls += 1;
    throw new Error('sem papel');
  });
} catch (error) {
  assert(error.message === 'sem papel', 'printer error should be exposed');
}
assert(kitchen.getPrintJobs()[0].status === kitchen.PRINT_STATUSES.failed, 'failed print should remain queued');
assert(kitchen.getPrintJobs()[0].lastError === 'sem papel', 'failed print should preserve diagnostic');

const printed = await kitchen.processPrintJob(originalJob.id, async (ticket) => {
  printerCalls += 1;
  assert(ticket.comandaNumber === sale.comandaNumber, 'retry should preserve original ticket');
  return { printerReference: 'printer-001' };
});
assert(printed.status === kitchen.PRINT_STATUSES.printed, 'successful retry should mark job printed');
assert(printed.attempts === 2, 'print attempts should include failure and retry');

await kitchen.processPrintJob(originalJob.id, async () => {
  printerCalls += 1;
});
assert(printerCalls === 2, 'printed job must not print automatically again');

const preparing = kitchen.updateKitchenOrderStatus(originalOrder.id, kitchen.KITCHEN_STATUSES.preparing);
const ready = kitchen.updateKitchenOrderStatus(originalOrder.id, kitchen.KITCHEN_STATUSES.ready);
assert(preparing.history.length === 2, 'state transition should append history');
assert(ready.history.length === 3, 'kitchen history should retain every transition');

const reprint = kitchen.requestReprint(originalOrder.id, { reason: 'Papel cortou incompleto' });
assert(reprint.copyType === 'reimpressao', 'manual copy should be identified as reprint');
assert(reprint.payload.copyLabel === 'REIMPRESSAO', 'reprint ticket should have a visible label');
assert(reprint.reason === 'Papel cortou incompleto', 'reprint should preserve reason');

transactions.cancelTransaction(sale.id, { reason: 'Cliente cancelou' });
transactions.cancelTransaction(sale.id, { reason: 'Cliente cancelou' });
assert(
  kitchen.getKitchenOrders().filter((order) => order.eventType === 'cancelamento').length === 0,
  'sale cancellation should not notify kitchen automatically'
);
kitchen.enqueueSaleCancellation(sale, 'Cliente cancelou');
kitchen.enqueueSaleCancellation(sale, 'Cliente cancelou');
const cancellationOrders = kitchen.getKitchenOrders().filter((order) => order.eventType === 'cancelamento');
const cancellationJobs = kitchen.getPrintJobs().filter((job) => job.documentType === 'cancelamento');
assert(cancellationOrders.length === 1, 'repeated cancellation must create one kitchen alert');
assert(cancellationOrders[0].reason === 'Cliente cancelou', 'cancellation should be highlighted with reason');
assert(cancellationJobs.length === 1, 'repeated cancellation must create one cancellation print');
assert(kitchen.getKitchenOrders().some((order) => order.eventType === 'pedido'), 'cancellation must not erase original history');

console.log('Kitchen and print service tests passed.');
