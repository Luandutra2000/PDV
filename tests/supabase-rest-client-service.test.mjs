const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const calls = [];

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

const { getSupabaseRestClient } = await import('../src/services/supabase-rest-client.service.js?v=20260729-13');

const client = getSupabaseRestClient();
await client.from('sales').select('id,total');
await client.from('sales').upsert([{ id: 'sale-1', total: 10 }]);
await client.from('sales').update({ status: 'cancelada' }).eq('id', 'sale-1');
await client.from('sale_items').delete().in('id', ['item-1', 'item-2']);

assert(calls[0].url === 'https://example.supabase.co/rest/v1/sales?select=id%2Ctotal', 'select should call REST endpoint with selected columns');
assert(calls[1].options.method === 'POST', 'upsert should use POST');
assert(calls[1].options.headers.Prefer.includes('resolution=merge-duplicates'), 'upsert should request merge duplicates');
assert(calls[2].options.method === 'PATCH', 'update eq should use PATCH');
assert(calls[2].url.includes('id=eq.sale-1'), 'update eq should filter by id');
assert(calls[3].options.method === 'DELETE', 'delete in should use DELETE');
assert(calls[3].url.includes('id=in.('), 'delete in should filter by id list');

console.log('supabase rest client service ok');
