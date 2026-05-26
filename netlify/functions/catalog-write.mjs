const JSON_HEADERS = {
  'Content-Type': 'application/json'
};

const TABLES = {
  categories: 'categories',
  products: 'products'
};

export async function handler(event, _context = {}, deps = {}) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Metodo nao permitido.' });
  }

  const env = deps.env || process.env;
  const requestFetch = deps.fetch || fetch;
  const config = getConfig(env);

  if (!config.ok) {
    return json(500, { error: config.error });
  }

  const authHeader = getHeader(event.headers, 'authorization');
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!accessToken || accessToken === authHeader) {
    return json(401, { error: 'Sessao obrigatoria.' });
  }

  const payload = parsePayload(event.body);
  const table = TABLES[payload.resource];

  if (!table || !['upsert', 'delete'].includes(payload.action)) {
    return json(400, { error: 'Operacao de catalogo invalida.' });
  }

  try {
    const currentUser = await getCurrentUser({ ...config.value, accessToken, fetch: requestFetch });
    await requireProductManager({ ...config.value, userId: currentUser.id, fetch: requestFetch });
    const result = payload.action === 'upsert'
      ? await upsertRecord({ ...config.value, table, record: payload.record, fetch: requestFetch })
      : await deleteRecord({ ...config.value, table, id: payload.id, fetch: requestFetch });

    return json(200, { result });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'Nao foi possivel salvar no banco.' });
  }
}

function getConfig(env) {
  const supabaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return {
      ok: false,
      error: 'Variaveis SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias.'
    };
  }

  return {
    ok: true,
    value: {
      supabaseUrl,
      anonKey,
      serviceRoleKey
    }
  };
}

function parsePayload(body) {
  try {
    return JSON.parse(body || '{}');
  } catch {
    return {};
  }
}

async function getCurrentUser({ supabaseUrl, anonKey, accessToken, fetch }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await readJson(response);

  if (!response.ok || !data.id) {
    throw httpError(401, 'Sessao invalida.');
  }

  return data;
}

async function requireProductManager({ supabaseUrl, serviceRoleKey, userId, fetch }) {
  const profileUrl = `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role,is_active`;
  const profiles = await requestJson(profileUrl, serviceHeaders(serviceRoleKey), fetch);
  const profile = profiles[0];

  if (!profile?.is_active) {
    throw httpError(403, 'Usuario sem permissao para alterar produtos.');
  }

  if (profile.role === 'admin') {
    return;
  }

  const permissionUrl = `${supabaseUrl}/rest/v1/role_permissions?role_id=eq.${encodeURIComponent(profile.role)}&permission_id=eq.products.manage&select=permission_id`;
  const permissions = await requestJson(permissionUrl, serviceHeaders(serviceRoleKey), fetch);

  if (!permissions.length) {
    throw httpError(403, 'Usuario sem permissao para alterar produtos.');
  }
}

async function upsertRecord({ supabaseUrl, serviceRoleKey, table, record, fetch }) {
  if (!record?.id) {
    throw httpError(400, 'Registro invalido.');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(serviceRoleKey),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify([record])
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || 'Falha ao salvar no banco.');
  }

  return data[0];
}

async function deleteRecord({ supabaseUrl, serviceRoleKey, table, id, fetch }) {
  if (!id) {
    throw httpError(400, 'ID obrigatorio.');
  }

  if (table === 'categories') {
    await deleteByColumn({ supabaseUrl, serviceRoleKey, table: 'products', column: 'category_id', value: id, fetch });
  }

  return deleteByColumn({ supabaseUrl, serviceRoleKey, table, column: 'id', value: id, fetch });
}

async function deleteByColumn({ supabaseUrl, serviceRoleKey, table, column, value, fetch }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
    method: 'DELETE',
    headers: {
      ...serviceHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    }
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || 'Falha ao apagar no banco.');
  }

  return data;
}

async function requestJson(url, headers, fetch) {
  const response = await fetch(url, { headers });
  const data = await readJson(response);

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || 'Falha ao consultar Supabase.');
  }

  return data;
}

function serviceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function getHeader(headers = {}, name) {
  const target = name.toLowerCase();
  const key = Object.keys(headers).find((item) => item.toLowerCase() === target);
  return key ? String(headers[key] || '') : '';
}

function normalizeSupabaseUrl(url = '') {
  return String(url).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: statusCode === 204 ? '' : JSON.stringify(body)
  };
}
