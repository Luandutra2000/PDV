import { isSupabaseEnabled } from './app-config.service.js';
import { getCurrentSession } from './auth.service.js';

let peopleFetchForTests = null;

export function setPeopleFetchForTests(fetcher) {
  peopleFetchForTests = fetcher;
}

export async function listPeople() {
  if (!isSupabaseEnabled()) {
    return [];
  }

  const session = await getCurrentSession();

  if (!session?.access_token) {
    throw new Error('Sessao expirada. Entre novamente.');
  }

  const response = await getPeopleFetch()('/.netlify/functions/list-users', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Nao foi possivel listar usuarios.');
  }

  return (data.people || []).map(mapProfile);
}

export async function createPersonUser(input = {}) {
  const payload = normalizePayload(input);
  const session = await getCurrentSession();

  if (!session?.access_token) {
    throw new Error('Sessao expirada. Entre novamente.');
  }

  const response = await getPeopleFetch()('/.netlify/functions/create-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Nao foi possivel criar usuario.');
  }

  return data;
}

function normalizePayload(input) {
  return {
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim().toLowerCase(),
    password: String(input.password || ''),
    role: ['admin', 'operador'].includes(input.role) ? input.role : 'operador'
  };
}

function mapProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    active: profile.is_active,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at
  };
}

function getPeopleFetch() {
  return peopleFetchForTests || fetch;
}
