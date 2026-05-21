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

const storage = await import('../src/services/storage.service.js');
const products = await import('../src/services/product.service.js');
const comandas = await import('../src/services/comanda.service.js');
const transactions = await import('../src/services/transaction.service.js');
const estoque = await import('../src/services/estoque.service.js');
const closing = await import('../src/services/cash-closing.service.js');

storage.ensureSeedData();

const burger = products.getProductById('x-burger');
const soda = products.getProductById('refrigerante-lata');

estoque.createStockLaunch({ produtoId: burger.id, quantidade: 10 });
estoque.createStockLaunch({ produtoId: soda.id, quantidade: 5 });

comandas.clearComanda();
comandas.addItem(burger);
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 40 });

comandas.addItem(soda);
transactions.finalizeComandaPayment({ paymentMethod: 'pix' });

transactions.registerCashMovement({
  type: 'entrada',
  amount: 20,
  description: 'Reforco'
});

transactions.registerCashMovement({
  type: 'saida',
  amount: 5,
  description: 'Compra pequena'
});

estoque.createShowcaseWriteOff({
  productId: burger.id,
  quantity: 1,
  reason: 'consumo-interno'
});

const summary = closing.buildClosingSummary({
  countedCash: 45,
  checkedPix: ''
});

assert(summary.payments.expectedCash === 47, 'expected cash should include cash sales plus entries minus outputs');
assert(summary.payments.countedCash === 45, 'counted cash should come from input');
assert(summary.payments.cashDifference === -2, 'cash difference should compare counted and expected cash');
assert(summary.payments.expectedPix === 6, 'expected pix should include pix sales');
assert(summary.payments.checkedPix === null, 'blank pix check should be null');
assert(summary.payments.generalDifference === -2, 'general difference should use expected values for unchecked optional methods');

const burgerRow = summary.showcase.find((item) => item.productId === burger.id);
assert(burgerRow.producedQuantity === 10, 'showcase should include produced quantity');
assert(burgerRow.soldQuantity === 2, 'showcase should include sold quantity');
assert(burgerRow.writeOffQuantity === 1, 'showcase should include write-off quantity');
assert(burgerRow.expectedLeftoverQuantity === 7, 'showcase should calculate expected leftover');

const draft = closing.saveClosingDraft({
  countedCash: 45,
  leftovers: {
    [burger.id]: 7,
    [soda.id]: 4
  },
  differences: [
    {
      scope: 'payment',
      referenceId: 'dinheiro',
      reason: 'erro-caixa',
      note: 'Faltou dinheiro',
      amount: -2
    }
  ]
});
assert(draft.status === 'rascunho', 'draft should be saved as draft');

const confirmed = closing.confirmClosing(draft);
assert(confirmed.status === 'fechado', 'confirmed closing should be closed');
assert(closing.getCashClosings().length === 1, 'closing history should include confirmed closing');

await new Promise((resolve) => setTimeout(resolve, 5));
comandas.addItem(burger);
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 20 });

const afterClosing = closing.getSalesAfterClosing(confirmed);
assert(afterClosing.length === 1, 'sales after closing should be listed separately');
assert(closing.getCashClosings()[0].totals.sales === confirmed.totals.sales, 'confirmed closing totals should not change after later sale');

console.log('cash closing service ok');
