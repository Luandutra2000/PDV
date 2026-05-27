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
let notificationBackupCalled = false;
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
    return jsonResponse({ message: 'legacy sales table rejected row' }, false, 400);
  }

  if (url.endsWith('/rest/v1/notifications')) {
    notificationBackupCalled = true;
    const body = JSON.parse(options.body);
    assert(body[0].type === 'sale_backup', 'sync events API should backup failed sales as notifications');
    assert(body[0].payload.id === 'sale-api-1', 'sale backup should keep original sale id');
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
  body: Buffer.from(JSON.stringify({
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
  }))
}, response);

assert(response.statusCode === 200, 'sync events API should return 200');
assert(calls.filter((call) => call.url.endsWith('/rest/v1/sales')).length === 2, 'sync events API should retry sales without payload');
assert(!calls.some((call) => call.url.endsWith('/rest/v1/sale_items')), 'sync events API should skip sale items when sale row falls back to backup');
assert(notificationBackupCalled, 'sync events API should use notification backup when sales table rejects the row');
const saleCall = calls.find((call) => call.url.endsWith('/rest/v1/sales'));
assert(JSON.parse(saleCall.options.body)[0].payment_method === 'dinheiro', 'sync events API should normalize missing payment method');

process.env = originalEnv;

console.log('sync events api ok');

calls.length = 0;
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return jsonResponse({ id: 'operator-1', email: 'caixa@pdv.local' });
  }

  if (options.method === 'DELETE') {
    return jsonResponse({});
  }

  throw new Error(`Unexpected URL while clearing: ${url}`);
};

const clearResponse = createMockResponse();
await syncEventsHandler({
  method: 'POST',
  headers: { authorization: 'Bearer user-token' },
  body: JSON.stringify({
    event: {
      type: 'TRANSACTION_HISTORY_CLEARED',
      payload: { id: 'history-clear-1', clearedAt: '2026-05-27T11:00:00.000Z' }
    }
  })
}, clearResponse);

assert(clearResponse.statusCode === 200, 'sync events API should clear transaction history');
assert(calls.some((call) => call.url.endsWith('/rest/v1/sale_items?id=not.is.null')), 'clear should delete sale items');
assert(calls.some((call) => call.url.endsWith('/rest/v1/sales?id=not.is.null')), 'clear should delete sales');
assert(calls.some((call) => call.url.endsWith('/rest/v1/cash_movements?id=not.is.null')), 'clear should delete cash movements');
assert(calls.some((call) => call.url.endsWith('/rest/v1/notifications?type=eq.sale_backup')), 'clear should delete sale backups');

process.env = originalEnv;

console.log('sync events clear api ok');

calls.length = 0;
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return jsonResponse({ id: 'operator-1', email: 'caixa@pdv.local' });
  }

  if (options.method === 'DELETE') {
    return jsonResponse({});
  }

  throw new Error(`Unexpected URL while filtered clearing: ${url}`);
};

const filteredClearResponse = createMockResponse();
await syncEventsHandler({
  method: 'POST',
  headers: { authorization: 'Bearer user-token' },
  body: JSON.stringify({
    event: {
      type: 'TRANSACTION_HISTORY_CLEARED',
      payload: {
        id: 'history-clear-2',
        period: 'today',
        startAt: '2026-05-27T03:00:00.000Z',
        endAt: '2026-05-28T03:00:00.000Z',
        clearedAt: '2026-05-27T11:00:00.000Z'
      }
    }
  })
}, filteredClearResponse);

assert(filteredClearResponse.statusCode === 200, 'sync events API should clear filtered transaction history');
assert(!calls.some((call) => call.url.includes('/rest/v1/sale_items?')), 'filtered clear should not delete all sale items');
assert(calls.some((call) => decodeURIComponent(call.url).includes('/rest/v1/sales?created_at=gte.2026-05-27T03:00:00.000Z&created_at=lt.2026-05-28T03:00:00.000Z')), 'filtered clear should delete sales by date range');
assert(calls.some((call) => decodeURIComponent(call.url).includes('/rest/v1/cash_movements?created_at=gte.2026-05-27T03:00:00.000Z&created_at=lt.2026-05-28T03:00:00.000Z')), 'filtered clear should delete cash movements by date range');
assert(calls.some((call) => decodeURIComponent(call.url).includes('/rest/v1/notifications?type=eq.sale_backup&created_at=gte.2026-05-27T03:00:00.000Z')), 'filtered clear should delete sale backups by date range');

process.env = originalEnv;

console.log('sync events filtered clear api ok');

calls.length = 0;
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return jsonResponse({ id: 'operator-1', email: 'caixa@pdv.local' });
  }

  if (options.method === 'PATCH') {
    return jsonResponse({});
  }

  throw new Error(`Unexpected URL while clearing showcase: ${url}`);
};

const showcaseClearResponse = createMockResponse();
await syncEventsHandler({
  method: 'POST',
  headers: { authorization: 'Bearer user-token' },
  body: JSON.stringify({
    event: {
      type: 'SHOWCASE_PRODUCT_CLEARED',
      payload: {
        id: 'showcase-clear-1',
        productId: 'coxinha',
        launchIds: ['stock-1'],
        clearedAt: '2026-05-27T11:30:00.000Z'
      }
    }
  })
}, showcaseClearResponse);

assert(showcaseClearResponse.statusCode === 200, 'sync events API should clear showcase product rows');
assert(calls.some((call) => call.options.method === 'PATCH' && call.url.endsWith('/rest/v1/stock_production?id=eq.stock-1')), 'showcase clear should patch stock rows by launch id');
assert(JSON.parse(calls.find((call) => call.options.method === 'PATCH').options.body).status === 'cancelado', 'showcase clear should mark stock row canceled');

process.env = originalEnv;

console.log('sync events showcase clear api ok');

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
