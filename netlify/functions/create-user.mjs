const JSON_HEADERS = {
  'Content-Type': 'application/json'
};

const VALID_ROLES = new Set(['admin', 'operador']);

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
  const validationError = validatePayload(payload);

  if (validationError) {
    return json(400, { error: validationError });
  }

  try {
    const currentUser = await getCurrentUser({ ...config.value, accessToken, fetch: requestFetch });
    await requireUserManager({ ...config.value, userId: currentUser.id, fetch: requestFetch });
    const user = await createAuthUser({ ...config.value, payload, fetch: requestFetch });
    const profile = await upsertProfile({ ...config.value, userId: user.id, payload, fetch: requestFetch });

    return json(200, { user, profile });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'Nao foi possivel criar usuario.' });
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

function validatePayload(payload) {
  if (!String(payload.name || '').trim()) {
    return 'Nome obrigatorio.';
  }

  if (!String(payload.email || '').includes('@')) {
    return 'Email invalido.';
  }

  if (String(payload.password || '').length < 6) {
    return 'Senha precisa ter pelo menos 6 caracteres.';
  }

  if (!VALID_ROLES.has(payload.role)) {
    return 'Perfil invalido.';
  }

  return '';
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

async function requireUserManager({ supabaseUrl, serviceRoleKey, userId, fetch }) {
  const profileUrl = `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role,is_active`;
  const profiles = await requestJson(profileUrl, serviceHeaders(serviceRoleKey), fetch);
  const profile = profiles[0];

  if (!profile?.is_active) {
    throw httpError(403, 'Usuario sem permissao para criar pessoas.');
  }

  if (profile.role === 'admin') {
    return;
  }

  const permissionUrl = `${supabaseUrl}/rest/v1/role_permissions?role_id=eq.${encodeURIComponent(profile.role)}&permission_id=eq.users.manage&select=permission_id`;
  const permissions = await requestJson(permissionUrl, serviceHeaders(serviceRoleKey), fetch);

  if (!permissions.length) {
    throw httpError(403, 'Usuario sem permissao para criar pessoas.');
  }
}

async function createAuthUser({ supabaseUrl, serviceRoleKey, payload, fetch }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(serviceRoleKey),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        name: payload.name
      }
    })
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw httpError(response.status, data.msg || data.message || data.error || 'Falha ao criar usuario no Auth.');
  }

  return {
    id: data.id,
    email: data.email
  };
}

async function upsertProfile({ supabaseUrl, serviceRoleKey, userId, payload, fetch }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(serviceRoleKey),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify([{
      id: userId,
      name: payload.name,
      role: payload.role,
      is_active: true
    }])
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || 'Falha ao criar perfil.');
  }

  return data[0];
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
