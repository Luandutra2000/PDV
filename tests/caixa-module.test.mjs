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

const { buildCrmClosingInput, buildDifferences } = await import('../src/modules/caixa/caixa.module.js?v=20260804-01');

const differences = buildDifferences({
  payments: {
    cashDifference: 0,
    pixDifference: -2,
    debitDifference: 3,
    creditDifference: 4
  },
  showcase: []
});

assert(differences.some((difference) => difference.key === 'payment:pix' && difference.amount === -2), 'pix difference should require a reason when checked and non-zero');
assert(differences.some((difference) => difference.key === 'payment:debito' && difference.amount === 3), 'debit difference should require a reason when checked and non-zero');
assert(differences.some((difference) => difference.key === 'payment:credito' && difference.amount === 4), 'credit difference should require a reason when checked and non-zero');

const uncheckedDifferences = buildDifferences({
  payments: {
    cashDifference: 0,
    pixDifference: null,
    debitDifference: 0,
    creditDifference: null
  },
  showcase: []
});

assert(!uncheckedDifferences.some((difference) => difference.referenceId === 'pix'), 'unchecked pix should not require a reason');
assert(!uncheckedDifferences.some((difference) => difference.referenceId === 'debito'), 'zero debit difference should not require a reason');
assert(!uncheckedDifferences.some((difference) => difference.referenceId === 'credito'), 'unchecked credit should not require a reason');

const closingInput = buildCrmClosingInput({
  entriesTotal: 10.01,
  outputsTotal: 469.21,
  paymentTotals: {
    dinheiro: 7.35,
    pix: 42.35,
    debito: 130.35,
    credito: 65.35
  }
}, { countedCash: '-451.85' });

assert(closingInput.expectedCash === -451.85, 'CRM closing should use the same cash total displayed by the report');
assert(closingInput.expectedPix === 42.35, 'CRM closing should use the displayed Pix total');

console.log('caixa module ok');
