import { STORAGE_KEYS } from '../database/schema.js';
import { isSupabaseEnabled } from './app-config.service.js';
import { getItem, setItem } from './storage.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import {
  mapCashClosingToSupabase,
  mapCashMovementToSupabase,
  mapSaleToSupabase
} from './providers/supabase.provider.js';

// Persistent outbox: every sale, cash movement and closing is first saved on the
// device and then sent to Supabase. Items leave the outbox only after the server
// accepted them, and every write is idempotent (fixed ids), so retrying is safe.
const RETRY_INTERVAL_MS = 30_000;

const MAPPERS = {
  sale: (sale) => mapSaleToSupabase(sale),
  cashMovement: (movement) => mapCashMovementToSupabase(movement),
  cashClosing: (closing) => mapCashClosingToSupabase(closing),
  saleStatus: (change) => mapStatusChange(change),
  movementStatus: (change) => mapStatusChange(change)
};

const HANDLERS = {
  async sale(client, { sale, items }) {
    await insertIgnoringDuplicates(client, 'sales', sale);

    if (items.length) {
      await insertIgnoringDuplicates(client, 'sale_items', items);
    }
  },
  cashMovement: (client, row) => insertIgnoringDuplicates(client, 'cash_movements', row),
  cashClosing: (client, row) => insertIgnoringDuplicates(client, 'cash_closings', row),
  saleStatus: (client, change) => updateStatus(client, 'sales', change),
  movementStatus: (client, change) => updateStatus(client, 'cash_movements', change)
};

const listeners = new Set();
let clientForTests = null;
let flushing = null;
let started = false;

export function setRemoteOutboxClientForTests(client) {
  clientForTests = client;
}

export function isRemoteSyncEnabled() {
  return Boolean(clientForTests) || isSupabaseEnabled();
}

export function enqueueRemote(kind, record) {
  if (!isRemoteSyncEnabled()) {
    return null;
  }

  const mapper = MAPPERS[kind];

  if (!mapper) {
    throw new Error(`Tipo de envio desconhecido: ${kind}`);
  }

  const item = {
    id: createId(kind),
    kind,
    data: mapper(record),
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString()
  };

  saveOutbox([...getRemoteOutbox(), item]);
  scheduleFlush();
  return item;
}

export function getRemoteOutbox() {
  const outbox = getItem(STORAGE_KEYS.remoteOutbox, []);
  return Array.isArray(outbox) ? outbox : [];
}

export function getRemoteOutboxStatus() {
  const outbox = getRemoteOutbox();
  const failing = outbox.filter((item) => item.lastError);

  return {
    enabled: isRemoteSyncEnabled(),
    pending: outbox.length,
    failing: failing.length,
    lastError: failing.at(-1)?.lastError || null,
    flushing: Boolean(flushing)
  };
}

export function onRemoteOutboxChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startRemoteOutbox() {
  if (started || !isRemoteSyncEnabled()) {
    return;
  }

  started = true;
  globalThis.addEventListener?.('online', scheduleFlush);
  setInterval(scheduleFlush, RETRY_INTERVAL_MS);
  scheduleFlush();
}

export function flushRemoteOutbox() {
  if (!flushing) {
    flushing = runFlush().finally(() => {
      flushing = null;
      notify();
    });
    notify();
  }

  return flushing;
}

async function runFlush() {
  if (!isRemoteSyncEnabled() || !getRemoteOutbox().length) {
    return getRemoteOutboxStatus();
  }

  const client = clientForTests || await getSupabaseClient();

  for (const item of getRemoteOutbox()) {
    try {
      await HANDLERS[item.kind](client, item.data);
      removeFromOutbox(item.id);
    } catch (error) {
      markFailure(item.id, error);

      if (isNetworkError(error)) {
        break;
      }
    }
  }

  return getRemoteOutboxStatus();
}

function scheduleFlush() {
  flushRemoteOutbox().catch((error) => {
    console.error('Falha ao enviar dados para o servidor.', error);
  });
}

async function insertIgnoringDuplicates(client, table, rows) {
  const { error } = await client.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    throw toError(error);
  }
}

async function updateStatus(client, table, { id, status, canceled_at: canceledAt }) {
  const { data, error } = await client
    .from(table)
    .update({ status, canceled_at: canceledAt })
    .eq('id', id)
    .select('id');

  if (error) {
    throw toError(error);
  }

  if (!data?.length) {
    throw new Error('Registro ainda nao enviado ou sem permissao para alterar.');
  }
}

function mapStatusChange({ id, status, canceledAt }) {
  return { id, status, canceled_at: canceledAt || null };
}

function removeFromOutbox(itemId) {
  saveOutbox(getRemoteOutbox().filter((item) => item.id !== itemId));
}

function markFailure(itemId, error) {
  saveOutbox(getRemoteOutbox().map((item) => (
    item.id === itemId
      ? {
        ...item,
        attempts: (item.attempts || 0) + 1,
        lastError: String(error?.message || error),
        lastAttemptAt: new Date().toISOString()
      }
      : item
  )));
}

function saveOutbox(outbox) {
  setItem(STORAGE_KEYS.remoteOutbox, outbox);
  notify();
}

function notify() {
  const status = getRemoteOutboxStatus();
  listeners.forEach((listener) => listener(status));
}

function toError(error) {
  const wrapped = new Error(error.message || 'Falha ao enviar para o servidor.');
  wrapped.code = error.code;
  return wrapped;
}

function isNetworkError(error) {
  return /fetch|network|failed to load|timeout|offline/i.test(String(error?.message || ''));
}

function createId(prefix) {
  const randomValue = globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
  return `outbox-${prefix}-${Date.now()}-${randomValue}`;
}
