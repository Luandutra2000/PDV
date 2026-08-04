import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js?v=20260804-03';
import { emit } from './event-bus.service.js?v=20260804-03';
import { getSupabaseClient } from './supabase-client.service.js?v=20260804-03';
import { getSupabaseRestClient } from './supabase-rest-client.service.js?v=20260804-03';
import { saleAdapter } from './repositories/sale.adapter.js?v=20260804-03';
import { saleItemAdapter } from './repositories/sale-item.adapter.js?v=20260804-03';
import { cashMovementAdapter } from './repositories/cash-movement.adapter.js?v=20260804-03';
import { commandAdapter } from './repositories/command.adapter.js?v=20260804-03';
import { commandItemAdapter } from './repositories/command-item.adapter.js?v=20260804-03';
import { cashClosingAdapter } from './repositories/cash-closing.adapter.js?v=20260804-03';
import { financialCategoryAdapter } from './repositories/financial-category.adapter.js?v=20260804-03';
import { financialTransactionAdapter } from './repositories/financial-transaction.adapter.js?v=20260804-03';

const FINANCIAL_TABLES = [
  commandAdapter.table,
  commandItemAdapter.table,
  saleAdapter.table,
  saleItemAdapter.table,
  cashMovementAdapter.table,
  cashClosingAdapter.table,
  financialCategoryAdapter.table,
  financialTransactionAdapter.table
];
const REALTIME_HYDRATE_DELAY_MS = 600;

let getClientOverride = null;
let realtimeChannel = null;
let realtimePromise = null;
let realtimeHydrateTimer = null;
let inFlightOperations = [];
let status = createStatus('idle', readQueue().length);

export function configureFinancialSyncForTests({ getClient } = {}) {
  getClientOverride = typeof getClient === 'function' ? getClient : null;
  status = createStatus('idle', readQueue().length);
  realtimeChannel = null;
  realtimePromise = null;
  inFlightOperations = [];
  clearRealtimeHydrateTimer();
}

export function getFinancialSyncStatus() {
  const pending = readQueue().length;

  return {
    ...status,
    state: pending > 0 ? 'pending' : status.state,
    pending
  };
}

export async function hydrateFinancialData({ includePending = false } = {}) {
  try {
    setStatus({ state: 'syncing', error: '' });
    const client = await getWriteClient();
    const [
      saleRows,
      saleItemRows,
      movementRows,
      commandRows,
      commandItemRows,
      closingRows,
      financialCategoryRows,
      financialTransactionRows
    ] = await Promise.all([
      selectRows(client, saleAdapter),
      selectRows(client, saleItemAdapter),
      selectRows(client, cashMovementAdapter),
      selectRows(client, commandAdapter),
      selectRows(client, commandItemAdapter),
      selectRows(client, cashClosingAdapter),
      selectRows(client, financialCategoryAdapter),
      selectRows(client, financialTransactionAdapter)
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
    const financialCategories = financialCategoryRows.map(financialCategoryAdapter.fromRow);
    const financialTransactions = financialTransactionRows.map(financialTransactionAdapter.fromRow);

    const queue = [...inFlightOperations, ...readQueue()];

    writeFinancialCaches({
      transactions: sortNewestFirst(includePending ? applyQueueToTransactions([...sales, ...movements], queue) : [...sales, ...movements]),
      commands: sortNewestFirst(includePending ? applyQueueToCommands(commands, queue) : commands),
      closings: sortNewestFirst(includePending ? applyQueueToClosings(closings, queue) : closings),
      financialCategories,
      financialTransactions: sortNewestFirst(includePending ? applyQueueToFinancialTransactions(financialTransactions, queue) : financialTransactions)
    });
    setStatusFromQueue(readQueue());

    return {
      transactions: readJson(STORAGE_KEYS.transactions, []),
      closedComandas: readJson(STORAGE_KEYS.closedComandas, []),
      cashClosings: readJson(STORAGE_KEYS.cashClosings, []),
      financialCategories: readJson(STORAGE_KEYS.financialCategories, []),
      financialTransactions: readJson(STORAGE_KEYS.financialTransactions, [])
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
      cashClosings: readJson(STORAGE_KEYS.cashClosings, []),
      financialCategories: readJson(STORAGE_KEYS.financialCategories, []),
      financialTransactions: readJson(STORAGE_KEYS.financialTransactions, [])
    };
  }
}

export async function saveSaleToSupabase({ sale, command }) {
  const nextSale = { ...sale };
  const nextCommand = { ...command };
  const inFlightOperation = { action: 'saveSale', sale: nextSale, command: nextCommand };

  try {
    addInFlightOperation(inFlightOperation);
    setStatus({ state: 'syncing', error: '' });
    await writeComposedSale(await getWriteClient(), nextSale, nextCommand);
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
  } finally {
    removeInFlightOperation(inFlightOperation);
  }
}

export async function saveCashMovementToSupabase(movement) {
  const nextMovement = { ...movement };
  const inFlightOperation = { action: 'saveCashMovement', movement: nextMovement };

  try {
    addInFlightOperation(inFlightOperation);
    setStatus({ state: 'syncing', error: '' });
    const client = await getWriteClient();
    await upsertRows(client, cashMovementAdapter.table, [cashMovementAdapter.toRow(nextMovement)]);
    upsertTransactionCache(nextMovement);
    setStatusFromQueue(readQueue());
    return nextMovement;
  } catch (error) {
    const queue = enqueueOperation({ action: 'saveCashMovement', movement: nextMovement });
    upsertTransactionCache({ ...nextMovement, syncPending: true });
    setPendingStatus(queue, error);
    return nextMovement;
  } finally {
    removeInFlightOperation(inFlightOperation);
  }
}

export async function saveFinancialTransactionToSupabase(transaction) {
  const nextTransaction = { ...transaction };
  const inFlightOperation = { action: 'saveFinancialTransaction', transaction: nextTransaction };

  try {
    addInFlightOperation(inFlightOperation);
    setStatus({ state: 'syncing', error: '' });
    const client = await getWriteClient();
    await upsertRows(client, financialTransactionAdapter.table, [financialTransactionAdapter.toRow(nextTransaction)]);
    upsertFinancialTransactionCache(nextTransaction);
    setStatusFromQueue(readQueue());
    return nextTransaction;
  } catch (error) {
    const queue = enqueueOperation({ action: 'saveFinancialTransaction', transaction: nextTransaction });
    upsertFinancialTransactionCache({ ...nextTransaction, syncPending: true });
    setPendingStatus(queue, error);
    return nextTransaction;
  } finally {
    removeInFlightOperation(inFlightOperation);
  }
}

export async function saveFinancialTransactionToSupabaseStrict(transaction) {
  const nextTransaction = { ...transaction };

  setStatus({ state: 'syncing', error: '' });
  const client = await getWriteClient();
  await upsertRows(client, financialTransactionAdapter.table, [financialTransactionAdapter.toRow(nextTransaction)]);
  upsertFinancialTransactionCache(nextTransaction);
  setStatusFromQueue(readQueue());
  return nextTransaction;
}

export async function updateFinancialTransactionInSupabaseStrict(transaction) {
  const nextTransaction = { ...transaction };

  setStatus({ state: 'syncing', error: '' });
  const client = await getWriteClient();
  await upsertRows(client, financialTransactionAdapter.table, [financialTransactionAdapter.toRow(nextTransaction)]);
  upsertFinancialTransactionCache(nextTransaction);
  setStatusFromQueue(readQueue());
  return nextTransaction;
}

export async function cancelFinancialTransactionInSupabase({ transactionId, canceledAt, cancelReason = '' }) {
  const nextCanceledAt = canceledAt || new Date().toISOString();

  try {
    setStatus({ state: 'syncing', error: '' });
    await updateById(await getWriteClient(), financialTransactionAdapter.table, transactionId, {
      status: 'canceled',
      canceled_at: nextCanceledAt,
      cancel_reason: cancelReason
    });
    markFinancialTransactionCanceledInCache({ transactionId, canceledAt: nextCanceledAt, cancelReason });
    setStatusFromQueue(readQueue());
  } catch (error) {
    const queue = enqueueOperation({ action: 'cancelFinancialTransaction', transactionId, canceledAt: nextCanceledAt, cancelReason });
    markFinancialTransactionCanceledInCache({ transactionId, canceledAt: nextCanceledAt, cancelReason, syncPending: true });
    setPendingStatus(queue, error);
  }
}

export async function saveCashClosingToSupabase(closing) {
  const nextClosing = { ...closing };
  const inFlightOperation = { action: 'saveCashClosing', closing: nextClosing };

  try {
    addInFlightOperation(inFlightOperation);
    setStatus({ state: 'syncing', error: '' });
    const client = await getWriteClient();
    await upsertRows(client, cashClosingAdapter.table, [cashClosingAdapter.toRow(nextClosing)]);
    upsertClosingCache(nextClosing);
    setStatusFromQueue(readQueue());
    return nextClosing;
  } catch (error) {
    const queue = enqueueOperation({ action: 'saveCashClosing', closing: nextClosing });
    upsertClosingCache({ ...nextClosing, syncPending: true });
    setPendingStatus(queue, error);
    return nextClosing;
  } finally {
    removeInFlightOperation(inFlightOperation);
  }
}

export async function saveCashClosingToSupabaseStrict(closing) {
  const nextClosing = { ...closing };

  setStatus({ state: 'syncing', error: '' });
  const client = await getWriteClient();
  await upsertRows(client, cashClosingAdapter.table, [cashClosingAdapter.toRow(nextClosing)]);
  upsertClosingCache(nextClosing);
  setStatusFromQueue(readQueue());
  return nextClosing;
}

export async function cancelSaleInSupabase({ saleId, comandaId, canceledAt }) {
  const nextCanceledAt = canceledAt || new Date().toISOString();

  try {
    setStatus({ state: 'syncing', error: '' });
    await writeSaleCancellation(await getWriteClient(), { saleId, comandaId, canceledAt: nextCanceledAt });
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
    await writeMovementCancellation(await getWriteClient(), { movementId, canceledAt: nextCanceledAt });
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
    const client = await getWriteClient();

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

export async function clearFinancialHistoryInSupabase({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const client = await getWriteClient();
  const range = resolvePeriodRange({ period, customStart, customEnd });
  const [
    saleRows,
    commandRows,
    movementRows,
    closingRows
  ] = await Promise.all([
    selectRows(client, saleAdapter),
    selectRows(client, commandAdapter),
    selectRows(client, cashMovementAdapter),
    selectRows(client, cashClosingAdapter)
  ]);
  const saleIds = saleRows.filter((row) => isRowInRange(row.created_at, range)).map((row) => row.id);
  const commandIds = commandRows.filter((row) => isRowInRange(row.closed_at || row.created_at, range)).map((row) => row.id);
  const movementIds = movementRows.filter((row) => isRowInRange(row.created_at, range)).map((row) => row.id);
  const closingIds = closingRows.filter((row) => isRowInRange(row.created_at || row.closed_at, range)).map((row) => row.id);

  await deleteByForeignIds(client, saleItemAdapter.table, 'sale_id', saleIds);
  await deleteByIds(client, saleAdapter.table, saleIds);
  await deleteByForeignIds(client, commandItemAdapter.table, 'command_id', commandIds);
  await deleteByIds(client, commandAdapter.table, commandIds);
  await deleteByIds(client, cashMovementAdapter.table, movementIds);
  await deleteByIds(client, cashClosingAdapter.table, closingIds);
  await hydrateFinancialData({ includePending: true });
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
      const onChange = () => {
        scheduleRealtimeHydrate();
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
  clearRealtimeHydrateTimer();
}

function getClient() {
  const getClientFn = getClientOverride || getSupabaseClient;
  return getClientFn();
}

function getWriteClient() {
  if (getClientOverride) {
    return getClientOverride();
  }

  return getSupabaseRestClient();
}

async function writeComposedSale(client, sale, command) {
  try {
    await upsertRows(client, commandAdapter.table, [commandAdapter.toRow(command)]);
    await upsertRows(client, commandItemAdapter.table, commandItemAdapter.toRows(command));
    await upsertRows(client, saleAdapter.table, [saleAdapter.toRow(sale)]);
    await upsertRows(client, saleItemAdapter.table, saleItemAdapter.toRows(sale));
  } catch (error) {
    await cleanupPartialComposedSale(client, sale, command);
    throw error;
  }
}

function scheduleRealtimeHydrate() {
  clearRealtimeHydrateTimer();
  realtimeHydrateTimer = setTimeout(async () => {
    realtimeHydrateTimer = null;
    await hydrateFinancialData({ includePending: true });
  }, REALTIME_HYDRATE_DELAY_MS);
}

function clearRealtimeHydrateTimer() {
  if (!realtimeHydrateTimer) {
    return;
  }

  clearTimeout(realtimeHydrateTimer);
  realtimeHydrateTimer = null;
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

  if (operation.action === 'saveFinancialTransaction') {
    await upsertRows(client, financialTransactionAdapter.table, [financialTransactionAdapter.toRow(operation.transaction)]);
    return;
  }

  if (operation.action === 'cancelSale') {
    await writeSaleCancellation(client, operation);
    return;
  }

  if (operation.action === 'cancelCashMovement') {
    await writeMovementCancellation(client, operation);
    return;
  }

  if (operation.action === 'cancelFinancialTransaction') {
    await updateById(client, financialTransactionAdapter.table, operation.transactionId, {
      status: 'canceled',
      canceled_at: operation.canceledAt,
      cancel_reason: operation.cancelReason || ''
    });
  }
}

function addInFlightOperation(operation) {
  inFlightOperations = [...inFlightOperations, operation];
}

function removeInFlightOperation(operation) {
  inFlightOperations = inFlightOperations.filter((candidate) => candidate !== operation);
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

async function cleanupPartialComposedSale(client, sale, command) {
  const saleItemRows = saleItemAdapter.toRows(sale);
  const commandItemRows = commandItemAdapter.toRows(command);

  try {
    await deleteByIds(client, saleItemAdapter.table, saleItemRows.map((row) => row.id));
    await deleteById(client, saleAdapter.table, sale.id);
    await deleteByIds(client, commandItemAdapter.table, commandItemRows.map((row) => row.id));
    await deleteById(client, commandAdapter.table, command.id);
  } catch (cleanupError) {
    console.warn('Nao foi possivel limpar venda parcial no Supabase.', cleanupError);
  }
}

async function deleteByIds(client, table, ids) {
  const nextIds = ids.filter(Boolean);

  if (!nextIds.length) {
    return;
  }

  const query = client.from(table);

  if (typeof query.delete !== 'function') {
    return;
  }

  const { error } = await query.delete().in('id', nextIds);

  if (error) {
    throw error;
  }
}

async function deleteByForeignIds(client, table, column, ids) {
  const nextIds = ids.filter(Boolean);

  if (!nextIds.length) {
    return;
  }

  const query = client.from(table);

  if (typeof query.delete !== 'function') {
    return;
  }

  const { error } = await query.delete().in(column, nextIds);

  if (error) {
    throw error;
  }
}

async function deleteById(client, table, id) {
  if (!id) {
    return;
  }

  const query = client.from(table);

  if (typeof query.delete !== 'function') {
    return;
  }

  const { error } = await query.delete().eq('id', id);

  if (error) {
    throw error;
  }
}

function resolvePeriodRange({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const now = new Date();

  if (period === 'all') {
    return { start: null, end: null };
  }

  if (period === 'hour') {
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    const end = new Date(start);
    end.setMinutes(59, 59, 999);
    return { start, end };
  }

  if (period === 'custom') {
    return {
      start: customStart ? new Date(`${customStart}T00:00:00`) : null,
      end: customEnd ? new Date(`${customEnd}T23:59:59`) : null
    };
  }

  if (period === 'yesterday') {
    const start = new Date(now);
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  }

  if (period === 'year') {
    return { start: new Date(now.getFullYear(), 0, 1), end: now };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function isRowInRange(value, { start, end }) {
  if (!start && !end) {
    return true;
  }

  if (!value) {
    return false;
  }

  const date = new Date(value);
  return (!start || date >= start) && (!end || date <= end);
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

  if (operation.action === 'saveFinancialTransaction') {
    upsertFinancialTransactionCache(operation.transaction);
  }

  if (operation.action === 'cancelSale') {
    markSaleCanceledInCache(operation);
  }

  if (operation.action === 'cancelCashMovement') {
    markMovementCanceledInCache(operation);
  }

  if (operation.action === 'cancelFinancialTransaction') {
    markFinancialTransactionCanceledInCache(operation);
  }
}

function applyQueueToTransactions(transactions, queue = readQueue()) {
  return queue.reduce((nextTransactions, operation) => {
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

function applyQueueToCommands(commands, queue = readQueue()) {
  return queue.reduce((nextCommands, operation) => {
    if (operation.action === 'saveSale') {
      return upsertInList(nextCommands, { ...operation.command, syncPending: true });
    }

    if (operation.action === 'cancelSale') {
      return markCommandCanceled(nextCommands, operation);
    }

    return nextCommands;
  }, commands);
}

function applyQueueToClosings(closings, queue = readQueue()) {
  return queue.reduce((nextClosings, operation) => {
    if (operation.action === 'saveCashClosing') {
      return upsertInList(nextClosings, { ...operation.closing, syncPending: true });
    }

    return nextClosings;
  }, closings);
}

function applyQueueToFinancialTransactions(transactions, queue = readQueue()) {
  return queue.reduce((nextTransactions, operation) => {
    if (operation.action === 'saveFinancialTransaction') {
      return upsertInList(nextTransactions, { ...operation.transaction, syncPending: true });
    }

    if (operation.action === 'cancelFinancialTransaction') {
      return nextTransactions.map((transaction) => (
        transaction.id === operation.transactionId
          ? stripUndefined({
            ...transaction,
            status: 'canceled',
            canceledAt: operation.canceledAt,
            cancelReason: operation.cancelReason || '',
            syncPending: true
          })
          : transaction
      ));
    }

    return nextTransactions;
  }, transactions);
}

function markSaleCanceledInCache(operation) {
  writeJson(STORAGE_KEYS.transactions, sortNewestFirst(markSaleCanceled(readJson(STORAGE_KEYS.transactions, []), operation)));
  writeJson(STORAGE_KEYS.closedComandas, sortNewestFirst(markCommandCanceled(readJson(STORAGE_KEYS.closedComandas, []), operation)));
  emitFinancialDataChanged(operation);
}

function markMovementCanceledInCache(operation) {
  writeJson(STORAGE_KEYS.transactions, sortNewestFirst(markMovementCanceled(readJson(STORAGE_KEYS.transactions, []), operation)));
  emitFinancialDataChanged(operation);
}

function markFinancialTransactionCanceledInCache(operation) {
  writeJson(
    STORAGE_KEYS.financialTransactions,
    sortNewestFirst(readJson(STORAGE_KEYS.financialTransactions, []).map((transaction) => (
      transaction.id === operation.transactionId
        ? stripUndefined({
          ...transaction,
          status: 'canceled',
          canceledAt: operation.canceledAt,
          cancelReason: operation.cancelReason || '',
          syncPending: operation.syncPending || undefined
        })
        : transaction
    )))
  );
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

function writeFinancialCaches({ transactions, commands, closings, financialCategories = [], financialTransactions = [] }) {
  writeJson(STORAGE_KEYS.transactions, transactions);
  writeJson(STORAGE_KEYS.closedComandas, commands);
  writeJson(STORAGE_KEYS.cashClosings, closings);
  writeJson(STORAGE_KEYS.financialCategories, financialCategories);
  writeJson(STORAGE_KEYS.financialTransactions, sortNewestFirst(financialTransactions));
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

function upsertFinancialTransactionCache(item) {
  writeJson(STORAGE_KEYS.financialTransactions, upsertInList(readJson(STORAGE_KEYS.financialTransactions, []), item));
  emitFinancialDataChanged(item);
}

function upsertInList(items, item) {
  const exists = items.some((candidate) => candidate.id === item.id);
  const nextItems = exists
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [item, ...items];

  return sortNewestFirst(nextItems);
}

function sortNewestFirst(items) {
  return items
    .map((item, index) => ({ item, index, timestamp: getSortTimestamp(item) }))
    .sort((left, right) => {
      if (left.timestamp !== null && right.timestamp !== null && left.timestamp !== right.timestamp) {
        return right.timestamp - left.timestamp;
      }

      if (left.timestamp !== null && right.timestamp === null) {
        return -1;
      }

      if (left.timestamp === null && right.timestamp !== null) {
        return 1;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function getSortTimestamp(item) {
  const dateValue = item.closedAt || item.createdAt || item.updatedAt;

  if (!dateValue) {
    return null;
  }

  const timestamp = Date.parse(dateValue);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function enqueueOperation(operation) {
  const nextOperation = { ...operation, createdAt: new Date().toISOString() };
  const operationKey = getOperationKey(nextOperation);
  const currentQueue = readQueue();
  const existingIndex = currentQueue.findIndex((candidate) => getOperationKey(candidate) === operationKey);
  const queue = existingIndex < 0
    ? [...currentQueue, nextOperation]
    : currentQueue.map((candidate, index) => (
      index === existingIndex
        ? { ...nextOperation, createdAt: candidate.createdAt || nextOperation.createdAt }
        : candidate
    ));
  writeQueue(queue);
  return queue;
}

function getOperationKey(operation) {
  const entityId = operation.sale?.id
    || operation.movement?.id
    || operation.closing?.id
    || operation.transaction?.id
    || operation.saleId
    || operation.movementId
    || operation.id
    || '';
  return `${operation.action || operation.type || 'operation'}:${entityId}`;
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
