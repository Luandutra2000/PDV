import { STORAGE_KEYS } from '../database/schema.js?v=20260804-03';
import { getItem, setItem } from './storage.service.js?v=20260804-03';

export const ELECTRONIC_PAYMENT_METHODS = Object.freeze(['pix', 'debito', 'credito']);
export const PAYMENT_STATUSES = Object.freeze({
  pending: 'pendente',
  approved: 'aprovado',
  declined: 'recusado',
  canceled: 'cancelado'
});

export function getPaymentAttempts() {
  return getItem(STORAGE_KEYS.paymentAttempts, []);
}

export function getPaymentAttempt(attemptId) {
  return getPaymentAttempts().find((attempt) => attempt.id === attemptId) || null;
}

export function createPaymentAttempt({ idempotencyKey, paymentMethod, amount }) {
  const key = String(idempotencyKey || '').trim();
  const method = String(paymentMethod || '').trim();
  const normalizedAmount = normalizeAmount(amount);

  if (!key) {
    throw new Error('Chave de idempotencia do pagamento obrigatoria.');
  }

  if (!ELECTRONIC_PAYMENT_METHODS.includes(method)) {
    throw new Error('Forma de pagamento eletronico invalida.');
  }

  if (normalizedAmount <= 0) {
    throw new Error('Valor do pagamento precisa ser maior que zero.');
  }

  const existing = getPaymentAttempts().find((attempt) => attempt.idempotencyKey === key);
  if (existing) {
    if (existing.paymentMethod !== method || existing.amount !== normalizedAmount) {
      throw new Error('Chave de idempotencia ja usada em outro pagamento.');
    }
    return existing;
  }

  const now = new Date().toISOString();
  const attempt = {
    id: createId('payment'),
    idempotencyKey: key,
    paymentMethod: method,
    amount: normalizedAmount,
    status: PAYMENT_STATUSES.pending,
    providerTransactionId: '',
    providerStatus: '',
    createdAt: now,
    updatedAt: now
  };
  setItem(STORAGE_KEYS.paymentAttempts, [...getPaymentAttempts(), attempt]);
  return attempt;
}

export async function authorizePayment(input, authorize) {
  if (typeof authorize !== 'function') {
    throw new Error('Provedor de pagamento nao configurado.');
  }

  const attempt = createPaymentAttempt(input);
  if (attempt.status !== PAYMENT_STATUSES.pending) {
    return attempt;
  }

  try {
    const result = await authorize({
      idempotencyKey: attempt.idempotencyKey,
      paymentMethod: attempt.paymentMethod,
      amount: attempt.amount
    });
    return applyProviderResult(attempt.id, result);
  } catch (error) {
    // A tentativa permanece pendente: o provedor pode ter aprovado antes da
    // conexao cair. Uma nova autorizacao seria risco de cobranca duplicada.
    throw new Error(`Pagamento pendente de conciliacao: ${error?.message || 'falha de comunicacao'}`);
  }
}

export async function reconcilePayment(attemptId, lookup) {
  const attempt = requireAttempt(attemptId);
  if (attempt.status !== PAYMENT_STATUSES.pending) {
    return attempt;
  }
  if (typeof lookup !== 'function') {
    throw new Error('Consulta ao provedor de pagamento nao configurada.');
  }

  const result = await lookup({
    idempotencyKey: attempt.idempotencyKey,
    providerTransactionId: attempt.providerTransactionId
  });
  return applyProviderResult(attempt.id, result);
}

export function registerPaymentResult(attemptId, result) {
  return applyProviderResult(attemptId, result);
}

export function requireApprovedPayment({ attemptId, paymentMethod, amount }) {
  const attempt = requireAttempt(attemptId);
  if (attempt.status !== PAYMENT_STATUSES.approved) {
    throw new Error('Pagamento eletronico ainda nao aprovado.');
  }
  if (attempt.paymentMethod !== paymentMethod || attempt.amount !== normalizeAmount(amount)) {
    throw new Error('A aprovacao nao corresponde ao valor e forma desta venda.');
  }
  return attempt;
}

function applyProviderResult(attemptId, result = {}) {
  const attempt = requireAttempt(attemptId);
  const status = normalizeProviderStatus(result.status);
  const updated = {
    ...attempt,
    status,
    providerTransactionId: String(result.providerTransactionId || attempt.providerTransactionId || ''),
    providerStatus: String(result.providerStatus || result.status || ''),
    updatedAt: new Date().toISOString()
  };
  setItem(
    STORAGE_KEYS.paymentAttempts,
    getPaymentAttempts().map((candidate) => candidate.id === attemptId ? updated : candidate)
  );
  return updated;
}

function normalizeProviderStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (['approved', 'aprovado', 'paid'].includes(normalized)) {
    return PAYMENT_STATUSES.approved;
  }
  if (['declined', 'recusado', 'rejected'].includes(normalized)) {
    return PAYMENT_STATUSES.declined;
  }
  if (['canceled', 'cancelled', 'cancelado'].includes(normalized)) {
    return PAYMENT_STATUSES.canceled;
  }
  return PAYMENT_STATUSES.pending;
}

function requireAttempt(attemptId) {
  const attempt = getPaymentAttempt(String(attemptId || ''));
  if (!attempt) {
    throw new Error('Tentativa de pagamento nao encontrada.');
  }
  return attempt;
}

function normalizeAmount(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
