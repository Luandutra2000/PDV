# Frente de Caixa Vitrine Estoque Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate cashier sales with showcase stock so production increases available stock, sales decrease it, out-of-stock sales are tracked, cash closing reports them, and all data syncs through Supabase with offline queue support.

**Architecture:** Add a dedicated showcase stock domain beside the existing financial sync domain. Keep pure stock math isolated in a small service, persist local cache/queue through `localStorage`, sync online through Supabase tables/RPC, and notify modules with event-bus events.

**Tech Stack:** JavaScript ES Modules, localStorage, Supabase REST/RPC/Realtime, SQL migrations, Node `.mjs` tests.

---

## File Structure

- Create `supabase/migrations/<timestamp>_add_showcase_stock_sync.sql`: tables, indexes, RLS policies, Realtime publication entries, RPC functions.
- Modify `src/database/schema.js`: add storage keys and UI events for showcase stock, movements, out-of-stock sales, and queue.
- Create `src/services/repositories/product-stock.adapter.js`: map `product_stock` rows.
- Create `src/services/repositories/showcase-movement.adapter.js`: map `showcase_movements` rows.
- Create `src/services/repositories/out-of-stock-sale.adapter.js`: map `out_of_stock_sales` rows.
- Create `src/services/showcase-stock.service.js`: pure local stock operations, idempotency, summaries, and selectors.
- Create `src/services/showcase-sync.service.js`: hydrate, queue, flush, RPC fallback, Realtime subscription, cache updates.
- Modify `src/services/estoque.service.js`: delegate production, write-off, adjustment, and summaries to showcase stock domain while preserving existing launch history.
- Modify `src/services/transaction.service.js`: process showcase stock after sale finalize and reverse it on sale/command cancel.
- Modify `src/services/cash-closing.service.js`: include `outOfStockSales` in summaries and confirmed closings.
- Modify `src/services/online-data.service.js`: hydrate/flush showcase sync together with financial data.
- Modify `src/services/realtime.service.js`: initialize showcase Realtime feed/events.
- Modify `src/components/product-card.component.js`: render current showcase stock and `Sem estoque` state.
- Modify `src/modules/vendas/vendas.module.js`: pass showcase stock to product cards and show no-stock warning when adding product.
- Modify `src/modules/estoque/estoque.module.js`: show current stock, produced/sold/out-of-stock totals, zero alerts, movements, and manual adjustment.
- Modify `src/components/fechamento-rapido-modal.component.js`: render `Produtos vendidos sem estoque`.
- Create `tests/showcase-stock-service.test.mjs`.
- Create `tests/showcase-sync-service.test.mjs`.
- Create `tests/showcase-adapters.test.mjs`.
- Modify `tests/transaction-service.test.mjs`.
- Modify `tests/cash-closing-service.test.mjs`.
- Modify `tests/estoque-service.test.mjs`.
- Modify `tests/realtime-service.test.mjs`.
- Modify or create module rendering tests for product cards, vendas, estoque, and closing modal as needed.

## Task 1: Database Schema and Policies

**Files:**
- Create: `supabase/migrations/<generated>_add_showcase_stock_sync.sql`
- Test: `tests/showcase-stock-migration.test.mjs`

- [ ] **Step 1: Create the migration with Supabase CLI**

Run:

```powershell
npx.cmd supabase migration new add_showcase_stock_sync
```

Expected: a new file under `supabase/migrations/` with a timestamped name.

- [ ] **Step 2: Write the migration test**

Create `tests/showcase-stock-migration.test.mjs` with string-level assertions so schema drift is caught in CI:

```js
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationName = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_add_showcase_stock_sync.sql'))
  .sort()
  .at(-1);

if (!migrationName) {
  throw new Error('showcase stock migration should exist');
}

const sql = readFileSync(join('supabase/migrations', migrationName), 'utf8');
const required = [
  'create table if not exists public.product_stock',
  'create table if not exists public.showcase_movements',
  'create table if not exists public.out_of_stock_sales',
  'alter table public.product_stock enable row level security',
  'alter table public.showcase_movements enable row level security',
  'alter table public.out_of_stock_sales enable row level security',
  'create or replace function public.process_showcase_sale',
  'create or replace function public.reverse_showcase_sale',
  'create or replace function public.process_showcase_production',
  'create or replace function public.adjust_showcase_stock',
  'alter publication supabase_realtime add table public.product_stock',
  'alter publication supabase_realtime add table public.showcase_movements',
  'alter publication supabase_realtime add table public.out_of_stock_sales'
];

for (const snippet of required) {
  if (!sql.includes(snippet)) {
    throw new Error(`migration missing: ${snippet}`);
  }
}

console.log('showcase stock migration ok');
```

- [ ] **Step 3: Run the migration test and verify it fails**

Run:

```powershell
node tests\showcase-stock-migration.test.mjs
```

Expected: FAIL with `showcase stock migration should exist` or `migration missing`.

- [ ] **Step 4: Implement the migration SQL**

Add this SQL to the generated migration file:

```sql
create table if not exists public.product_stock (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  quantity_available numeric(12,3) not null default 0 check (quantity_available >= 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (product_id)
);

create table if not exists public.showcase_movements (
  id text primary key,
  operation_id text not null,
  product_id text not null references public.products(id),
  movement_type text not null check (movement_type in (
    'entrada_producao',
    'saida_venda',
    'ajuste_manual',
    'venda_sem_estoque',
    'estorno_venda',
    'estorno_sem_estoque'
  )),
  quantity numeric(12,3) not null,
  previous_quantity numeric(12,3) not null default 0,
  new_quantity numeric(12,3) not null default 0,
  sale_id text references public.sales(id),
  command_id text references public.commands(id),
  user_id uuid references public.profiles(id),
  notes text not null default '',
  reversed_movement_id text references public.showcase_movements(id),
  status text not null default 'ativa' check (status in ('ativa', 'estornada')),
  created_at timestamptz not null default now(),
  unique (operation_id, product_id, movement_type)
);

create table if not exists public.out_of_stock_sales (
  id text primary key,
  operation_id text not null,
  product_id text not null references public.products(id),
  sale_id text not null references public.sales(id),
  command_id text references public.commands(id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  user_id uuid references public.profiles(id),
  status text not null default 'ativa' check (status in ('ativa', 'cancelada')),
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  canceled_by uuid references public.profiles(id),
  unique (sale_id, product_id)
);

create index if not exists product_stock_product_idx on public.product_stock(product_id);
create index if not exists showcase_movements_product_created_idx on public.showcase_movements(product_id, created_at desc);
create index if not exists showcase_movements_sale_idx on public.showcase_movements(sale_id);
create index if not exists out_of_stock_sales_sale_idx on public.out_of_stock_sales(sale_id);
create index if not exists out_of_stock_sales_created_idx on public.out_of_stock_sales(created_at desc);

alter table public.product_stock enable row level security;
alter table public.showcase_movements enable row level security;
alter table public.out_of_stock_sales enable row level security;

grant select, insert, update, delete on public.product_stock to authenticated;
grant select, insert, update, delete on public.showcase_movements to authenticated;
grant select, insert, update, delete on public.out_of_stock_sales to authenticated;

create policy "cash and stock users read product stock" on public.product_stock
  for select to authenticated using (
    private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('products.view')
    or private.current_profile_has_permission('stock.view')
    or private.current_profile_has_permission('showcase.launch')
  );

create policy "stock users manage product stock" on public.product_stock
  for all to authenticated using (
    private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
  ) with check (
    private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
  );

create policy "cash and stock users read showcase movements" on public.showcase_movements
  for select to authenticated using (
    private.current_profile_has_permission('dashboard.view')
    or private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('stock.view')
  );

create policy "cash and stock users manage showcase movements" on public.showcase_movements
  for all to authenticated using (
    private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.cancel')
    or private.current_profile_has_permission('sales.cancel')
  ) with check (
    private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.cancel')
    or private.current_profile_has_permission('sales.cancel')
  );

create policy "closing users read out of stock sales" on public.out_of_stock_sales
  for select to authenticated using (
    private.current_profile_has_permission('dashboard.view')
    or private.current_profile_has_permission('cash.close')
    or private.current_profile_has_permission('cashier.access')
  );

create policy "sale users manage out of stock sales" on public.out_of_stock_sales
  for all to authenticated using (
    private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.cancel')
    or private.current_profile_has_permission('sales.cancel')
  ) with check (
    private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.cancel')
    or private.current_profile_has_permission('sales.cancel')
  );

create or replace function public.process_showcase_sale(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  item jsonb;
  current_stock numeric(12,3);
  requested_quantity numeric(12,3);
  stocked_quantity numeric(12,3);
  missing_quantity numeric(12,3);
  next_quantity numeric(12,3);
  product_id text;
  operation_id text := _payload->>'operationId';
  sale_id text := _payload->>'saleId';
  command_id text := nullif(_payload->>'commandId', '');
  actor_id uuid := nullif(_payload->>'userId', '')::uuid;
  created_value timestamptz := coalesce(nullif(_payload->>'createdAt', '')::timestamptz, now());
begin
  if not (
    private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
  ) then
    raise exception 'Permissao insuficiente para baixar estoque da vitrine.';
  end if;

  for item in select * from jsonb_array_elements(coalesce(_payload->'items', '[]'::jsonb)) loop
    product_id := item->>'productId';
    requested_quantity := greatest(coalesce((item->>'quantity')::numeric, 0), 0);

    if requested_quantity <= 0 then
      continue;
    end if;

    insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
    values ('stock-' || product_id, product_id, 0, actor_id, created_value)
    on conflict (product_id) do nothing;

    select quantity_available
      into current_stock
      from public.product_stock
      where public.product_stock.product_id = product_id
      for update;

    stocked_quantity := least(current_stock, requested_quantity);
    missing_quantity := greatest(requested_quantity - stocked_quantity, 0);

    if stocked_quantity > 0 then
      next_quantity := current_stock - stocked_quantity;

      update public.product_stock
        set quantity_available = next_quantity,
            updated_by = actor_id,
            updated_at = created_value
        where public.product_stock.product_id = product_id;

      insert into public.showcase_movements (
        id,
        operation_id,
        product_id,
        movement_type,
        quantity,
        previous_quantity,
        new_quantity,
        sale_id,
        command_id,
        user_id,
        notes,
        created_at
      ) values (
        'mov-' || operation_id || '-' || product_id || '-saida_venda',
        operation_id,
        product_id,
        'saida_venda',
        stocked_quantity,
        current_stock,
        next_quantity,
        sale_id,
        command_id,
        actor_id,
        'Baixa automatica por venda',
        created_value
      ) on conflict (operation_id, product_id, movement_type) do nothing;
    else
      next_quantity := current_stock;
    end if;

    if missing_quantity > 0 then
      insert into public.out_of_stock_sales (
        id,
        operation_id,
        product_id,
        sale_id,
        command_id,
        quantity,
        unit_price,
        total_price,
        user_id,
        status,
        created_at
      ) values (
        'out-' || sale_id || '-' || product_id,
        operation_id,
        product_id,
        sale_id,
        command_id,
        missing_quantity,
        coalesce((item->>'unitPrice')::numeric, 0),
        missing_quantity * coalesce((item->>'unitPrice')::numeric, 0),
        actor_id,
        'ativa',
        created_value
      ) on conflict (sale_id, product_id) do nothing;

      insert into public.showcase_movements (
        id,
        operation_id,
        product_id,
        movement_type,
        quantity,
        previous_quantity,
        new_quantity,
        sale_id,
        command_id,
        user_id,
        notes,
        created_at
      ) values (
        'mov-' || operation_id || '-' || product_id || '-venda_sem_estoque',
        operation_id,
        product_id,
        'venda_sem_estoque',
        missing_quantity,
        next_quantity,
        next_quantity,
        sale_id,
        command_id,
        actor_id,
        'Produto vendido sem estoque na vitrine',
        created_value
      ) on conflict (operation_id, product_id, movement_type) do nothing;
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.reverse_showcase_sale(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  movement record;
  current_stock numeric(12,3);
  next_quantity numeric(12,3);
  operation_id text := _payload->>'operationId';
  sale_id text := _payload->>'saleId';
  command_id text := nullif(_payload->>'commandId', '');
  actor_id uuid := nullif(_payload->>'userId', '')::uuid;
  created_value timestamptz := coalesce(nullif(_payload->>'createdAt', '')::timestamptz, now());
begin
  if not (
    private.current_profile_has_permission('sale.cancel')
    or private.current_profile_has_permission('sales.cancel')
  ) then
    raise exception 'Permissao insuficiente para estornar estoque da vitrine.';
  end if;

  for movement in
    select *
    from public.showcase_movements
    where public.showcase_movements.sale_id = sale_id
      and movement_type = 'saida_venda'
      and status <> 'estornada'
  loop
    select quantity_available
      into current_stock
      from public.product_stock
      where product_id = movement.product_id
      for update;

    next_quantity := coalesce(current_stock, 0) + movement.quantity;

    update public.product_stock
      set quantity_available = next_quantity,
          updated_by = actor_id,
          updated_at = created_value
      where product_id = movement.product_id;

    insert into public.showcase_movements (
      id,
      operation_id,
      product_id,
      movement_type,
      quantity,
      previous_quantity,
      new_quantity,
      sale_id,
      command_id,
      user_id,
      notes,
      reversed_movement_id,
      created_at
    ) values (
      'mov-' || operation_id || '-' || movement.product_id || '-estorno_venda',
      operation_id,
      movement.product_id,
      'estorno_venda',
      movement.quantity,
      coalesce(current_stock, 0),
      next_quantity,
      sale_id,
      command_id,
      actor_id,
      'Estorno automatico por cancelamento de venda',
      movement.id,
      created_value
    ) on conflict (operation_id, product_id, movement_type) do nothing;
  end loop;

  update public.showcase_movements
    set status = 'estornada'
    where public.showcase_movements.sale_id = sale_id
      and movement_type in ('saida_venda', 'venda_sem_estoque')
      and status <> 'estornada';

  update public.out_of_stock_sales
    set status = 'cancelada',
        canceled_at = created_value,
        canceled_by = actor_id
    where public.out_of_stock_sales.sale_id = sale_id
      and status <> 'cancelada';

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.process_showcase_production(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  current_stock numeric(12,3);
  next_quantity numeric(12,3);
  operation_id text := _payload->>'operationId';
  product_id text := _payload->>'productId';
  quantity numeric(12,3) := greatest(coalesce((_payload->>'quantity')::numeric, 0), 0);
  actor_id uuid := nullif(_payload->>'userId', '')::uuid;
  created_value timestamptz := coalesce(nullif(_payload->>'createdAt', '')::timestamptz, now());
begin
  if not (
    private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('showcase.launch')
  ) then
    raise exception 'Permissao insuficiente para lancar producao na vitrine.';
  end if;

  insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
  values ('stock-' || product_id, product_id, 0, actor_id, created_value)
  on conflict (product_id) do nothing;

  select quantity_available
    into current_stock
    from public.product_stock
    where public.product_stock.product_id = product_id
    for update;

  next_quantity := coalesce(current_stock, 0) + quantity;

  update public.product_stock
    set quantity_available = next_quantity,
        updated_by = actor_id,
        updated_at = created_value
    where public.product_stock.product_id = product_id;

  insert into public.showcase_movements (
    id,
    operation_id,
    product_id,
    movement_type,
    quantity,
    previous_quantity,
    new_quantity,
    user_id,
    notes,
    created_at
  ) values (
    'mov-' || operation_id || '-' || product_id || '-entrada_producao',
    operation_id,
    product_id,
    'entrada_producao',
    quantity,
    coalesce(current_stock, 0),
    next_quantity,
    actor_id,
    'Entrada de producao na vitrine',
    created_value
  ) on conflict (operation_id, product_id, movement_type) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.adjust_showcase_stock(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  current_stock numeric(12,3);
  next_quantity numeric(12,3);
  operation_id text := _payload->>'operationId';
  product_id text := _payload->>'productId';
  actor_id uuid := nullif(_payload->>'userId', '')::uuid;
  created_value timestamptz := coalesce(nullif(_payload->>'createdAt', '')::timestamptz, now());
  note_text text := concat_ws(' - ', nullif(_payload->>'reason', ''), nullif(_payload->>'note', ''));
begin
  if not (
    private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('showcase.launch')
  ) then
    raise exception 'Permissao insuficiente para ajustar estoque da vitrine.';
  end if;

  next_quantity := greatest(coalesce((_payload->>'quantityAvailable')::numeric, 0), 0);

  insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
  values ('stock-' || product_id, product_id, 0, actor_id, created_value)
  on conflict (product_id) do nothing;

  select quantity_available
    into current_stock
    from public.product_stock
    where public.product_stock.product_id = product_id
    for update;

  update public.product_stock
    set quantity_available = next_quantity,
        updated_by = actor_id,
        updated_at = created_value
    where public.product_stock.product_id = product_id;

  insert into public.showcase_movements (
    id,
    operation_id,
    product_id,
    movement_type,
    quantity,
    previous_quantity,
    new_quantity,
    user_id,
    notes,
    created_at
  ) values (
    'mov-' || operation_id || '-' || product_id || '-ajuste_manual',
    operation_id,
    product_id,
    'ajuste_manual',
    abs(next_quantity - coalesce(current_stock, 0)),
    coalesce(current_stock, 0),
    next_quantity,
    actor_id,
    note_text,
    created_value
  ) on conflict (operation_id, product_id, movement_type) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'product_stock',
    'showcase_movements',
    'out_of_stock_sales',
    'stock_production'
  ];
begin
  foreach table_name in array realtime_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
```

- [ ] **Step 5: Run the migration test**

Run:

```powershell
node tests\showcase-stock-migration.test.mjs
```

Expected: PASS and `showcase stock migration ok`.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations tests/showcase-stock-migration.test.mjs
git commit -m "db: add showcase stock sync schema"
```

## Task 2: Storage Keys, Events, and Adapters

**Files:**
- Modify: `src/database/schema.js`
- Create: `src/services/repositories/product-stock.adapter.js`
- Create: `src/services/repositories/showcase-movement.adapter.js`
- Create: `src/services/repositories/out-of-stock-sale.adapter.js`
- Test: `tests/showcase-adapters.test.mjs`

- [ ] **Step 1: Write adapter tests**

Create `tests/showcase-adapters.test.mjs`:

```js
import { STORAGE_KEYS, UI_EVENTS } from '../src/database/schema.js';
import { productStockAdapter } from '../src/services/repositories/product-stock.adapter.js';
import { showcaseMovementAdapter } from '../src/services/repositories/showcase-movement.adapter.js';
import { outOfStockSaleAdapter } from '../src/services/repositories/out-of-stock-sale.adapter.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(STORAGE_KEYS.productStock === 'pdv.productStock', 'product stock key should exist');
assert(STORAGE_KEYS.showcaseMovements === 'pdv.showcaseMovements', 'showcase movements key should exist');
assert(STORAGE_KEYS.outOfStockSales === 'pdv.outOfStockSales', 'out of stock key should exist');
assert(STORAGE_KEYS.showcaseSyncQueue === 'pdv.syncQueue.showcase', 'showcase queue key should exist');
assert(UI_EVENTS.showcaseStockChanged === 'SHOWCASE_STOCK_CHANGED', 'showcase stock event should exist');

const stockRow = productStockAdapter.toRow({
  id: 'stock-risole',
  productId: 'risole',
  quantityAvailable: 8,
  updatedBy: 'user-1',
  updatedAt: '2026-06-15T10:00:00.000Z'
});
assert(stockRow.product_id === 'risole', 'stock row maps product id');
assert(productStockAdapter.fromRow(stockRow).quantityAvailable === 8, 'stock row unmaps quantity');

const movementRow = showcaseMovementAdapter.toRow({
  id: 'mov-1',
  operationId: 'op-sale-1',
  productId: 'risole',
  movementType: 'saida_venda',
  quantity: 2,
  previousQuantity: 10,
  newQuantity: 8,
  saleId: 'sale-1',
  commandId: 'cmd-1',
  userId: 'user-1',
  notes: 'Venda',
  status: 'ativa',
  createdAt: '2026-06-15T10:00:00.000Z'
});
assert(movementRow.movement_type === 'saida_venda', 'movement row maps type');
assert(showcaseMovementAdapter.fromRow(movementRow).previousQuantity === 10, 'movement row unmaps previous quantity');

const outRow = outOfStockSaleAdapter.toRow({
  id: 'out-1',
  operationId: 'op-sale-1',
  productId: 'risole',
  saleId: 'sale-1',
  commandId: 'cmd-1',
  quantity: 3,
  unitPrice: 7,
  totalPrice: 21,
  userId: 'user-1',
  status: 'ativa',
  createdAt: '2026-06-15T10:00:00.000Z'
});
assert(outRow.total_price === 21, 'out-of-stock row maps total');
assert(outOfStockSaleAdapter.fromRow(outRow).quantity === 3, 'out-of-stock row unmaps quantity');

console.log('showcase adapters ok');
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node tests\showcase-adapters.test.mjs
```

Expected: FAIL because keys/adapters do not exist.

- [ ] **Step 3: Add storage keys and events**

Modify `src/database/schema.js`:

```js
export const STORAGE_KEYS = {
  // existing keys...
  productStock: 'pdv.productStock',
  showcaseMovements: 'pdv.showcaseMovements',
  outOfStockSales: 'pdv.outOfStockSales',
  showcaseSyncQueue: 'pdv.syncQueue.showcase'
};

export const UI_EVENTS = {
  // existing events...
  showcaseStockChanged: 'SHOWCASE_STOCK_CHANGED',
  showcaseDataChanged: 'SHOWCASE_DATA_CHANGED',
  showcaseSyncStatusChanged: 'SHOWCASE_SYNC_STATUS_CHANGED'
};
```

Keep all existing keys/events intact; only append the new entries.

- [ ] **Step 4: Create `product-stock.adapter.js`**

```js
export const productStockAdapter = {
  table: 'product_stock',
  select: 'id,product_id,quantity_available,updated_by,updated_at',
  toRow(stock) {
    return {
      id: stock.id,
      product_id: stock.productId,
      quantity_available: Number(stock.quantityAvailable) || 0,
      updated_by: stock.updatedBy || null,
      updated_at: stock.updatedAt || new Date().toISOString()
    };
  },
  fromRow(row) {
    return {
      id: row.id,
      productId: row.product_id,
      quantityAvailable: Number(row.quantity_available) || 0,
      updatedBy: row.updated_by || '',
      updatedAt: row.updated_at
    };
  }
};
```

- [ ] **Step 5: Create `showcase-movement.adapter.js`**

```js
export const showcaseMovementAdapter = {
  table: 'showcase_movements',
  select: 'id,operation_id,product_id,movement_type,quantity,previous_quantity,new_quantity,sale_id,command_id,user_id,notes,reversed_movement_id,status,created_at',
  toRow(movement) {
    return {
      id: movement.id,
      operation_id: movement.operationId,
      product_id: movement.productId,
      movement_type: movement.movementType,
      quantity: Number(movement.quantity) || 0,
      previous_quantity: Number(movement.previousQuantity) || 0,
      new_quantity: Number(movement.newQuantity) || 0,
      sale_id: movement.saleId || null,
      command_id: movement.commandId || null,
      user_id: movement.userId || null,
      notes: movement.notes || '',
      reversed_movement_id: movement.reversedMovementId || null,
      status: movement.status || 'ativa',
      created_at: movement.createdAt || new Date().toISOString()
    };
  },
  fromRow(row) {
    return {
      id: row.id,
      operationId: row.operation_id,
      productId: row.product_id,
      movementType: row.movement_type,
      quantity: Number(row.quantity) || 0,
      previousQuantity: Number(row.previous_quantity) || 0,
      newQuantity: Number(row.new_quantity) || 0,
      saleId: row.sale_id || '',
      commandId: row.command_id || '',
      userId: row.user_id || '',
      notes: row.notes || '',
      reversedMovementId: row.reversed_movement_id || '',
      status: row.status || 'ativa',
      createdAt: row.created_at
    };
  }
};
```

- [ ] **Step 6: Create `out-of-stock-sale.adapter.js`**

```js
export const outOfStockSaleAdapter = {
  table: 'out_of_stock_sales',
  select: 'id,operation_id,product_id,sale_id,command_id,quantity,unit_price,total_price,user_id,status,created_at,canceled_at,canceled_by',
  toRow(item) {
    return {
      id: item.id,
      operation_id: item.operationId,
      product_id: item.productId,
      sale_id: item.saleId,
      command_id: item.commandId || null,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unitPrice) || 0,
      total_price: Number(item.totalPrice) || 0,
      user_id: item.userId || null,
      status: item.status || 'ativa',
      created_at: item.createdAt || new Date().toISOString(),
      canceled_at: item.canceledAt || null,
      canceled_by: item.canceledBy || null
    };
  },
  fromRow(row) {
    return {
      id: row.id,
      operationId: row.operation_id,
      productId: row.product_id,
      saleId: row.sale_id,
      commandId: row.command_id || '',
      quantity: Number(row.quantity) || 0,
      unitPrice: Number(row.unit_price) || 0,
      totalPrice: Number(row.total_price) || 0,
      userId: row.user_id || '',
      status: row.status || 'ativa',
      createdAt: row.created_at,
      canceledAt: row.canceled_at || '',
      canceledBy: row.canceled_by || ''
    };
  }
};
```

- [ ] **Step 7: Run adapter tests**

Run:

```powershell
node tests\showcase-adapters.test.mjs
```

Expected: PASS and `showcase adapters ok`.

- [ ] **Step 8: Commit**

```powershell
git add src/database/schema.js src/services/repositories/product-stock.adapter.js src/services/repositories/showcase-movement.adapter.js src/services/repositories/out-of-stock-sale.adapter.js tests/showcase-adapters.test.mjs
git commit -m "feat: add showcase stock adapters"
```

## Task 3: Pure Showcase Stock Domain

**Files:**
- Create: `src/services/showcase-stock.service.js`
- Test: `tests/showcase-stock-service.test.mjs`

- [ ] **Step 1: Write failing stock domain tests**

Create `tests/showcase-stock-service.test.mjs`:

```js
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const stock = await import('../src/services/showcase-stock.service.js');

stock.resetShowcaseStockForTests();
stock.applyProductionToShowcase({
  operationId: 'prod-risole-1',
  productId: 'risole',
  quantity: 10,
  userId: 'user-1',
  createdAt: '2026-06-15T10:00:00.000Z'
});

assert(stock.getShowcaseStockByProductId('risole').quantityAvailable === 10, 'production should increase stock');

const saleResult = stock.applySaleToShowcase({
  operationId: 'sale-1',
  saleId: 'sale-1',
  commandId: 'cmd-1',
  userId: 'user-1',
  createdAt: '2026-06-15T10:05:00.000Z',
  items: [{ productId: 'risole', quantity: 2, unitPrice: 7, total: 14 }]
});

assert(saleResult.outOfStockSales.length === 0, 'sale with stock should not create out-of-stock record');
assert(stock.getShowcaseStockByProductId('risole').quantityAvailable === 8, 'sale should decrease stock');

stock.applySaleToShowcase({
  operationId: 'sale-2',
  saleId: 'sale-2',
  commandId: 'cmd-2',
  userId: 'user-1',
  createdAt: '2026-06-15T10:10:00.000Z',
  items: [{ productId: 'risole', quantity: 11, unitPrice: 7, total: 77 }]
});

assert(stock.getShowcaseStockByProductId('risole').quantityAvailable === 0, 'visual stock should not go negative');
assert(stock.getActiveOutOfStockSales()[0].quantity === 3, 'partial shortage should be tracked');

stock.applySaleToShowcase({
  operationId: 'sale-2',
  saleId: 'sale-2',
  commandId: 'cmd-2',
  userId: 'user-1',
  createdAt: '2026-06-15T10:10:00.000Z',
  items: [{ productId: 'risole', quantity: 11, unitPrice: 7, total: 77 }]
});
assert(stock.getActiveOutOfStockSales().length === 1, 'duplicate sale operation should be idempotent');

stock.reverseSaleInShowcase({
  operationId: 'reverse-sale-2',
  saleId: 'sale-2',
  commandId: 'cmd-2',
  userId: 'user-1',
  createdAt: '2026-06-15T10:15:00.000Z'
});

assert(stock.getShowcaseStockByProductId('risole').quantityAvailable === 8, 'cancel should restore only stocked quantity');
assert(stock.getActiveOutOfStockSales().length === 0, 'cancel should remove active out-of-stock record');

stock.adjustShowcaseStock({
  operationId: 'adjust-risole-1',
  productId: 'risole',
  quantityAvailable: 5,
  reason: 'conferencia',
  userId: 'user-1',
  createdAt: '2026-06-15T10:20:00.000Z'
});

assert(stock.getShowcaseStockByProductId('risole').quantityAvailable === 5, 'manual adjustment should set stock');
assert(stock.getShowcaseMovements().some((item) => item.movementType === 'ajuste_manual'), 'adjustment should create movement');

console.log('showcase stock service ok');
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
node tests\showcase-stock-service.test.mjs
```

Expected: FAIL because `showcase-stock.service.js` does not exist.

- [ ] **Step 3: Implement minimal pure service**

Create `src/services/showcase-stock.service.js` with these public functions:

```js
import { STORAGE_KEYS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';

export function getShowcaseStock() {
  return getItem(STORAGE_KEYS.productStock, []);
}

export function getShowcaseMovements() {
  return getItem(STORAGE_KEYS.showcaseMovements, []);
}

export function getOutOfStockSales() {
  return getItem(STORAGE_KEYS.outOfStockSales, []);
}

export function getActiveOutOfStockSales() {
  return getOutOfStockSales().filter((item) => item.status !== 'cancelada');
}

export function getShowcaseStockByProductId(productId) {
  return getShowcaseStock().find((item) => item.productId === productId) || {
    id: `stock-${productId}`,
    productId,
    quantityAvailable: 0,
    updatedBy: '',
    updatedAt: ''
  };
}

export function applyProductionToShowcase({ operationId, productId, quantity, userId = '', createdAt = new Date().toISOString() }) {
  if (hasMovementOperation(operationId, productId, 'entrada_producao')) {
    return { stock: getShowcaseStockByProductId(productId), movements: [], outOfStockSales: [] };
  }

  const previous = getShowcaseStockByProductId(productId);
  const delta = Math.max(Number(quantity) || 0, 0);
  const nextQuantity = previous.quantityAvailable + delta;
  const nextStock = saveStock(productId, nextQuantity, userId, createdAt);
  const movement = createMovement({
    operationId,
    productId,
    movementType: 'entrada_producao',
    quantity: delta,
    previousQuantity: previous.quantityAvailable,
    newQuantity: nextQuantity,
    userId,
    createdAt
  });

  prependMovement(movement);
  return { stock: nextStock, movements: [movement], outOfStockSales: [] };
}

export function applySaleToShowcase({ operationId, saleId, commandId = '', userId = '', createdAt = new Date().toISOString(), items = [] }) {
  if (getShowcaseMovements().some((movement) => movement.operationId === operationId && movement.saleId === saleId)) {
    return { movements: [], outOfStockSales: [] };
  }

  const movements = [];
  const outOfStockSales = [];

  items.forEach((item) => {
    const productId = item.productId;
    const quantity = Math.max(Number(item.quantity) || 0, 0);
    const previous = getShowcaseStockByProductId(productId);
    const stockedQuantity = Math.min(previous.quantityAvailable, quantity);
    const missingQuantity = Math.max(quantity - stockedQuantity, 0);

    if (stockedQuantity > 0) {
      const nextQuantity = previous.quantityAvailable - stockedQuantity;
      saveStock(productId, nextQuantity, userId, createdAt);
      const movement = createMovement({
        operationId,
        productId,
        movementType: 'saida_venda',
        quantity: stockedQuantity,
        previousQuantity: previous.quantityAvailable,
        newQuantity: nextQuantity,
        saleId,
        commandId,
        userId,
        createdAt
      });
      movements.push(movement);
      prependMovement(movement);
    }

    if (missingQuantity > 0) {
      const missing = {
        id: `out-${saleId}-${productId}`,
        operationId,
        productId,
        saleId,
        commandId,
        quantity: missingQuantity,
        unitPrice: Number(item.unitPrice ?? item.price) || 0,
        totalPrice: missingQuantity * (Number(item.unitPrice ?? item.price) || 0),
        userId,
        status: 'ativa',
        createdAt,
        canceledAt: '',
        canceledBy: ''
      };
      const movement = createMovement({
        operationId,
        productId,
        movementType: 'venda_sem_estoque',
        quantity: missingQuantity,
        previousQuantity: Math.max(previous.quantityAvailable - stockedQuantity, 0),
        newQuantity: 0,
        saleId,
        commandId,
        userId,
        createdAt
      });
      outOfStockSales.push(missing);
      movements.push(movement);
      upsertOutOfStockSale(missing);
      prependMovement(movement);
    }
  });

  return { movements, outOfStockSales };
}

export function reverseSaleInShowcase({ operationId, saleId, commandId = '', userId = '', createdAt = new Date().toISOString() }) {
  if (getShowcaseMovements().some((movement) => movement.operationId === operationId && movement.saleId === saleId)) {
    return { movements: [], outOfStockSales: [] };
  }

  const relatedMovements = getShowcaseMovements()
    .filter((movement) => movement.saleId === saleId && movement.status !== 'estornada');
  const reversalMovements = [];

  relatedMovements.filter((movement) => movement.movementType === 'saida_venda').forEach((movement) => {
    const previous = getShowcaseStockByProductId(movement.productId);
    const nextQuantity = previous.quantityAvailable + movement.quantity;
    saveStock(movement.productId, nextQuantity, userId, createdAt);
    const reversal = createMovement({
      operationId,
      productId: movement.productId,
      movementType: 'estorno_venda',
      quantity: movement.quantity,
      previousQuantity: previous.quantityAvailable,
      newQuantity: nextQuantity,
      saleId,
      commandId,
      userId,
      reversedMovementId: movement.id,
      createdAt
    });
    reversalMovements.push(reversal);
    prependMovement(reversal);
  });

  const canceledOutOfStock = getOutOfStockSales().map((item) => (
    item.saleId === saleId && item.status !== 'cancelada'
      ? { ...item, status: 'cancelada', canceledAt: createdAt, canceledBy: userId }
      : item
  ));
  setItem(STORAGE_KEYS.outOfStockSales, canceledOutOfStock);
  markSaleMovementsReversed(saleId);

  return { movements: reversalMovements, outOfStockSales: canceledOutOfStock.filter((item) => item.saleId === saleId) };
}

export function adjustShowcaseStock({ operationId, productId, quantityAvailable, reason = '', note = '', userId = '', createdAt = new Date().toISOString() }) {
  if (hasMovementOperation(operationId, productId, 'ajuste_manual')) {
    return { stock: getShowcaseStockByProductId(productId), movements: [], outOfStockSales: [] };
  }

  const previous = getShowcaseStockByProductId(productId);
  const nextQuantity = Math.max(Number(quantityAvailable) || 0, 0);
  const nextStock = saveStock(productId, nextQuantity, userId, createdAt);
  const movement = createMovement({
    operationId,
    productId,
    movementType: 'ajuste_manual',
    quantity: Math.abs(nextQuantity - previous.quantityAvailable),
    previousQuantity: previous.quantityAvailable,
    newQuantity: nextQuantity,
    userId,
    notes: [reason, note].filter(Boolean).join(' - '),
    createdAt
  });
  prependMovement(movement);
  return { stock: nextStock, movements: [movement], outOfStockSales: [] };
}

export function resetShowcaseStockForTests() {
  setItem(STORAGE_KEYS.productStock, []);
  setItem(STORAGE_KEYS.showcaseMovements, []);
  setItem(STORAGE_KEYS.outOfStockSales, []);
}

function saveStock(productId, quantityAvailable, updatedBy, updatedAt) {
  const nextStock = {
    id: `stock-${productId}`,
    productId,
    quantityAvailable: Math.max(Number(quantityAvailable) || 0, 0),
    updatedBy,
    updatedAt
  };
  const items = getShowcaseStock();
  setItem(STORAGE_KEYS.productStock, upsert(items, nextStock));
  return nextStock;
}

function createMovement(input) {
  return {
    id: `mov-${input.operationId}-${input.productId}-${input.movementType}`,
    operationId: input.operationId,
    productId: input.productId,
    movementType: input.movementType,
    quantity: Number(input.quantity) || 0,
    previousQuantity: Number(input.previousQuantity) || 0,
    newQuantity: Number(input.newQuantity) || 0,
    saleId: input.saleId || '',
    commandId: input.commandId || '',
    userId: input.userId || '',
    notes: input.notes || '',
    reversedMovementId: input.reversedMovementId || '',
    status: 'ativa',
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function prependMovement(movement) {
  setItem(STORAGE_KEYS.showcaseMovements, [movement, ...getShowcaseMovements()]);
}

function upsertOutOfStockSale(item) {
  setItem(STORAGE_KEYS.outOfStockSales, upsert(getOutOfStockSales(), item));
}

function markSaleMovementsReversed(saleId) {
  setItem(STORAGE_KEYS.showcaseMovements, getShowcaseMovements().map((movement) => (
    movement.saleId === saleId && ['saida_venda', 'venda_sem_estoque'].includes(movement.movementType)
      ? { ...movement, status: 'estornada' }
      : movement
  )));
}

function hasMovementOperation(operationId, productId, movementType) {
  return getShowcaseMovements().some((movement) => (
    movement.operationId === operationId
      && movement.productId === productId
      && movement.movementType === movementType
  ));
}

function upsert(items, item) {
  return items.some((candidate) => candidate.id === item.id)
    ? items.map((candidate) => candidate.id === item.id ? item : candidate)
    : [item, ...items];
}
```

- [ ] **Step 4: Run stock domain tests**

Run:

```powershell
node tests\showcase-stock-service.test.mjs
```

Expected: PASS and `showcase stock service ok`.

- [ ] **Step 5: Commit**

```powershell
git add src/services/showcase-stock.service.js tests/showcase-stock-service.test.mjs
git commit -m "feat: add showcase stock domain"
```

## Task 4: Showcase Sync Service

**Files:**
- Create: `src/services/showcase-sync.service.js`
- Modify: `src/services/online-data.service.js`
- Test: `tests/showcase-sync-service.test.mjs`

- [ ] **Step 1: Write sync tests**

Create `tests/showcase-sync-service.test.mjs`:

```js
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const calls = [];
const rows = {
  product_stock: [{ id: 'stock-risole', product_id: 'risole', quantity_available: 6, updated_by: 'user-1', updated_at: '2026-06-15T10:00:00.000Z' }],
  showcase_movements: [],
  out_of_stock_sales: []
};

const sync = await import('../src/services/showcase-sync.service.js');
const stock = await import('../src/services/showcase-stock.service.js');

sync.configureShowcaseSyncForTests({
  getClient: async () => ({
    from(table) {
      return {
        select() {
          return Promise.resolve({ data: rows[table] || [], error: null });
        }
      };
    },
    rpc(name, payload) {
      calls.push({ name, payload });
      return Promise.resolve({ data: { ok: true }, error: null });
    },
    channel() {
      return {
        on() { return this; },
        subscribe() { return this; }
      };
    },
    removeChannel() {}
  })
});

await sync.hydrateShowcaseData();
assert(stock.getShowcaseStockByProductId('risole').quantityAvailable === 6, 'hydrate should cache product stock');

await sync.processShowcaseSale({
  operationId: 'sale-1',
  saleId: 'sale-1',
  commandId: 'cmd-1',
  userId: 'user-1',
  items: [{ productId: 'risole', quantity: 2, unitPrice: 7, total: 14 }]
});
assert(calls.some((call) => call.name === 'process_showcase_sale'), 'online sale should call RPC');

sync.configureShowcaseSyncForTests({
  getClient: async () => ({
    rpc() {
      return Promise.resolve({ data: null, error: new Error('offline') });
    }
  })
});

await sync.processShowcaseSale({
  operationId: 'sale-2',
  saleId: 'sale-2',
  commandId: 'cmd-2',
  userId: 'user-1',
  items: [{ productId: 'risole', quantity: 10, unitPrice: 7, total: 70 }]
});

const status = sync.getShowcaseSyncStatus();
assert(status.pending === 1, 'offline sale should queue operation');
assert(stock.getActiveOutOfStockSales().length === 1, 'offline sale should apply local out-of-stock result');

sync.configureShowcaseSyncForTests();
globalThis.__PDV_RUNTIME_CONFIG__ = null;

console.log('showcase sync service ok');
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
node tests\showcase-sync-service.test.mjs
```

Expected: FAIL because sync service does not exist.

- [ ] **Step 3: Implement sync service**

Create `src/services/showcase-sync.service.js` with:

```js
import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js';
import { emit } from './event-bus.service.js';
import { isSupabaseEnabled } from './app-config.service.js';
import { getSupabaseRestClient } from './supabase-rest-client.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { productStockAdapter } from './repositories/product-stock.adapter.js';
import { showcaseMovementAdapter } from './repositories/showcase-movement.adapter.js';
import { outOfStockSaleAdapter } from './repositories/out-of-stock-sale.adapter.js';
import {
  applyProductionToShowcase,
  applySaleToShowcase,
  reverseSaleInShowcase,
  adjustShowcaseStock
} from './showcase-stock.service.js';

let getClientOverride = null;
let realtimeChannel = null;
let status = { state: 'idle', pending: readQueue().length, error: '' };

export function configureShowcaseSyncForTests({ getClient } = {}) {
  getClientOverride = typeof getClient === 'function' ? getClient : null;
  realtimeChannel = null;
  status = { state: 'idle', pending: readQueue().length, error: '' };
  writeQueue([]);
}

export function getShowcaseSyncStatus() {
  return { ...status, pending: readQueue().length };
}

export async function hydrateShowcaseData() {
  if (!isSupabaseEnabled() && !getClientOverride) return;
  try {
    setStatus({ state: 'syncing', error: '' });
    const client = await getWriteClient();
    const [stockRows, movementRows, outRows] = await Promise.all([
      selectRows(client, productStockAdapter),
      selectRows(client, showcaseMovementAdapter),
      selectRows(client, outOfStockSaleAdapter)
    ]);
    writeJson(STORAGE_KEYS.productStock, stockRows.map(productStockAdapter.fromRow));
    writeJson(STORAGE_KEYS.showcaseMovements, movementRows.map(showcaseMovementAdapter.fromRow));
    writeJson(STORAGE_KEYS.outOfStockSales, outRows.map(outOfStockSaleAdapter.fromRow));
    setStatus({ state: readQueue().length ? 'pending' : 'synced', error: '' });
    emit(UI_EVENTS.showcaseDataChanged, { type: 'hydrated' });
  } catch (error) {
    setStatus({ state: 'error', error: error.message || 'Erro ao carregar vitrine.' });
  }
}

export async function processShowcaseProduction(input) {
  applyProductionToShowcase(input);
  return runOnlineOperation('process_showcase_production', input, { action: 'processProduction', input });
}

export async function processShowcaseSale(input) {
  applySaleToShowcase(input);
  return runOnlineOperation('process_showcase_sale', input, { action: 'processSale', input });
}

export async function reverseShowcaseSale(input) {
  reverseSaleInShowcase(input);
  return runOnlineOperation('reverse_showcase_sale', input, { action: 'reverseSale', input });
}

export async function adjustShowcaseStockOnline(input) {
  adjustShowcaseStock(input);
  return runOnlineOperation('adjust_showcase_stock', input, { action: 'adjustStock', input });
}

export async function flushShowcaseQueue() {
  const queue = readQueue();
  if (!queue.length) {
    setStatus({ state: 'synced', pending: 0, error: '' });
    return;
  }
  const remaining = [];
  for (const operation of queue) {
    try {
      await callRpc(getRpcName(operation.action), operation.input);
    } catch (error) {
      remaining.push(operation);
    }
  }
  writeQueue(remaining);
  setStatus({ state: remaining.length ? 'pending' : 'synced', pending: remaining.length, error: remaining.length ? 'Sincronizacao da vitrine pendente.' : '' });
}

export async function startShowcaseRealtime() {
  if (realtimeChannel) return realtimeChannel;
  try {
    const client = await getReadClient();
    const channel = client.channel('showcase-changes');
    ['product_stock', 'showcase_movements', 'out_of_stock_sales', 'stock_production'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => hydrateShowcaseData());
    });
    realtimeChannel = channel.subscribe();
    return realtimeChannel;
  } catch (error) {
    setStatus({ state: 'error', error: error.message || 'Realtime da vitrine indisponivel.' });
    return null;
  }
}

async function runOnlineOperation(rpcName, payload, queuedOperation) {
  emit(UI_EVENTS.showcaseStockChanged, payload);
  if (!isSupabaseEnabled() && !getClientOverride) return payload;
  try {
    setStatus({ state: 'syncing', error: '' });
    await callRpc(rpcName, payload);
    setStatus({ state: readQueue().length ? 'pending' : 'synced', error: '' });
    return payload;
  } catch (error) {
    enqueueOperation(queuedOperation);
    setStatus({ state: 'pending', pending: readQueue().length, error: error.message || 'Sincronizacao da vitrine pendente.' });
    return payload;
  }
}

async function callRpc(name, payload) {
  const client = await getWriteClient();
  const { error } = await client.rpc(name, { _payload: payload });
  if (error) throw error;
}

function getRpcName(action) {
  return {
    processProduction: 'process_showcase_production',
    processSale: 'process_showcase_sale',
    reverseSale: 'reverse_showcase_sale',
    adjustStock: 'adjust_showcase_stock'
  }[action];
}

async function selectRows(client, adapter) {
  const { data, error } = await client.from(adapter.table).select(adapter.select || '*');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function getWriteClient() {
  return getClientOverride ? getClientOverride() : getSupabaseRestClient();
}

function getReadClient() {
  return getClientOverride ? getClientOverride() : getSupabaseClient();
}

function enqueueOperation(operation) {
  writeQueue([...readQueue(), { ...operation, createdAt: new Date().toISOString() }]);
}

function readQueue() {
  return readJson(STORAGE_KEYS.showcaseSyncQueue, []);
}

function writeQueue(queue) {
  writeJson(STORAGE_KEYS.showcaseSyncQueue, queue);
}

function setStatus(nextStatus) {
  status = { ...status, ...nextStatus, pending: readQueue().length };
  emit(UI_EVENTS.showcaseSyncStatusChanged, getShowcaseSyncStatus());
}

function readJson(key, fallback) {
  const rawValue = globalThis.localStorage?.getItem(key);
  if (rawValue === null || rawValue === undefined) return fallback;
  try { return JSON.parse(rawValue); } catch { return fallback; }
}

function writeJson(key, value) {
  globalThis.localStorage?.setItem(key, JSON.stringify(value));
  return value;
}
```

- [ ] **Step 4: Wire online data hydration**

Modify `src/services/online-data.service.js`:

```js
import { flushShowcaseQueue, hydrateShowcaseData } from './showcase-sync.service.js';

// Inside hydrateOnlineOperationalData, replace showcase hydrateDataProvider block:
if (showcase) {
  await hydrateDataProvider(OPERATIONAL_KEYS);
  await hydrateShowcaseData();
  await flushShowcaseQueue();
  await hydrateShowcaseData();
}
```

- [ ] **Step 5: Run sync tests**

Run:

```powershell
node tests\showcase-sync-service.test.mjs
```

Expected: PASS and `showcase sync service ok`.

- [ ] **Step 6: Commit**

```powershell
git add src/services/showcase-sync.service.js src/services/online-data.service.js tests/showcase-sync-service.test.mjs
git commit -m "feat: add showcase stock sync service"
```

## Task 5: Integrate Production, Sales, and Cancellation

**Files:**
- Modify: `src/services/estoque.service.js`
- Modify: `src/services/transaction.service.js`
- Test: `tests/estoque-service.test.mjs`
- Test: `tests/transaction-service.test.mjs`

- [ ] **Step 1: Add integration tests**

Append to `tests/transaction-service.test.mjs` or create a focused test block:

```js
const showcase = await import('../src/services/showcase-stock.service.js');
showcase.resetShowcaseStockForTests();

estoque.createStockLaunch({ produtoId: 'risole', quantidade: 10 });
assert(showcase.getShowcaseStockByProductId('risole').quantityAvailable === 10, 'stock launch should increase showcase stock');

comandas.clearComanda();
comandas.addItem(products.getProductById('risole'));
comandas.addItem(products.getProductById('risole'));
const sale = transactions.finalizeComandaPayment({ paymentMethod: 'pix' });
assert(showcase.getShowcaseStockByProductId('risole').quantityAvailable === 8, 'sale should decrease showcase stock once');

transactions.cancelTransaction(sale.id, { reason: 'Teste de estorno' });
assert(showcase.getShowcaseStockByProductId('risole').quantityAvailable === 10, 'cancel should restore stocked quantity');
```

If seeded product IDs differ, use the existing seeded product ID from `mock-data.js` and set its stock through `showcase.applyProductionToShowcase`.

- [ ] **Step 2: Run integration tests and verify failure**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: FAIL because sale does not yet process showcase stock.

- [ ] **Step 3: Modify production flow**

In `src/services/estoque.service.js`, import:

```js
import { processShowcaseProduction, adjustShowcaseStockOnline } from './showcase-sync.service.js';
```

After creating a stock launch, call:

```js
processShowcaseProduction({
  operationId: launch.id,
  productId: launch.produtoId,
  quantity: launch.quantidade,
  userId: launch.usuarioId,
  createdAt: launch.dataHora
});
```

For write-offs and manual adjustment, call:

```js
adjustShowcaseStockOnline({
  operationId: writeOff.id,
  productId: writeOff.productId,
  quantityAvailable: Math.max(0, Number(product.stock || 0) - writeOff.quantity),
  reason: writeOff.reason,
  note: writeOff.note,
  userId: writeOff.createdBy,
  createdAt: writeOff.createdAt
});
```

- [ ] **Step 4: Modify sale finalize flow**

In `src/services/transaction.service.js`, import:

```js
import { processShowcaseSale, reverseShowcaseSale } from './showcase-sync.service.js';
```

After `syncSaleToSupabase(sale, closedCommand);`, call:

```js
processShowcaseSale({
  operationId: sale.id,
  saleId: sale.id,
  commandId: sale.comandaId,
  userId: sale.createdBy,
  createdAt: sale.createdAt,
  items: sale.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? item.price,
    total: item.total
  }))
});
```

- [ ] **Step 5: Modify cancellation flow**

In both `cancelClosedComanda` and the sale branch of `cancelTransaction`, after identifying the sale ID, call:

```js
reverseShowcaseSale({
  operationId: `reverse-${sale.id}`,
  saleId: sale.id,
  commandId: sale.comandaId,
  userId: user?.id || '',
  createdAt: canceledAt
});
```

- [ ] **Step 6: Run service tests**

Run:

```powershell
node tests\estoque-service.test.mjs
node tests\transaction-service.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/services/estoque.service.js src/services/transaction.service.js tests/estoque-service.test.mjs tests/transaction-service.test.mjs
git commit -m "feat: connect sales to showcase stock"
```

## Task 6: Cash Closing Out-of-Stock Section

**Files:**
- Modify: `src/services/cash-closing.service.js`
- Modify: `src/components/fechamento-rapido-modal.component.js`
- Test: `tests/cash-closing-service.test.mjs`

- [ ] **Step 1: Add closing service test**

Append to `tests/cash-closing-service.test.mjs`:

```js
const showcaseStock = await import('../src/services/showcase-stock.service.js');
showcaseStock.resetShowcaseStockForTests();
showcaseStock.applySaleToShowcase({
  operationId: 'sale-sem-estoque',
  saleId: 'sale-sem-estoque',
  commandId: 'cmd-sem-estoque',
  userId: adminSession.user.id,
  createdAt: new Date().toISOString(),
  items: [{ productId: burger.id, quantity: 3, unitPrice: burger.price, total: burger.price * 3 }]
});

const outSummary = closing.buildClosingSummary({ countedCash: 0 });
assert(outSummary.outOfStockSales.length === 1, 'closing summary should include out-of-stock sales');
assert(outSummary.outOfStockSales[0].quantity === 3, 'closing out-of-stock section should include quantity');
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
node tests\cash-closing-service.test.mjs
```

Expected: FAIL because summary has no `outOfStockSales`.

- [ ] **Step 3: Add selector to closing service**

In `src/services/cash-closing.service.js`, import:

```js
import { getActiveOutOfStockSales } from './showcase-stock.service.js';
import { getProductById, getCategories } from './product.service.js';
```

Add to `buildClosingSummary` return object:

```js
outOfStockSales: buildOutOfStockClosingRows()
```

Add helper:

```js
function buildOutOfStockClosingRows() {
  const categories = getCategories();
  return getActiveOutOfStockSales().map((item) => {
    const product = getProductById(item.productId);
    const category = categories.find((candidate) => candidate.id === product?.categoryId);
    return {
      productId: item.productId,
      productName: product?.name || item.productName || 'Produto removido',
      categoryName: category?.name || 'Sem categoria',
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      createdAt: item.createdAt,
      saleId: item.saleId,
      commandId: item.commandId,
      userId: item.userId
    };
  });
}
```

- [ ] **Step 4: Preserve out-of-stock rows in confirmed closing**

In `confirmClosing`, include:

```js
outOfStockSales: draft.outOfStockSales || []
```

- [ ] **Step 5: Render modal section**

In `src/components/fechamento-rapido-modal.component.js`, render a section when `summary.outOfStockSales.length > 0`:

```js
function renderOutOfStockSales(rows = []) {
  if (!rows.length) {
    return '';
  }

  return `
    <section class="quick-closing-section">
      <header class="manager-section__header">
        <strong>Produtos vendidos sem estoque</strong>
        <span>${rows.length} registro(s)</span>
      </header>
      <div class="comparison-table">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Qtd.</th>
              <th>Unitario</th>
              <th>Total</th>
              <th>Venda</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((item) => `
              <tr>
                <td>${item.productName}</td>
                <td>${item.categoryName}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unitPrice)}</td>
                <td>${formatCurrency(item.totalPrice)}</td>
                <td>${item.commandId || item.saleId}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}
```

Call it in the quick closing body:

```js
${renderOutOfStockSales(summary.outOfStockSales)}
```

- [ ] **Step 6: Run closing tests**

Run:

```powershell
node tests\cash-closing-service.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/services/cash-closing.service.js src/components/fechamento-rapido-modal.component.js tests/cash-closing-service.test.mjs
git commit -m "feat: show out of stock sales in closing"
```

## Task 7: Cashier and Showcase UI

**Files:**
- Modify: `src/components/product-card.component.js`
- Modify: `src/modules/vendas/vendas.module.js`
- Modify: `src/modules/estoque/estoque.module.js`
- Modify: `src/styles/cards.css`
- Modify: `src/styles/pdv.css`
- Test: product/module rendering tests as appropriate

- [ ] **Step 1: Add product card rendering test**

Create or extend a component test:

```js
import { renderProductCard } from '../src/components/product-card.component.js';

const html = renderProductCard(
  { id: 'risole', name: 'Risole', price: 7, stock: 0, showcaseStock: 0 },
  'Salgados'
);

if (!html.includes('Sem estoque')) {
  throw new Error('product card should render Sem estoque tag');
}

if (!html.includes('data-stock-state="empty"')) {
  throw new Error('product card should mark empty stock state');
}

console.log('product card stock state ok');
```

- [ ] **Step 2: Run rendering test and verify failure**

Run the new or updated test:

```powershell
node tests\product-card.test.mjs
```

Expected: FAIL because product card has no showcase stock state.

- [ ] **Step 3: Update product card**

Modify `src/components/product-card.component.js`:

```js
export function renderProductCard(product, categoryName = '') {
  const stock = Number(product.showcaseStock ?? product.stock ?? 0);
  const isEmpty = stock <= 0;
  return `
    <article class="product-card ${isEmpty ? 'product-card--empty-stock' : ''}" data-product-card data-product-id="${product.id}" data-stock-state="${isEmpty ? 'empty' : 'available'}">
      <button class="product-card__main" type="button" data-action="add-product" data-product-id="${product.id}">
        <span>
          <h3 class="product-card__name">${product.name}</h3>
          <span class="product-card__meta">${categoryName} - Estoque ${Math.max(stock, 0)}</span>
          ${isEmpty ? '<span class="stock-badge stock-badge--empty">Sem estoque</span>' : ''}
        </span>
        <strong class="product-card__price">${formatCurrency(product.price)}</strong>
      </button>
      <div class="product-card__quick-actions" aria-label="Acoes rapidas">
        <button type="button" data-action="quick-add" data-product-id="${product.id}" data-quantity="2">+2</button>
        <button type="button" data-action="quick-add" data-product-id="${product.id}" data-quantity="5">+5</button>
        <button type="button" data-action="open-quantity" data-product-id="${product.id}">Qtd</button>
      </div>
    </article>
  `;
}
```

- [ ] **Step 4: Feed showcase stock into Vendas**

In `src/modules/vendas/vendas.module.js`, import:

```js
import { getShowcaseStockByProductId } from '../../services/showcase-stock.service.js';
```

When rendering each product:

```js
const showcaseStock = getShowcaseStockByProductId(product.id).quantityAvailable;
return renderProductCard({ ...product, showcaseStock }, category ? category.name : 'Sem categoria');
```

Before `addItem(product)` for add-product/quick-add/open-quantity, show warning when stock is empty:

```js
function warnIfProductOutOfStock(product) {
  const stock = getShowcaseStockByProductId(product.id).quantityAvailable;
  if (stock <= 0) {
    showNotification({
      title: 'Produto sem estoque',
      message: 'Atencao: este produto esta sem estoque na vitrine.',
      type: 'warning'
    });
  }
}
```

Call `warnIfProductOutOfStock(product)` before adding quantity.

- [ ] **Step 5: Add CSS states**

In `src/styles/cards.css` or `src/styles/pdv.css`:

```css
.product-card--empty-stock {
  border-color: #f2b8a2;
  background: #fff8f4;
}

.stock-badge {
  display: inline-flex;
  width: fit-content;
  margin-top: 0.35rem;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.stock-badge--empty {
  color: #9a3412;
  background: #ffedd5;
}
```

- [ ] **Step 6: Update Vitrine module summaries**

In `src/modules/estoque/estoque.module.js`, import:

```js
import { getShowcaseStock, getShowcaseMovements, getActiveOutOfStockSales } from '../../services/showcase-stock.service.js';
```

Add summary counters:

```js
function getShowcaseLiveSummary() {
  const stockItems = getShowcaseStock();
  const movements = getShowcaseMovements();
  const outOfStock = getActiveOutOfStockSales();
  return {
    availableUnits: stockItems.reduce((total, item) => total + Number(item.quantityAvailable || 0), 0),
    zeroProducts: stockItems.filter((item) => Number(item.quantityAvailable || 0) <= 0).length,
    producedToday: movements.filter((item) => item.movementType === 'entrada_producao').reduce((total, item) => total + item.quantity, 0),
    soldToday: movements.filter((item) => item.movementType === 'saida_venda').reduce((total, item) => total + item.quantity, 0),
    outOfStockUnits: outOfStock.reduce((total, item) => total + item.quantity, 0)
  };
}
```

Render cards for these counters beside the existing summary grid.

- [ ] **Step 7: Run UI/component tests**

Run:

```powershell
node tests\product-card.test.mjs
node tests\estoque-service.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/components/product-card.component.js src/modules/vendas/vendas.module.js src/modules/estoque/estoque.module.js src/styles/cards.css src/styles/pdv.css tests
git commit -m "feat: show showcase stock in cashier and stock screens"
```

## Task 8: Realtime Bootstrap and Verification

**Files:**
- Modify: `src/services/realtime.service.js`
- Modify: `src/app.js`
- Test: `tests/realtime-service.test.mjs`

- [ ] **Step 1: Update realtime test**

Extend `tests/realtime-service.test.mjs` so it verifies showcase events are initialized:

```js
const realtime = await import('../src/services/realtime.service.js');
const schema = await import('../src/database/schema.js');

let seen = false;
const bus = await import('../src/services/event-bus.service.js');
bus.on(schema.UI_EVENTS.showcaseDataChanged, () => {
  seen = true;
});

realtime.initRealtimeService();
bus.emit(schema.UI_EVENTS.showcaseDataChanged, { type: 'test' });

if (!seen) {
  throw new Error('showcase data event should be available after realtime init');
}
```

- [ ] **Step 2: Run realtime test and verify failure if imports are missing**

Run:

```powershell
node tests\realtime-service.test.mjs
```

Expected: FAIL until service imports/events are wired, or PASS if the event enum already exists from Task 2.

- [ ] **Step 3: Initialize showcase realtime**

Modify `src/services/realtime.service.js`:

```js
import { startShowcaseRealtime } from './showcase-sync.service.js';

export function initRealtimeService() {
  if (initialized) return;
  on(SYNC_EVENTS.saleFinished, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.cashMovementRegistered, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  startShowcaseRealtime();
  initialized = true;
}
```

- [ ] **Step 4: Ensure app boot hydrates showcase data**

In `src/app.js`, confirm the app already calls `hydrateOnlineOperationalData`. If not, add:

```js
import { hydrateOnlineOperationalData } from './services/online-data.service.js';

hydrateOnlineOperationalData({ catalog: true, financial: true, showcase: true }).catch((error) => {
  console.warn('Nao foi possivel hidratar dados online.', error);
});
```

- [ ] **Step 5: Run core tests**

Run:

```powershell
node tests\showcase-stock-service.test.mjs
node tests\showcase-sync-service.test.mjs
node tests\transaction-service.test.mjs
node tests\cash-closing-service.test.mjs
node tests\realtime-service.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/services/realtime.service.js src/app.js tests/realtime-service.test.mjs
git commit -m "feat: start showcase realtime sync"
```

## Task 9: Full Verification and Manual Checklist

**Files:**
- Modify docs only if test notes are recorded.

- [ ] **Step 1: Run all automated tests**

Run:

```powershell
Get-ChildItem tests -Filter *.mjs | ForEach-Object { node $_.FullName }
```

Expected: every test prints its `ok` line and exits successfully.

- [ ] **Step 2: Start local server**

Run:

```powershell
scripts\start-server.cmd
```

Expected: app available at `http://127.0.0.1:5500/`.

- [ ] **Step 3: Manual test 1**

In the app:

1. Log in as admin.
2. Open Vitrine/Estoque.
3. Launch 10 units of Risole.
4. Open Frente de Caixa.
5. Sell 2 Risoles.
6. Return to Vitrine/Estoque.

Expected: Risole stock is 8.

- [ ] **Step 4: Manual test 2**

1. Set or adjust a product to stock 0.
2. Sell 3 units.

Expected: sale succeeds, card shows `Sem estoque`, notification says `Atencao: este produto esta sem estoque na vitrine.`, and out-of-stock sales contains quantity 3.

- [ ] **Step 5: Manual test 3**

1. Open quick closing.
2. Review `Produtos vendidos sem estoque`.

Expected: section lists product, category, quantity, unit price, total, time, sale/command, and user.

- [ ] **Step 6: Manual test 4**

1. Cancel the sale from history.
2. Reopen Vitrine/Estoque.

Expected: stocked quantity returns only for the quantity that had been available, and the out-of-stock record is canceled.

- [ ] **Step 7: Manual test 5**

1. Open the app in two browsers.
2. Sell a stocked product in browser A.
3. Watch browser B.

Expected: stock updates after Realtime/hydration.

- [ ] **Step 8: Manual test 6**

1. Open PWA/mobile route.
2. Launch production.
3. Check desktop site.

Expected: desktop stock increases.

- [ ] **Step 9: Manual test 7**

1. Sell from desktop site.
2. Check PWA/mobile route.

Expected: mobile stock decreases.

- [ ] **Step 10: Final commit if manual notes/docs changed**

```powershell
git add docs tests src supabase
git commit -m "test: verify showcase stock cashier integration"
```

Only run this commit if files changed during verification.

## Self-Review Notes

- Spec coverage: schema, production increase, sale decrease, sale without stock, non-negative visual stock, closing section, movement history, manual adjustment, Supabase sync, Realtime, UI, cancel reversal, idempotency, and tests are all covered.
- Scope: this is one coherent domain integration. It touches several modules, but each task produces a testable slice.
- SQL/RPC coverage: Task 1 defines concrete RPC bodies for production, sale, reversal, and adjustment. During implementation, keep the SQL behavior aligned with `showcase-stock.service.js` tests so offline and online paths produce the same movements.
