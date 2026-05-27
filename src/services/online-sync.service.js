import { STORAGE_KEYS, SYNC_EVENTS, UI_EVENTS } from '../database/schema.js';
import { emit } from './event-bus.service.js';
import { isSupabaseEnabled } from './app-config.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { getItem, setItem } from './storage.service.js';

const MAX_ATTEMPTS = 12;
const SUPPORTED_SYNC_EVENTS = new Set([
  SYNC_EVENTS.saleFinished,
  SYNC_EVENTS.cashMovementRegistered,
  SYNC_EVENTS.stockLaunchCreated,
  SYNC_EVENTS.stockLaunchUpdated,
  SYNC_EVENTS.stockLaunchCanceled,
  SYNC_EVENTS.showcaseProductCleared,
  SYNC_EVENTS.showcaseWriteOffCreated,
  SYNC_EVENTS.transactionHistoryCleared
]);
let initialized = false;
let flushing = false;
let clientForTests = null;
let syncFetchForTests = null;

export function setOnlineSyncClientForTests(client) {
  clientForTests = client;
}

export function setOnlineSyncFetchForTests(fetcher) {
  syncFetchForTests = fetcher;
}

export function initOnlineSyncService() {
  if (initialized) {
    return;
  }

  initialized = true;
  globalThis.addEventListener?.('online', () => runSafeFlush());
  globalThis.addEventListener?.('online', () => runSafeSnapshot());
  globalThis.setInterval?.(() => runSafeFlush(), 30000);
  globalThis.setInterval?.(() => runSafeSnapshot(), 30000);
  runSafeFlush();
  runSafeSnapshot();
}

export function getPendingSyncQueue() {
  return getItem(STORAGE_KEYS.syncQueue, []).filter((item) => item.status !== 'synced');
}

export async function flushSyncQueue() {
  if (!isSupabaseEnabled() || flushing || globalThis.navigator?.onLine === false) {
    return getPendingSyncQueue();
  }

  flushing = true;

  try {
    const client = await getOnlineClient();
    const queue = getPendingSyncQueue();
    const nextQueue = [];

    for (const item of queue) {
      try {
        await syncQueueItem(client, item);
      } catch (error) {
        const attempts = Number(item.attempts || 0) + 1;
        nextQueue.push({
          ...item,
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'error' : 'pending',
          lastError: error.message || 'Falha ao sincronizar.',
          updatedAt: new Date().toISOString()
        });
      }
    }

    setItem(STORAGE_KEYS.syncQueue, nextQueue);

    if (nextQueue.length !== queue.length) {
      emit(UI_EVENTS.mobileFeedChanged, { type: 'online-sync-flushed' });
      emit(UI_EVENTS.cashSummaryChanged, { type: 'online-sync-flushed' });
    }

    return nextQueue;
  } finally {
    flushing = false;
  }
}

function runSafeFlush() {
  flushSyncQueue().catch((error) => {
    console.warn('Sincronizacao online indisponivel. Mantendo eventos no cache local.', error);
  });
}

function runSafeSnapshot() {
  loadOnlineSnapshot().catch((error) => {
    console.warn('Snapshot online indisponivel. Mantendo dados locais em cache.', error);
  });
}

export async function loadOnlineSnapshot({ limit = 120 } = {}) {
  if (!isSupabaseEnabled()) {
    return;
  }

  const apiSnapshot = await loadOnlineSnapshotViaApi(limit);

  if (apiSnapshot) {
    applyOnlineSnapshot(apiSnapshot);
    return;
  }

  const client = await getOnlineClient();
  const [sales, movements, launches, writeOffs] = await Promise.all([
    selectRows(client, 'sales', limit),
    selectRows(client, 'cash_movements', limit),
    selectRows(client, 'stock_production', limit),
    selectRows(client, 'showcase_write_offs', limit)
  ]);

  applyOnlineSnapshot({
    sales,
    cash_movements: movements,
    stock_production: launches,
    showcase_write_offs: writeOffs
  });
}

function applyOnlineSnapshot({ sales = [], cash_movements: movements = [], stock_production: launches = [], showcase_write_offs: writeOffs = [] }) {
  replaceOnlineCollection(STORAGE_KEYS.transactions, [
    ...sales.map(mapSaleRowToTransaction),
    ...movements.map(mapCashMovementRowToTransaction)
  ], getPendingPayloadIds([SYNC_EVENTS.saleFinished, SYNC_EVENTS.cashMovementRegistered]));
  replaceOnlineCollection(STORAGE_KEYS.closedComandas, sales.map(mapSaleRowToClosedComanda), getPendingComandaIds());
  replaceOnlineCollection(STORAGE_KEYS.stockLaunches, launches.map(mapStockRowToLaunch), getPendingPayloadIds([
    SYNC_EVENTS.stockLaunchCreated,
    SYNC_EVENTS.stockLaunchUpdated,
    SYNC_EVENTS.stockLaunchCanceled
  ]));
  replaceOnlineCollection(STORAGE_KEYS.showcaseWriteOffs, writeOffs.map(mapWriteOffRowToLocal), getPendingPayloadIds([SYNC_EVENTS.showcaseWriteOffCreated]));

  emit(UI_EVENTS.mobileFeedChanged, { type: 'online-snapshot-loaded' });
  emit(UI_EVENTS.cashSummaryChanged, { type: 'online-snapshot-loaded' });
}

async function loadOnlineSnapshotViaApi(limit) {
  const token = await getAccessToken();

  if (!token) {
    return null;
  }

  try {
    const response = await getSyncFetch()('/api/sync-snapshot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ limit })
    });
    const data = await readResponseJson(response);

    if (!response.ok) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

async function getOnlineClient() {
  return clientForTests || getSupabaseClient();
}

async function syncQueueItem(client, item) {
  if (!SUPPORTED_SYNC_EVENTS.has(item.type)) {
    return;
  }

  if (await syncQueueItemViaApi(item)) {
    return;
  }

  try {
    if (item.type === SYNC_EVENTS.saleFinished) {
      await syncSale(client, item.payload);
      return;
    }

    if (item.type === SYNC_EVENTS.cashMovementRegistered) {
      await syncCashMovement(client, item.payload);
      return;
    }

    if (item.type === SYNC_EVENTS.stockLaunchCreated) {
      await upsert(client, 'stock_production', mapStockLaunchToRow(item.payload));
      return;
    }

    if (item.type === SYNC_EVENTS.stockLaunchUpdated || item.type === SYNC_EVENTS.stockLaunchCanceled) {
      await upsert(client, 'stock_production', mapStockLaunchToRow(item.payload));
      return;
    }

    if (item.type === SYNC_EVENTS.showcaseProductCleared) {
      await clearOnlineShowcaseProduct(client, item.payload);
      return;
    }

    if (item.type === SYNC_EVENTS.showcaseWriteOffCreated) {
      await upsert(client, 'showcase_write_offs', mapWriteOffToRow(item.payload));
      return;
    }

    if (item.type === SYNC_EVENTS.transactionHistoryCleared) {
      await clearOnlineTransactionHistory(client, item.payload);
    }
  } catch (error) {
    throw error;
  }
}

async function syncQueueItemViaApi(item) {
  const token = await getAccessToken();

  if (!token) {
    return false;
  }

  let response;

  try {
    response = await getSyncFetch()('/api/sync-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ event: item })
    });
  } catch {
    return false;
  }

  if (response.ok) {
    return true;
  }

  const data = await readResponseJson(response);
  throw new Error(data.error || `API de sincronizacao retornou ${response.status}.`);
}

async function getAccessToken() {
  try {
    const client = await getOnlineClient();
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || '';
  } catch {
    return '';
  }
}

function getSyncFetch() {
  return syncFetchForTests || globalThis.fetch;
}

async function readResponseJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function syncSale(client, sale) {
  await upsert(client, 'sales', mapSaleToRow(sale));

  const items = (sale.items || []).map((item) => ({
    id: `${sale.id}-${item.productId}`,
    sale_id: sale.id,
    product_id: item.productId,
    name: item.name,
    quantity: Number(item.quantity) || 0,
    unit_price: Number(item.price || item.unitPrice) || 0,
    total: Number(item.total) || 0
  }));

  if (items.length) {
    try {
      await upsert(client, 'sale_items', items);
    } catch (error) {
      console.warn('Venda sincronizada sem itens normalizados. Mantendo payload completo em sales.', error);
    }
  }
}

async function syncCashMovement(client, movement) {
  await upsert(client, 'cash_movements', mapCashMovementToRow(movement));
}

async function clearOnlineTransactionHistory(client, payload = {}) {
  if (payload?.startAt || payload?.endAt) {
    await Promise.all([
      deleteRowsByCreatedAt(client, 'cash_movements', payload),
      deleteRowsByCreatedAt(client, 'notifications', payload, { column: 'type', value: 'sale_backup' })
    ]);
    await deleteRowsByCreatedAt(client, 'sales', payload);
    return;
  }

  if (payload?.period && payload.period !== 'all') {
    return;
  }

  await Promise.all([
    deleteRows(client, 'sale_items'),
    deleteRows(client, 'cash_movements'),
    deleteRows(client, 'notifications', 'type', 'sale_backup')
  ]);
  await deleteRows(client, 'sales');
}

async function clearOnlineShowcaseProduct(client, payload = {}) {
  const ids = Array.isArray(payload?.launchIds) ? payload.launchIds.filter(Boolean) : [];

  if (ids.length) {
    await Promise.all(ids.map((id) => updateRows(client, 'stock_production', {
      column: 'id',
      value: id,
      changes: {
        status: 'cancelado',
        canceled_at: payload.clearedAt || new Date().toISOString()
      }
    })));
    return;
  }

  if (payload?.productId) {
    await updateRowsByCreatedAt(client, 'stock_production', {
      ...payload,
      equalityFilter: { column: 'product_id', value: payload.productId },
      changes: {
        status: 'cancelado',
        canceled_at: payload.clearedAt || new Date().toISOString()
      }
    });
  }
}

async function upsert(client, table, payload) {
  const { error } = await client.from(table).upsert(payload);

  if (error) {
    throw new Error(error.message || `Falha ao sincronizar ${table}.`);
  }
}

async function deleteRows(client, table, column = 'id', value = null) {
  const query = client.from(table).delete();
  const { error } = value === null
    ? await query.not(column, 'is', null)
    : await query.eq(column, value);

  if (error) {
    throw new Error(error.message || `Falha ao limpar ${table}.`);
  }
}

async function deleteRowsByCreatedAt(client, table, { startAt = null, endAt = null } = {}, equalityFilter = null) {
  let query = client.from(table).delete();

  if (equalityFilter) {
    query = query.eq(equalityFilter.column, equalityFilter.value);
  }

  if (startAt) {
    query = query.gte('created_at', startAt);
  }

  if (endAt) {
    query = query.lt('created_at', endAt);
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message || `Falha ao limpar ${table}.`);
  }
}

async function updateRowsByCreatedAt(client, table, { startAt = null, endAt = null, equalityFilter = null, changes = {} } = {}) {
  let query = client.from(table).update(changes);

  if (equalityFilter) {
    query = query.eq(equalityFilter.column, equalityFilter.value);
  }

  if (startAt) {
    query = query.gte('created_at', startAt);
  }

  if (endAt) {
    query = query.lt('created_at', endAt);
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message || `Falha ao atualizar ${table}.`);
  }
}

async function updateRows(client, table, { column, value, changes = {} }) {
  const { error } = await client.from(table).update(changes).eq(column, value);

  if (error) {
    throw new Error(error.message || `Falha ao atualizar ${table}.`);
  }
}

async function selectRows(client, table, limit) {
  const { data, error } = await client
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || `Falha ao carregar ${table}.`);
  }

  return data || [];
}

function replaceOnlineCollection(storageKey, incomingItems, preservedIds = new Set()) {
  const currentItems = getItem(storageKey, []);
  const preservedLocalItems = currentItems.filter((item) => preservedIds.has(item.id));
  const byId = new Map(preservedLocalItems.map((item) => [item.id, item]));

  incomingItems.filter(Boolean).forEach((item) => {
    byId.set(item.id, {
      ...(byId.get(item.id) || {}),
      ...item
    });
  });

  setItem(storageKey, Array.from(byId.values()).sort(sortNewestFirst));
}

function getPendingPayloadIds(eventTypes) {
  const allowedTypes = new Set(eventTypes);
  return new Set(getPendingSyncQueue()
    .filter((item) => allowedTypes.has(item.type))
    .map((item) => item.payload?.id)
    .filter(Boolean));
}

function getPendingComandaIds() {
  return new Set(getPendingSyncQueue()
    .filter((item) => item.type === SYNC_EVENTS.saleFinished)
    .map((item) => item.payload?.comandaId || `closed-${item.payload?.id}`)
    .filter(Boolean));
}

function sortNewestFirst(a, b) {
  return new Date(getItemDate(b)).getTime() - new Date(getItemDate(a)).getTime();
}

function getItemDate(item) {
  return item.createdAt || item.dataHora || item.closedAt || item.updatedAt || 0;
}

function mapSaleToRow(sale) {
  const paymentMethod = normalizePaymentMethod(sale.paymentMethod);

  return {
    id: sale.id,
    status: sale.status || 'ativa',
    command_id: null,
    command_number: sale.comandaNumber || null,
    total: Number(sale.total) || 0,
    payment_method: paymentMethod,
    received_amount: Number(sale.receivedAmount) || 0,
    change_amount: Number(sale.change) || 0,
    created_at: sale.createdAt || new Date().toISOString(),
    canceled_at: sale.canceledAt || null,
    payload: {
      ...sale,
      paymentMethod
    }
  };
}

function mapCashMovementToRow(movement) {
  return {
    id: movement.id,
    type: movement.type,
    status: movement.status || 'ativa',
    amount: Number(movement.amount) || 0,
    category: movement.category || 'sem-categoria',
    description: movement.description || '',
    user_name: movement.userName || 'Local',
    created_at: movement.createdAt || new Date().toISOString(),
    canceled_at: movement.canceledAt || null,
    payload: movement
  };
}

function mapStockLaunchToRow(launch) {
  return {
    id: launch.id,
    product_id: launch.produtoId,
    product_name: launch.produtoNome,
    category_id: launch.categoriaId,
    category_name: launch.categoriaNome,
    quantity: Number(launch.quantidade) || 0,
    unit_value: Number(launch.valorUnitario) || 0,
    total_value: Number(launch.valorTotal) || 0,
    status: launch.status || 'ativo',
    created_at: launch.dataHora || launch.createdAt || new Date().toISOString(),
    canceled_at: launch.canceledAt || null,
    payload: launch
  };
}

function mapWriteOffToRow(writeOff) {
  return {
    id: writeOff.id,
    product_id: writeOff.productId,
    product_name: writeOff.productName,
    category_id: writeOff.categoryId,
    category_name: writeOff.categoryName,
    quantity: Number(writeOff.quantity) || 0,
    unit_value: Number(writeOff.unitValue) || 0,
    total_value: Number(writeOff.totalValue) || 0,
    reason: writeOff.reason || 'ajuste',
    note: writeOff.note || '',
    status: writeOff.status || 'ativa',
    created_at: writeOff.createdAt || new Date().toISOString(),
    canceled_at: writeOff.canceledAt || null,
    payload: writeOff
  };
}

function mapSaleRowToTransaction(row) {
  const sale = row.payload || {
    id: row.id,
    type: 'venda',
    status: row.status,
    comandaId: row.command_id,
    comandaNumber: row.command_number,
    items: [],
    total: Number(row.total) || 0,
    paymentMethod: row.payment_method,
    receivedAmount: Number(row.received_amount) || 0,
    change: Number(row.change_amount) || 0,
    createdAt: row.created_at,
    canceledAt: row.canceled_at
  };

  return {
    ...sale,
    type: 'venda',
    status: sale.status || row.status || 'ativa',
    items: Array.isArray(sale.items) ? sale.items : [],
    total: Number(sale.total || row.total) || 0,
    paymentMethod: normalizePaymentMethod(sale.paymentMethod || row.payment_method),
    createdAt: sale.createdAt || row.created_at
  };
}

function mapSaleRowToClosedComanda(row) {
  const sale = mapSaleRowToTransaction(row);
  const comandaId = sale.comandaId || `closed-${sale.id}`;

  return {
    id: comandaId,
    number: sale.comandaNumber || row.command_number || 0,
    status: sale.status === 'cancelada' ? 'cancelada' : 'fechada',
    items: sale.items,
    total: Number(sale.total) || 0,
    paymentMethod: normalizePaymentMethod(sale.paymentMethod),
    receivedAmount: Number(sale.receivedAmount) || 0,
    change: Number(sale.change) || 0,
    closedAt: sale.createdAt || row.created_at,
    canceledAt: sale.canceledAt || row.canceled_at
  };
}

function mapCashMovementRowToTransaction(row) {
  return row.payload || {
    id: row.id,
    type: row.type,
    status: row.status,
    amount: Number(row.amount) || 0,
    category: row.category,
    description: row.description,
    userName: row.user_name,
    createdAt: row.created_at,
    canceledAt: row.canceled_at
  };
}

function mapStockRowToLaunch(row) {
  const launch = row.payload || {
    id: row.id,
    produtoId: row.product_id,
    produtoNome: row.product_name,
    categoriaId: row.category_id,
    categoriaNome: row.category_name,
    quantidade: Number(row.quantity) || 0,
    valorUnitario: Number(row.unit_value) || 0,
    valorTotal: Number(row.total_value) || 0,
    dataHora: row.created_at,
    status: row.status,
    canceledAt: row.canceled_at
  };

  return {
    ...launch,
    status: row.status || launch.status || 'ativo',
    canceledAt: row.canceled_at || launch.canceledAt || null
  };
}

function mapWriteOffRowToLocal(row) {
  const writeOff = row.payload || {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    quantity: Number(row.quantity) || 0,
    unitValue: Number(row.unit_value) || 0,
    totalValue: Number(row.total_value) || 0,
    reason: row.reason,
    note: row.note,
    createdAt: row.created_at,
    status: row.status,
    canceledAt: row.canceled_at
  };

  return {
    ...writeOff,
    status: row.status || writeOff.status || 'ativa',
    canceledAt: row.canceled_at || writeOff.canceledAt || null
  };
}

function normalizePaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  return ['dinheiro', 'pix', 'debito', 'credito'].includes(method) ? method : 'dinheiro';
}
