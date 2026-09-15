import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js?v=20260804-06';
import { emit } from './event-bus.service.js?v=20260804-06';
import { getSupabaseClient } from './supabase-client.service.js?v=20260804-06';
import { getSupabaseRestClient } from './supabase-rest-client.service.js?v=20260804-06';
import { saleAdapter } from './repositories/sale.adapter.js?v=20260804-06';
import { saleItemAdapter } from './repositories/sale-item.adapter.js?v=20260804-06';
import { cashMovementAdapter } from './repositories/cash-movement.adapter.js?v=20260804-06';
import { commandAdapter } from './repositories/command.adapter.js?v=20260804-06';
import { commandItemAdapter } from './repositories/command-item.adapter.js?v=20260804-06';
import { cashClosingAdapter } from './repositories/cash-closing.adapter.js?v=20260804-06';
import { financialCategoryAdapter } from './repositories/financial-category.adapter.js?v=20260804-06';
import { financialTransactionAdapter } from './repositories/financial-transaction.adapter.js?v=20260804-06';
import { readLocalCache as readJson, setLocalCache as writeJson } from './providers/local.provider.js?v=20260804-06';

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
const SELECT_PAGE_SIZE = 1000;

let getClientOverride = null;
let realtimeChannel = null;
let realtimePromise = null;
let realtimeHydrateTimer = null;
let flushPromise = null;
let writeTail = Promise.resolve();
const preparedRevisions = new Map();
let status = createStatus('idle', readQueue().length);

export function configureFinancialSyncForTests({ getClient } = {}) {
  getClientOverride = typeof getClient === 'function' ? getClient : null;
  status = createStatus('idle', readQueue().length);
  realtimeChannel = null;
  realtimePromise = null;
  flushPromise = null;
  writeTail = Promise.resolve();
  preparedRevisions.clear();
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
    const rows = await readFinancialTables(client);
    const currentTransactions = readJson(STORAGE_KEYS.transactions, []);
    const currentCommands = readJson(STORAGE_KEYS.closedComandas, []);
    const currentClosings = readJson(STORAGE_KEYS.cashClosings, []);
    const currentCategories = readJson(STORAGE_KEYS.financialCategories, []);
    const currentFinancialTransactions = readJson(STORAGE_KEYS.financialTransactions, []);
    const sales = rows.sales.ok && rows.saleItems.ok ? rows.sales.rows.map((row) => ({
      ...saleAdapter.fromRow(row),
      items: saleItemAdapter.fromRows(rows.saleItems.rows, row.id)
    })) : currentTransactions.filter((transaction) => transaction.type === 'venda');
    const movements = rows.movements.ok
      ? rows.movements.rows.map(cashMovementAdapter.fromRow)
      : currentTransactions.filter((transaction) => ['entrada', 'saida', 'sangria'].includes(transaction.type));
    const commands = rows.commands.ok && rows.commandItems.ok ? rows.commands.rows.map((row) => ({
      ...commandAdapter.fromRow(row),
      items: commandItemAdapter.fromRows(rows.commandItems.rows, row.id)
    })) : currentCommands;
    const closings = rows.closings.ok ? rows.closings.rows.map(cashClosingAdapter.fromRow) : currentClosings;
    const financialCategories = rows.financialCategories.ok
      ? rows.financialCategories.rows.map(financialCategoryAdapter.fromRow)
      : currentCategories;
    const financialTransactions = rows.financialTransactions.ok
      ? rows.financialTransactions.rows.map(financialTransactionAdapter.fromRow)
      : currentFinancialTransactions;

    const queue = readQueue();

    writeFinancialCaches({
      transactions: sortNewestFirst(includePending
        ? applyQueueToTransactions(mergeRemoteWithCache([...sales, ...movements], currentTransactions), queue)
        : mergeRemoteWithCache([...sales, ...movements], currentTransactions)),
      commands: sortNewestFirst(includePending
        ? applyQueueToCommands(mergeRemoteWithCache(commands, currentCommands), queue)
        : mergeRemoteWithCache(commands, currentCommands)),
      closings: sortNewestFirst(includePending
        ? applyQueueToClosings(mergeRemoteWithCache(closings, currentClosings), queue)
        : mergeRemoteWithCache(closings, currentClosings)),
      financialCategories,
      financialTransactions: sortNewestFirst(includePending
        ? applyQueueToFinancialTransactions(mergeRemoteWithCache(financialTransactions, currentFinancialTransactions), queue)
        : mergeRemoteWithCache(financialTransactions, currentFinancialTransactions))
    });
    const failedTable = Object.values(rows).find((result) => !result.ok);
    setStatusFromQueue(readQueue());
    if (failedTable) {
      setStatus({
        state: 'cache',
        pending: readQueue().length,
        error: failedTable.error?.message || 'Parte dos dados remotos continua no cache local.'
      });
    }

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
  const operation = prepareFinancialOperation({ action: 'saveSale', sale, command });
  await sendPreparedOperation();
  return operation.sale;
}

export async function saveCashMovementToSupabase(movement) {
  const operation = prepareFinancialOperation({ action: 'saveCashMovement', movement });
  await sendPreparedOperation();
  return operation.movement;
}

export async function saveFinancialTransactionToSupabase(transaction) {
  const operation = prepareFinancialOperation({ action: 'saveFinancialTransaction', transaction });
  await sendPreparedOperation();
  return operation.transaction;
}

export function saveFinancialTransactionToSupabaseStrict(transaction) {
  return writeStrictOperation({ action: 'saveFinancialTransaction', transaction });
}

async function readFinancialTables(client) {
  const entries = [
    ['sales', saleAdapter],
    ['saleItems', saleItemAdapter],
    ['movements', cashMovementAdapter],
    ['commands', commandAdapter],
    ['commandItems', commandItemAdapter],
    ['closings', cashClosingAdapter],
    ['financialCategories', financialCategoryAdapter],
    ['financialTransactions', financialTransactionAdapter]
  ];
  const results = await Promise.all(entries.map(async ([key, adapter]) => {
    try {
      return [key, { ok: true, rows: await selectRows(client, adapter) }];
    } catch (error) {
      return [key, { ok: false, rows: [], error }];
    }
  }));

  return Object.fromEntries(results);
}

export function updateFinancialTransactionInSupabaseStrict(transaction) {
  return writeStrictOperation({ action: 'saveFinancialTransaction', transaction });
}

export async function cancelFinancialTransactionInSupabase({ transactionId, canceledAt, cancelReason = '' }) {
  prepareFinancialOperation({ action: 'cancelFinancialTransaction', transactionId, canceledAt: canceledAt || new Date().toISOString(), cancelReason });
  await sendPreparedOperation();
}

export async function saveCashClosingToSupabase(closing) {
  const operation = prepareFinancialOperation({ action: 'saveCashClosing', closing });
  await sendPreparedOperation();
  return operation.closing;
}

export function saveCashClosingToSupabaseStrict(closing) {
  return writeStrictOperation({ action: 'saveCashClosing', closing });
}

export async function cancelSaleInSupabase({ saleId, comandaId, canceledAt }) {
  prepareFinancialOperation({ action: 'cancelSale', saleId, comandaId, canceledAt: canceledAt || new Date().toISOString() });
  await sendPreparedOperation();
}

export async function cancelCashMovementInSupabase({ movementId, canceledAt }) {
  prepareFinancialOperation({ action: 'cancelCashMovement', movementId, canceledAt: canceledAt || new Date().toISOString() });
  await sendPreparedOperation();
}

// This synchronous boundary lets callers include the outbox in their local transaction.
export function prepareFinancialOperation(operation) {
  const snapshot = JSON.parse(JSON.stringify(operation));
  if (snapshot.action === 'saveSale') {
    const knownSale = readJson(STORAGE_KEYS.transactions, []).find((item) => item.id === snapshot.sale.id);
    if (knownSale && saleCommercialSignature(knownSale) !== saleCommercialSignature(snapshot.sale)) {
      throw new Error('Nao e possivel alterar os valores ou itens de uma venda finalizada. Cancele e registre uma nova venda.');
    }
    snapshot.sale = preserveCancellation(knownSale, snapshot.sale);
    snapshot.command = preserveCancellation(readJson(STORAGE_KEYS.closedComandas, []).find((item) => item.id === snapshot.command.id), snapshot.command);
  }
  enqueueOperation(snapshot);
  preparedRevisions.set(getOperationEntity(snapshot), {});
  const pending = { ...snapshot, syncPending: true };
  for (const key of ['sale', 'command', 'movement', 'transaction', 'closing']) {
    if (snapshot[key]) pending[key] = { ...snapshot[key], syncPending: true };
  }
  applyCompletedOperationToCache(pending);
  return snapshot;
}

async function sendPreparedOperation() {
  const alreadyFlushing = Boolean(flushPromise);
  const pendingFlush = flushFinancialQueue();
  // A new operation is accepted once durable while the current writer continues.
  if (!alreadyFlushing) await pendingFlush;
}

function serializeFinancialWrite(work) {
  const next = writeTail.then(work);
  writeTail = next.catch(() => {});
  return next;
}

function writeStrictOperation(operation) {
  const snapshot = JSON.parse(JSON.stringify(operation));
  const savedValue = snapshot.transaction || snapshot.closing;
  const entity = getOperationEntity(snapshot);
  const expectedRevision = preparedRevisions.get(entity);
  const assertCurrentRevision = () => {
    if (preparedRevisions.get(entity) !== expectedRevision) throw new Error('Os dados foram alterados durante a espera. Confira a versao atual e tente novamente.');
  };
  return serializeFinancialWrite(async () => {
    assertCurrentRevision();
    await flushPendingFinancialOperations();
    assertCurrentRevision();
    if (readQueue().length) throw new Error('Sincronizacao pendente: confirme as operacoes anteriores antes de continuar.');
    setStatus({ state: 'syncing', error: '' });
    await writeQueuedOperation(await getWriteClient(), snapshot);
    const warnings = [];
    try {
      if (preparedRevisions.get(entity) === expectedRevision) applyCompletedOperationToCache(snapshot);
    } catch (error) {
      warnings.push('Salvo no servidor; nao foi possivel atualizar o cache deste aparelho: ' + error.message);
    }
    try {
      setStatusFromQueue(readQueue());
    } catch (error) {
      warnings.push('Salvo no servidor; nao foi possivel atualizar o status local: ' + error.message);
    }
    return warnings.length ? { ...savedValue, warnings } : savedValue;
  });
}

export function flushFinancialQueue() {
  if (!flushPromise) {
    flushPromise = serializeFinancialWrite(flushPendingFinancialOperations).finally(() => { flushPromise = null; });
  }
  return flushPromise;
}

async function flushPendingFinancialOperations() {
  const queue = readQueue();

  if (!queue.length) {
    setStatus({ state: 'synced', pending: 0, error: '' });
    return;
  }

  let syncError = null;

  try {
    const client = await getWriteClient();

    while (readQueue().length) {
      const operation = readQueue()[0];
      try {
        await writeQueuedOperation(client, operation);
        if (removeConfirmedOperation(operation) && !readQueue().some((candidate) => getOperationEntity(candidate) === getOperationEntity(operation))) {
          applyCompletedOperationToCache(operation);
        }
      } catch (error) {
        syncError = error;
        // Preserve ordering: a cancellation must not overtake its failed sale.
        break;
      }
    }
  } catch (error) {
    setPendingStatus(queue, error);
    return;
  }

  const pending = readQueue();
  setStatusFromQueue(pending, syncError?.message || (pending.length ? 'Algumas alteracoes continuam pendentes.' : ''));
}

function removeConfirmedOperation(operation) {
  const serialized = JSON.stringify(operation);
  const pending = readQueue();
  const remaining = pending.filter((candidate) => JSON.stringify(candidate) !== serialized);
  if (pending.length === remaining.length) return false;
  writeQueue(remaining);
  return true;
}

export async function clearFinancialHistoryInSupabase({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const client = await getWriteClient();
  const range = resolvePeriodRange({ period, customStart, customEnd });
  const [
    saleRows,
    commandRows,
    movementRows,
    closingRows,
    financialTransactionRows
  ] = await Promise.all([
    selectRows(client, saleAdapter),
    selectRows(client, commandAdapter),
    selectRows(client, cashMovementAdapter),
    selectRows(client, cashClosingAdapter),
    selectRows(client, financialTransactionAdapter)
  ]);
  const saleIds = saleRows.filter((row) => isRowInRange(row.created_at, range)).map((row) => row.id);
  const commandIds = commandRows.filter((row) => isRowInRange(row.closed_at || row.created_at, range)).map((row) => row.id);
  const movementIds = movementRows.filter((row) => isRowInRange(row.created_at, range)).map((row) => row.id);
  const closingIds = closingRows.filter((row) => isRowInRange(row.created_at || row.closed_at, range)).map((row) => row.id);
  const financialTransactionIds = financialTransactionRows
    .filter((row) => isRowInRange(row.transaction_date || row.created_at, range))
    .map((row) => row.id);

  await deleteByForeignIds(client, saleItemAdapter.table, 'sale_id', saleIds);
  await deleteByIds(client, saleAdapter.table, saleIds);
  await deleteByForeignIds(client, commandItemAdapter.table, 'command_id', commandIds);
  await deleteByIds(client, commandAdapter.table, commandIds);
  await deleteByIds(client, cashMovementAdapter.table, movementIds);
  await deleteByIds(client, cashClosingAdapter.table, closingIds);
  await deleteByIds(client, financialTransactionAdapter.table, financialTransactionIds);
  clearLocalFinancialHistory(range);
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
  const immutable = { onConflict: 'id', ignoreDuplicates: true };
  // Keep partial rows: the durable outbox completes them without changing a prior sale.
  await upsertRows(client, commandAdapter.table, [commandAdapter.toRow(command)], immutable);
  await upsertRows(client, commandItemAdapter.table, commandItemAdapter.toRows(command), immutable);
  await upsertRows(client, saleAdapter.table, [saleAdapter.toRow(sale)], immutable);
  await upsertRows(client, saleItemAdapter.table, saleItemAdapter.toRows(sale), immutable);
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
  const initialTable = client.from(adapter.table);

  if (typeof initialTable?.selectRange === 'function') {
    return selectRestRows(client, adapter);
  }

  const initialQuery = initialTable.select(adapter.select || '*');

  if (typeof initialQuery?.range !== 'function') {
    const { data, error } = await initialQuery;

    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data : [];
  }

  const rows = [];
  let offset = 0;

  while (true) {
    const query = client.from(adapter.table).select(adapter.select || '*');
    const { data, error } = await query.range(offset, offset + SELECT_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (page.length < SELECT_PAGE_SIZE) {
      return rows;
    }

    offset += SELECT_PAGE_SIZE;
  }
}

async function selectRestRows(client, adapter) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from(adapter.table)
      .selectRange(adapter.select || '*', offset, offset + SELECT_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (page.length < SELECT_PAGE_SIZE) {
      return rows;
    }

    offset += SELECT_PAGE_SIZE;
  }
}

async function upsertRows(client, table, rows, options) {
  if (!rows.length) {
    return;
  }

  const { error } = await client.from(table).upsert(rows, options);

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
    upsertTransactionCache(preserveCancellation(readJson(STORAGE_KEYS.transactions, []).find((item) => item.id === operation.sale.id), operation.sale));
    upsertCommandCache(preserveCancellation(readJson(STORAGE_KEYS.closedComandas, []).find((item) => item.id === operation.command.id), operation.command));
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
      return upsertInList(nextTransactions, preserveCancellation(nextTransactions.find((item) => item.id === operation.sale.id), { ...operation.sale, syncPending: true }));
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
      return upsertInList(nextCommands, preserveCancellation(nextCommands.find((item) => item.id === operation.command.id), { ...operation.command, syncPending: true }));
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

function preserveCancellation(current, next) {
  return current?.status === 'cancelada'
    ? { ...next, status: current.status, canceledAt: current.canceledAt, cancelReason: current.cancelReason }
    : next;
}

function saleCommercialSignature(sale) {
  const row = saleAdapter.toRow(sale);
  const items = saleItemAdapter.toRows(sale).map(({ product_id, name, quantity, unit_price, total }) => (
    JSON.stringify([product_id, name, quantity, unit_price, total])
  )).sort();
  return JSON.stringify([row.total, row.payment_method, row.received_amount, row.change_amount, items]);
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
  const nextOperation = { ...operation, createdAt: new Date().toISOString(), queueRevision: globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random() };
  const operationKey = getOperationKey(nextOperation);
  const currentQueue = readQueue();
  const lastEntityIndex = currentQueue.findLastIndex((candidate) => getOperationEntity(candidate) === getOperationEntity(nextOperation));
  const existingIndex = lastEntityIndex >= 0 && getOperationKey(currentQueue[lastEntityIndex]) === operationKey ? lastEntityIndex : -1;
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

function clearLocalFinancialHistory(range) {
  const transactionCache = readJson(STORAGE_KEYS.transactions, []);
  const closingCache = readJson(STORAGE_KEYS.cashClosings, []);
  const financialCache = readJson(STORAGE_KEYS.financialTransactions, []);
  writeJson(STORAGE_KEYS.transactions, transactionCache.filter((item) => !isRowInRange(item.createdAt, range)));
  writeJson(STORAGE_KEYS.cashClosings, closingCache.filter((item) => !isRowInRange(item.closedAt || item.createdAt, range)));
  writeJson(
    STORAGE_KEYS.financialTransactions,
    financialCache.filter((item) => !isRowInRange(item.transactionDate || item.createdAt, range))
  );
}

function mergeRemoteWithCache(remoteItems, cachedItems) {
  const merged = new Map(cachedItems.map((item) => [item.id, item]));
  remoteItems.forEach((item) => {
    const cached = merged.get(item.id);
    merged.set(item.id, cached?.syncPending ? { ...item, ...cached } : item);
  });
  return Array.from(merged.values());
}

function getOperationEntity(operation) {
  const key = getOperationKey(operation);
  return key.slice(key.indexOf(':') + 1);
}

function getOperationKey(operation) {
  const entityId = operation.sale?.id
    || operation.movement?.id
    || operation.closing?.id
    || operation.transaction?.id
    || operation.saleId
    || operation.movementId
    || operation.transactionId
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
