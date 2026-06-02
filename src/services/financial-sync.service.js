import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js';
import { emit } from './event-bus.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { saleAdapter } from './repositories/sale.adapter.js';
import { saleItemAdapter } from './repositories/sale-item.adapter.js';
import { cashMovementAdapter } from './repositories/cash-movement.adapter.js';
import { commandAdapter } from './repositories/command.adapter.js';
import { commandItemAdapter } from './repositories/command-item.adapter.js';
import { cashClosingAdapter } from './repositories/cash-closing.adapter.js';

const FINANCIAL_TABLES = [
  commandAdapter.table,
  commandItemAdapter.table,
  saleAdapter.table,
  saleItemAdapter.table,
  cashMovementAdapter.table,
  cashClosingAdapter.table
];

let getClientOverride = null;
let realtimeChannel = null;
let realtimePromise = null;
let status = createStatus('idle', readQueue().length);

export function configureFinancialSyncForTests({ getClient } = {}) {
  getClientOverride = typeof getClient === 'function' ? getClient : null;
  status = createStatus('idle', readQueue().length);
  realtimeChannel = null;
  realtimePromise = null;
}

export function getFinancialSyncStatus() {
  const pending = readQueue().length;

  return {
    ...status,
    state: pending > 0 ? 'pending' : status.state,
    pending
  };
}

export async function hydrateFinancialData() {
  try {
    setStatus({ state: 'syncing', error: '' });
    const client = await getClient();
    const [
      saleRows,
      saleItemRows,
      movementRows,
      commandRows,
      commandItemRows,
      closingRows
    ] = await Promise.all([
      selectRows(client, saleAdapter),
      selectRows(client, saleItemAdapter),
      selectRows(client, cashMovementAdapter),
      selectRows(client, commandAdapter),
      selectRows(client, commandItemAdapter),
      selectRows(client, cashClosingAdapter)
    ]);

    const sales = saleRows.map((row) => ({
      ...saleAdapter.fromRow(row),
      items: saleItemAdapter.fromRows(saleItemRows, row.id)
    }));
    const movements = movementRows.map(cashMovementAdapter.fromRow);
    const commands = commandRows.map((row) => ({
      ...commandAdapter.fromRow(row),
      items: commandItemAdapter.fromRows(commandItemRows, row.id)
    }));
    const closings = closingRows.map(cashClosingAdapter.fromRow);

    writeFinancialCaches({
      transactions: applyQueueToTransactions([...sales, ...movements]),
      commands: applyQueueToCommands(commands),
      closings: applyQueueToClosings(closings)
    });
    setStatusFromQueue(readQueue());

    return {
      transactions: readJson(STORAGE_KEYS.transactions, []),
      closedComandas: readJson(STORAGE_KEYS.closedComandas, []),
      cashClosings: readJson(STORAGE_KEYS.cashClosings, [])
    };
  } catch (error) {
    setStatus({
      state: readJson(STORAGE_KEYS.transactions, []).length ? 'cache' : 'error',
      pending: readQueue().length,
      error: error.message || 'Erro ao carregar dados financeiros.'
    });

    return {
      transactions: readJson(STORAGE_KEYS.transactions, []),
      closedComandas: readJson(STORAGE_KEYS.closedComandas, []),
      cashClosings: readJson(STORAGE_KEYS.cashClosings, [])
    };
  }
}

export async function saveSaleToSupabase({ sale, command }) {
  const nextSale = { ...sale };
  const nextCommand = { ...command };

  try {
    setStatus({ state: 'syncing', error: '' });
    await writeComposedSale(await getClient(), nextSale, nextCommand);
    upsertTransactionCache(nextSale);
    upsertCommandCache(nextCommand);
    setStatusFromQueue(readQueue());
    return nextSale;
  } catch (error) {
    const queue = enqueueOperation({ action: 'saveSale', sale: nextSale, command: nextCommand });
    upsertTransactionCache({ ...nextSale, syncPending: true });
    upsertCommandCache({ ...nextCommand, syncPending: true });
    setPendingStatus(queue, error);
    return nextSale;
  }
}

export async function saveCashMovementToSupabase(movement) {
  const nextMovement = { ...movement };

  try {
    setStatus({ state: 'syncing', error: '' });
    const client = await getClient();
    await upsertRows(client, cashMovementAdapter.table, [cashMovementAdapter.toRow(nextMovement)]);
    upsertTransactionCache(nextMovement);
    setStatusFromQueue(readQueue());
    return nextMovement;
  } catch (error) {
    const queue = enqueueOperation({ action: 'saveCashMovement', movement: nextMovement });
    upsertTransactionCache({ ...nextMovement, syncPending: true });
    setPendingStatus(queue, error);
    return nextMovement;
  }
}

export async function saveCashClosingToSupabase(closing) {
  const nextClosing = { ...closing };

  try {
    setStatus({ state: 'syncing', error: '' });
    const client = await getClient();
    await upsertRows(client, cashClosingAdapter.table, [cashClosingAdapter.toRow(nextClosing)]);
    upsertClosingCache(nextClosing);
    setStatusFromQueue(readQueue());
    return nextClosing;
  } catch (error) {
    const queue = enqueueOperation({ action: 'saveCashClosing', closing: nextClosing });
    upsertClosingCache({ ...nextClosing, syncPending: true });
    setPendingStatus(queue, error);
    return nextClosing;
  }
}

export async function cancelSaleInSupabase({ saleId, comandaId, canceledAt }) {
  const nextCanceledAt = canceledAt || new Date().toISOString();

  try {
    setStatus({ state: 'syncing', error: '' });
    await writeSaleCancellation(await getClient(), { saleId, comandaId, canceledAt: nextCanceledAt });
    markSaleCanceledInCache({ saleId, comandaId, canceledAt: nextCanceledAt });
    setStatusFromQueue(readQueue());
  } catch (error) {
    const queue = enqueueOperation({
      action: 'cancelSale',
      saleId,
      comandaId,
      canceledAt: nextCanceledAt
    });
    markSaleCanceledInCache({ saleId, comandaId, canceledAt: nextCanceledAt, syncPending: true });
    setPendingStatus(queue, error);
  }
}

export async function cancelCashMovementInSupabase({ movementId, canceledAt }) {
  const nextCanceledAt = canceledAt || new Date().toISOString();

  try {
    setStatus({ state: 'syncing', error: '' });
    await writeMovementCancellation(await getClient(), { movementId, canceledAt: nextCanceledAt });
    markMovementCanceledInCache({ movementId, canceledAt: nextCanceledAt });
    setStatusFromQueue(readQueue());
  } catch (error) {
    const queue = enqueueOperation({
      action: 'cancelCashMovement',
      movementId,
      canceledAt: nextCanceledAt
    });
    markMovementCanceledInCache({ movementId, canceledAt: nextCanceledAt, syncPending: true });
    setPendingStatus(queue, error);
  }
}

export async function flushFinancialQueue() {
  const queue = readQueue();

  if (!queue.length) {
    setStatus({ state: 'synced', pending: 0, error: '' });
    return;
  }

  const remaining = [];

  try {
    const client = await getClient();

    for (const operation of queue) {
      try {
        await writeQueuedOperation(client, operation);
        applyCompletedOperationToCache(operation);
      } catch (error) {
        remaining.push(operation);
      }
    }
  } catch (error) {
    setPendingStatus(queue, error);
    return;
  }

  writeQueue(remaining);
  setStatusFromQueue(remaining, remaining.length ? 'Algumas alteracoes continuam pendentes.' : '');
}

export async function startFinancialRealtime() {
  if (realtimeChannel) {
    return realtimeChannel;
  }

  if (realtimePromise) {
    return realtimePromise;
  }

  realtimePromise = (async () => {
    try {
      const client = await getClient();
      const channel = client.channel('financial-changes');
      const onChange = async () => {
        await hydrateFinancialData();
      };

      FINANCIAL_TABLES.forEach((table) => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
      });

      realtimeChannel = channel.subscribe();
      return realtimeChannel;
    } catch (error) {
      setStatus({
        state: 'error',
        pending: readQueue().length,
        error: error.message || 'Realtime financeiro indisponivel.'
      });
      return null;
    } finally {
      realtimePromise = null;
    }
  })();

  return realtimePromise;
}

export async function stopFinancialRealtime() {
  const channel = realtimeChannel || (realtimePromise ? await realtimePromise : null);

  if (!channel) {
    realtimeChannel = null;
    return;
  }

  try {
    const client = await getClient();
    client.removeChannel(channel);
  } catch (error) {
    // Nothing else to do when the client is unavailable during cleanup.
  }

  realtimeChannel = null;
}

function getClient() {
  const getClientFn = getClientOverride || getSupabaseClient;
  return getClientFn();
}

async function writeComposedSale(client, sale, command) {
  await upsertRows(client, commandAdapter.table, [commandAdapter.toRow(command)]);
  await upsertRows(client, commandItemAdapter.table, commandItemAdapter.toRows(command));
  await upsertRows(client, saleAdapter.table, [saleAdapter.toRow(sale)]);
  await upsertRows(client, saleItemAdapter.table, saleItemAdapter.toRows(sale));
}

async function writeQueuedOperation(client, operation) {
  if (operation.action === 'saveSale') {
    await writeComposedSale(client, operation.sale, operation.command);
    return;
  }

  if (operation.action === 'saveCashMovement') {
    await upsertRows(client, cashMovementAdapter.table, [cashMovementAdapter.toRow(operation.movement)]);
    return;
  }

  if (operation.action === 'saveCashClosing') {
    await upsertRows(client, cashClosingAdapter.table, [cashClosingAdapter.toRow(operation.closing)]);
    return;
  }

  if (operation.action === 'cancelSale') {
    await writeSaleCancellation(client, operation);
    return;
  }

  if (operation.action === 'cancelCashMovement') {
    await writeMovementCancellation(client, operation);
  }
}

async function writeSaleCancellation(client, { saleId, comandaId, canceledAt }) {
  const patch = { status: 'cancelada', canceled_at: canceledAt };
  await updateById(client, saleAdapter.table, saleId, patch);

  if (comandaId) {
    await updateById(client, commandAdapter.table, comandaId, patch);
  }
}

async function writeMovementCancellation(client, { movementId, canceledAt }) {
  await updateById(client, cashMovementAdapter.table, movementId, {
    status: 'cancelada',
    canceled_at: canceledAt
  });
}

async function selectRows(client, adapter) {
  const { data, error } = await client.from(adapter.table).select(adapter.select || '*');

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function upsertRows(client, table, rows) {
  if (!rows.length) {
    return;
  }

  const { error } = await client.from(table).upsert(rows);

  if (error) {
    throw error;
  }
}

async function updateById(client, table, id, patch) {
  if (!id) {
    return;
  }

  const { error } = await client.from(table).update(patch).eq('id', id);

  if (error) {
    throw error;
  }
}

function applyCompletedOperationToCache(operation) {
  if (operation.action === 'saveSale') {
    upsertTransactionCache(operation.sale);
    upsertCommandCache(operation.command);
  }

  if (operation.action === 'saveCashMovement') {
    upsertTransactionCache(operation.movement);
  }

  if (operation.action === 'saveCashClosing') {
    upsertClosingCache(operation.closing);
  }

  if (operation.action === 'cancelSale') {
    markSaleCanceledInCache(operation);
  }

  if (operation.action === 'cancelCashMovement') {
    markMovementCanceledInCache(operation);
  }
}

function applyQueueToTransactions(transactions) {
  return readQueue().reduce((nextTransactions, operation) => {
    if (operation.action === 'saveSale') {
      return upsertInList(nextTransactions, { ...operation.sale, syncPending: true });
    }

    if (operation.action === 'saveCashMovement') {
      return upsertInList(nextTransactions, { ...operation.movement, syncPending: true });
    }

    if (operation.action === 'cancelSale') {
      return markSaleCanceled(nextTransactions, operation);
    }

    if (operation.action === 'cancelCashMovement') {
      return markMovementCanceled(nextTransactions, operation);
    }

    return nextTransactions;
  }, transactions);
}

function applyQueueToCommands(commands) {
  return readQueue().reduce((nextCommands, operation) => {
    if (operation.action === 'saveSale') {
      return upsertInList(nextCommands, { ...operation.command, syncPending: true });
    }

    if (operation.action === 'cancelSale') {
      return markCommandCanceled(nextCommands, operation);
    }

    return nextCommands;
  }, commands);
}

function applyQueueToClosings(closings) {
  return readQueue().reduce((nextClosings, operation) => {
    if (operation.action === 'saveCashClosing') {
      return upsertInList(nextClosings, { ...operation.closing, syncPending: true });
    }

    return nextClosings;
  }, closings);
}

function markSaleCanceledInCache(operation) {
  writeJson(STORAGE_KEYS.transactions, markSaleCanceled(readJson(STORAGE_KEYS.transactions, []), operation));
  writeJson(STORAGE_KEYS.closedComandas, markCommandCanceled(readJson(STORAGE_KEYS.closedComandas, []), operation));
  emitFinancialDataChanged(operation);
}

function markMovementCanceledInCache(operation) {
  writeJson(STORAGE_KEYS.transactions, markMovementCanceled(readJson(STORAGE_KEYS.transactions, []), operation));
  emitFinancialDataChanged(operation);
}

function markSaleCanceled(transactions, { saleId, canceledAt, syncPending = false }) {
  return transactions.map((transaction) => (
    transaction.id === saleId
      ? stripUndefined({ ...transaction, status: 'cancelada', canceledAt, syncPending: syncPending || undefined })
      : transaction
  ));
}

function markCommandCanceled(commands, { comandaId, canceledAt, syncPending = false }) {
  return commands.map((command) => (
    command.id === comandaId
      ? stripUndefined({ ...command, status: 'cancelada', canceledAt, syncPending: syncPending || undefined })
      : command
  ));
}

function markMovementCanceled(transactions, { movementId, canceledAt, syncPending = false }) {
  return transactions.map((transaction) => (
    transaction.id === movementId
      ? stripUndefined({ ...transaction, status: 'cancelada', canceledAt, syncPending: syncPending || undefined })
      : transaction
  ));
}

function writeFinancialCaches({ transactions, commands, closings }) {
  writeJson(STORAGE_KEYS.transactions, transactions);
  writeJson(STORAGE_KEYS.closedComandas, commands);
  writeJson(STORAGE_KEYS.cashClosings, closings);
  emitFinancialDataChanged({ type: 'hydrated' });
}

function upsertTransactionCache(item) {
  writeJson(STORAGE_KEYS.transactions, upsertInList(readJson(STORAGE_KEYS.transactions, []), item));
  emitFinancialDataChanged(item);
}

function upsertCommandCache(item) {
  writeJson(STORAGE_KEYS.closedComandas, upsertInList(readJson(STORAGE_KEYS.closedComandas, []), item));
  emitFinancialDataChanged(item);
}

function upsertClosingCache(item) {
  writeJson(STORAGE_KEYS.cashClosings, upsertInList(readJson(STORAGE_KEYS.cashClosings, []), item));
  emitFinancialDataChanged(item);
}

function upsertInList(items, item) {
  const exists = items.some((candidate) => candidate.id === item.id);

  return exists
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [...items, item];
}

function enqueueOperation(operation) {
  const queue = [
    ...readQueue(),
    {
      ...operation,
      createdAt: new Date().toISOString()
    }
  ];
  writeQueue(queue);
  return queue;
}

function readQueue() {
  return readJson(STORAGE_KEYS.financialSyncQueue, []);
}

function writeQueue(queue) {
  return writeJson(STORAGE_KEYS.financialSyncQueue, queue);
}

function readJson(key, fallback) {
  if (!globalThis.localStorage) {
    return fallback;
  }

  const rawValue = globalThis.localStorage.getItem(key);

  if (rawValue === null) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn(`Valor local invalido para ${key}.`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  if (!globalThis.localStorage) {
    return value;
  }

  globalThis.localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function createStatus(state = 'idle', pending = 0, error = '') {
  return { state, pending, error };
}

function setPendingStatus(queue, error) {
  setStatus({
    state: 'pending',
    pending: queue.length,
    error: error.message || 'Sincronizacao financeira pendente.'
  });
}

function setStatusFromQueue(queue, error = '') {
  setStatus({
    state: queue.length ? 'pending' : 'synced',
    pending: queue.length,
    error
  });
}

function setStatus(nextStatus) {
  status = { ...status, ...nextStatus };
  emit(UI_EVENTS.financialSyncStatusChanged, getFinancialSyncStatus());
}

function emitFinancialDataChanged(payload) {
  emit(UI_EVENTS.cashSummaryChanged, payload);
  emit(UI_EVENTS.financialDataChanged, payload);
}

function stripUndefined(item) {
  return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
}
