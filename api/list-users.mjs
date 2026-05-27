import {
  getBearerToken,
  getConfig,
  getCurrentUser,
  requireUserManager,
  requestJson,
  sendJson,
  serviceHeaders
} from './_people-utils.mjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'GET') {
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
    const currentUser = await getCurrentUser({ ...config.value, accessToken, fetch: requestFetch });
    await requireUserManager({ ...config.value, userId: currentUser.id, fetch: requestFetch });
    const people = await requestJson(
      `${config.value.supabaseUrl}/rest/v1/profiles?select=*&order=name.asc`,
      serviceHeaders(config.value.serviceRoleKey),
      requestFetch
    );

    sendJson(res, 200, { people: people.map(mapProfile) });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || 'Nao foi possivel listar usuarios.' });
  }
}

function mapProfile(profile) {
  return {
    ...profile,
    role: profile.role || profile.role_id
  };
}
