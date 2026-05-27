import {
  getBearerToken,
  getConfig,
  getCurrentUser,
  requestJson,
  sendJson,
  serviceHeaders
} from './_people-utils.mjs';

const SNAPSHOT_TABLES = [
  'sales',
  'cash_movements',
  'stock_production',
  'showcase_write_offs',
  'notifications'
];

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
    const snapshot = await loadSnapshot({ ...config.value, limit: normalizeLimit(body?.limit), fetch: requestFetch });
    sendJson(res, 200, snapshot);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || 'Nao foi possivel carregar snapshot.' });
  }
}

async function loadSnapshot({ supabaseUrl, serviceRoleKey, limit, fetch }) {
  const headers = serviceHeaders(serviceRoleKey);
  const [sales, movements, launches, writeOffs, notifications, saleItems] = await Promise.all([
    ...SNAPSHOT_TABLES.map((table) => selectRows({ supabaseUrl, headers, table, limit, fetch })),
    selectRows({ supabaseUrl, headers, table: 'sale_items', limit: limit * 8, fetch, orderByCreatedAt: false })
  ]);
  const backupSales = notifications
    .filter((notification) => notification.type === 'sale_backup' && notification.payload)
    .map((notification) => ({
      id: notification.payload.id || notification.id,
      status: notification.payload.status || 'ativa',
      command_id: notification.payload.comandaId || null,
      command_number: notification.payload.comandaNumber || null,
      total: Number(notification.payload.total) || 0,
      payment_method: notification.payload.paymentMethod || 'dinheiro',
      received_amount: Number(notification.payload.receivedAmount) || 0,
      change_amount: Number(notification.payload.change) || 0,
      created_at: notification.payload.createdAt || notification.created_at,
      canceled_at: notification.payload.canceledAt || null,
      payload: notification.payload
    }));

  return {
    sales: mergeRowsById([
      ...sales.map((sale) => hydrateSalePayload(sale, saleItems)),
      ...backupSales
    ]),
    cash_movements: movements,
    stock_production: launches,
    showcase_write_offs: writeOffs
  };
}

function mergeRowsById(rows) {
  const byId = new Map();

  rows.forEach((row) => {
    if (row?.id) {
      byId.set(row.id, row);
    }
  });

  return Array.from(byId.values());
}

async function selectRows({ supabaseUrl, headers, table, limit, fetch, orderByCreatedAt = true }) {
  const query = new URLSearchParams({
    select: '*',
    limit: String(limit)
  });

  if (orderByCreatedAt) {
    query.set('order', 'created_at.desc');
  }

  try {
    return await requestJson(`${supabaseUrl}/rest/v1/${table}?${query}`, headers, fetch);
  } catch (error) {
    if (table !== 'showcase_write_offs') {
      throw error;
    }

    return [];
  }
}

function normalizeLimit(value) {
  const limit = Number(value) || 120;
  return Math.min(Math.max(limit, 1), 500);
}

function hydrateSalePayload(sale, saleItems) {
  if (sale.payload) {
    return sale;
  }

  const items = saleItems
    .filter((item) => item.sale_id === sale.id)
    .map((item) => ({
      productId: item.product_id,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      price: Number(item.unit_price) || 0,
      unitPrice: Number(item.unit_price) || 0,
      total: Number(item.total) || 0
    }));

  return {
    ...sale,
    payload: {
      id: sale.id,
      type: 'venda',
      status: sale.status,
      comandaId: sale.command_id,
      comandaNumber: sale.command_number,
      items,
      total: Number(sale.total) || 0,
      paymentMethod: sale.payment_method,
      receivedAmount: Number(sale.received_amount) || 0,
      change: Number(sale.change_amount) || 0,
      createdAt: sale.created_at,
      canceledAt: sale.canceled_at
    }
  };
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
