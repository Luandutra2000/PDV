import {
  getBearerToken,
  getConfig,
  getCurrentUser,
  httpError,
  readJson,
  requireUserManager,
  sendJson,
  serviceHeaders,
  upsertProfile,
  VALID_ROLES
} from './_people-utils.mjs';

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

  const payload = normalizePayload(req.body || {});
  const validationError = validatePayload(payload);

  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }

  try {
    const requestFetch = fetch;
    const currentUser = await getCurrentUser({ ...config.value, accessToken, fetch: requestFetch });
    await requireUserManager({ ...config.value, userId: currentUser.id, fetch: requestFetch });
    const user = await createAuthUser({ ...config.value, payload, fetch: requestFetch });
    const profile = await upsertProfile({ ...config.value, userId: user.id, payload, fetch: requestFetch });

    sendJson(res, 200, { user, profile: { ...profile, role: profile.role || profile.role_id } });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || 'Nao foi possivel criar usuario.' });
  }
}

function normalizePayload(input) {
  return {
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim().toLowerCase(),
    password: String(input.password || ''),
    role: VALID_ROLES.has(input.role) ? input.role : 'operador'
  };
}

function validatePayload(payload) {
  if (!payload.name) {
    return 'Nome obrigatorio.';
  }

  if (!payload.email.includes('@')) {
    return 'Email invalido.';
  }

  if (payload.password.length < 6) {
    return 'Senha precisa ter pelo menos 6 caracteres.';
  }

  return '';
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
