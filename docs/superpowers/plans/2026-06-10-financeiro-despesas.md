# Financeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Financeiro tab with Supabase-backed categories, manual income/expense entries, bills payable, required descriptions, cash-register integration, details rows, and summary/CRM panels.

**Architecture:** Add a focused financial domain beside the existing sales/cash domain. `financial.service.js` owns categories, transactions, summaries, payable state, validation, and optional cash movement linkage; `financial-sync.service.js` hydrates/syncs the new Supabase tables; `despesas.module.js` becomes the Financeiro UI while keeping the current PDV visual system. Existing `cash_movements` remains the source for cash closing impacts, and `financial_transactions.cashMovementId` links a Financeiro record to that cash movement.

**Tech Stack:** Vanilla JavaScript ES Modules, Supabase REST/realtime, HTML templates, existing CSS classes, Node `.mjs` tests.

---

## File Structure

- Create `src/services/repositories/financial-category.adapter.js`: maps `financial_categories` rows to UI category objects.
- Create `src/services/repositories/financial-transaction.adapter.js`: maps `financial_transactions` rows to UI transaction objects.
- Create `src/services/financial.service.js`: domain API for categories, transactions, summaries, payable lists, validation, mark-paid, cancel, and cash movement linkage.
- Modify `src/services/financial-sync.service.js`: include new tables in hydration, realtime, queue write/flush, and cache updates.
- Modify `src/database/schema.js`: add storage keys and sync/UI events for Financeiro.
- Modify `src/services/permission.service.js`: align existing financial permission IDs with route and service checks.
- Modify `src/components/sidebar.component.js`: rename Despesas to Financeiro and use financial permission.
- Modify `src/app.js`: import and register Financeiro route.
- Replace `src/modules/despesas/despesas.module.js`: render full Financeiro page and bind UI actions.
- Modify `src/services/transaction.service.js`: let quick cash entry/saida accept required description and create linked financial transaction.
- Modify `src/modules/vendas/vendas.module.js`: enforce required description in the quick cash movement popup and use Financeiro categories.
- Create Supabase migration `supabase/migrations/20260610185204_add_financial_module.sql`.
- Create tests:
  - `tests/financial-adapters.test.mjs`
  - `tests/financial-service.test.mjs`
  - `tests/financial-sync-service.test.mjs`
  - `tests/despesas-module.test.mjs`
  - extend `tests/transaction-service.test.mjs`
  - extend `tests/permission-service.test.mjs`

## Task 1: Schema, Storage Keys, Permissions Catalog

**Files:**
- Create: `supabase/migrations/20260610185204_add_financial_module.sql`
- Modify: `src/database/schema.js`
- Modify: `src/services/permission.service.js`
- Modify: `tests/permission-service.test.mjs`

- [ ] **Step 1: Create migration file**

The migration file already exists at:

```text
supabase/migrations/20260610185204_add_financial_module.sql
```

- [ ] **Step 2: Write the failing permission test**

Append these assertions to `tests/permission-service.test.mjs` near the existing financial assertions:

```js
assert(permissions.hasPermission(gerente, 'financial.view'), 'gerente should view finance module');
assert(permissions.hasPermission(gerente, 'financial.transaction.create'), 'gerente should create finance transactions');
assert(permissions.hasPermission(gerente, 'financial.payable.pay'), 'gerente should mark payables as paid');
assert(!permissions.hasPermission(caixa, 'financial.category.manage'), 'caixa should not manage finance categories by default');
assert(!permissions.hasPermission(operator, 'financial.view'), 'operator should not view finance module by default');
```

Run:

```powershell
node tests\permission-service.test.mjs
```

Expected: FAIL because `financial.view` is unknown.

- [ ] **Step 3: Add storage keys and events**

Update `src/database/schema.js` so `STORAGE_KEYS` includes:

```js
  financialCategories: 'pdv.financialCategories',
  financialTransactions: 'pdv.financialTransactions',
```

and `SYNC_EVENTS` includes:

```js
  financialTransactionChanged: 'FINANCIAL_TRANSACTION_CHANGED'
```

and `UI_EVENTS` includes:

```js
  financeChanged: 'FINANCE_CHANGED'
```

- [ ] **Step 4: Add canonical financial permissions**

In `src/services/permission.service.js`, keep existing financial permissions for backward compatibility and add these canonical IDs to `PERMISSIONS`:

```js
  { id: 'financial.view', label: 'Acessar financeiro', group: 'Financeiro/Despesas', description: 'Permite abrir a aba Financeiro.' },
  { id: 'financial.transaction.create', label: 'Criar lancamento financeiro', group: 'Financeiro/Despesas', description: 'Permite registrar entradas, saidas e boletos.' },
  { id: 'financial.transaction.edit', label: 'Editar lancamento financeiro', group: 'Financeiro/Despesas', description: 'Permite corrigir lancamentos financeiros.' },
  { id: 'financial.transaction.cancel', label: 'Cancelar lancamento financeiro', group: 'Financeiro/Despesas', description: 'Permite cancelar lancamentos mantendo historico.' },
  { id: 'financial.category.manage', label: 'Gerenciar categorias financeiras', group: 'Financeiro/Despesas', description: 'Permite criar, editar e inativar categorias financeiras.' },
  { id: 'financial.payable.pay', label: 'Marcar conta como paga', group: 'Financeiro/Despesas', description: 'Permite baixar contas pendentes ou vencidas.' },
```

Add these IDs to `ROLE_PERMISSION_DEFAULTS.gerente`:

```js
    'financial.view',
    'financial.transaction.create',
    'financial.transaction.edit',
    'financial.category.manage',
    'financial.payable.pay',
```

Add these IDs to `ROLE_PERMISSION_DEFAULTS.dono`:

```js
    'financial.view',
    'financial.transaction.create',
    'financial.transaction.edit',
    'financial.transaction.cancel',
    'financial.category.manage',
    'financial.payable.pay',
```

- [ ] **Step 5: Fill migration SQL**

In the generated migration file, add:

```sql
create table if not exists public.financial_categories (
  id text primary key,
  name text not null,
  type text not null check (type in ('income', 'expense', 'both')),
  color text not null default '#ff6b1a',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_transactions (
  id text primary key,
  type text not null check (type in ('income', 'expense')),
  description text not null check (length(trim(description)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  category_id text references public.financial_categories(id),
  payment_method text not null default 'dinheiro',
  status text not null default 'paid' check (status in ('paid', 'pending', 'overdue', 'canceled')),
  transaction_date date not null default current_date,
  due_date date,
  paid_at timestamptz,
  notes text not null default '',
  origin text not null default 'finance' check (origin in ('finance', 'cashier')),
  cash_movement_id text references public.cash_movements(id),
  moves_cash_session boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id),
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_categories_active_idx on public.financial_categories(active);
create index if not exists financial_transactions_date_idx on public.financial_transactions(transaction_date desc);
create index if not exists financial_transactions_status_idx on public.financial_transactions(status);
create index if not exists financial_transactions_due_date_idx on public.financial_transactions(due_date);

insert into public.permissions (id, description) values
  ('financial.view', 'Acessar financeiro'),
  ('financial.transaction.create', 'Criar lancamento financeiro'),
  ('financial.transaction.edit', 'Editar lancamento financeiro'),
  ('financial.transaction.cancel', 'Cancelar lancamento financeiro'),
  ('financial.category.manage', 'Gerenciar categorias financeiras'),
  ('financial.payable.pay', 'Marcar conta como paga')
on conflict (id) do update set description = excluded.description;

insert into public.financial_categories (id, name, type, color) values
  ('compra-materiais', 'Compra de materiais', 'expense', '#c2413b'),
  ('fornecedor', 'Fornecedor', 'expense', '#c2413b'),
  ('boleto', 'Boleto', 'expense', '#ff6b1a'),
  ('aluguel', 'Aluguel', 'expense', '#c2413b'),
  ('energia', 'Energia', 'expense', '#c2413b'),
  ('agua', 'Agua', 'expense', '#c2413b'),
  ('internet', 'Internet', 'expense', '#c2413b'),
  ('funcionario', 'Funcionario', 'expense', '#c2413b'),
  ('retirada-dono', 'Retirada do dono', 'expense', '#c2413b'),
  ('manutencao', 'Manutencao', 'expense', '#c2413b'),
  ('reforco-caixa', 'Reforco de caixa', 'income', '#17824f'),
  ('aporte-dono', 'Aporte do dono', 'income', '#17824f'),
  ('reembolso', 'Reembolso', 'income', '#17824f'),
  ('outros-financeiro', 'Outros', 'both', '#ff6b1a')
on conflict (id) do update set name = excluded.name, type = excluded.type, color = excluded.color, active = true;

alter table public.financial_categories enable row level security;
alter table public.financial_transactions enable row level security;

grant select, insert, update, delete on public.financial_categories to authenticated;
grant select, insert, update, delete on public.financial_transactions to authenticated;

create policy "financial users read categories" on public.financial_categories
  for select to authenticated using (private.current_profile_has_permission('financial.view'));
create policy "financial category managers manage categories" on public.financial_categories
  for all to authenticated using (private.current_profile_has_permission('financial.category.manage')) with check (private.current_profile_has_permission('financial.category.manage'));

create policy "financial users read transactions" on public.financial_transactions
  for select to authenticated using (private.current_profile_has_permission('financial.view'));
create policy "financial creators insert transactions" on public.financial_transactions
  for insert to authenticated with check (private.current_profile_has_permission('financial.transaction.create'));
create policy "financial editors update transactions" on public.financial_transactions
  for update to authenticated using (
    private.current_profile_has_permission('financial.transaction.edit')
    or private.current_profile_has_permission('financial.transaction.cancel')
    or private.current_profile_has_permission('financial.payable.pay')
  ) with check (
    private.current_profile_has_permission('financial.transaction.edit')
    or private.current_profile_has_permission('financial.transaction.cancel')
    or private.current_profile_has_permission('financial.payable.pay')
  );
```

- [ ] **Step 6: Run permission test**

Run:

```powershell
node tests\permission-service.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/database/schema.js src/services/permission.service.js tests/permission-service.test.mjs supabase/migrations/20260610185204_add_financial_module.sql
git commit -m "feat: add finance schema and permissions"
```

## Task 2: Financial Adapters

**Files:**
- Create: `src/services/repositories/financial-category.adapter.js`
- Create: `src/services/repositories/financial-transaction.adapter.js`
- Create: `tests/financial-adapters.test.mjs`

- [ ] **Step 1: Write failing adapter tests**

Create `tests/financial-adapters.test.mjs`:

```js
import assert from 'node:assert/strict';

const categoryAdapter = await import('../src/services/repositories/financial-category.adapter.js');
const transactionAdapter = await import('../src/services/repositories/financial-transaction.adapter.js');

const category = categoryAdapter.fromRow({
  id: 'fornecedor',
  name: 'Fornecedor',
  type: 'expense',
  color: '#c2413b',
  active: true,
  created_at: '2026-06-10T10:00:00.000Z',
  updated_at: '2026-06-10T10:00:00.000Z'
});

assert.equal(category.name, 'Fornecedor');
assert.equal(category.active, true);
assert.equal(categoryAdapter.toRow(category).created_at, '2026-06-10T10:00:00.000Z');

const transaction = transactionAdapter.fromRow({
  id: 'fin-1',
  type: 'expense',
  description: 'Boleto fornecedor',
  amount: 220,
  category_id: 'fornecedor',
  payment_method: 'boleto',
  status: 'pending',
  transaction_date: '2026-06-10',
  due_date: '2026-06-15',
  paid_at: null,
  notes: 'Entrega de embalagens',
  origin: 'finance',
  cash_movement_id: null,
  moves_cash_session: false,
  created_by: 'user-1',
  canceled_at: null,
  cancel_reason: null,
  created_at: '2026-06-10T10:00:00.000Z',
  updated_at: '2026-06-10T10:00:00.000Z'
});

assert.equal(transaction.amount, 220);
assert.equal(transaction.categoryId, 'fornecedor');
assert.equal(transaction.paymentMethod, 'boleto');
assert.equal(transaction.dueDate, '2026-06-15');
assert.equal(transaction.movesCashSession, false);
assert.equal(transactionAdapter.toRow(transaction).category_id, 'fornecedor');
assert.equal(transactionAdapter.toRow(transaction).cash_movement_id, null);

console.log('financial adapters ok');
```

Run:

```powershell
node tests\financial-adapters.test.mjs
```

Expected: FAIL because adapter modules do not exist.

- [ ] **Step 2: Implement category adapter**

Create `src/services/repositories/financial-category.adapter.js`:

```js
export const financialCategoryAdapter = {
  table: 'financial_categories',
  cacheKey: 'pdv.financialCategories',
  select: 'id,name,type,color,active,created_at,updated_at',
  fromRow(row) {
    return {
      id: row.id,
      name: row.name || '',
      type: row.type || 'both',
      color: row.color || '#ff6b1a',
      active: row.active !== false,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    };
  },
  toRow(category) {
    return {
      id: category.id,
      name: category.name || '',
      type: category.type || 'both',
      color: category.color || '#ff6b1a',
      active: category.active !== false,
      created_at: category.createdAt || new Date().toISOString(),
      updated_at: category.updatedAt || new Date().toISOString()
    };
  }
};

export const { fromRow, toRow } = financialCategoryAdapter;
```

- [ ] **Step 3: Implement transaction adapter**

Create `src/services/repositories/financial-transaction.adapter.js`:

```js
export const financialTransactionAdapter = {
  table: 'financial_transactions',
  cacheKey: 'pdv.financialTransactions',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,type,description,amount,category_id,payment_method,status,transaction_date,due_date,paid_at,notes,origin,cash_movement_id,moves_cash_session,created_by,canceled_at,cancel_reason,created_at,updated_at',
  fromRow(row) {
    return {
      id: row.id,
      type: row.type || 'expense',
      description: row.description || '',
      amount: Number(row.amount) || 0,
      categoryId: row.category_id || '',
      paymentMethod: row.payment_method || 'dinheiro',
      status: row.status || 'paid',
      transactionDate: row.transaction_date || toDateOnly(row.created_at),
      dueDate: row.due_date || '',
      paidAt: row.paid_at || null,
      notes: row.notes || '',
      origin: row.origin || 'finance',
      cashMovementId: row.cash_movement_id || null,
      movesCashSession: row.moves_cash_session === true,
      createdBy: row.created_by || '',
      canceledAt: row.canceled_at || null,
      cancelReason: row.cancel_reason || '',
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    };
  },
  toRow(transaction) {
    return {
      id: transaction.id,
      type: transaction.type,
      description: transaction.description || '',
      amount: Number(transaction.amount) || 0,
      category_id: transaction.categoryId || null,
      payment_method: transaction.paymentMethod || 'dinheiro',
      status: transaction.status || 'paid',
      transaction_date: transaction.transactionDate || toDateOnly(transaction.createdAt),
      due_date: transaction.dueDate || null,
      paid_at: transaction.paidAt || null,
      notes: transaction.notes || '',
      origin: transaction.origin || 'finance',
      cash_movement_id: transaction.cashMovementId || null,
      moves_cash_session: transaction.movesCashSession === true,
      created_by: transaction.createdBy || null,
      canceled_at: transaction.canceledAt || null,
      cancel_reason: transaction.cancelReason || null,
      created_at: transaction.createdAt || new Date().toISOString(),
      updated_at: transaction.updatedAt || new Date().toISOString()
    };
  }
};

function toDateOnly(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

export const { fromRow, toRow } = financialTransactionAdapter;
```

- [ ] **Step 4: Run adapter tests**

Run:

```powershell
node tests\financial-adapters.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/repositories/financial-category.adapter.js src/services/repositories/financial-transaction.adapter.js tests/financial-adapters.test.mjs
git commit -m "feat: add finance adapters"
```

## Task 3: Financial Domain Service

**Files:**
- Create: `src/services/financial.service.js`
- Create: `tests/financial-service.test.mjs`

- [ ] **Step 1: Write failing service tests**

Create `tests/financial-service.test.mjs` with localStorage setup and these assertions:

```js
import assert from 'node:assert/strict';

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

const storage = await import('../src/services/storage.service.js');
storage.setItem('pdv.currentSession', { user: { id: 'admin-1', name: 'Administrador', role: 'admin', active: true } });

const finance = await import('../src/services/financial.service.js');

finance.seedFinancialCategories();

const expenseCategory = finance.getFinancialCategories().find((category) => category.id === 'compra-materiais');
assert.equal(expenseCategory.name, 'Compra de materiais');

assert.throws(
  () => finance.createFinancialTransaction({ type: 'expense', amount: 100, categoryId: expenseCategory.id, description: '' }),
  /Descricao obrigatoria/
);

const expense = finance.createFinancialTransaction({
  type: 'expense',
  amount: 100,
  categoryId: expenseCategory.id,
  description: 'Retirada para pagar fornecedor',
  paymentMethod: 'dinheiro',
  status: 'paid',
  origin: 'finance'
});

assert.equal(expense.status, 'paid');
assert.equal(expense.description, 'Retirada para pagar fornecedor');

const bill = finance.createFinancialTransaction({
  type: 'expense',
  amount: 220,
  categoryId: 'fornecedor',
  description: 'Boleto fornecedor',
  paymentMethod: 'boleto',
  status: 'pending',
  transactionDate: '2026-06-10',
  dueDate: '2026-06-15'
});

assert.equal(finance.getPayables({ now: new Date('2026-06-10T12:00:00') }).pending.length, 1);
assert.equal(finance.getPayables({ now: new Date('2026-06-20T12:00:00') }).overdue.length, 1);

const paid = finance.markFinancialTransactionPaid(bill.id, { paidAt: '2026-06-11T10:00:00.000Z', paymentMethod: 'pix' });
assert.equal(paid.status, 'paid');
assert.equal(paid.paymentMethod, 'pix');

const summary = finance.getFinancialSummary({ period: 'all' });
assert.equal(summary.entriesTotal, 0);
assert.equal(summary.outputsTotal, 320);
assert.equal(summary.paidBillsCount, 1);

console.log('financial service ok');
```

Run:

```powershell
node tests\financial-service.test.mjs
```

Expected: FAIL because `financial.service.js` does not exist.

- [ ] **Step 2: Implement financial service**

Create `src/services/financial.service.js` with these exports:

```js
import { STORAGE_KEYS, SYNC_EVENTS, UI_EVENTS } from '../database/schema.js';
import { emit } from './event-bus.service.js';
import { getCurrentUser } from './auth.service.js';
import { assertPermission } from './permission.service.js';
import { getItem, setItem } from './storage.service.js';
import { recordAudit } from './audit.service.js';

export const PAYMENT_METHODS = ['dinheiro', 'pix', 'cartao', 'boleto', 'transferencia', 'outro'];
export const FINANCIAL_STATUSES = ['paid', 'pending', 'overdue', 'canceled'];
export const FINANCIAL_CATEGORY_SEED = [
  { id: 'compra-materiais', name: 'Compra de materiais', type: 'expense', color: '#c2413b' },
  { id: 'fornecedor', name: 'Fornecedor', type: 'expense', color: '#c2413b' },
  { id: 'boleto', name: 'Boleto', type: 'expense', color: '#ff6b1a' },
  { id: 'aluguel', name: 'Aluguel', type: 'expense', color: '#c2413b' },
  { id: 'energia', name: 'Energia', type: 'expense', color: '#c2413b' },
  { id: 'agua', name: 'Agua', type: 'expense', color: '#c2413b' },
  { id: 'internet', name: 'Internet', type: 'expense', color: '#c2413b' },
  { id: 'funcionario', name: 'Funcionario', type: 'expense', color: '#c2413b' },
  { id: 'retirada-dono', name: 'Retirada do dono', type: 'expense', color: '#c2413b' },
  { id: 'manutencao', name: 'Manutencao', type: 'expense', color: '#c2413b' },
  { id: 'reforco-caixa', name: 'Reforco de caixa', type: 'income', color: '#17824f' },
  { id: 'aporte-dono', name: 'Aporte do dono', type: 'income', color: '#17824f' },
  { id: 'reembolso', name: 'Reembolso', type: 'income', color: '#17824f' },
  { id: 'outros-financeiro', name: 'Outros', type: 'both', color: '#ff6b1a' }
];

export function seedFinancialCategories() {
  const existing = getFinancialCategories();
  const existingIds = new Set(existing.map((category) => category.id));
  const missing = FINANCIAL_CATEGORY_SEED.filter((category) => !existingIds.has(category.id));

  if (!missing.length) {
    return existing;
  }

  const now = new Date().toISOString();
  const nextCategories = [
    ...existing,
    ...missing.map((category) => ({ ...category, active: true, createdAt: now, updatedAt: now }))
  ];
  setItem(STORAGE_KEYS.financialCategories, nextCategories);
  return nextCategories;
}

export function getFinancialCategories({ type = 'all', activeOnly = true } = {}) {
  const categories = getItem(STORAGE_KEYS.financialCategories, FINANCIAL_CATEGORY_SEED.map((category) => ({
    ...category,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })));

  return categories.filter((category) => {
    if (activeOnly && category.active === false) {
      return false;
    }

    return type === 'all' || category.type === type || category.type === 'both';
  });
}

export function getFinancialTransactions() {
  return getItem(STORAGE_KEYS.financialTransactions, []);
}

export function createFinancialTransaction(input) {
  const user = getCurrentUser();
  assertPermission(user, 'financial.transaction.create');

  const transaction = normalizeFinancialTransaction(input, user);
  const transactions = [transaction, ...getFinancialTransactions()];
  setItem(STORAGE_KEYS.financialTransactions, transactions);
  emitFinanceChanged(transaction);
  recordAudit({
    action: 'financial.transaction.create',
    entityType: 'financial_transaction',
    entityId: transaction.id,
    user,
    reason: transaction.description,
    metadata: { type: transaction.type, amount: transaction.amount, status: transaction.status }
  });
  return transaction;
}

export function upsertFinancialTransaction(transaction) {
  const transactions = getFinancialTransactions();
  const exists = transactions.some((candidate) => candidate.id === transaction.id);
  const nextTransactions = exists
    ? transactions.map((candidate) => (candidate.id === transaction.id ? transaction : candidate))
    : [transaction, ...transactions];

  setItem(STORAGE_KEYS.financialTransactions, sortNewestFirst(nextTransactions));
  emitFinanceChanged(transaction);
  return transaction;
}

export function markFinancialTransactionPaid(transactionId, { paidAt = new Date().toISOString(), paymentMethod = 'dinheiro', cashMovementId = null, movesCashSession = false } = {}) {
  const user = getCurrentUser();
  assertPermission(user, 'financial.payable.pay');

  const transaction = getFinancialTransactions().find((candidate) => candidate.id === transactionId);

  if (!transaction) {
    throw new Error('Lancamento financeiro nao encontrado.');
  }

  const nextTransaction = {
    ...transaction,
    status: 'paid',
    paidAt,
    paymentMethod,
    cashMovementId: cashMovementId || transaction.cashMovementId || null,
    movesCashSession: movesCashSession || transaction.movesCashSession === true,
    updatedAt: new Date().toISOString()
  };

  upsertFinancialTransaction(nextTransaction);
  recordAudit({
    action: 'financial.payable.paid',
    entityType: 'financial_transaction',
    entityId: nextTransaction.id,
    user,
    reason: nextTransaction.description,
    metadata: { amount: nextTransaction.amount, paymentMethod: nextTransaction.paymentMethod }
  });
  return nextTransaction;
}

export function cancelFinancialTransaction(transactionId, { reason = '' } = {}) {
  const user = getCurrentUser();
  assertPermission(user, 'financial.transaction.cancel');

  const cancelReason = String(reason || '').trim();

  if (!cancelReason) {
    throw new Error('Informe o motivo do cancelamento.');
  }

  const transaction = getFinancialTransactions().find((candidate) => candidate.id === transactionId);

  if (!transaction) {
    throw new Error('Lancamento financeiro nao encontrado.');
  }

  const canceled = {
    ...transaction,
    status: 'canceled',
    canceledAt: new Date().toISOString(),
    cancelReason,
    updatedAt: new Date().toISOString()
  };
  upsertFinancialTransaction(canceled);
  recordAudit({
    action: 'financial.transaction.cancel',
    entityType: 'financial_transaction',
    entityId: canceled.id,
    user,
    reason: cancelReason,
    metadata: { amount: canceled.amount }
  });
  return canceled;
}

export function getFinancialSummary({ period = 'today', customStart = '', customEnd = '' } = {}) {
  const filtered = getFinancialTransactions()
    .map(resolveOverdueStatus)
    .filter((transaction) => transaction.status !== 'canceled' && isInPeriod(transaction.transactionDate || transaction.createdAt, period, { customStart, customEnd }));
  const paid = filtered.filter((transaction) => transaction.status === 'paid');
  const pending = filtered.filter((transaction) => transaction.status === 'pending');
  const overdue = filtered.filter((transaction) => transaction.status === 'overdue');
  const entriesTotal = sumTransactions(paid, 'income');
  const outputsTotal = sumTransactions(paid, 'expense');

  return {
    entriesTotal,
    outputsTotal,
    balance: entriesTotal - outputsTotal,
    payablesCount: pending.length + overdue.length,
    paidBillsCount: paid.filter((transaction) => transaction.type === 'expense' && transaction.dueDate).length,
    overdueCount: overdue.length
  };
}

export function getPayables({ now = new Date() } = {}) {
  const payables = getFinancialTransactions()
    .filter((transaction) => transaction.type === 'expense' && transaction.status !== 'paid' && transaction.status !== 'canceled')
    .map((transaction) => resolveOverdueStatus(transaction, now));

  return {
    pending: payables.filter((transaction) => transaction.status === 'pending'),
    overdue: payables.filter((transaction) => transaction.status === 'overdue'),
    upcoming: payables.filter((transaction) => isUpcoming(transaction, now))
  };
}

export function buildFinancialCrm() {
  const active = getFinancialTransactions().map(resolveOverdueStatus).filter((transaction) => transaction.status !== 'canceled');
  const paid = active.filter((transaction) => transaction.status === 'paid');

  return {
    outputsByCategory: totalsBy(paid.filter((transaction) => transaction.type === 'expense'), 'categoryId'),
    entriesByCategory: totalsBy(paid.filter((transaction) => transaction.type === 'income'), 'categoryId'),
    spendingByPaymentMethod: totalsBy(paid.filter((transaction) => transaction.type === 'expense'), 'paymentMethod'),
    pendingByCategory: totalsBy(active.filter((transaction) => transaction.status === 'pending' || transaction.status === 'overdue'), 'categoryId')
  };
}

export function normalizeFinancialTransaction(input, user = getCurrentUser()) {
  const description = String(input.description || '').trim();
  const amount = Number(input.amount) || 0;
  const type = input.type === 'income' || input.type === 'entrada' ? 'income' : 'expense';
  const status = normalizeStatus(input.status);
  const now = new Date().toISOString();

  if (!description) {
    throw new Error('Descricao obrigatoria.');
  }

  if (amount <= 0) {
    throw new Error('Valor precisa ser maior que zero.');
  }

  return {
    id: input.id || createId('fin'),
    type,
    description,
    amount,
    categoryId: input.categoryId || 'outros-financeiro',
    paymentMethod: normalizePaymentMethod(input.paymentMethod),
    status,
    transactionDate: input.transactionDate || now.slice(0, 10),
    dueDate: input.dueDate || '',
    paidAt: status === 'paid' ? (input.paidAt || now) : null,
    notes: String(input.notes || '').trim(),
    origin: input.origin || 'finance',
    cashMovementId: input.cashMovementId || null,
    movesCashSession: input.movesCashSession === true,
    createdBy: user?.id || '',
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function emitFinanceChanged(payload) {
  emit(SYNC_EVENTS.financialTransactionChanged, payload);
  emit(UI_EVENTS.financeChanged, payload);
  emit(UI_EVENTS.financialDataChanged, payload);
  emit(UI_EVENTS.cashSummaryChanged, payload);
}

function normalizeStatus(status) {
  if (FINANCIAL_STATUSES.includes(status)) {
    return status;
  }

  if (status === 'pago') {
    return 'paid';
  }

  if (status === 'vencido') {
    return 'overdue';
  }

  return 'pending';
}

function normalizePaymentMethod(paymentMethod) {
  return PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : 'dinheiro';
}

function resolveOverdueStatus(transaction, now = new Date()) {
  if (transaction.status !== 'pending' || !transaction.dueDate) {
    return transaction;
  }

  const due = new Date(`${transaction.dueDate}T23:59:59`);
  return due < now ? { ...transaction, status: 'overdue' } : transaction;
}

function isUpcoming(transaction, now) {
  if (!transaction.dueDate || transaction.status !== 'pending') {
    return false;
  }

  const due = new Date(`${transaction.dueDate}T23:59:59`);
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return due >= now && due <= end;
}

function sumTransactions(transactions, type) {
  return transactions.filter((transaction) => transaction.type === type).reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
}

function totalsBy(transactions, key) {
  return transactions.reduce((totals, transaction) => {
    const id = transaction[key] || 'sem-categoria';
    totals[id] = (totals[id] || 0) + Number(transaction.amount || 0);
    return totals;
  }, {});
}

function sortNewestFirst(items) {
  return [...items].sort((left, right) => Date.parse(right.createdAt || right.transactionDate || 0) - Date.parse(left.createdAt || left.transactionDate || 0));
}

function isInPeriod(value, period, filters = {}) {
  if (!value || period === 'all') {
    return true;
  }

  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  const now = new Date();

  if (period === 'custom') {
    const start = filters.customStart ? new Date(`${filters.customStart}T00:00:00`) : null;
    const end = filters.customEnd ? new Date(`${filters.customEnd}T23:59:59`) : null;
    return (!start || date >= start) && (!end || date <= end);
  }

  if (period === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  return date.toDateString() === now.toDateString();
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
```

- [ ] **Step 3: Run service test**

Run:

```powershell
node tests\financial-service.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/services/financial.service.js tests/financial-service.test.mjs
git commit -m "feat: add finance domain service"
```

## Task 4: Supabase Sync and Realtime Hydration

**Files:**
- Modify: `src/services/financial-sync.service.js`
- Modify: `tests/financial-sync-service.test.mjs`

- [ ] **Step 1: Extend financial sync test**

In `tests/financial-sync-service.test.mjs`, add empty row arrays in the mocked `rows` object:

```js
  financial_categories: [],
  financial_transactions: []
```

Add assertions after hydration:

```js
assert(calls.find((call) => call.table === 'financial_categories'), 'financial categories should hydrate');
assert(calls.find((call) => call.table === 'financial_transactions'), 'financial transactions should hydrate');
```

Add a queued operation assertion:

```js
await sync.saveFinancialTransactionToSupabase({
  id: 'fin-1',
  type: 'expense',
  description: 'Boleto fornecedor',
  amount: 220,
  categoryId: 'fornecedor',
  paymentMethod: 'boleto',
  status: 'pending',
  transactionDate: '2026-06-10',
  dueDate: '2026-06-15',
  origin: 'finance',
  movesCashSession: false,
  createdAt: '2026-06-10T10:00:00.000Z',
  updatedAt: '2026-06-10T10:00:00.000Z'
});

assert(calls.find((call) => call.table === 'financial_transactions'), 'financial transaction should write financial_transactions');
```

Run:

```powershell
node tests\financial-sync-service.test.mjs
```

Expected: FAIL because sync functions do not include the new tables.

- [ ] **Step 2: Import financial adapters**

In `src/services/financial-sync.service.js`, add imports:

```js
import { financialCategoryAdapter } from './repositories/financial-category.adapter.js';
import { financialTransactionAdapter } from './repositories/financial-transaction.adapter.js';
```

Add both tables to `FINANCIAL_TABLES`:

```js
  financialCategoryAdapter.table,
  financialTransactionAdapter.table
```

- [ ] **Step 3: Hydrate new caches**

In `hydrateFinancialData`, add two selects:

```js
      financialCategoryRows,
      financialTransactionRows
```

and:

```js
      selectRows(client, financialCategoryAdapter),
      selectRows(client, financialTransactionAdapter)
```

Map rows:

```js
    const financialCategories = financialCategoryRows.map(financialCategoryAdapter.fromRow);
    const financialTransactions = financialTransactionRows.map(financialTransactionAdapter.fromRow);
```

Pass to `writeFinancialCaches`:

```js
      financialCategories,
      financialTransactions: includePending ? applyQueueToFinancialTransactions(financialTransactions, queue) : financialTransactions
```

Update the return value:

```js
      financialCategories: readJson(STORAGE_KEYS.financialCategories, []),
      financialTransactions: readJson(STORAGE_KEYS.financialTransactions, [])
```

- [ ] **Step 4: Add transaction write functions**

Export:

```js
export async function saveFinancialTransactionToSupabase(transaction) {
  const nextTransaction = { ...transaction };
  const inFlightOperation = { action: 'saveFinancialTransaction', transaction: nextTransaction };

  try {
    addInFlightOperation(inFlightOperation);
    setStatus({ state: 'syncing', error: '' });
    const client = await getWriteClient();
    await upsertRows(client, financialTransactionAdapter.table, [financialTransactionAdapter.toRow(nextTransaction)]);
    upsertFinancialTransactionCache(nextTransaction);
    setStatusFromQueue(readQueue());
    return nextTransaction;
  } catch (error) {
    const queue = enqueueOperation({ action: 'saveFinancialTransaction', transaction: nextTransaction });
    upsertFinancialTransactionCache({ ...nextTransaction, syncPending: true });
    setPendingStatus(queue, error);
    return nextTransaction;
  } finally {
    removeInFlightOperation(inFlightOperation);
  }
}
```

Export:

```js
export async function cancelFinancialTransactionInSupabase({ transactionId, canceledAt, cancelReason = '' }) {
  const nextCanceledAt = canceledAt || new Date().toISOString();

  try {
    setStatus({ state: 'syncing', error: '' });
    await updateById(await getWriteClient(), financialTransactionAdapter.table, transactionId, {
      status: 'canceled',
      canceled_at: nextCanceledAt,
      cancel_reason: cancelReason
    });
    markFinancialTransactionCanceledInCache({ transactionId, canceledAt: nextCanceledAt, cancelReason });
    setStatusFromQueue(readQueue());
  } catch (error) {
    const queue = enqueueOperation({ action: 'cancelFinancialTransaction', transactionId, canceledAt: nextCanceledAt, cancelReason });
    markFinancialTransactionCanceledInCache({ transactionId, canceledAt: nextCanceledAt, cancelReason, syncPending: true });
    setPendingStatus(queue, error);
  }
}
```

- [ ] **Step 5: Add queue helpers**

Add to `writeQueuedOperation`:

```js
  if (operation.action === 'saveFinancialTransaction') {
    await upsertRows(client, financialTransactionAdapter.table, [financialTransactionAdapter.toRow(operation.transaction)]);
    return;
  }

  if (operation.action === 'cancelFinancialTransaction') {
    await updateById(client, financialTransactionAdapter.table, operation.transactionId, {
      status: 'canceled',
      canceled_at: operation.canceledAt,
      cancel_reason: operation.cancelReason || ''
    });
  }
```

Add cache helpers:

```js
function upsertFinancialTransactionCache(item) {
  writeJson(STORAGE_KEYS.financialTransactions, upsertInList(readJson(STORAGE_KEYS.financialTransactions, []), item));
  emitFinancialDataChanged(item);
}

function markFinancialTransactionCanceledInCache(operation) {
  writeJson(STORAGE_KEYS.financialTransactions, sortNewestFirst(readJson(STORAGE_KEYS.financialTransactions, []).map((transaction) => (
    transaction.id === operation.transactionId
      ? stripUndefined({ ...transaction, status: 'canceled', canceledAt: operation.canceledAt, cancelReason: operation.cancelReason || '', syncPending: operation.syncPending || undefined })
      : transaction
  ))));
  emitFinancialDataChanged(operation);
}

function applyQueueToFinancialTransactions(transactions, queue = readQueue()) {
  return queue.reduce((nextTransactions, operation) => {
    if (operation.action === 'saveFinancialTransaction') {
      return upsertInList(nextTransactions, { ...operation.transaction, syncPending: true });
    }

    if (operation.action === 'cancelFinancialTransaction') {
      return nextTransactions.map((transaction) => (
        transaction.id === operation.transactionId
          ? { ...transaction, status: 'canceled', canceledAt: operation.canceledAt, cancelReason: operation.cancelReason || '', syncPending: true }
          : transaction
      ));
    }

    return nextTransactions;
  }, transactions);
}
```

Update `writeFinancialCaches` signature and body:

```js
function writeFinancialCaches({ transactions, commands, closings, financialCategories = [], financialTransactions = [] }) {
  writeJson(STORAGE_KEYS.transactions, transactions);
  writeJson(STORAGE_KEYS.closedComandas, commands);
  writeJson(STORAGE_KEYS.cashClosings, closings);
  writeJson(STORAGE_KEYS.financialCategories, financialCategories);
  writeJson(STORAGE_KEYS.financialTransactions, sortNewestFirst(financialTransactions));
  emitFinancialDataChanged({ type: 'hydrated' });
}
```

- [ ] **Step 6: Run financial sync tests**

Run:

```powershell
node tests\financial-sync-service.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/services/financial-sync.service.js tests/financial-sync-service.test.mjs
git commit -m "feat: sync finance tables"
```

## Task 5: Cash Movement Linkage

**Files:**
- Modify: `src/services/transaction.service.js`
- Modify: `src/modules/vendas/vendas.module.js`
- Modify: `tests/transaction-service.test.mjs`

- [ ] **Step 1: Add failing transaction test**

In `tests/transaction-service.test.mjs`, add:

```js
const linkedMovement = transactions.registerCashMovement({
  type: 'saida',
  amount: 100,
  category: 'compra-materiais',
  description: 'Retirada para pagar fornecedor',
  createFinancialTransaction: true
});

const financialTransactions = JSON.parse(localStorage.getItem('pdv.financialTransactions'));
const linkedFinancial = financialTransactions.find((transaction) => transaction.cashMovementId === linkedMovement.id);

assert(linkedFinancial, 'cash movement should create linked financial transaction');
assert.equal(linkedFinancial.description, 'Retirada para pagar fornecedor');
assert.equal(linkedFinancial.type, 'expense');
assert.equal(linkedFinancial.status, 'paid');
assert.equal(linkedFinancial.movesCashSession, true);

assert.throws(
  () => transactions.registerCashMovement({ type: 'entrada', amount: 10, category: 'reforco-caixa', description: '' }),
  /Descricao obrigatoria/
);
```

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: FAIL because `registerCashMovement` accepts empty description and does not create Financeiro record.

- [ ] **Step 2: Update registerCashMovement**

In `src/services/transaction.service.js`, import:

```js
import { createFinancialTransaction, upsertFinancialTransaction } from './financial.service.js';
```

Change description validation inside `registerCashMovement`:

```js
  const normalizedDescription = String(description || '').trim();

  if (!normalizedDescription) {
    throw new Error('Descricao obrigatoria.');
  }
```

Set movement description:

```js
    description: normalizedDescription,
```

After `appendTransaction(movement);`, add:

```js
  if (createFinancialTransaction !== false) {
    const financialTransaction = createFinancialTransaction({
      type: type === 'entrada' ? 'income' : 'expense',
      amount: normalizedAmount,
      categoryId: movement.category,
      description: movement.description,
      paymentMethod: 'dinheiro',
      status: 'paid',
      origin: 'cashier',
      cashMovementId: movement.id,
      movesCashSession: true,
      transactionDate: movement.createdAt.slice(0, 10),
      paidAt: movement.createdAt
    });
    upsertFinancialTransaction({ ...financialTransaction, cashMovementId: movement.id });
  }
```

Use the option name exactly as:

```js
  createFinancialTransaction: shouldCreateFinancialTransaction = true
```

in the function parameter object, then wrap the creation in:

```js
  if (shouldCreateFinancialTransaction) {
```

- [ ] **Step 3: Update quick movement popup in vendas module**

In `src/modules/vendas/vendas.module.js`, find the cash movement modal. Ensure its description input label says `Descricao obrigatoria` and the submit handler passes a trimmed description. Add validation before calling `registerCashMovement`:

```js
if (!description) {
  showToast('Informe a descricao do movimento.');
  return;
}
```

Ensure entrada category options come from `getFinancialCategories({ type: 'income' })` and saida options from `getFinancialCategories({ type: 'expense' })`.

- [ ] **Step 4: Run transaction tests**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/transaction.service.js src/modules/vendas/vendas.module.js tests/transaction-service.test.mjs
git commit -m "feat: link cash movements to finance"
```

## Task 6: Financeiro UI Module

**Files:**
- Modify: `src/components/sidebar.component.js`
- Modify: `src/app.js`
- Replace: `src/modules/despesas/despesas.module.js`
- Create: `tests/despesas-module.test.mjs`

- [ ] **Step 1: Write failing module test**

Create `tests/despesas-module.test.mjs`:

```js
import assert from 'node:assert/strict';

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

globalThis.document = {
  createElement() {
    return { innerHTML: '', querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  }
};

const { renderFinanceiroMarkup } = await import('../src/modules/despesas/despesas.module.js');

const html = renderFinanceiroMarkup({
  summary: {
    entriesTotal: 420,
    outputsTotal: 185,
    balance: 235,
    payablesCount: 3,
    paidBillsCount: 8,
    overdueCount: 1
  },
  categories: [{ id: 'reforco-caixa', name: 'Reforco de caixa', type: 'income' }],
  transactions: [{
    id: 'fin-1',
    type: 'expense',
    description: 'Boleto fornecedor',
    amount: 220,
    categoryId: 'fornecedor',
    status: 'pending',
    transactionDate: '2026-06-10',
    dueDate: '2026-06-15'
  }],
  payables: {
    pending: [],
    overdue: [{
      id: 'fin-2',
      description: 'Energia',
      amount: 320,
      status: 'overdue',
      transactionDate: '2026-06-10',
      dueDate: '2026-06-09',
      notes: 'Conta de energia da lanchonete.'
    }],
    upcoming: []
  },
  crm: {
    outputsByCategory: { fornecedor: 220 },
    entriesByCategory: { 'reforco-caixa': 100 },
    spendingByPaymentMethod: { boleto: 220 },
    pendingByCategory: { fornecedor: 220 }
  }
});

assert(html.includes('Financeiro'));
assert(html.includes('+ Entrada'));
assert(html.includes('- Saida'));
assert(html.includes('+ Boleto'));
assert(html.includes('Descricao obrigatoria'));
assert(html.includes('Contas a pagar'));
assert(html.includes('Mais info'));
assert(html.includes('Mini CRM financeiro'));
assert(html.includes('Vencimento: 09/06/2026'));

console.log('despesas module ok');
```

Run:

```powershell
node tests\despesas-module.test.mjs
```

Expected: FAIL because `renderFinanceiroMarkup` does not exist.

- [ ] **Step 2: Register route and sidebar**

In `src/app.js`, import:

```js
import { initDespesasModule } from './modules/despesas/despesas.module.js';
```

Add route:

```js
  despesas: initDespesasModule,
```

Add permission:

```js
  despesas: 'financial.view',
```

In `src/components/sidebar.component.js`, change the Despesas item to:

```js
      { id: 'despesas', label: 'Financeiro', icon: 'FI', permission: 'financial.view' }
```

- [ ] **Step 3: Implement markup export**

Replace `src/modules/despesas/despesas.module.js` with exports:

```js
import { formatCurrency } from '../../utils/currency.js';
import {
  buildFinancialCrm,
  createFinancialTransaction,
  getFinancialCategories,
  getFinancialSummary,
  getFinancialTransactions,
  getPayables,
  markFinancialTransactionPaid,
  seedFinancialCategories
} from '../../services/financial.service.js';

export function initDespesasModule(container) {
  seedFinancialCategories();
  renderFinanceiro(container);
  bindFinanceiroEvents(container);
}

export function renderFinanceiro(container) {
  const state = getFinanceiroState();
  container.innerHTML = renderFinanceiroMarkup(state);
}

export function getFinanceiroState() {
  return {
    summary: getFinancialSummary({ period: 'today' }),
    categories: getFinancialCategories(),
    transactions: getFinancialTransactions(),
    payables: getPayables(),
    crm: buildFinancialCrm()
  };
}
```

Then add `renderFinanceiroMarkup(state)` using the approved structure: module header, action buttons, six summary cards, two modal preview sections only when modal state is active, movements table, accounts payable cards with data/description/due date/value, and Mini CRM panel. Use existing classes where possible:

```js
export function renderFinanceiroMarkup({ summary, categories, transactions, payables, crm }) {
  const activeTransactions = transactions.filter((transaction) => transaction.status !== 'canceled');

  return `
    <section class="module-screen finance-screen" data-financeiro-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Financeiro</h1>
          <p class="module-subtitle">Entradas, saidas, boletos, contas a pagar e mini CRM financeiro.</p>
        </div>
        <div class="header-actions">
          <button class="button button--success" type="button" data-finance-action="open-income">+ Entrada</button>
          <button class="button button--danger" type="button" data-finance-action="open-expense">- Saida</button>
          <button class="button" type="button" data-finance-action="open-bill">+ Boleto</button>
        </div>
      </header>
      <div class="summary-grid money-summary-grid">
        ${renderSummaryCard('Entradas', summary.entriesTotal, 'money-positive')}
        ${renderSummaryCard('Saidas', summary.outputsTotal, 'money-negative')}
        ${renderSummaryCard('Saldo', summary.balance, '')}
        ${renderCountCard('Contas a pagar', summary.payablesCount, 'money-primary')}
        ${renderCountCard('Contas pagas', summary.paidBillsCount, 'money-positive')}
        ${renderCountCard('Vencidas', summary.overdueCount, 'money-negative')}
      </div>
      <div class="history-grid finance-grid">
        ${renderFinancialTable(activeTransactions, categories)}
        ${renderPayablesPanel(payables)}
      </div>
      ${renderFinancialCrm(crm, categories)}
    </section>
  `;
}
```

Add helpers in the same file:

```js
function renderSummaryCard(label, value, stateClass) {
  return `<article class="summary-card"><span>${label}</span><strong class="${stateClass}">${formatCurrency(value)}</strong></article>`;
}

function renderCountCard(label, value, stateClass) {
  return `<article class="summary-card"><span>${label}</span><strong class="${stateClass}">${value}</strong></article>`;
}
```

Implement table, payables, and CRM helpers with the labels from the approved mockup.

- [ ] **Step 4: Bind actions**

In `bindFinanceiroEvents(container)`, bind:

```js
container.addEventListener('click', (event) => {
  const action = event.target.closest('[data-finance-action]')?.dataset.financeAction;

  if (action === 'open-income') {
    openFinancialModal(container, { type: 'income' });
  }

  if (action === 'open-expense') {
    openFinancialModal(container, { type: 'expense' });
  }

  if (action === 'open-bill') {
    openFinancialModal(container, { type: 'bill' });
  }

  const payableId = event.target.closest('[data-payable-id]')?.dataset.payableId;

  if (payableId) {
    markFinancialTransactionPaid(payableId, { paymentMethod: 'boleto' });
    renderFinanceiro(container);
  }
});
```

The modal submit handler must call `createFinancialTransaction` with required description and then `renderFinanceiro(container)`.

- [ ] **Step 5: Run module test**

Run:

```powershell
node tests\despesas-module.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/sidebar.component.js src/app.js src/modules/despesas/despesas.module.js tests/despesas-module.test.mjs
git commit -m "feat: add finance module UI"
```

## Task 7: Integration Verification

**Files:**
- Modify: `tests/vercel-cache-config.test.mjs` if it checks versioned file references.
- Modify: `index.html` and `service-worker.js` only if cache bust versions need to include the new module.

- [ ] **Step 1: Run focused test suite**

Run:

```powershell
node tests\financial-adapters.test.mjs
node tests\financial-service.test.mjs
node tests\financial-sync-service.test.mjs
node tests\transaction-service.test.mjs
node tests\permission-service.test.mjs
node tests\despesas-module.test.mjs
```

Expected: all commands print their `ok` message and exit 0.

- [ ] **Step 2: Run existing cash and dashboard tests**

Run:

```powershell
node tests\cash-closing-service.test.mjs
node tests\dashboard-resumo-service.test.mjs
node tests\crm-dashboard-service.test.mjs
node tests\mobile-cash-flow-service.test.mjs
```

Expected: all commands print their `ok` message and exit 0. This confirms Financeiro changes did not break cash closing, dashboard, CRM, or mobile cash summaries.

- [ ] **Step 3: Browser smoke test**

Start the local server:

```powershell
scripts\start-server.cmd
```

Open:

```text
http://127.0.0.1:5500/?view=despesas
```

Manual checks:

- Financeiro page loads.
- Summary cards appear.
- `+ Entrada`, `- Saida`, and `+ Boleto` open modals.
- Saving without description is blocked.
- Saving with description adds a row.
- Conta a pagar card shows data, description, due date, value, and `Marcar pago`.
- `Mais info` opens details for a row.

- [ ] **Step 4: Commit verification-only fixes**

If Step 1 or 2 required small fixes, commit those files:

```powershell
git add tests/vercel-cache-config.test.mjs index.html service-worker.js
git commit -m "test: cover finance module integration"
```

If none of those files changed, do not create an empty commit.

## Task 8: Supabase/Remote Checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-06-10-financeiro-despesas-design.md` only if implementation discovers a necessary correction.

- [ ] **Step 1: List SQL to apply**

In the final implementation report, include the generated migration path and state that it creates:

```text
financial_categories
financial_transactions
financial permissions
financial RLS policies
seed financial categories
```

- [ ] **Step 2: Confirm no local-only finance source**

Inspect `src/services/financial.service.js` and `src/services/financial-sync.service.js`:

```powershell
Select-String -Path src\services\financial.service.js,src\services\financial-sync.service.js -Pattern "financialTransactions|financialCategories|localStorage|Supabase"
```

Expected: `localStorage` appears only through existing cache helpers/storage service; Supabase sync hydrates and writes canonical remote rows.

- [ ] **Step 3: Final full test command**

Run the focused suite from Task 7 again.

Expected: all pass.

- [ ] **Step 4: Final commit if needed**

If Step 2 or 3 produced code/doc changes:

```powershell
git add docs/superpowers/specs/2026-06-10-financeiro-despesas-design.md
git commit -m "docs: document finance deployment sql"
```

If that spec file did not change, do not create an empty commit.

## Self-Review

Spec coverage:

- Financeiro tab/menu: Task 6.
- Top cards: Task 6.
- Entrada/saida/boleto forms: Task 3 and Task 6.
- Financial categories: Task 1, Task 2, Task 3.
- Movements table, filters, details: Task 6.
- Accounts payable with boleto information: Task 3 and Task 6.
- Mini CRM: Task 3 and Task 6.
- Supabase tables/RLS: Task 1 and Task 4.
- Cash open integration: Task 5.
- Permissions: Task 1 and Task 6.
- Tests: Tasks 1 through 8.

No placeholders remain in this plan. Function/property names are consistent across adapters, service, sync, and UI: `categoryId`, `paymentMethod`, `transactionDate`, `dueDate`, `paidAt`, `origin`, `cashMovementId`, and `movesCashSession`.
