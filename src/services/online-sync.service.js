import { STORAGE_KEYS, SYNC_EVENTS, UI_EVENTS } from '../database/schema.js';
import { emit } from './event-bus.service.js';
import { isSupabaseEnabled } from './app-config.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { getItem, setItem } from './storage.service.js';

const MAX_ATTEMPTS = 12;
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

  const client = await getOnlineClient();
  const [sales, movements, launches, writeOffs] = await Promise.all([
    selectRows(client, 'sales', limit),
    selectRows(client, 'cash_movements', limit),
    selectRows(client, 'stock_production', limit),
    selectRows(client, 'showcase_write_offs', limit)
  ]);

  mergeCollection(STORAGE_KEYS.transactions, [
    ...sales.map(mapSaleRowToTransaction),
    ...movements.map(mapCashMovementRowToTransaction)
  ]);
  mergeCollection(STORAGE_KEYS.stockLaunches, launches.map(mapStockRowToLaunch));
  mergeCollection(STORAGE_KEYS.showcaseWriteOffs, writeOffs.map(mapWriteOffRowToLocal));

  emit(UI_EVENTS.mobileFeedChanged, { type: 'online-snapshot-loaded' });
  emit(UI_EVENTS.cashSummaryChanged, { type: 'online-snapshot-loaded' });
}

async function getOnlineClient() {
  return clientForTests || getSupabaseClient();
}

async function syncQueueItem(client, item) {
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

    if (item.type === SYNC_EVENTS.showcaseWriteOffCreated) {
      await upsert(client, 'showcase_write_offs', mapWriteOffToRow(item.payload));
    }
  } catch (error) {
    await syncQueueItemViaApi(item, error);
  }
}

async function syncQueueItemViaApi(item, originalError) {
  const token = await getAccessToken();

  if (!token) {
    throw originalError;
  }

  const response = await getSyncFetch()('/api/sync-events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ event: item })
  });
  const data = await readResponseJson(response);

  if (!response.ok) {
    throw new Error(data.error || originalError.message || 'Falha ao sincronizar pelo servidor.');
  }
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

async function upsert(client, table, payload) {
  const { error } = await client.from(table).upsert(payload);

  if (error) {
    throw new Error(error.message || `Falha ao sincronizar ${table}.`);
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

function mergeCollection(storageKey, incomingItems) {
  const currentItems = getItem(storageKey, []);
  const byId = new Map(currentItems.map((item) => [item.id, item]));

  incomingItems.filter(Boolean).forEach((item) => {
    byId.set(item.id, {
      ...(byId.get(item.id) || {}),
      ...item
    });
  });

  setItem(storageKey, Array.from(byId.values()).sort(sortNewestFirst));
}

function sortNewestFirst(a, b) {
  return new Date(getItemDate(b)).getTime() - new Date(getItemDate(a)).getTime();
}

function getItemDate(item) {
  return item.createdAt || item.dataHora || item.closedAt || item.updatedAt || 0;
}

function mapSaleToRow(sale) {
  return {
    id: sale.id,
    status: sale.status || 'ativa',
    command_id: null,
    command_number: sale.comandaNumber || null,
    total: Number(sale.total) || 0,
    payment_method: sale.paymentMethod,
    received_amount: Number(sale.receivedAmount) || 0,
    change_amount: Number(sale.change) || 0,
    created_at: sale.createdAt || new Date().toISOString(),
    canceled_at: sale.canceledAt || null,
    payload: sale
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
  return row.payload || {
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
  return row.payload || {
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
}

function mapWriteOffRowToLocal(row) {
  return row.payload || {
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
}
