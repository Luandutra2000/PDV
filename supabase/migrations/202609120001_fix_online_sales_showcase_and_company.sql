begin;

alter table if exists public.profiles
  add column if not exists empresa_id uuid;

create table if not exists public.empresa_configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique,
  nome_sistema text not null default 'Zelo PDV',
  nome_fantasia text not null default 'Lanchonete',
  razao_social text,
  cnpj text,
  telefone text,
  whatsapp text,
  email text,
  endereco text,
  logo_url text,
  cor_primaria text not null default '#ff6b1a',
  cor_secundaria text not null default '#e65b11',
  cor_destaque text not null default '#fff0e6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_stock (
  id text primary key,
  product_id text not null references public.products(id),
  quantity_available numeric(12,3) not null default 0,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.showcase_movements (
  id text primary key,
  operation_id text not null,
  product_id text not null references public.products(id),
  movement_type text not null,
  quantity numeric(12,3) not null,
  previous_quantity numeric(12,3) not null default 0,
  new_quantity numeric(12,3) not null default 0,
  sale_id text,
  command_id text,
  user_id uuid references public.profiles(id),
  notes text not null default '',
  reversed_movement_id text,
  status text not null default 'ativa',
  created_at timestamptz not null default now()
);

create table if not exists public.out_of_stock_sales (
  id text primary key,
  operation_id text not null,
  product_id text not null references public.products(id),
  sale_id text,
  command_id text,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  user_id uuid references public.profiles(id),
  status text not null default 'ativa',
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  canceled_by uuid references public.profiles(id)
);

create index if not exists empresa_configuracoes_empresa_idx on public.empresa_configuracoes(empresa_id);
create index if not exists product_stock_product_idx on public.product_stock(product_id);
create index if not exists showcase_movements_sale_idx on public.showcase_movements(sale_id);
create index if not exists showcase_movements_operation_idx on public.showcase_movements(operation_id);
create index if not exists out_of_stock_sales_sale_idx on public.out_of_stock_sales(sale_id);

create or replace function public.process_showcase_production(_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_operation_id text := nullif(_payload->>'operationId', '');
  v_product_id text := nullif(_payload->>'productId', '');
  v_quantity numeric(12,3) := (_payload->>'quantity')::numeric;
  v_user_id uuid := nullif(_payload->>'userId', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(_payload->>'createdAt', '')::timestamptz, now());
  v_previous numeric(12,3);
  v_new numeric(12,3);
  v_movement_id text;
begin
  if v_operation_id is null or v_product_id is null or v_quantity is null or v_quantity <= 0 then
    raise exception 'operationId, productId e quantity sao obrigatorios';
  end if;

  v_movement_id := 'mov-' || v_operation_id || '-' || v_product_id || '-entrada_producao';
  if exists (select 1 from public.showcase_movements where id = v_movement_id) then
    return jsonb_build_object('changed', false, 'reason', 'already-applied');
  end if;

  insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
  values ('stock-' || v_product_id, v_product_id, 0, v_user_id, v_created_at)
  on conflict (product_id) do nothing;

  select quantity_available into v_previous
    from public.product_stock
   where product_id = v_product_id
   for update;
  v_previous := coalesce(v_previous, 0);
  v_new := v_previous + v_quantity;

  update public.product_stock
     set quantity_available = v_new, updated_by = v_user_id, updated_at = v_created_at
   where product_id = v_product_id;

  insert into public.showcase_movements (
    id, operation_id, product_id, movement_type, quantity,
    previous_quantity, new_quantity, user_id, notes, status, created_at
  ) values (
    v_movement_id, v_operation_id, v_product_id, 'entrada_producao', v_quantity,
    v_previous, v_new, v_user_id, 'Entrada de producao na vitrine', 'ativa', v_created_at
  );

  return jsonb_build_object('changed', true, 'quantityAvailable', v_new);
end;
$$;

create or replace function public.process_showcase_sale(_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_operation_id text := nullif(_payload->>'operationId', '');
  v_sale_id text := nullif(_payload->>'saleId', '');
  v_command_id text := nullif(_payload->>'commandId', '');
  v_user_id uuid := nullif(_payload->>'userId', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(_payload->>'createdAt', '')::timestamptz, now());
  v_item record;
  v_previous numeric(12,3);
  v_stocked numeric(12,3);
  v_missing numeric(12,3);
  v_new numeric(12,3);
  v_changed integer := 0;
begin
  if v_operation_id is null or v_sale_id is null then
    raise exception 'operationId e saleId sao obrigatorios';
  end if;

  if not exists (select 1 from public.sales where id = v_sale_id) then
    raise exception 'Venda % ainda nao foi persistida', v_sale_id;
  end if;

  if exists (
    select 1 from public.showcase_movements
     where operation_id = v_operation_id
       and movement_type in ('saida_venda', 'venda_sem_estoque')
  ) then
    return jsonb_build_object('changed', false, 'reason', 'already-applied');
  end if;

  for v_item in
    select product_id,
           sum(quantity)::numeric(12,3) as quantity,
           max(unit_price)::numeric(12,2) as unit_price
      from jsonb_to_recordset(coalesce(_payload->'items', '[]'::jsonb))
        as item(product_id text, quantity numeric, unit_price numeric, total numeric)
     where product_id is not null and quantity > 0
     group by product_id
  loop
    insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
    values ('stock-' || v_item.product_id, v_item.product_id, 0, v_user_id, v_created_at)
    on conflict (product_id) do nothing;

    select quantity_available into v_previous
      from public.product_stock
     where product_id = v_item.product_id
     for update;
    v_previous := coalesce(v_previous, 0);
    v_stocked := least(v_previous, v_item.quantity);
    v_missing := greatest(v_item.quantity - v_stocked, 0);
    v_new := v_previous - v_stocked;

    update public.product_stock
       set quantity_available = v_new, updated_by = v_user_id, updated_at = v_created_at
     where product_id = v_item.product_id;

    if v_stocked > 0 then
      insert into public.showcase_movements (
        id, operation_id, product_id, movement_type, quantity,
        previous_quantity, new_quantity, sale_id, command_id, user_id, notes, status, created_at
      ) values (
        'mov-' || v_operation_id || '-' || v_item.product_id || '-saida_venda',
        v_operation_id, v_item.product_id, 'saida_venda', v_stocked,
        v_previous, v_new, v_sale_id, v_command_id, v_user_id,
        'Baixa automatica por venda', 'ativa', v_created_at
      ) on conflict (id) do nothing;
      v_changed := v_changed + 1;
    end if;

    if v_missing > 0 then
      insert into public.showcase_movements (
        id, operation_id, product_id, movement_type, quantity,
        previous_quantity, new_quantity, sale_id, command_id, user_id, notes, status, created_at
      ) values (
        'mov-' || v_operation_id || '-' || v_item.product_id || '-venda_sem_estoque',
        v_operation_id, v_item.product_id, 'venda_sem_estoque', v_missing,
        v_new, v_new, v_sale_id, v_command_id, v_user_id,
        'Produto vendido sem estoque na vitrine', 'ativa', v_created_at
      ) on conflict (id) do nothing;

      insert into public.out_of_stock_sales (
        id, operation_id, product_id, sale_id, command_id, quantity,
        unit_price, total_price, user_id, status, created_at
      ) values (
        'out-' || v_operation_id || '-' || v_item.product_id,
        v_operation_id, v_item.product_id, v_sale_id, v_command_id, v_missing,
        coalesce(v_item.unit_price, 0), v_missing * coalesce(v_item.unit_price, 0),
        v_user_id, 'ativa', v_created_at
      ) on conflict (id) do nothing;
      v_changed := v_changed + 1;
    end if;
  end loop;

  return jsonb_build_object('changed', v_changed > 0, 'changedItems', v_changed);
end;
$$;

create or replace function public.adjust_showcase_stock(_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_operation_id text := nullif(_payload->>'operationId', '');
  v_product_id text := nullif(_payload->>'productId', '');
  v_quantity numeric(12,3) := (_payload->>'quantityAvailable')::numeric;
  v_user_id uuid := nullif(_payload->>'userId', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(_payload->>'createdAt', '')::timestamptz, now());
  v_previous numeric(12,3);
  v_movement_id text;
begin
  if v_operation_id is null or v_product_id is null or v_quantity is null or v_quantity < 0 then
    raise exception 'operationId, productId e quantityAvailable sao obrigatorios';
  end if;

  v_movement_id := 'mov-' || v_operation_id || '-' || v_product_id || '-ajuste_manual';
  if exists (select 1 from public.showcase_movements where id = v_movement_id) then
    return jsonb_build_object('changed', false, 'reason', 'already-applied');
  end if;

  insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
  values ('stock-' || v_product_id, v_product_id, 0, v_user_id, v_created_at)
  on conflict (product_id) do nothing;
  select quantity_available into v_previous from public.product_stock where product_id = v_product_id for update;
  v_previous := coalesce(v_previous, 0);
  update public.product_stock
     set quantity_available = v_quantity, updated_by = v_user_id, updated_at = v_created_at
   where product_id = v_product_id;

  insert into public.showcase_movements (
    id, operation_id, product_id, movement_type, quantity,
    previous_quantity, new_quantity, user_id, notes, status, created_at
  ) values (
    v_movement_id, v_operation_id, v_product_id, 'ajuste_manual', abs(v_quantity - v_previous),
    v_previous, v_quantity, v_user_id,
    concat_ws(' | ', nullif(_payload->>'reason', ''), nullif(_payload->>'notes', '')),
    'ativa', v_created_at
  );

  return jsonb_build_object('changed', true, 'quantityAvailable', v_quantity);
end;
$$;

create or replace function public.reverse_showcase_sale(_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_operation_id text := nullif(_payload->>'operationId', '');
  v_sale_id text := nullif(_payload->>'saleId', '');
  v_command_id text := nullif(_payload->>'commandId', '');
  v_user_id uuid := nullif(_payload->>'userId', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(_payload->>'createdAt', '')::timestamptz, now());
  v_movement record;
  v_previous numeric(12,3);
  v_new numeric(12,3);
  v_reversed integer := 0;
begin
  if v_operation_id is null or v_sale_id is null then
    raise exception 'operationId e saleId sao obrigatorios';
  end if;

  if exists (
    select 1 from public.showcase_movements
     where operation_id = v_operation_id
       and movement_type in ('estorno_venda', 'estorno_sem_estoque')
  ) then
    return jsonb_build_object('changed', false, 'reversed', 0, 'reason', 'already-applied');
  end if;

  for v_movement in
    select * from public.showcase_movements
     where sale_id = v_sale_id and movement_type = 'saida_venda' and status <> 'estornada'
     order by created_at, id for update
  loop
    insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
    values ('stock-' || v_movement.product_id, v_movement.product_id, 0, v_user_id, v_created_at)
    on conflict (product_id) do nothing;
    select quantity_available into v_previous from public.product_stock where product_id = v_movement.product_id for update;
    v_previous := coalesce(v_previous, 0);
    v_new := v_previous + v_movement.quantity;
    update public.product_stock
       set quantity_available = v_new, updated_by = v_user_id, updated_at = v_created_at
     where product_id = v_movement.product_id;

    insert into public.showcase_movements (
      id, operation_id, product_id, movement_type, quantity,
      previous_quantity, new_quantity, sale_id, command_id, user_id,
      notes, reversed_movement_id, status, created_at
    ) values (
      'mov-' || v_operation_id || '-' || v_movement.product_id || '-estorno_venda',
      v_operation_id, v_movement.product_id, 'estorno_venda', v_movement.quantity,
      v_previous, v_new, v_sale_id, coalesce(v_command_id, v_movement.command_id), v_user_id,
      'Estorno automatico por cancelamento de venda', v_movement.id, 'ativa', v_created_at
    ) on conflict (id) do nothing;

    update public.showcase_movements set status = 'estornada' where id = v_movement.id;
    v_reversed := v_reversed + 1;
  end loop;

  for v_movement in
    select * from public.showcase_movements
     where sale_id = v_sale_id and movement_type = 'venda_sem_estoque' and status <> 'estornada'
     order by created_at, id for update
  loop
    select quantity_available into v_previous from public.product_stock where product_id = v_movement.product_id;
    v_previous := coalesce(v_previous, 0);
    insert into public.showcase_movements (
      id, operation_id, product_id, movement_type, quantity,
      previous_quantity, new_quantity, sale_id, command_id, user_id,
      notes, reversed_movement_id, status, created_at
    ) values (
      'mov-' || v_operation_id || '-' || v_movement.product_id || '-estorno_sem_estoque',
      v_operation_id, v_movement.product_id, 'estorno_sem_estoque', v_movement.quantity,
      v_previous, v_previous, v_sale_id, coalesce(v_command_id, v_movement.command_id), v_user_id,
      'Estorno de venda sem estoque', v_movement.id, 'ativa', v_created_at
    ) on conflict (id) do nothing;
    update public.showcase_movements set status = 'estornada' where id = v_movement.id;
    v_reversed := v_reversed + 1;
  end loop;

  update public.out_of_stock_sales
     set status = 'cancelada', canceled_at = v_created_at, canceled_by = v_user_id
   where sale_id = v_sale_id and status <> 'cancelada';

  return jsonb_build_object('changed', v_reversed > 0, 'reversed', v_reversed);
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.empresa_configuracoes,
  public.product_stock,
  public.showcase_movements,
  public.out_of_stock_sales
  to authenticated;
grant execute on function public.process_showcase_production(jsonb) to authenticated;
grant execute on function public.process_showcase_sale(jsonb) to authenticated;
grant execute on function public.adjust_showcase_stock(jsonb) to authenticated;
grant execute on function public.reverse_showcase_sale(jsonb) to authenticated;

alter table public.empresa_configuracoes enable row level security;
alter table public.product_stock enable row level security;
alter table public.showcase_movements enable row level security;
alter table public.out_of_stock_sales enable row level security;

do $$
declare
  target_table text;
  current_policy record;
begin
  foreach target_table in array array[
    'empresa_configuracoes',
    'product_stock',
    'showcase_movements',
    'out_of_stock_sales',
    'commands',
    'command_items',
    'sales',
    'sale_items'
  ]
  loop
    for current_policy in
      select policyname from pg_policies where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', current_policy.policyname, target_table);
    end loop;
  end loop;
end;
$$;

create policy "active users read company settings" on public.empresa_configuracoes
  for select to authenticated
  using (
    private.current_profile_is_active()
    and (
      empresa_id = (select p.empresa_id from public.profiles p where p.id = auth.uid())
      or private.current_profile_has_permission('company_settings.manage')
    )
  );
create policy "company managers manage settings" on public.empresa_configuracoes
  for all to authenticated
  using (private.current_profile_has_permission('company_settings.manage'))
  with check (private.current_profile_has_permission('company_settings.manage'));

create policy "active users read product stock" on public.product_stock
  for select to authenticated
  using (private.current_profile_has_permission('showcase.access') or private.current_profile_has_permission('stock.view'));
create policy "showcase users manage product stock" on public.product_stock
  for all to authenticated
  using (
    private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.cancel')
    or private.current_profile_has_permission('sale.cancel')
  )
  with check (
    private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.cancel')
    or private.current_profile_has_permission('sale.cancel')
  );

create policy "active users read showcase movements" on public.showcase_movements
  for select to authenticated
  using (private.current_profile_has_permission('showcase.access') or private.current_profile_has_permission('stock.view'));
create policy "showcase users manage showcase movements" on public.showcase_movements
  for all to authenticated
  using (
    private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.cancel')
    or private.current_profile_has_permission('sale.cancel')
  )
  with check (
    private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.cancel')
    or private.current_profile_has_permission('sale.cancel')
  );

create policy "active users read out of stock sales" on public.out_of_stock_sales
  for select to authenticated
  using (private.current_profile_has_permission('showcase.access') or private.current_profile_has_permission('stock.view'));
create policy "showcase users manage out of stock sales" on public.out_of_stock_sales
  for all to authenticated
  using (
    private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.cancel')
    or private.current_profile_has_permission('sale.cancel')
  )
  with check (
    private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.cancel')
    or private.current_profile_has_permission('sale.cancel')
  );

create policy "active users read commands online" on public.commands
  for select to authenticated using (private.current_profile_is_active());
create policy "sales users manage commands online" on public.commands
  for all to authenticated
  using (
    private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
  )
  with check (
    private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
  );

create policy "active users read command items online" on public.command_items
  for select to authenticated using (private.current_profile_is_active());
create policy "sales users manage command items online" on public.command_items
  for all to authenticated
  using (
    private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
  )
  with check (
    private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
  );

create policy "active users read sales online" on public.sales
  for select to authenticated using (private.current_profile_is_active());
create policy "sales users create sales online" on public.sales
  for insert to authenticated
  with check (private.current_profile_has_permission('sales.create') or private.current_profile_has_permission('sale.create'));
create policy "sales users cancel sales online" on public.sales
  for update to authenticated
  using (private.current_profile_has_permission('sales.cancel') or private.current_profile_has_permission('sale.cancel'))
  with check (private.current_profile_has_permission('sales.cancel') or private.current_profile_has_permission('sale.cancel'));

create policy "active users read sale items online" on public.sale_items
  for select to authenticated using (private.current_profile_is_active());
create policy "sales users manage sale items online" on public.sale_items
  for all to authenticated
  using (private.current_profile_has_permission('sales.create') or private.current_profile_has_permission('sale.create'))
  with check (private.current_profile_has_permission('sales.create') or private.current_profile_has_permission('sale.create'));

commit;
