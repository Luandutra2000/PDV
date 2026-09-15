const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const calls = [];

const localStore = new Map();
globalThis.localStorage = {
  getItem(key) {
    return localStore.has(key) ? localStore.get(key) : null;
  },
  setItem(key, value) {
    localStore.set(key, String(value));
  },
  removeItem(key) {
    localStore.delete(key);
  },
  clear() {
    localStore.clear();
  }
};

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  return {
    ok: true,
    status: 200,
    async text() {
      return '[]';
    }
  };
};

const { getSupabaseRestClient } = await import('../src/services/supabase-rest-client.service.js?v=20260804-06');
const { configureSupabaseClientForTests } = await import('../src/services/supabase-client.service.js?v=20260804-06');
let liveToken = 'session-jwt';
let refreshCount = 0;
configureSupabaseClientForTests({ client: { auth: {
  getSession: async () => ({ data: { session: liveToken ? { access_token: liveToken } : null } }),
  refreshSession: async () => {
    refreshCount += 1;
    liveToken = 'refreshed-jwt';
    return { data: { session: { access_token: liveToken } } };
  }
} } });

globalThis.localStorage.setItem('pdv.currentSession', JSON.stringify({ accessToken: 'session-jwt' }));

const client = getSupabaseRestClient();
await client.from('sales').select('id,total');
await client.from('sales').selectRange('id,total', 1000, 1999);
await client.from('sales').upsert([{ id: 'sale-1', total: 10 }]);
await client.from('sales').update({ status: 'cancelada' }).eq('id', 'sale-1');
await client.from('sale_items').delete().in('id', ['item-1', 'item-2']);
await client.from('sales').upsert([{ id: 'sale-1', total: 10 }], { onConflict: 'id', ignoreDuplicates: true });

assert(calls[0].url === 'https://example.supabase.co/rest/v1/sales?select=id%2Ctotal', 'select should call REST endpoint with selected columns');
assert(calls[0].options.headers.Authorization === 'Bearer session-jwt', 'REST should use the authenticated session token');
assert(calls[1].url.includes('offset=1000&limit=1000'), 'selectRange should paginate REST rows');
assert(calls[2].options.method === 'POST', 'upsert should use POST');
assert(calls[2].options.headers.Prefer.includes('resolution=merge-duplicates'), 'upsert should request merge duplicates');
assert(calls[3].options.method === 'PATCH', 'update eq should use PATCH');
assert(calls[3].url.includes('id=eq.sale-1'), 'update eq should filter by id');
assert(calls[4].options.method === 'DELETE', 'delete in should use DELETE');
assert(calls[4].url.includes('id=in.('), 'delete in should filter by id list');
assert(calls[5].options.headers.Prefer.includes('resolution=ignore-duplicates'), 'immutable sale retry must not request UPDATE permissions');
assert(calls[5].url.endsWith('?on_conflict=id'), 'upsert options must reach the real PostgREST conflict target');

liveToken = 'sdk-renewed-jwt';
await client.from('sales').select();
assert(calls.at(-1).options.headers.Authorization === 'Bearer sdk-renewed-jwt', 'an existing REST client must use the renewed SDK session instead of the stale local token');

const retryCalls = [];
globalThis.fetch = async (url, options) => {
  retryCalls.push({ url, options });
  const ok = retryCalls.length > 1;
  return { ok, status: ok ? 200 : 401, text: async () => ok ? '[]' : '{"message":"JWT expired"}' };
};
const retried = await client.from('sales').upsert([{ id: 'sale-1', total: 10 }], { onConflict: 'id', ignoreDuplicates: true });
assert(!retried.error && refreshCount === 1 && retryCalls.length === 2, '401 must refresh the session and retry once');
assert(retryCalls[1].options.headers.Authorization === 'Bearer refreshed-jwt', 'retry must use refreshed authentication');
assert(retryCalls[0].options.body === retryCalls[1].options.body && retryCalls[0].url === retryCalls[1].url, 'retry must preserve the exact operation');
assert(retryCalls[1].options.headers.Prefer.includes('ignore-duplicates'), 'retry must preserve immutable sale semantics');

globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => '{"message":"denied"}' });
const denied = await client.from('sales').select();
assert(denied.error && refreshCount === 2, 'a persistent 401 must stop after one refresh and return an error');
liveToken = null;
let anonymousRequests = 0;
globalThis.fetch = async () => { anonymousRequests += 1; throw new Error('unexpected request'); };
const signedOut = await client.from('sales').upsert([{ id: 'sale-2' }]);
assert(signedOut.error && anonymousRequests === 0, 'without an SDK session, financial writes must not use stale credentials or anonymous fallback');

console.log('supabase rest client service ok');
