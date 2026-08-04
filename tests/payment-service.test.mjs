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

const payments = await import('../src/services/payment.service.js?v=20260804-04');

let authorizationCalls = 0;
const approved = await payments.authorizePayment({
  idempotencyKey: 'sale-1-pix',
  paymentMethod: 'pix',
  amount: 32
}, async () => {
  authorizationCalls += 1;
  return { status: 'approved', providerTransactionId: 'provider-123' };
});

assert(approved.status === payments.PAYMENT_STATUSES.approved, 'provider approval should be persisted');
assert(approved.providerTransactionId === 'provider-123', 'provider transaction id should be persisted');

const replay = await payments.authorizePayment({
  idempotencyKey: 'sale-1-pix',
  paymentMethod: 'pix',
  amount: 32
}, async () => {
  authorizationCalls += 1;
  return { status: 'approved' };
});

assert(replay.id === approved.id, 'same idempotency key should return the original attempt');
assert(authorizationCalls === 1, 'approved payment must not be charged again');

let mismatchRejected = false;
try {
  payments.createPaymentAttempt({
    idempotencyKey: 'sale-1-pix',
    paymentMethod: 'pix',
    amount: 33
  });
} catch (error) {
  mismatchRejected = error.message.includes('ja usada');
}
assert(mismatchRejected, 'same key with another amount should be rejected');

let uncertainAttemptId = '';
try {
  await payments.authorizePayment({
    idempotencyKey: 'sale-2-credit',
    paymentMethod: 'credito',
    amount: 50
  }, async () => {
    throw new Error('conexao perdida depois da autorizacao');
  });
} catch (error) {
  assert(error.message.includes('conciliacao'), 'network failure should require reconciliation');
  uncertainAttemptId = payments.getPaymentAttempts()
    .find((attempt) => attempt.idempotencyKey === 'sale-2-credit')?.id;
}

assert(Boolean(uncertainAttemptId), 'attempt must exist before provider authorization');
assert(
  payments.getPaymentAttempt(uncertainAttemptId).status === payments.PAYMENT_STATUSES.pending,
  'uncertain provider result must stay pending'
);

let lookupCalls = 0;
const reconciled = await payments.reconcilePayment(uncertainAttemptId, async ({ idempotencyKey }) => {
  lookupCalls += 1;
  assert(idempotencyKey === 'sale-2-credit', 'reconciliation should use original idempotency key');
  return { status: 'paid', providerTransactionId: 'provider-456' };
});

assert(reconciled.status === payments.PAYMENT_STATUSES.approved, 'provider lookup should reconcile approval');
await payments.reconcilePayment(uncertainAttemptId, async () => {
  lookupCalls += 1;
  return { status: 'paid' };
});
assert(lookupCalls === 1, 'approved reconciliation must not query provider again');

console.log('Payment service tests passed.');
