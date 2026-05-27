import syncEventsHandler from '../api/sync-events.mjs';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const originalEnv = { ...process.env };
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const calls = [];
let salesAttempts = 0;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return jsonResponse({ id: 'operator-1', email: 'caixa@pdv.local' });
  }

  if (url.endsWith('/rest/v1/sales')) {
    salesAttempts += 1;
    const body = JSON.parse(options.body);
    assert(body[0].command_id === null, 'API should not persist local command ids as Supabase foreign keys');

    if (salesAttempts === 1) {
      assert(body[0].payload.items.length === 1, 'API should keep full sale payload on first attempt');
      return jsonResponse({ message: "Could not find the 'payload' column of 'sales'" }, false, 400);
    }

    assert(!('payload' in body[0]), 'API should retry sales without payload when schema rejects it');
    return jsonResponse({});
  }

  if (url.endsWith('/rest/v1/sale_items')) {
    return jsonResponse({});
  }

  throw new Error(`Unexpected URL: ${url}`);
};

const response = createMockResponse();
await syncEventsHandler({
  method: 'POST',
  headers: { authorization: 'Bearer user-token' },
  body: JSON.stringify({
    event: {
      type: 'SALE_FINISHED',
      payload: {
        id: 'sale-api-1',
        type: 'venda',
        status: 'ativa',
        comandaId: 'local-command',
        comandaNumber: 3,
        items: [{ productId: 'coxinha', name: 'Coxinha', quantity: 1, price: 9, total: 9 }],
        total: 9,
        paymentMethod: '',
        receivedAmount: 9,
        change: 0,
        createdAt: '2026-05-27T10:00:00.000Z'
      }
    }
  })
}, response);

assert(response.statusCode === 200, 'sync events API should return 200');
assert(calls.filter((call) => call.url.endsWith('/rest/v1/sales')).length === 2, 'sync events API should retry sales without payload');
assert(calls.some((call) => call.url.endsWith('/rest/v1/sale_items')), 'sync events API should try to upsert sale items');
const saleCall = calls.find((call) => call.url.endsWith('/rest/v1/sales'));
assert(JSON.parse(saleCall.options.body)[0].payment_method === 'dinheiro', 'sync events API should normalize missing payment method');

process.env = originalEnv;

console.log('sync events api ok');

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
