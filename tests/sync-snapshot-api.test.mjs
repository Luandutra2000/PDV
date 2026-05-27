import syncSnapshotHandler from '../api/sync-snapshot.mjs';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const originalEnv = { ...process.env };
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return jsonResponse({ id: 'dono-1', email: 'dono@pdv.local' });
  }

  if (url.includes('/rest/v1/sales?')) {
    return jsonResponse([{
      id: 'sale-1',
      status: 'ativa',
      command_id: null,
      command_number: 4,
      total: 12,
      payment_method: 'pix',
      received_amount: 12,
      change_amount: 0,
      created_at: '2026-05-27T10:00:00.000Z'
    }]);
  }

  if (url.includes('/rest/v1/sale_items?')) {
    return jsonResponse([{
      id: 'sale-1-coxinha',
      sale_id: 'sale-1',
      product_id: 'coxinha',
      name: 'Coxinha',
      quantity: 2,
      unit_price: 6,
      total: 12
    }]);
  }

  if (url.includes('/rest/v1/cash_movements?')) {
    return jsonResponse([{ id: 'entrada-1', payload: { id: 'entrada-1', type: 'entrada', amount: 50 } }]);
  }

  if (url.includes('/rest/v1/stock_production?')) {
    return jsonResponse([{ id: 'launch-1', payload: { id: 'launch-1', produtoNome: 'Coxinha' } }]);
  }

  if (url.includes('/rest/v1/showcase_write_offs?')) {
    return jsonResponse([]);
  }

  throw new Error(`Unexpected URL: ${url}`);
};

const response = createMockResponse();
await syncSnapshotHandler({
  method: 'POST',
  headers: { authorization: 'Bearer user-token' },
  body: JSON.stringify({ limit: 10 })
}, response);

const payload = JSON.parse(response.body);

assert(response.statusCode === 200, 'sync snapshot API should return 200');
assert(payload.sales.length === 1, 'sync snapshot API should return sales');
assert(payload.sales[0].payload.items.length === 1, 'sync snapshot API should rebuild sale payload from sale items');
assert(payload.cash_movements.length === 1, 'sync snapshot API should return cash movements');
assert(payload.stock_production.length === 1, 'sync snapshot API should return stock production');
assert(calls.some((call) => call.url.includes('limit=10')), 'sync snapshot API should pass requested limit');

process.env = originalEnv;

console.log('sync snapshot api ok');

function createMockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(body) {
      this.body = body;
    }
  };
}

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return data;
    }
  };
}
