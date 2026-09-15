import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js?v=20260804-06';
import { getCurrentUser } from './auth.service.js?v=20260804-06';
import { emit } from './event-bus.service.js?v=20260804-06';
import { getItem, setItem } from './storage.service.js?v=20260804-06';

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCashSession() {
  const session = getItem(STORAGE_KEYS.cashSession, null);
  return session?.date === getLocalDateKey() ? session : null;
}

export function isCashSessionOpen() {
  return getCashSession()?.status === 'aberto';
}

export function assertCashSessionOpen() {
  if (!isCashSessionOpen()) {
    throw new Error('Abra o caixa do dia antes de registrar vendas.');
  }
}

export function openCashSession({ openingAmount = 0 } = {}) {
  const amount = Number(openingAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('O dinheiro inicial precisa ser zero ou maior.');
  }
  if (isCashSessionOpen()) {
    return getCashSession();
  }

  const user = getCurrentUser();
  const now = new Date().toISOString();
  const session = {
    id: `cash-session-${getLocalDateKey()}-${crypto.randomUUID()}`,
    date: getLocalDateKey(),
    status: 'aberto',
    openingAmount: Math.round(amount * 100) / 100,
    openedAt: now,
    openedBy: user?.id || '',
    openedByName: user?.name || 'Sistema'
  };
  setItem(STORAGE_KEYS.cashSession, session);
  emit(UI_EVENTS.cashSessionChanged, session);
  return session;
}

export function closeCashSession({ closingId = '', closedAt = new Date().toISOString() } = {}) {
  const session = getCashSession();
  if (!session) {
    return null;
  }
  const closed = { ...session, status: 'fechado', closingId, closedAt };
  setItem(STORAGE_KEYS.cashSession, closed);
  emit(UI_EVENTS.cashSessionChanged, closed);
  return closed;
}

export function getCashSessionStatus() {
  const session = getCashSession();
  return {
    open: session?.status === 'aberto',
    session,
    label: session?.status === 'aberto' ? 'Caixa aberto' : 'Caixa fechado'
  };
}
