const JSON_HEADERS = {
  'Content-Type': 'application/json'
};

export async function handler(event, _context = {}, deps = {}) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod !== 'GET') {
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

  try {
    await getCurrentUser({ ...config.value, accessToken, fetch: requestFetch });
    const [categories, products] = await Promise.all([
      requestJson(`${config.value.supabaseUrl}/rest/v1/categories?select=*&order=name.asc`, serviceHeaders(config.value.serviceRoleKey), requestFetch),
      requestJson(`${config.value.supabaseUrl}/rest/v1/products?select=*&order=name.asc`, serviceHeaders(config.value.serviceRoleKey), requestFetch)
    ]);

    return json(200, { categories, products });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'Nao foi possivel carregar catalogo.' });
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
