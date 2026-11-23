import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js?v=20260804-06';
import { isSupabaseEnabled } from './app-config.service.js?v=20260804-06';
import { hydrateDataProvider } from './data-provider.service.js?v=20261123-03';
import { emit } from './event-bus.service.js?v=20260804-06';
import { hydrateFinancialData } from './financial-sync.service.js?v=20261123-03';
import { getSupabaseClient } from './supabase-client.service.js?v=20261123-03';
import {
  adjustShowcaseStock,
  applyProductionToShowcase,
  applySaleToShowcase,
  reverseSaleInShowcase
} from './showcase-stock.service.js?v=20261123-03';
import { setItem } from './storage.service.js?v=20261123-03';
import { readLocalCache, setLocalCache, runLocalTransaction, deferLocalEffect } from './providers/local.provider.js?v=20261123-02';
import { outOfStockSaleAdapter } from './repositories/out-of-stock-sale.adapter.js?v=20260804-06';
import { productStockAdapter } from './repositories/product-stock.adapter.js?v=20260804-06';
import { showcaseMovementAdapter } from './repositories/showcase-movement.adapter.js?v=20260804-06';
import { applyHistoryFilters, getHistoryQuery } from './history-window.service.js?v=20261123-01';
import { mergeById, readRealtimeChange, selectRowsByValues } from './realtime-delta.service.js?v=20261123-03';

const SHOWCASE_ADAPTERS = [
  productStockAdapter,
  showcaseMovementAdapter,
  outOfStockSaleAdapter
];
const SHOWCASE_OPERATIONAL_KEYS = [
  STORAGE_KEYS.stockLaunches,
  STORAGE_KEYS.showcaseWriteOffs
];
const REALTIME_TABLES = [
  productStockAdapter.table,
  showcaseMovementAdapter.table,
  outOfStockSaleAdapter.table,
  'stock_production'
];
const REALTIME_HYDRATE_DELAY_MS = 600;
const RPC_BY_ACTION = {
  processProduction: 'process_showcase_production',
  processSale: 'process_showcase_sale',
  reverseSale: 'reverse_showcase_sale',
  adjustStock: 'adjust_showcase_stock'
};

let getClientOverride = null;
let realtimeChannel = null;
let realtimePromise = null;
let realtimeHydrateTimer = null;
let pendingRealtimeChanges = [];
// Movements created by a sale or its reversal; any other movement (production,
// adjustment, loss) also refreshes production and write-off lists.
const SALE_MOVEMENT_TYPES = new Set(['saida_venda', 'estorno_venda', 'venda_sem_estoque', 'estorno_sem_estoque']);
let flushPromise = null;
let status = createStatus('idle', readQueue().length);

export function configureShowcaseSyncForTests({ getClient } = {}) {
  getClientOverride = typeof getClient === 'function' ? getClient : null;
  status = createStatus('idle', readQueue().length);
  realtimeChannel = null;
  realtimePromise = null;
  flushPromise = null;
  clearRealtimeHydrateTimer();
}

export function getShowcaseSyncStatus() {
  const pending = readQueue().length;

  return {
    ...status,
    state: pending > 0 ? 'pending' : status.state,
    pending
  };
}

// `changes` (realtime events) limits the read to the rows they name.
export async function hydrateShowcaseData({ force = false, changes = null } = {}) {
  const queue = readQueue();
  const cachedBefore = JSON.stringify(readShowcaseCaches());

  if (queue.length && !force) {
    setStatus({
      state: 'pending',
      pending: queue.length,
      error: ''
    });
    return readShowcaseCaches();
  }

  try {
    setStatus({ state: 'syncing', error: '' });
    const client = await getClient();
    const delta = changes ? await readShowcaseChanges(client, changes) : null;
    const [stockRows, movementRows, outOfStockRows] = delta
      ? [delta.stockRows, delta.movementRows, delta.outOfStockRows]
      : await Promise.all(SHOWCASE_ADAPTERS.map((adapter) => selectRows(client, adapter)));

    if (readQueue().length || cachedBefore !== JSON.stringify(readShowcaseCaches())) {
      setStatusFromQueue(readQueue());
      return readShowcaseCaches();
    }

    const caches = readShowcaseCaches();
    const merge = (rows, adapter, cached) => (delta
      ? mergeById(rows.map(adapter.fromRow), cached)
      : rows.map(adapter.fromRow));
    setItem(STORAGE_KEYS.productStock, merge(stockRows, productStockAdapter, caches.productStock));
    setItem(STORAGE_KEYS.showcaseMovements, merge(movementRows, showcaseMovementAdapter, caches.showcaseMovements));
    setItem(STORAGE_KEYS.outOfStockSales, merge(outOfStockRows, outOfStockSaleAdapter, caches.outOfStockSales));
    emitShowcaseDataChanged({ type: 'hydrated' });
    setStatusFromQueue(readQueue());

    return readShowcaseCaches();
  } catch (error) {
    setStatus({
      state: hasCachedShowcaseData() ? 'cache' : 'error',
      pending: readQueue().length,
      error: error.message || 'Erro ao carregar estoque da vitrine.'
    });

    return readShowcaseCaches();
  }
}

export async function processShowcaseProduction(input = {}) {
  return applyLocalThenSync({
    action: 'processProduction',
    input,
    applyLocal: applyProductionToShowcase
  });
}

export async function processShowcaseSale(input = {}) {
  return applyLocalThenSync({
    action: 'processSale',
    input,
    applyLocal: applySaleToShowcase
  });
}

export function prepareShowcaseSale(input = {}) {
  return prepareLocalOperation({ action: 'processSale', input, applyLocal: applySaleToShowcase });
}

export async function reverseShowcaseSale(input = {}) {
  return applyLocalThenSync({
    action: 'reverseSale',
    input,
    applyLocal: reverseSaleInShowcase
  });
}

export function prepareShowcaseReversal(input = {}) {
  return prepareLocalOperation({ action: 'reverseSale', input, applyLocal: reverseSaleInShowcase });
}

export async function adjustShowcaseStockOnline(input = {}) {
  return applyLocalThenSync({
    action: 'adjustStock',
    input,
    applyLocal: adjustShowcaseStock
  });
}

export function flushShowcaseQueue() {
  if (!flushPromise) {
    flushPromise = flushPendingOperations().finally(() => { flushPromise = null; });
  }
  return flushPromise;
}

async function flushPendingOperations() {
  try {
    if (!readQueue().length) {
      setStatusFromQueue([]);
      return;
    }
    setStatus({ state: 'syncing', error: '' });
    const client = await getClient();
    let operation;
    while ((operation = readQueue()[0])) {
      await callRpc(client, operation.action, operation.input);
      // Re-read after each await: another action or tab may have appended work.
      const sent = JSON.stringify(operation);
      writeQueue(readQueue().filter((queued) => JSON.stringify(queued) !== sent));
    }
    setStatusFromQueue(readQueue());
  } catch (error) {
    setPendingStatus(readQueue(), error);
  }
}

export async function startShowcaseRealtime() {
  if (realtimeChannel) {
    return realtimeChannel;
  }

  if (realtimePromise) {
    return realtimePromise;
  }

  realtimePromise = (async () => {
    try {
      const client = await getClient();
      const channel = client.channel('showcase-stock-changes');
      const onChange = (payload) => {
        pendingRealtimeChanges.push(readRealtimeChange(payload));
        scheduleRealtimeHydrate();
      };

      REALTIME_TABLES.forEach((table) => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
      });

      // Events sent while the connection was down are lost: after a reconnect
      // read the whole window once, since realtime now reads only changed rows.
      let connectionLost = false;
      realtimeChannel = channel.subscribe((channelStatus) => {
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(channelStatus)) {
          connectionLost = true;
        } else if (channelStatus === 'SUBSCRIBED' && connectionLost) {
          connectionLost = false;
          Promise.resolve(hydrateRealtimeShowcaseData([])).catch(() => {});
        }
      });
      return realtimeChannel;
    } catch (error) {
      setStatus({
        state: 'error',
        pending: readQueue().length,
        error: error.message || 'Realtime da vitrine indisponivel.'
      });
      return null;
    } finally {
      realtimePromise = null;
    }
  })();

  return realtimePromise;
}

export async function stopShowcaseRealtime() {
  const channel = realtimeChannel || (realtimePromise ? await realtimePromise : null);

  if (!channel) {
    realtimeChannel = null;
    return;
  }

  try {
    const client = await getClient();
    client.removeChannel(channel);
  } catch (error) {
    // Cleanup should not fail the caller when the client is already unavailable.
  }

  realtimeChannel = null;
  clearRealtimeHydrateTimer();
}

async function applyLocalThenSync({ action, input, applyLocal }) {
  const result = prepareLocalOperation({ action, input, applyLocal });
  if (isSupabaseEnabled()) await flushShowcaseQueue();
  return result;
}

function prepareLocalOperation({ action, input, applyLocal }) {
  return runLocalTransaction(() => {
  const result = applyLocal(input);
  // Persist before awaiting the client or emitting events that can start a flush.
  if (isSupabaseEnabled()) {
    enqueueOperation({ action, input });
  }
  deferLocalEffect(() => emitShowcaseDataChanged({ action, input, result }));

  if (!isSupabaseEnabled()) {
    setStatusFromQueue(readQueue());
    return result;
  }

  return result;
  });
}

async function callRpc(client, action, input) {
  if (!client?.rpc) {
    throw new Error('Cliente Supabase indisponivel para sincronizar vitrine.');
  }

  const functionName = RPC_BY_ACTION[action];
  if (!functionName) {
    throw new Error(`Acao de vitrine desconhecida: ${action}`);
  }

  const { data, error } = await client.rpc(functionName, { _payload: normalizeRpcInput(action, input) });
  if (error) {
    throw error;
  }
  if (action === 'processSale' && data?.reason !== 'already-applied'
    && !(data?.changed === true && Number(data.changedItems) > 0)) {
    throw new Error('O servidor nao confirmou a baixa dos itens da venda.');
  }
}

function normalizeRpcInput(action, input = {}) {
  if (action === 'processSale') {
    return {
      ...input,
      items: (input.items || []).map(({ productId, unitPrice, price, ...item }) => ({
        ...item,
        product_id: productId,
        unit_price: unitPrice ?? price ?? 0
      }))
    };
  }
  if (action === 'adjustStock' && input.note && !input.notes) {
    return { ...input, notes: input.note };
  }

  return input;
}

function getClient() {
  const getClientFn = getClientOverride || getSupabaseClient;
  return getClientFn();
}

async function selectRows(client, adapter) {
  if (!client?.from) {
    throw new Error('Cliente Supabase indisponivel para carregar vitrine.');
  }

  const rows = [];
  const pageSize = 1000;
  // Movement history follows the retention window; product_stock (the balance) is always complete.
  const historyQuery = getHistoryQuery(adapter.table);
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await applyHistoryFilters(client.from(adapter.table).select(adapter.select || '*'), historyQuery)
      .order('id', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function scheduleRealtimeHydrate() {
  clearRealtimeHydrateTimer();
  realtimeHydrateTimer = setTimeout(async () => {
    realtimeHydrateTimer = null;
    const changes = pendingRealtimeChanges;
    pendingRealtimeChanges = [];
    await hydrateRealtimeShowcaseData(changes);
  }, REALTIME_HYDRATE_DELAY_MS);
}

async function hydrateRealtimeShowcaseData(changes = []) {
  if (!changes.length) {
    await hydrateDataProvider(SHOWCASE_OPERATIONAL_KEYS);
    await Promise.all([hydrateShowcaseData(), hydrateFinancialData({ includePending: true })]);
    return;
  }

  const needsOperationalLists = changes.some(({ table, row }) => table === 'stock_production'
    || (table === showcaseMovementAdapter.table && !SALE_MOVEMENT_TYPES.has(row.movement_type)));
  if (needsOperationalLists) {
    await hydrateDataProvider(SHOWCASE_OPERATIONAL_KEYS);
  }

  const saleIds = [...new Set(changes.map(({ row }) => row.sale_id).filter(Boolean))];
  await Promise.all([
    hydrateShowcaseData({ changes }),
    saleIds.length
      ? hydrateFinancialData({ includePending: true, changes: saleIds.map((id) => ({ table: 'sales', row: { id } })) })
      : Promise.resolve()
  ]);
}

// Reads only the stock balances, movements and out-of-stock sales the events
// point to. An event that cannot be identified falls back to the full read.
async function readShowcaseChanges(client, changes) {
  const productIds = new Set();
  const movementIds = new Set();
  const outOfStockIds = new Set();

  for (const { table, row } of changes) {
    if (table === 'stock_production') continue;
    if (![productStockAdapter.table, showcaseMovementAdapter.table, outOfStockSaleAdapter.table].includes(table) || !row.id) {
      return null;
    }
    if (row.product_id) productIds.add(row.product_id);
    if (table === showcaseMovementAdapter.table) movementIds.add(row.id);
    if (table === outOfStockSaleAdapter.table) outOfStockIds.add(row.id);
    if (table === productStockAdapter.table && !row.product_id) return null;
  }

  const [stockRows, movementRows, outOfStockRows] = await Promise.all([
    productIds.size ? selectRowsByValues(client, productStockAdapter, 'product_id', [...productIds]) : [],
    movementIds.size ? selectRowsByValues(client, showcaseMovementAdapter, 'id', [...movementIds]) : [],
    outOfStockIds.size ? selectRowsByValues(client, outOfStockSaleAdapter, 'id', [...outOfStockIds]) : []
  ]);

  return { stockRows, movementRows, outOfStockRows };
}

function clearRealtimeHydrateTimer() {
  if (!realtimeHydrateTimer) {
    return;
  }

  clearTimeout(realtimeHydrateTimer);
  realtimeHydrateTimer = null;
}

function enqueueOperation(operation) {
  const queue = readQueue();
  const operationKey = getOperationKey(operation);

  if (queue.some((queuedOperation) => getOperationKey(queuedOperation) === operationKey)) {
    return queue;
  }

  const nextQueue = [
    ...queue,
    {
      ...operation,
      createdAt: new Date().toISOString()
    }
  ];
  writeQueue(nextQueue);
  return nextQueue;
}

function getOperationKey({ action, input = {} }) {
  return input.operationId
    ? `${action}:${input.operationId}`
    : `${action}:${JSON.stringify(input)}`;
}

function readQueue() {
  return readJson(STORAGE_KEYS.showcaseSyncQueue, []);
}

function writeQueue(queue) {
  return writeJson(STORAGE_KEYS.showcaseSyncQueue, queue);
}

function hasCachedShowcaseData() {
  return readJson(STORAGE_KEYS.productStock, []).length > 0
    || readJson(STORAGE_KEYS.showcaseMovements, []).length > 0
    || readJson(STORAGE_KEYS.outOfStockSales, []).length > 0;
}

function readShowcaseCaches() {
  return {
    productStock: readJson(STORAGE_KEYS.productStock, []),
    showcaseMovements: readJson(STORAGE_KEYS.showcaseMovements, []),
    outOfStockSales: readJson(STORAGE_KEYS.outOfStockSales, [])
  };
}

function readJson(key, fallback) {
  return readLocalCache(key, fallback);
}

function writeJson(key, value) {
  return setLocalCache(key, value);
}

function createStatus(state = 'idle', pending = 0, error = '') {
  return { state, pending, error };
}

function setPendingStatus(queue, error) {
  setStatus({
    state: 'pending',
    pending: queue.length,
    error: error.message || 'Sincronizacao da vitrine pendente.'
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
  emit(UI_EVENTS.showcaseSyncStatusChanged, getShowcaseSyncStatus());
}

function emitShowcaseDataChanged(payload) {
  emit(UI_EVENTS.showcaseStockChanged, payload);
  emit(UI_EVENTS.showcaseDataChanged, payload);
}
