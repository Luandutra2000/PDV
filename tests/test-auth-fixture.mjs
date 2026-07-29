export function seedTestAdmin(storage, storageKeys) {
  const now = new Date().toISOString();
  storage.setItem(storageKeys.users, [{
    id: 'user-admin',
    name: 'Administrador',
    username: 'admin',
    role: 'admin',
    active: true,
    createdAt: now,
    updatedAt: now
  }]);
  storage.setItem(storageKeys.currentSession, {
    userId: 'user-admin',
    startedAt: now
  });
}

export function setTestUserSession(storage, storageKeys, user) {
  const users = storage.getItem(storageKeys.users, []);
  const safeUser = { ...user };
  delete safeUser.password;
  storage.setItem(
    storageKeys.users,
    users.some((candidate) => candidate.id === safeUser.id)
      ? users.map((candidate) => (candidate.id === safeUser.id ? safeUser : candidate))
      : [...users, safeUser]
  );
  storage.setItem(storageKeys.currentSession, {
    userId: safeUser.id,
    startedAt: new Date().toISOString()
  });
}

let paymentSequence = 0;

export function approveTestPayment(payments, comandas, paymentMethod = 'pix') {
  paymentSequence += 1;
  const amount = comandas.getSubtotal(comandas.getActiveComanda());
  const attempt = payments.createPaymentAttempt({
    idempotencyKey: `test-payment-${paymentSequence}`,
    paymentMethod,
    amount
  });
  return payments.registerPaymentResult(attempt.id, {
    status: 'approved',
    providerTransactionId: `test-provider-${paymentSequence}`
  });
}
