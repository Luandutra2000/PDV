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
  'showcase_write_offs'
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
    const body = normalizeBody(req.body);
    await getCurrentUser({ ...config.value, accessToken, fetch: requestFetch });
    const snapshot = await loadSnapshot({ ...config.value, limit: normalizeLimit(body?.limit), fetch: requestFetch });
    sendJson(res, 200, snapshot);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || 'Nao foi possivel carregar snapshot.' });
  }
}

async function loadSnapshot({ supabaseUrl, serviceRoleKey, limit, fetch }) {
  const headers = serviceHeaders(serviceRoleKey);
  const [sales, movements, launches, writeOffs] = await Promise.all(
    SNAPSHOT_TABLES.map((table) => selectRows({ supabaseUrl, headers, table, limit, fetch }))
  );

  return {
    sales,
    cash_movements: movements,
    stock_production: launches,
    showcase_write_offs: writeOffs
  };
}

async function selectRows({ supabaseUrl, headers, table, limit, fetch }) {
  const query = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    limit: String(limit)
  });

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

function normalizeBody(body) {
  if (typeof body !== 'string') {
    return body || {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
