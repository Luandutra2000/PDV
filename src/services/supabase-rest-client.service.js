import { getRuntimeConfig, isSupabaseEnabled } from './app-config.service.js?v=20260804-06';
import { getSupabaseAuthSession } from './supabase-client.service.js?v=20260804-06';

export function getSupabaseRestClient() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  const config = getRuntimeConfig();
  const baseUrl = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: config.supabaseAnonKey,
    'Content-Type': 'application/json'
  };

  return {
    from(table) {
      return createTableClient({ baseUrl, headers, table });
    }
  };
}

function createTableClient({ baseUrl, headers, table }) {
  return {
    select(columns = '*') {
      return requestJson(`${baseUrl}/${table}?select=${encodeURIComponent(columns)}`, {
        method: 'GET',
        headers
      });
    },
    selectRange(columns = '*', from = 0, to = 999) {
      const limit = Math.max(0, to - from + 1);
      const query = `select=${encodeURIComponent(columns)}&offset=${encodeURIComponent(from)}&limit=${encodeURIComponent(limit)}`;
      return requestJson(`${baseUrl}/${table}?${query}`, {
        method: 'GET',
        headers
      });
    },
    upsert(rows, { onConflict, ignoreDuplicates = false } = {}) {
      const conflictQuery = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
      return requestJson(`${baseUrl}/${table}${conflictQuery}`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: `resolution=${ignoreDuplicates ? 'ignore' : 'merge'}-duplicates,return=representation`
        },
        body: JSON.stringify(rows)
      });
    },
    update(patch) {
      return {
        eq(column, value) {
          return requestJson(`${baseUrl}/${table}?${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`, {
            method: 'PATCH',
            headers: {
              ...headers,
              Prefer: 'return=representation'
            },
            body: JSON.stringify(patch)
          });
        }
      };
    },
    delete() {
      return {
        eq(column, value) {
          return requestJson(`${baseUrl}/${table}?${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`, {
            method: 'DELETE',
            headers
          });
        },
        in(column, values) {
          const encodedValues = values.map((value) => encodeFilterValue(value)).join(',');
          return requestJson(`${baseUrl}/${table}?${encodeURIComponent(column)}=in.(${encodedValues})`, {
            method: 'DELETE',
            headers
          });
        }
      };
    }
  };
}

async function requestJson(url, options) {
  try {
    let response = await fetchAuthenticated(url, options);
    if (response.status === 401) {
      response = await fetchAuthenticated(url, options, true);
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      return { data: null, error: createRestError(data, response.status) };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

async function fetchAuthenticated(url, options, forceRefresh = false) {
  // The SDK renews its session while the local user profile may still hold an expired token.
  const session = await getSupabaseAuthSession({ forceRefresh });
  if (!session?.access_token) {
    throw new Error('Sessao expirada. Entre novamente para sincronizar as vendas.');
  }
  return fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${session.access_token}` }
  });
}

function createRestError(data, status) {
  const message = data?.message || `Supabase REST retornou status ${status}.`;
  const error = new Error(message);
  error.code = data?.code || String(status);
  error.details = data?.details || '';
  error.hint = data?.hint || '';
  return error;
}

function encodeFilterValue(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}
