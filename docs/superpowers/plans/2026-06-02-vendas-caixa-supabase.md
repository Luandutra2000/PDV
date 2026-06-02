# Vendas e Caixa Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sales, sale items, cash movements, cancellations, closed commands, and confirmed cash closings use Supabase as the primary financial source when online mode is active.

**Architecture:** Add focused financial adapters plus a `financial-sync.service.js` for composed Supabase operations. Keep `transaction.service.js` and `cash-closing.service.js` as the public facades so current screens keep calling the same service APIs while online mode writes through Supabase, uses temporary cache, queues failed writes, and listens for realtime changes.

**Tech Stack:** JavaScript ES Modules, Supabase client APIs, localStorage cache/queue, existing event bus, existing Node `.mjs` tests, Vercel static deploy.

---

## File Structure

- Create: `src/services/repositories/sale.adapter.js`
  - Maps app sale objects to `sales` rows and back.
- Create: `src/services/repositories/sale-item.adapter.js`
  - Maps sale items to `sale_items` rows and back.
- Create: `src/services/repositories/cash-movement.adapter.js`
  - Maps app cash movements to `cash_movements` rows and back.
- Create: `src/services/repositories/command.adapter.js`
  - Maps closed/canceled comandas to `commands` rows and back.
- Create: `src/services/repositories/command-item.adapter.js`
  - Maps command items to `command_items` rows and back.
- Create: `src/services/repositories/cash-closing.adapter.js`
  - Maps confirmed closings to `cash_closings` rows and back.
- Create: `src/services/financial-sync.service.js`
  - Owns composed financial Supabase operations, temporary cache, queue, status, realtime, and hydration.
- Modify: `src/database/schema.js`
  - Add finance sync queue/status event keys.
- Modify: `src/services/transaction.service.js`
  - Route sales, movements, cancellations, reads, and summaries through Supabase facade when enabled.
- Modify: `src/services/cash-closing.service.js`
  - Save confirmed closings through Supabase facade when enabled; keep drafts local.
- Modify: `src/app.js`
  - Hydrate financial data and start financial realtime after login.
- Modify: `index.html`, `service-worker.js`, `tests/vercel-cache-config.test.mjs`
  - Bump cache-busting version.
- Modify: `src/modules/caixa/caixa.module.js` and/or `src/modules/dashboard/dashboard.module.js` only if needed for a minimal sync status/action.
- Create: `tests/financial-adapters.test.mjs`
  - Adapter mapping tests.
- Create: `tests/financial-sync-service.test.mjs`
  - Composed write, queue, hydrate, cancellation, realtime tests.
- Modify: `tests/transaction-service.test.mjs`
  - Supabase-mode facade tests plus existing local-mode tests.
- Modify: `tests/cash-closing-service.test.mjs`
  - Supabase confirmed closing test plus existing local-mode tests.
- Create: `docs/superpowers/checklists/2026-06-02-vendas-caixa-supabase.md`
  - Manual checklist for production validation.

---

### Task 1: Financial Adapters

**Files:**
- Create: `src/services/repositories/sale.adapter.js`
- Create: `src/services/repositories/sale-item.adapter.js`
- Create: `src/services/repositories/cash-movement.adapter.js`
- Create: `src/services/repositories/command.adapter.js`
- Create: `src/services/repositories/command-item.adapter.js`
- Create: `src/services/repositories/cash-closing.adapter.js`
- Test: `tests/financial-adapters.test.mjs`

- [ ] **Step 1: Write the failing adapter test**

Create `tests/financial-adapters.test.mjs`:

```js
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const saleAdapter = await import('../src/services/repositories/sale.adapter.js');
const saleItemAdapter = await import('../src/services/repositories/sale-item.adapter.js');
const cashMovementAdapter = await import('../src/services/repositories/cash-movement.adapter.js');
const commandAdapter = await import('../src/services/repositories/command.adapter.js');
const commandItemAdapter = await import('../src/services/repositories/command-item.adapter.js');
const cashClosingAdapter = await import('../src/services/repositories/cash-closing.adapter.js');

const sale = {
  id: 'sale-1',
  status: 'ativa',
  comandaId: 'comanda-1',
  comandaNumber: 12,
  total: '38.50',
  paymentMethod: 'dinheiro',
  receivedAmount: '50',
  change: '11.50',
  createdBy: 'user-1',
  createdAt: '2026-06-02T10:00:00.000Z'
};
const saleRow = saleAdapter.toRow(sale);
assert(saleRow.command_id === 'comanda-1', 'sale comandaId should map to command_id');
assert(saleRow.command_number === 12, 'sale comandaNumber should map to command_number');
assert(saleRow.received_amount === 50, 'sale receivedAmount should map numeric');
assert(saleRow.change_amount === 11.5, 'sale change should map numeric');
assert(saleAdapter.fromRow(saleRow).comandaId === 'comanda-1', 'sale row should map command_id back');

const saleItemRow = saleItemAdapter.toRows({
  id: 'sale-1',
  items: [
    { productId: 'x-burger', name: 'X-Burger', quantity: 2, unitPrice: 16, total: 32 },
    { productId: 'batata', name: 'Batata', quantity: 1, price: 14, total: 14 }
  ]
});
assert(saleItemRow[0].id === 'sale-1-x-burger-0', 'sale item id should be deterministic');
assert(saleItemRow[1].unit_price === 14, 'sale item should accept price fallback');
assert(saleItemAdapter.fromRows(saleItemRow, 'sale-1').length === 2, 'sale item rows should map back');

const movementRow = cashMovementAdapter.toRow({
  id: 'entrada-1',
  type: 'entrada',
  status: 'ativa',
  amount: '20',
  category: 'troco',
  description: 'Troco inicial',
  userName: 'Luan',
  createdBy: 'user-1',
  createdAt: '2026-06-02T09:00:00.000Z'
});
assert(movementRow.user_name === 'Luan', 'movement userName should map to user_name');
assert(cashMovementAdapter.fromRow(movementRow).amount === 20, 'movement row amount should map numeric');

const commandRow = commandAdapter.toRow({
  id: 'comanda-1',
  number: 12,
  status: 'fechada',
  total: 38.5,
  paymentMethod: 'dinheiro',
  receivedAmount: 50,
  change: 11.5,
  createdAt: '2026-06-02T09:50:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
  closedAt: '2026-06-02T10:00:00.000Z'
});
assert(commandRow.payment_method === 'dinheiro', 'command paymentMethod should map');
assert(commandAdapter.fromRow(commandRow).paymentMethod === 'dinheiro', 'command row should map back');

const commandItemRows = commandItemAdapter.toRows({
  id: 'comanda-1',
  items: [{ productId: 'x-burger', name: 'X-Burger', quantity: 2, unitPrice: 16, total: 32 }]
});
assert(commandItemRows[0].id === 'comanda-1-x-burger-0', 'command item id should be deterministic');
assert(commandItemAdapter.fromRows(commandItemRows, 'comanda-1')[0].productId === 'x-burger', 'command item rows should map back');

const closingRow = cashClosingAdapter.toRow({
  id: 'closing-1',
  status: 'fechado',
  totals: { sales: 100 },
  payments: { expectedCash: 50 },
  showcase: [{ productId: 'x-burger' }],
  differences: [{ scope: 'payment' }],
  input: { countedCash: 48 },
  createdBy: 'user-1',
  createdAt: '2026-06-02T11:00:00.000Z',
  closedAt: '2026-06-02T11:05:00.000Z',
  updatedAt: '2026-06-02T11:05:00.000Z'
});
assert(closingRow.totals.sales === 100, 'closing totals should stay JSON');
assert(cashClosingAdapter.fromRow(closingRow).payments.expectedCash === 50, 'closing payments should map back');

console.log('financial adapters ok');
```

- [ ] **Step 2: Run adapter test to verify it fails**

Run:

```powershell
node tests\financial-adapters.test.mjs
```

Expected: FAIL with module not found for `sale.adapter.js`.

- [ ] **Step 3: Create sale adapter**

Create `src/services/repositories/sale.adapter.js`:

```js
export const saleAdapter = {
  table: 'sales',
  cacheKey: 'pdv.transactions',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,status,command_id,command_number,total,payment_method,received_amount,change_amount,created_at,canceled_at',
  fromRow(row) {
    return {
      id: row.id,
      type: 'venda',
      status: row.status || 'ativa',
      comandaId: row.command_id || '',
      comandaNumber: Number(row.command_number) || 0,
      items: [],
      total: Number(row.total) || 0,
      paymentMethod: row.payment_method || '',
      receivedAmount: Number(row.received_amount) || 0,
      change: Number(row.change_amount) || 0,
      createdAt: row.created_at || new Date().toISOString(),
      canceledAt: row.canceled_at || null
    };
  },
  toRow(sale) {
    return {
      id: sale.id,
      status: sale.status || 'ativa',
      command_id: sale.comandaId || null,
      command_number: Number(sale.comandaNumber) || null,
      total: Number(sale.total) || 0,
      payment_method: sale.paymentMethod,
      received_amount: Number(sale.receivedAmount) || 0,
      change_amount: Number(sale.change) || 0,
      created_at: sale.createdAt || new Date().toISOString(),
      canceled_at: sale.canceledAt || null
    };
  }
};

export const { fromRow, toRow } = saleAdapter;
```

- [ ] **Step 4: Create sale item adapter**

Create `src/services/repositories/sale-item.adapter.js`:

```js
function createSaleItemId(saleId, item, index) {
  return `${saleId}-${item.productId || 'item'}-${index}`;
}

export const saleItemAdapter = {
  table: 'sale_items',
  select: 'id,sale_id,product_id,name,quantity,unit_price,total',
  fromRows(rows = [], saleId = '') {
    return rows
      .filter((row) => !saleId || row.sale_id === saleId)
      .map((row) => ({
        productId: row.product_id,
        name: row.name,
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unit_price) || 0,
        total: Number(row.total) || 0
      }));
  },
  toRows(sale) {
    return (sale.items || []).map((item, index) => ({
      id: createSaleItemId(sale.id, item, index),
      sale_id: sale.id,
      product_id: item.productId,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unitPrice || item.price) || 0,
      total: Number(item.total) || 0
    }));
  }
};

export const { fromRows, toRows } = saleItemAdapter;
```

- [ ] **Step 5: Create remaining adapters**

Create `src/services/repositories/cash-movement.adapter.js`:

```js
export const cashMovementAdapter = {
  table: 'cash_movements',
  cacheKey: 'pdv.transactions',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,type,status,amount,category,description,user_name,created_at,canceled_at',
  fromRow(row) {
    return {
      id: row.id,
      type: row.type,
      status: row.status || 'ativa',
      amount: Number(row.amount) || 0,
      category: row.category || 'sem-categoria',
      description: row.description || '',
      userName: row.user_name || 'Local',
      createdAt: row.created_at || new Date().toISOString(),
      canceledAt: row.canceled_at || null
    };
  },
  toRow(movement) {
    return {
      id: movement.id,
      type: movement.type,
      status: movement.status || 'ativa',
      amount: Number(movement.amount) || 0,
      category: movement.category || 'sem-categoria',
      description: movement.description || '',
      user_name: movement.userName || 'Local',
      created_at: movement.createdAt || new Date().toISOString(),
      canceled_at: movement.canceledAt || null
    };
  }
};

export const { fromRow, toRow } = cashMovementAdapter;
```

Create `src/services/repositories/command.adapter.js`:

```js
export const commandAdapter = {
  table: 'commands',
  cacheKey: 'pdv.closedComandas',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,number,status,total,payment_method,received_amount,change_amount,created_at,updated_at,closed_at,canceled_at',
  fromRow(row) {
    return {
      id: row.id,
      number: Number(row.number) || 0,
      status: row.status || 'fechada',
      items: [],
      total: Number(row.total) || 0,
      paymentMethod: row.payment_method || '',
      receivedAmount: Number(row.received_amount) || 0,
      change: Number(row.change_amount) || 0,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.closed_at || row.created_at || new Date().toISOString(),
      closedAt: row.closed_at || null,
      canceledAt: row.canceled_at || null
    };
  },
  toRow(command) {
    return {
      id: command.id,
      number: Number(command.number) || 0,
      status: command.status || 'fechada',
      total: Number(command.total) || 0,
      payment_method: command.paymentMethod || null,
      received_amount: Number(command.receivedAmount) || 0,
      change_amount: Number(command.change) || 0,
      created_at: command.createdAt || command.closedAt || new Date().toISOString(),
      updated_at: command.updatedAt || command.closedAt || command.createdAt || new Date().toISOString(),
      closed_at: command.closedAt || null,
      canceled_at: command.canceledAt || null
    };
  }
};

export const { fromRow, toRow } = commandAdapter;
```

Create `src/services/repositories/command-item.adapter.js`:

```js
function createCommandItemId(commandId, item, index) {
  return `${commandId}-${item.productId || 'item'}-${index}`;
}

export const commandItemAdapter = {
  table: 'command_items',
  select: 'id,command_id,product_id,name,quantity,unit_price,total',
  fromRows(rows = [], commandId = '') {
    return rows
      .filter((row) => !commandId || row.command_id === commandId)
      .map((row) => ({
        productId: row.product_id,
        name: row.name,
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unit_price) || 0,
        total: Number(row.total) || 0
      }));
  },
  toRows(command) {
    return (command.items || []).map((item, index) => ({
      id: createCommandItemId(command.id, item, index),
      command_id: command.id,
      product_id: item.productId,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unitPrice || item.price) || 0,
      total: Number(item.total) || 0
    }));
  }
};

export const { fromRows, toRows } = commandItemAdapter;
```

Create `src/services/repositories/cash-closing.adapter.js`:

```js
export const cashClosingAdapter = {
  table: 'cash_closings',
  cacheKey: 'pdv.cashClosings',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,status,totals,payments,showcase,differences,input,created_at,closed_at,updated_at',
  fromRow(row) {
    return {
      id: row.id,
      status: row.status || 'fechado',
      totals: row.totals || {},
      payments: row.payments || {},
      showcase: Array.isArray(row.showcase) ? row.showcase : [],
      differences: Array.isArray(row.differences) ? row.differences : [],
      input: row.input || {},
      createdAt: row.created_at || row.closed_at || new Date().toISOString(),
      closedAt: row.closed_at || row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.closed_at || row.created_at || new Date().toISOString()
    };
  },
  toRow(closing) {
    return {
      id: closing.id,
      status: closing.status || 'fechado',
      totals: closing.totals || {},
      payments: closing.payments || {},
      showcase: closing.showcase || [],
      differences: closing.differences || [],
      input: closing.input || {},
      created_at: closing.createdAt || closing.closedAt || new Date().toISOString(),
      closed_at: closing.closedAt || closing.createdAt || new Date().toISOString(),
      updated_at: closing.updatedAt || closing.closedAt || closing.createdAt || new Date().toISOString()
    };
  }
};

export const { fromRow, toRow } = cashClosingAdapter;
```

- [ ] **Step 6: Run adapter test to verify it passes**

Run:

```powershell
node tests\financial-adapters.test.mjs
```

Expected: PASS with `financial adapters ok`.

- [ ] **Step 7: Commit**

```powershell
git add src\services\repositories\sale.adapter.js src\services\repositories\sale-item.adapter.js src\services\repositories\cash-movement.adapter.js src\services\repositories\command.adapter.js src\services\repositories\command-item.adapter.js src\services\repositories\cash-closing.adapter.js tests\financial-adapters.test.mjs
git commit -m "feat: add financial Supabase adapters"
```

---

### Task 2: Financial Sync Service

**Files:**
- Create: `src/services/financial-sync.service.js`
- Modify: `src/database/schema.js`
- Test: `tests/financial-sync-service.test.mjs`

- [ ] **Step 1: Write the failing sync service test**

Create `tests/financial-sync-service.test.mjs`:

```js
const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const financial = await import('../src/services/financial-sync.service.js');

const calls = [];
let failTable = '';
let realtimeCallback = null;

const rows = {
  sales: [],
  sale_items: [],
  cash_movements: [],
  commands: [],
  command_items: [],
  cash_closings: []
};

const fakeClient = {
  from(table) {
    return {
      select() {
        return Promise.resolve({ data: rows[table] || [], error: null });
      },
      upsert(nextRows) {
        calls.push({ table, rows: nextRows });
        if (failTable === table) {
          return Promise.resolve({ error: new Error(`fail ${table}`) });
        }
        rows[table] = mergeRows(rows[table] || [], nextRows);
        return Promise.resolve({ error: null });
      },
      update(patch) {
        return {
          eq(column, value) {
            calls.push({ table, patch, column, value });
            rows[table] = (rows[table] || []).map((row) => (
              row[column] === value ? { ...row, ...patch } : row
            ));
            return Promise.resolve({ error: null });
          }
        };
      }
    };
  },
  channel() {
    return {
      on(eventName, filter, callback) {
        realtimeCallback = callback;
        return this;
      },
      subscribe() {
        return this;
      }
    };
  },
  removeChannel() {}
};

function mergeRows(currentRows, nextRows) {
  const byId = new Map(currentRows.map((row) => [row.id, row]));
  nextRows.forEach((row) => byId.set(row.id, row));
  return Array.from(byId.values());
}

financial.configureFinancialSyncForTests({ getClient: async () => fakeClient });

const sale = {
  id: 'sale-1',
  type: 'venda',
  status: 'ativa',
  comandaId: 'comanda-1',
  comandaNumber: 1,
  items: [{ productId: 'x-burger', name: 'X-Burger', quantity: 2, unitPrice: 16, total: 32 }],
  total: 32,
  paymentMethod: 'dinheiro',
  receivedAmount: 40,
  change: 8,
  createdAt: '2026-06-02T10:00:00.000Z'
};
const command = {
  id: 'comanda-1',
  number: 1,
  status: 'fechada',
  items: sale.items,
  total: 32,
  paymentMethod: 'dinheiro',
  receivedAmount: 40,
  change: 8,
  createdAt: '2026-06-02T09:00:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
  closedAt: '2026-06-02T10:00:00.000Z'
};

await financial.saveSaleToSupabase({ sale, command });
assert(calls.find((call) => call.table === 'commands'), 'sale save should write command');
assert(calls.find((call) => call.table === 'command_items'), 'sale save should write command items');
assert(calls.find((call) => call.table === 'sales'), 'sale save should write sale');
assert(calls.find((call) => call.table === 'sale_items'), 'sale save should write sale items');
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions))[0].id === 'sale-1', 'sale save should update transaction cache');

failTable = 'sale_items';
await financial.saveSaleToSupabase({ sale: { ...sale, id: 'sale-queued' }, command: { ...command, id: 'comanda-queued' } });
assert(financial.getFinancialSyncStatus().state === 'pending', 'failed composed sale should set pending status');
assert(JSON.parse(localStorage.getItem('pdv.syncQueue.financial')).length === 1, 'failed composed sale should queue operation');

failTable = '';
await financial.flushFinancialQueue();
assert(financial.getFinancialSyncStatus().pending === 0, 'flush should clear successful financial queue');

await financial.saveCashMovementToSupabase({
  id: 'entrada-1',
  type: 'entrada',
  amount: 20,
  category: 'troco',
  description: 'Troco inicial',
  userName: 'Luan',
  createdAt: '2026-06-02T11:00:00.000Z'
});
assert(calls.find((call) => call.table === 'cash_movements'), 'cash movement should write cash_movements');

await financial.hydrateFinancialData();
assert(Array.isArray(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions))), 'hydrate should write transaction cache');

await financial.startFinancialRealtime();
rows.cash_movements.push({
  id: 'entrada-2',
  type: 'entrada',
  status: 'ativa',
  amount: 10,
  category: 'troco',
  description: 'Realtime',
  user_name: 'Luan',
  created_at: '2026-06-02T12:00:00.000Z'
});
await realtimeCallback();
assert(JSON.parse(localStorage.getItem(STORAGE_KEYS.transactions)).some((item) => item.id === 'entrada-2'), 'realtime should refresh financial cache');

console.log('financial sync service ok');
```

- [ ] **Step 2: Run sync service test to verify it fails**

Run:

```powershell
node tests\financial-sync-service.test.mjs
```

Expected: FAIL with module not found for `financial-sync.service.js`.

- [ ] **Step 3: Add schema keys/events**

Modify `src/database/schema.js`:

```js
// Add this entry to the existing STORAGE_KEYS object.
financialSyncQueue: 'pdv.syncQueue.financial'

// Add these entries to the existing UI_EVENTS object.
financialSyncStatusChanged: 'FINANCIAL_SYNC_STATUS_CHANGED',
financialDataChanged: 'FINANCIAL_DATA_CHANGED'
```

- [ ] **Step 4: Implement financial sync service**

Create `src/services/financial-sync.service.js` with exports:

```js
export function configureFinancialSyncForTests({ getClient } = {}) {}
export function getFinancialSyncStatus() {}
export async function hydrateFinancialData() {}
export async function saveSaleToSupabase({ sale, command }) {}
export async function saveCashMovementToSupabase(movement) {}
export async function saveCashClosingToSupabase(closing) {}
export async function cancelSaleInSupabase({ saleId, comandaId, canceledAt }) {}
export async function cancelCashMovementInSupabase({ movementId, canceledAt }) {}
export async function flushFinancialQueue() {}
export async function startFinancialRealtime() {}
export async function stopFinancialRealtime() {}
```

Implementation requirements:

- use `getSupabaseClient` by default;
- use financial adapters from Task 1;
- write sales in order: `commands`, `command_items`, `sales`, `sale_items`;
- write failed composed operations to `STORAGE_KEYS.financialSyncQueue`;
- update `STORAGE_KEYS.transactions`, `STORAGE_KEYS.closedComandas`, and `STORAGE_KEYS.cashClosings` cache;
- `hydrateFinancialData()` reads sales/items/movements/commands/command items/closings and writes app-shaped cache;
- realtime subscribes to the six financial tables and calls `hydrateFinancialData()`;
- emit `UI_EVENTS.cashSummaryChanged`, `UI_EVENTS.financialDataChanged`, and `UI_EVENTS.financialSyncStatusChanged` after cache/status changes.

- [ ] **Step 5: Run sync service test to verify it passes**

Run:

```powershell
node tests\financial-sync-service.test.mjs
```

Expected: PASS with `financial sync service ok`.

- [ ] **Step 6: Commit**

```powershell
git add src\database\schema.js src\services\financial-sync.service.js tests\financial-sync-service.test.mjs
git commit -m "feat: add financial sync service"
```

---

### Task 3: Transaction Service Supabase Facade

**Files:**
- Modify: `src/services/transaction.service.js`
- Test: `tests/transaction-service.test.mjs`

- [ ] **Step 1: Add failing Supabase transaction tests**

Append to `tests/transaction-service.test.mjs`:

```js
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

localStorage.setItem('pdv.syncQueue.financial', JSON.stringify([]));

const supabaseTransactions = await import(`../src/services/transaction.service.js?supabase=${Date.now()}`);
const supabaseComandas = await import(`../src/services/comanda.service.js?supabase=${Date.now()}`);
const supabaseProducts = await import(`../src/services/product.service.js?supabase=${Date.now()}`);

auth.login({ username: 'admin', password: 'admin123' });
supabaseComandas.clearComanda();
supabaseComandas.addItem(supabaseProducts.getProductById('x-burger'));

const supabaseSale = supabaseTransactions.finalizeComandaPayment({
  paymentMethod: 'dinheiro',
  receivedAmount: 20
});

assert(supabaseSale.id, 'supabase sale should return sale object');
assert(JSON.parse(localStorage.getItem('pdv.syncQueue.financial')).some((operation) => operation.type === 'sale'), 'offline supabase sale should queue composed sale');

const supabaseMovement = supabaseTransactions.registerCashMovement({
  type: 'entrada',
  amount: 15,
  description: 'Entrada online'
});
assert(supabaseMovement.id, 'supabase movement should return movement object');
assert(JSON.parse(localStorage.getItem('pdv.syncQueue.financial')).some((operation) => operation.type === 'cash-movement'), 'offline supabase movement should queue movement');

globalThis.__PDV_RUNTIME_CONFIG__ = null;
```

- [ ] **Step 2: Run transaction test to verify it fails**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: FAIL because `transaction.service.js` does not call financial sync service yet.

- [ ] **Step 3: Integrate transaction service**

Modify `src/services/transaction.service.js`:

```js
import { isSupabaseEnabled } from './app-config.service.js';
import {
  cancelCashMovementInSupabase,
  cancelSaleInSupabase,
  getFinancialSyncStatus,
  saveCashMovementToSupabase,
  saveSaleToSupabase
} from './financial-sync.service.js';
```

In `finalizeComandaPayment()`:

- build `sale` and closed command exactly as today;
- if Supabase enabled, call `saveSaleToSupabase({ sale, command: closedCommand })` without awaiting, or return a Promise only if callers are already async-safe;
- update local cache immediately so UI remains responsive;
- keep local mode unchanged.

In `registerCashMovement()`:

- if Supabase enabled, call `saveCashMovementToSupabase(movement)`;
- update local cache immediately.

In cancellations:

- after local status update, call `cancelSaleInSupabase()` or `cancelCashMovementInSupabase()` when Supabase enabled.

Export:

```js
export function getTransactionSyncStatus() {
  return isSupabaseEnabled() ? getFinancialSyncStatus() : { state: 'local', pending: 0 };
}
```

- [ ] **Step 4: Run transaction tests**

Run:

```powershell
node tests\financial-adapters.test.mjs
node tests\financial-sync-service.test.mjs
node tests\transaction-service.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src\services\transaction.service.js tests\transaction-service.test.mjs
git commit -m "feat: sync transactions with Supabase"
```

---

### Task 4: Cash Closing Supabase Facade

**Files:**
- Modify: `src/services/cash-closing.service.js`
- Test: `tests/cash-closing-service.test.mjs`

- [ ] **Step 1: Add failing Supabase closing test**

Append to `tests/cash-closing-service.test.mjs`:

```js
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

localStorage.setItem('pdv.syncQueue.financial', JSON.stringify([]));

const supabaseClosing = await import(`../src/services/cash-closing.service.js?supabase=${Date.now()}`);
const supabaseDraft = supabaseClosing.saveClosingDraft({ countedCash: 0, leftovers: {}, differences: [] });
const supabaseConfirmed = supabaseClosing.confirmClosing(supabaseDraft);

assert(supabaseConfirmed.status === 'fechado', 'supabase closing should return confirmed closing');
assert(JSON.parse(localStorage.getItem('pdv.syncQueue.financial')).some((operation) => operation.type === 'cash-closing'), 'offline supabase closing should queue confirmed closing');

globalThis.__PDV_RUNTIME_CONFIG__ = null;
```

- [ ] **Step 2: Run closing test to verify it fails**

Run:

```powershell
node tests\cash-closing-service.test.mjs
```

Expected: FAIL because confirmed closings do not call financial sync service yet.

- [ ] **Step 3: Integrate cash closing service**

Modify `src/services/cash-closing.service.js`:

```js
import { isSupabaseEnabled } from './app-config.service.js';
import { saveCashClosingToSupabase } from './financial-sync.service.js';
```

In `confirmClosing(draft)`:

- preserve validation and local history behavior;
- after creating confirmed closing, call `saveCashClosingToSupabase(confirmed)` when Supabase enabled;
- keep drafts local.

- [ ] **Step 4: Run closing tests**

Run:

```powershell
node tests\financial-sync-service.test.mjs
node tests\cash-closing-service.test.mjs
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src\services\cash-closing.service.js tests\cash-closing-service.test.mjs
git commit -m "feat: sync cash closings with Supabase"
```

---

### Task 5: App Boot, Realtime, And Minimal Sync UI

**Files:**
- Modify: `src/app.js`
- Modify: `src/modules/caixa/caixa.module.js`
- Modify: `src/styles/pdv.css`
- Modify: `index.html`
- Modify: `service-worker.js`
- Modify: `tests/vercel-cache-config.test.mjs`

- [ ] **Step 1: Update app boot**

Modify `src/app.js` imports:

```js
import { hydrateFinancialData, startFinancialRealtime } from './services/financial-sync.service.js';
```

Inside authenticated bootstrap, after product catalog load:

```js
await hydrateFinancialData();
await startFinancialRealtime();
```

- [ ] **Step 2: Add minimal caixa sync status**

In `src/modules/caixa/caixa.module.js`, import:

```js
import { getTransactionSyncStatus } from '../../services/transaction.service.js';
import { UI_EVENTS } from '../../database/schema.js';
import { on } from '../../services/event-bus.service.js';
```

Render a small status block:

```js
function renderFinancialSyncStatus() {
  const status = getTransactionSyncStatus();
  const label = status.state === 'pending'
    ? `${status.pending || 0} alteracao(oes) financeira(s) pendente(s)`
    : status.state === 'local'
      ? 'Modo local'
      : 'Financeiro sincronizado';

  return `<div class="sync-status" data-sync-state="${status.state}"><span>${label}</span></div>`;
}
```

Listen to `UI_EVENTS.financialSyncStatusChanged` and re-render the module.

- [ ] **Step 3: Bump cache versions**

Update `index.html`:

```js
const LOCAL_CACHE_VERSION = '20260602-03-financial-supabase';
await import('./src/app.js?v=20260602-03');
```

Update `service-worker.js`:

```js
const CACHE_NAME = 'pdv-v22';
'./src/app.js?v=20260602-03'
```

Update `tests/vercel-cache-config.test.mjs`:

```js
assert(indexHtml.includes('./src/app.js?v=20260602-03'), 'app entrypoint should use the latest cache-busting version');
```

- [ ] **Step 4: Run syntax and focused tests**

Run:

```powershell
node --check src\app.js
node --check src\modules\caixa\caixa.module.js
node tests\financial-adapters.test.mjs
node tests\financial-sync-service.test.mjs
node tests\transaction-service.test.mjs
node tests\cash-closing-service.test.mjs
node tests\vercel-cache-config.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src\app.js src\modules\caixa\caixa.module.js src\styles\pdv.css index.html service-worker.js tests\vercel-cache-config.test.mjs
git commit -m "feat: load financial data at app boot"
```

---

### Task 6: Manual Checklist

**Files:**
- Create: `docs/superpowers/checklists/2026-06-02-vendas-caixa-supabase.md`

- [ ] **Step 1: Create checklist**

Create `docs/superpowers/checklists/2026-06-02-vendas-caixa-supabase.md`:

```md
# Vendas e Caixa Supabase - Checklist Manual

## Ambiente

- URL testada:
- Data/hora:
- Usuario:
- Navegador A:
- Navegador B:

## Venda e historico

- [ ] Fazer login.
- [ ] Finalizar uma venda em dinheiro.
- [ ] Confirmar venda em `sales`.
- [ ] Confirmar itens em `sale_items`.
- [ ] Fazer logout/login.
- [ ] Confirmar que historico e resumo continuam corretos.

## Movimento de caixa

- [ ] Registrar entrada.
- [ ] Registrar saida.
- [ ] Registrar sangria.
- [ ] Conferir registros em `cash_movements`.
- [ ] Confirmar dashboard/caixa atualizados.

## Cancelamento

- [ ] Cancelar uma venda.
- [ ] Confirmar status `cancelada` em `sales`.
- [ ] Confirmar resumo sem total da venda cancelada.
- [ ] Cancelar movimento de caixa.
- [ ] Confirmar status `cancelada` em `cash_movements`.

## Fechamento

- [ ] Gerar fechamento.
- [ ] Confirmar fechamento.
- [ ] Conferir registro em `cash_closings`.
- [ ] Fazer nova venda depois do fechamento.
- [ ] Confirmar que o fechamento anterior nao muda.

## Sincronizacao entre navegadores

- [ ] Abrir navegador A.
- [ ] Abrir navegador B.
- [ ] Fazer venda no navegador A.
- [ ] Confirmar resumo no navegador B sem refresh manual.
- [ ] Registrar entrada no navegador B.
- [ ] Confirmar caixa no navegador A sem refresh manual.

## Falha de conexao

- [ ] Simular falha de escrita.
- [ ] Finalizar venda.
- [ ] Confirmar status de pendencia.
- [ ] Restaurar conexao.
- [ ] Sincronizar.
- [ ] Confirmar venda e itens no Supabase.

## Observacoes

Registre aqui falhas, prints e ajustes necessarios.
```

- [ ] **Step 2: Commit checklist**

```powershell
git add docs\superpowers\checklists\2026-06-02-vendas-caixa-supabase.md
git commit -m "docs: add financial sync checklist"
```

---

### Task 7: Verification And Deploy

**Files:**
- No source files unless verification finds a bug.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node tests\financial-adapters.test.mjs
node tests\financial-sync-service.test.mjs
node tests\transaction-service.test.mjs
node tests\cash-closing-service.test.mjs
node tests\product-service.test.mjs
node tests\vercel-cache-config.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run syntax checks**

Run:

```powershell
node --check src\services\financial-sync.service.js
node --check src\services\transaction.service.js
node --check src\services\cash-closing.service.js
node --check src\app.js
```

Expected: exit code `0` and no syntax errors.

- [ ] **Step 3: Deploy to Vercel production**

Run:

```powershell
npx.cmd vercel deploy --prod --yes
```

Expected: deployment is `READY` and aliased to `https://pdv-blue.vercel.app`.

- [ ] **Step 4: Verify production cache version**

Run:

```powershell
$pageResponse = Invoke-WebRequest -UseBasicParsing -Uri 'https://pdv-blue.vercel.app/' -TimeoutSec 20
$pageResponse.StatusCode
$pageResponse.Content.Contains('20260602-03')
```

Expected:

```text
200
True
```

- [ ] **Step 5: Commit manual checklist results if filled**

If the manual checklist was executed, commit the filled checklist:

```powershell
git add docs\superpowers\checklists\2026-06-02-vendas-caixa-supabase.md
git commit -m "docs: record financial sync test results"
```

---

## Self-Review

Spec coverage:

- Sales and sale items in Supabase: Tasks 1, 2, 3.
- Cash movements in Supabase: Tasks 1, 2, 3.
- Cancellations: Tasks 2 and 3.
- Cash closings: Tasks 1, 2, 4.
- Cache and queue: Task 2.
- Realtime: Tasks 2 and 5.
- App boot hydration: Task 5.
- Minimal sync UI: Task 5.
- Tests and checklist: Tasks 1 through 7.

No automatic migration is included. Open comandas remain local, as allowed by the spec. The plan intentionally does not add schema migrations because the existing Supabase migration already defines the financial tables needed for this phase.
