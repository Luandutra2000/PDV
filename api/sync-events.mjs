import {
  getBearerToken,
  getConfig,
  getCurrentUser,
  httpError,
  readJson,
  sendJson,
  serviceHeaders
} from './_people-utils.mjs';

const SYNC_EVENTS = {
  saleFinished: 'SALE_FINISHED',
  cashMovementRegistered: 'CASH_MOVEMENT_REGISTERED',
  stockLaunchCreated: 'STOCK_LAUNCH_CREATED',
  stockLaunchUpdated: 'STOCK_LAUNCH_UPDATED',
  stockLaunchCanceled: 'STOCK_LAUNCH_CANCELED',
  showcaseProductCleared: 'SHOWCASE_PRODUCT_CLEARED',
  showcaseWriteOffCreated: 'SHOWCASE_WRITE_OFF_CREATED',
  transactionHistoryCleared: 'TRANSACTION_HISTORY_CLEARED'
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Metodo nao permitido.' });
    return;
  }

  const config = getConfig();

  if (!config.ok) {
    sendJson(res, 500, { error: config.error });
    return;
  }

  const accessToken = getBearerToken(req);

  if (!accessToken) {
    sendJson(res, 401, { error: 'Sessao obrigatoria.' });
    return;
  }

  try {
    const requestFetch = fetch;
    const body = await readRequestBody(req);
    await getCurrentUser({ ...config.value, accessToken, fetch: requestFetch });
    await syncEvent({ ...config.value, event: body?.event, fetch: requestFetch });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || 'Nao foi possivel sincronizar evento.' });
  }
}

async function syncEvent({ supabaseUrl, serviceRoleKey, event, fetch }) {
  if (!event?.type || !event?.payload) {
    throw httpError(400, 'Evento de sincronizacao invalido.');
  }

  if (event.type === SYNC_EVENTS.saleFinished) {
    await syncSale({ supabaseUrl, serviceRoleKey, sale: event.payload, fetch });
    return;
  }

  if (event.type === SYNC_EVENTS.cashMovementRegistered) {
    await syncCashMovement({ supabaseUrl, serviceRoleKey, movement: event.payload, fetch });
    return;
  }

  if (event.type === SYNC_EVENTS.stockLaunchCreated) {
    await syncStockLaunch({ supabaseUrl, serviceRoleKey, launch: event.payload, fetch });
    return;
  }

  if (event.type === SYNC_EVENTS.stockLaunchUpdated || event.type === SYNC_EVENTS.stockLaunchCanceled) {
    await syncStockLaunch({ supabaseUrl, serviceRoleKey, launch: event.payload, fetch });
    return;
  }

  if (event.type === SYNC_EVENTS.showcaseProductCleared) {
    await clearShowcaseProduct({ supabaseUrl, serviceRoleKey, payload: event.payload, fetch });
    return;
  }

  if (event.type === SYNC_EVENTS.showcaseWriteOffCreated) {
    await upsertRows({
      supabaseUrl,
      serviceRoleKey,
      table: 'showcase_write_offs',
      rows: [mapWriteOffToRow(event.payload)],
      fetch
    });
    return;
  }

  if (event.type === SYNC_EVENTS.transactionHistoryCleared) {
    await clearTransactionHistory({ supabaseUrl, serviceRoleKey, payload: event.payload, fetch });
    return;
  }

  throw httpError(400, 'Tipo de evento de sincronizacao invalido.');
}

async function clearTransactionHistory({ supabaseUrl, serviceRoleKey, payload = {}, fetch }) {
  const rangeQuery = buildCreatedAtQuery(payload);

  if (rangeQuery) {
    await Promise.all([
      deleteRows({ supabaseUrl, serviceRoleKey, table: 'cash_movements', query: rangeQuery, fetch }),
      deleteRows({ supabaseUrl, serviceRoleKey, table: 'notifications', query: buildCreatedAtQuery(payload, { type: 'sale_backup' }), fetch }),
      deleteRows({ supabaseUrl, serviceRoleKey, table: 'notifications', query: buildCreatedAtQuery(payload, { type: 'cash_movement_backup' }), fetch })
    ]);
    await deleteRows({ supabaseUrl, serviceRoleKey, table: 'sales', query: rangeQuery, fetch });
    return;
  }

  if (payload?.period && payload.period !== 'all') {
    return;
  }

  await Promise.all([
    deleteRows({ supabaseUrl, serviceRoleKey, table: 'sale_items', fetch }),
    deleteRows({ supabaseUrl, serviceRoleKey, table: 'cash_movements', fetch }),
    deleteRows({ supabaseUrl, serviceRoleKey, table: 'notifications', query: 'type=eq.sale_backup', fetch }),
    deleteRows({ supabaseUrl, serviceRoleKey, table: 'notifications', query: 'type=eq.cash_movement_backup', fetch })
  ]);
  await deleteRows({ supabaseUrl, serviceRoleKey, table: 'sales', fetch });
}

async function clearShowcaseProduct({ supabaseUrl, serviceRoleKey, payload = {}, fetch }) {
  const ids = Array.isArray(payload.launchIds) ? payload.launchIds.filter(Boolean) : [];
  const canceledAt = payload.clearedAt || new Date().toISOString();

  if (ids.length) {
    await Promise.all(ids.map((id) => clearShowcaseLaunch({
      supabaseUrl,
      serviceRoleKey,
      id,
      canceledAt,
      fetch
    })));
    return;
  }

  if (!payload.productId) {
    return;
  }

  const query = buildCreatedAtQuery(payload, { product_id: payload.productId });

  if (!query) {
    return;
  }

  await patchRows({
    supabaseUrl,
    serviceRoleKey,
    table: 'stock_production',
    query,
    row: {
      status: 'cancelado',
      canceled_at: canceledAt
    },
    fetch
  });
}

async function clearShowcaseLaunch({ supabaseUrl, serviceRoleKey, id, canceledAt, fetch }) {
  try {
    await patchRows({
      supabaseUrl,
      serviceRoleKey,
      table: 'stock_production',
      query: `id=eq.${encodeURIComponent(id)}`,
      row: {
        status: 'cancelado',
        canceled_at: canceledAt
      },
      fetch
    });
  } catch {
    // Quando a linha ficou no backup de notificacoes, limpar por id abaixo ainda remove da vitrine online.
  }

  await deleteRows({
    supabaseUrl,
    serviceRoleKey,
    table: 'notifications',
    query: `id=eq.${encodeURIComponent(`stock-backup-${id}`)}`,
    fetch
  });
}

function buildCreatedAtQuery({ startAt = null, endAt = null } = {}, extraFilters = {}) {
  if (!startAt && !endAt) {
    return '';
  }

  const query = new URLSearchParams();

  Object.entries(extraFilters).forEach(([key, value]) => {
    query.append(key, `eq.${value}`);
  });

  if (startAt) {
    query.append('created_at', `gte.${startAt}`);
  }

  if (endAt) {
    query.append('created_at', `lt.${endAt}`);
  }

  return query.toString();
}

async function syncSale({ supabaseUrl, serviceRoleKey, sale, fetch }) {
  let saleSynced = false;

  try {
    await upsertRows({
      supabaseUrl,
      serviceRoleKey,
      table: 'sales',
      rows: [mapSaleToRow(sale)],
      fetch
    });
    saleSynced = true;
  } catch (error) {
    try {
      await upsertRows({
        supabaseUrl,
        serviceRoleKey,
        table: 'sales',
        rows: [mapSaleToRow(sale, { includePayload: false })],
        fetch
      });
      saleSynced = true;
    } catch (fallbackError) {
      await upsertNotificationBackup({
        supabaseUrl,
        serviceRoleKey,
        notification: mapSaleToNotification(sale, fallbackError.message || error.message),
        fetch
      });
    }
  }

  const items = (sale.items || []).map((item) => ({
    id: `${sale.id}-${item.productId}`,
    sale_id: sale.id,
    product_id: item.productId,
    name: item.name,
    quantity: Number(item.quantity) || 0,
    unit_price: Number(item.price || item.unitPrice) || 0,
    total: Number(item.total) || 0
  }));

  if (!items.length) {
    return;
  }

  if (!saleSynced) {
    return;
  }

  try {
    await upsertRows({
      supabaseUrl,
      serviceRoleKey,
      table: 'sale_items',
      rows: items,
      fetch
    });
  } catch {
    // A venda ja fica completa em sales.payload mesmo quando itens normalizados falham.
  }
}

async function syncCashMovement({ supabaseUrl, serviceRoleKey, movement, fetch }) {
  try {
    await upsertRows({
      supabaseUrl,
      serviceRoleKey,
      table: 'cash_movements',
      rows: [mapCashMovementToRow(movement)],
      fetch
    });
  } catch (error) {
    await upsertNotificationBackup({
      supabaseUrl,
      serviceRoleKey,
      notification: mapCashMovementToNotification(movement, error.message),
      fetch
    });
  }
}

async function syncStockLaunch({ supabaseUrl, serviceRoleKey, launch, fetch }) {
  try {
    await upsertRows({
      supabaseUrl,
      serviceRoleKey,
      table: 'stock_production',
      rows: [mapStockLaunchToRow(launch)],
      fetch
    });
  } catch (error) {
    await upsertNotificationBackup({
      supabaseUrl,
      serviceRoleKey,
      notification: mapStockLaunchToNotification(launch, error.message),
      fetch
    });
  }
}

async function upsertNotificationBackup({ supabaseUrl, serviceRoleKey, notification, fetch }) {
  try {
    await upsertRows({
      supabaseUrl,
      serviceRoleKey,
      table: 'notifications',
      rows: [notification],
      fetch
    });
  } catch {
    // Se o backup tambem falhar, nao derruba o caixa: a fila local continua preservada no cliente.
  }
}

async function deleteRows({ supabaseUrl, serviceRoleKey, table, fetch, query = 'id=not.is.null' }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: {
      ...serviceHeaders(serviceRoleKey),
      Prefer: 'return=minimal'
    }
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || `Falha ao limpar ${table}.`);
  }
}

async function upsertRows({ supabaseUrl, serviceRoleKey, table, rows, fetch }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(serviceRoleKey),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || `Falha ao salvar ${table}.`);
  }
}

async function patchRows({ supabaseUrl, serviceRoleKey, table, query, row, fetch }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      ...serviceHeaders(serviceRoleKey),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(row)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || `Falha ao atualizar ${table}.`);
  }
}

function mapSaleToRow(sale, { includePayload = true } = {}) {
  const paymentMethod = normalizePaymentMethod(sale.paymentMethod);
  const row = {
    id: sale.id,
    status: sale.status || 'ativa',
    command_id: null,
    command_number: sale.comandaNumber || null,
    total: Number(sale.total) || 0,
    payment_method: paymentMethod,
    received_amount: Number(sale.receivedAmount) || 0,
    change_amount: Number(sale.change) || 0,
    created_at: sale.createdAt || new Date().toISOString(),
    canceled_at: sale.canceledAt || null
  };

  if (!includePayload) {
    return row;
  }

  return {
    ...row,
    payload: {
      ...sale,
      paymentMethod
    }
  };
}

function mapSaleToNotification(sale, errorMessage = '') {
  return {
    id: `sale-backup-${sale.id}`,
    type: 'sale_backup',
    level: 'success',
    title: 'Venda realizada',
    message: `Venda registrada no backup${errorMessage ? `: ${errorMessage}` : ''}`,
    payload: {
      id: sale.id,
      type: 'venda',
      status: sale.status || 'ativa',
      comandaId: sale.comandaId || null,
      comandaNumber: sale.comandaNumber || null,
      items: Array.isArray(sale.items) ? sale.items : [],
      total: Number(sale.total) || 0,
      paymentMethod: normalizePaymentMethod(sale.paymentMethod),
      receivedAmount: Number(sale.receivedAmount) || 0,
      change: Number(sale.change) || 0,
      createdAt: sale.createdAt || new Date().toISOString(),
      syncBackup: true
    },
    created_at: sale.createdAt || new Date().toISOString()
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

function mapCashMovementToNotification(movement, errorMessage = '') {
  const type = movement.type === 'saida' ? 'saida' : 'entrada';
  const amount = Number(movement.amount) || 0;
  const createdAt = movement.createdAt || new Date().toISOString();

  return {
    id: `cash-backup-${movement.id}`,
    type: 'cash_movement_backup',
    level: type === 'saida' ? 'warning' : 'success',
    title: type === 'saida' ? 'Saida de caixa' : 'Entrada de caixa',
    message: `Movimento registrado no backup${errorMessage ? `: ${errorMessage}` : ''}`,
    payload: {
      id: movement.id,
      type,
      status: movement.status || 'ativa',
      amount,
      category: movement.category || 'sem-categoria',
      description: movement.description || '',
      userName: movement.userName || 'Local',
      createdAt,
      canceledAt: movement.canceledAt || null,
      syncBackup: true
    },
    created_at: createdAt
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

function mapStockLaunchToNotification(launch, errorMessage = '') {
  const createdAt = launch.dataHora || launch.createdAt || new Date().toISOString();

  return {
    id: `stock-backup-${launch.id}`,
    type: 'stock_launch_backup',
    level: 'info',
    title: 'Vitrine atualizada',
    message: `Lancamento de vitrine registrado no backup${errorMessage ? `: ${errorMessage}` : ''}`,
    payload: {
      id: launch.id,
      produtoId: launch.produtoId,
      produtoNome: launch.produtoNome,
      categoriaId: launch.categoriaId,
      categoriaNome: launch.categoriaNome,
      quantidade: Number(launch.quantidade) || 0,
      valorUnitario: Number(launch.valorUnitario) || 0,
      valorTotal: Number(launch.valorTotal) || 0,
      dataHora: createdAt,
      status: launch.status || 'ativo',
      canceledAt: launch.canceledAt || null,
      syncBackup: true
    },
    created_at: createdAt
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

function normalizePaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  return ['dinheiro', 'pix', 'debito', 'credito'].includes(method) ? method : 'dinheiro';
}

async function readRequestBody(req) {
  if (isBufferLike(req.body)) {
    return parseJson(Buffer.from(req.body).toString('utf8'));
  }

  if (req.body && typeof req.body !== 'string') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return parseJson(req.body);
  }

  if (!req[Symbol.asyncIterator]) {
    return {};
  }

  let raw = '';

  for await (const chunk of req) {
    raw += chunk;
  }

  return parseJson(raw);
}

function parseJson(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function isBufferLike(value) {
  return value && (
    Buffer.isBuffer(value)
      || value instanceof Uint8Array
      || value?.type === 'Buffer'
  );
}
