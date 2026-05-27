export const JSON_HEADERS = {
  'Content-Type': 'application/json'
};

export const VALID_ROLES = new Set(['admin', 'dono', 'operador']);

export function getConfig(env = process.env) {
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
    value: { supabaseUrl, anonKey, serviceRoleKey }
  };
}

export async function getCurrentUser({ supabaseUrl, anonKey, accessToken, fetch }) {
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

export async function requireUserManager({ supabaseUrl, serviceRoleKey, userId, fetch }) {
  const profileUrl = `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`;
  const profiles = await requestJson(profileUrl, serviceHeaders(serviceRoleKey), fetch);
  const profile = profiles[0];
  const role = profile?.role || profile?.role_id;

  if (!profile?.is_active) {
    throw httpError(403, 'Usuario sem permissao para gerenciar pessoas.');
  }

  if (role === 'admin') {
    return;
  }

  const permissionUrl = `${supabaseUrl}/rest/v1/role_permissions?role_id=eq.${encodeURIComponent(role)}&permission_id=eq.users.manage&select=permission_id`;
  const permissions = await requestJson(permissionUrl, serviceHeaders(serviceRoleKey), fetch);

  if (!permissions.length) {
    throw httpError(403, 'Usuario sem permissao para gerenciar pessoas.');
  }
}

export async function upsertProfile({ supabaseUrl, serviceRoleKey, userId, payload, fetch }) {
  const baseRecord = {
    id: userId,
    name: payload.name,
    is_active: payload.is_active ?? true
  };

  try {
    return await writeProfile({
      supabaseUrl,
      serviceRoleKey,
      fetch,
      record: { ...baseRecord, role: payload.role }
    });
  } catch (error) {
    if (!String(error.message || '').includes('role')) {
      throw error;
    }

    return writeProfile({
      supabaseUrl,
      serviceRoleKey,
      fetch,
      record: { ...baseRecord, role_id: payload.role }
    });
  }
}

export async function writeProfile({ supabaseUrl, serviceRoleKey, record, fetch }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
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
    throw httpError(response.status, data.message || data.error || 'Falha ao salvar perfil.');
  }

  return data[0];
}

export async function requestJson(url, headers, fetch) {
  const response = await fetch(url, { headers });
  const data = await readJson(response);

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || 'Falha ao consultar Supabase.');
  }

  return data;
}

export function serviceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

export async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  return token && token !== header ? token : '';
}

export function normalizeSupabaseUrl(url = '') {
  return String(url).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  Object.entries(JSON_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
  res.end(statusCode === 204 ? '' : JSON.stringify(body));
}
