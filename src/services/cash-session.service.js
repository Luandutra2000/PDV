import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js?v=20260804-06';
import { getCurrentUser } from './auth.service.js?v=20261109-01';
import { emit } from './event-bus.service.js?v=20260804-06';
import { getItem, setItem } from './storage.service.js?v=20261109-01';
import { isSupabaseEnabled } from './app-config.service.js?v=20260804-06';
import { getSupabaseClient } from './supabase-client.service.js?v=20260804-06';

// A sessao de caixa (troco inicial) tambem vai para o servidor, para que o
// App do dono e outros aparelhos vejam o troco. Falha de envio nao bloqueia
// o caixa: a sessao local continua valendo e e reenviada no proximo evento.
function toSessionRow(session) {
  return {
    id: session.id,
    status: session.status,
    initial_amount: Number(session.openingAmount) || 0,
    current_amount: Number(session.openingAmount) || 0,
    opened_by: session.openedBy || null,
    opened_at: session.openedAt,
    closed_at: session.closedAt || null
  };
}

function fromSessionRow(row) {
  const openedAt = row.opened_at;
  return {
    id: row.id,
    date: getLocalDateKey(new Date(openedAt)),
    status: row.status === 'fechado' ? 'fechado' : 'aberto',
    openingAmount: Number(row.initial_amount) || 0,
    openedAt,
    openedBy: row.opened_by || '',
    openedByName: '',
    closedAt: row.closed_at || undefined
  };
}

export async function syncCashSessionToServer(session = getItem(STORAGE_KEYS.cashSession, null)) {
  if (!session?.id || !isSupabaseEnabled()) return false;
  try {
    const client = await getSupabaseClient();
    const { error } = await client.from('cash_sessions').upsert([toSessionRow(session)]);
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Sessao de caixa nao enviada ao servidor.', error);
    return false;
  }
}

// Adota a sessao do dia vinda do servidor quando o aparelho nao tem uma, ou
// quando a mesma sessao foi fechada em outro aparelho.
export async function hydrateCashSessionFromServer() {
  if (!isSupabaseEnabled()) return getCashSession();
  try {
    const client = await getSupabaseClient();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const { data, error } = await client.from('cash_sessions').select('*')
      .gte('opened_at', start.toISOString()).lt('opened_at', end.toISOString())
      .order('opened_at', { ascending: false }).limit(1);
    if (error) throw error;
    const remote = Array.isArray(data) && data[0] ? fromSessionRow(data[0]) : null;
    const local = getCashSession();
    const adopt = remote && (
      !local
      || (remote.id !== local.id && Date.parse(remote.openedAt) > Date.parse(local.openedAt))
      || (remote.id === local.id && remote.status === 'fechado' && local.status === 'aberto')
    );
    if (adopt) {
      setItem(STORAGE_KEYS.cashSession, { ...(local?.id === remote.id ? local : {}), ...remote });
      emit(UI_EVENTS.cashSessionChanged, getCashSession());
    } else if (local && !remote) {
      syncCashSessionToServer(local);
    }
  } catch (error) {
    console.warn('Nao foi possivel ler a sessao de caixa do servidor.', error);
  }
  return getCashSession();
}

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
    throw new Error('Abra o caixa do dia antes de registrar vendas ou movimentos de dinheiro.');
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
  // O fechamento do mesmo dia e cumulativo: ao reabrir, o troco da abertura
  // anterior continua na gaveta e o valor informado e apenas o troco adicional.
  const previous = getCashSession();
  const previousOpening = previous?.status === 'fechado' ? Number(previous.openingAmount || 0) : 0;
  const session = {
    id: `cash-session-${getLocalDateKey()}-${crypto.randomUUID()}`,
    date: getLocalDateKey(),
    status: 'aberto',
    openingAmount: Math.round((previousOpening + amount) * 100) / 100,
    ...(previous?.status === 'fechado' ? { previousClosingId: previous.closingId || '', reopenedFrom: previous.id } : {}),
    openedAt: now,
    openedBy: user?.id || '',
    openedByName: user?.name || 'Sistema'
  };
  setItem(STORAGE_KEYS.cashSession, session);
  emit(UI_EVENTS.cashSessionChanged, session);
  syncCashSessionToServer(session);
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
  syncCashSessionToServer(closed);
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
