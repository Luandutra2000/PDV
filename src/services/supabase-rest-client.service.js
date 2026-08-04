import { getRuntimeConfig, isSupabaseEnabled } from './app-config.service.js?v=20260804-03';

export function getSupabaseRestClient() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  const config = getRuntimeConfig();
  const baseUrl = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
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
    upsert(rows) {
      return requestJson(`${baseUrl}/${table}`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=representation'
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
    const response = await fetch(url, options);
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
