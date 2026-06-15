insert into public.permissions (id, description) values
  ('sales.create', 'Finalizar vendas'),
  ('sales.cancel', 'Cancelar vendas'),
  ('showcase.launch', 'Lancar producao e ajustes na vitrine')
on conflict (id) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select 'admin', id
from public.permissions
where id in ('sales.create', 'sales.cancel', 'showcase.launch')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id) values
  ('operador', 'sales.create'),
  ('operador', 'showcase.launch')
on conflict do nothing;

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
create index if not exists product_stock_updated_at_idx on public.product_stock(updated_at desc);
create index if not exists showcase_movements_operation_idx on public.showcase_movements(operation_id);
create index if not exists showcase_movements_product_created_idx on public.showcase_movements(product_id, created_at desc);
create index if not exists showcase_movements_sale_idx on public.showcase_movements(sale_id);
create index if not exists showcase_movements_command_idx on public.showcase_movements(command_id);
create unique index if not exists showcase_movements_sale_product_type_uidx
  on public.showcase_movements(sale_id, product_id, movement_type)
  where sale_id is not null
    and movement_type in ('saida_venda', 'venda_sem_estoque');
create unique index if not exists showcase_movements_reversed_movement_uidx
  on public.showcase_movements(reversed_movement_id)
  where reversed_movement_id is not null and movement_type = 'estorno_venda';
create index if not exists out_of_stock_sales_operation_idx on public.out_of_stock_sales(operation_id);
create index if not exists out_of_stock_sales_sale_idx on public.out_of_stock_sales(sale_id);
create index if not exists out_of_stock_sales_command_idx on public.out_of_stock_sales(command_id);
create index if not exists out_of_stock_sales_created_idx on public.out_of_stock_sales(created_at desc);
create index if not exists out_of_stock_sales_status_idx on public.out_of_stock_sales(status);

alter table public.product_stock enable row level security;
alter table public.showcase_movements enable row level security;
alter table public.out_of_stock_sales enable row level security;

revoke insert, update, delete on public.product_stock from authenticated;
revoke insert, update, delete on public.showcase_movements from authenticated;
revoke insert, update, delete on public.out_of_stock_sales from authenticated;
grant select on public.product_stock to authenticated;
grant select on public.showcase_movements to authenticated;
grant select on public.out_of_stock_sales to authenticated;

drop policy if exists "cash and stock users read product stock" on public.product_stock;
drop policy if exists "showcase users manage product stock" on public.product_stock;
drop policy if exists "cash and stock users read showcase movements" on public.showcase_movements;
drop policy if exists "showcase users manage showcase movements" on public.showcase_movements;
drop policy if exists "closing users read out of stock sales" on public.out_of_stock_sales;
drop policy if exists "sale users manage out of stock sales" on public.out_of_stock_sales;

create policy "cash and stock users read product stock" on public.product_stock
  for select to authenticated using (
    private.current_profile_has_permission('dashboard.view')
    or private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('products.view')
    or private.current_profile_has_permission('stock.view')
    or private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('showcase.launch')
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('cash.close')
  );

create policy "cash and stock users read showcase movements" on public.showcase_movements
  for select to authenticated using (
    private.current_profile_has_permission('dashboard.view')
    or private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('cash.close')
    or private.current_profile_has_permission('stock.view')
    or private.current_profile_has_permission('stock.create')
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
    or private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.cancel')
    or private.current_profile_has_permission('sales.cancel')
  );

create or replace function private.safe_showcase_numeric(_value text, _fallback numeric default 0)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if _value is null or btrim(_value) = '' then
    return _fallback;
  end if;

  if btrim(_value) !~ '^-?[0-9]+(\.[0-9]+)?$' then
    return _fallback;
  end if;

  return greatest(btrim(_value)::numeric, coalesce(_fallback, 0));
exception
  when others then
    return _fallback;
end;
$$;

create or replace function private.safe_showcase_uuid(_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if _value is null or btrim(_value) = '' then
    return null;
  end if;

  if btrim(_value) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return btrim(_value)::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function private.safe_showcase_timestamptz(_value text, _fallback timestamptz default now())
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if _value is null or btrim(_value) = '' then
    return _fallback;
  end if;

  return btrim(_value)::timestamptz;
exception
  when others then
    return _fallback;
end;
$$;

create or replace function public.process_showcase_production(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _operation_id text := _payload->>'operationId';
  _product_id text := _payload->>'productId';
  _quantity numeric(12,3) := private.safe_showcase_numeric(_payload->>'quantity', 0);
  _actor_id uuid := private.safe_showcase_uuid(_payload->>'userId');
  _created_at timestamptz := private.safe_showcase_timestamptz(_payload->>'createdAt', now());
  _current_quantity numeric(12,3);
  _new_quantity numeric(12,3);
begin
  if not (
    private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('showcase.launch')
  ) then
    raise exception 'Permissao insuficiente para lancar producao na vitrine.';
  end if;

  if _operation_id is null or _operation_id = '' or _product_id is null or _product_id = '' then
    raise exception 'Operacao e produto sao obrigatorios.';
  end if;

  if _quantity <= 0 then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  if exists (
    select 1
    from public.showcase_movements sm
    where sm.operation_id = _operation_id
      and sm.product_id = _product_id
      and sm.movement_type = 'entrada_producao'
  ) then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
  values ('stock-' || _product_id, _product_id, 0, _actor_id, _created_at)
  on conflict (product_id) do nothing;

  select ps.quantity_available
    into _current_quantity
  from public.product_stock ps
  where ps.product_id = _product_id
  for update;

  _new_quantity := coalesce(_current_quantity, 0) + _quantity;

  update public.product_stock ps
    set quantity_available = _new_quantity,
        updated_by = _actor_id,
        updated_at = _created_at
  where ps.product_id = _product_id;

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
    'mov-' || _operation_id || '-' || _product_id || '-entrada_producao',
    _operation_id,
    _product_id,
    'entrada_producao',
    _quantity,
    coalesce(_current_quantity, 0),
    _new_quantity,
    _actor_id,
    coalesce(nullif(_payload->>'notes', ''), 'Entrada automatica por producao'),
    _created_at
  );

  return jsonb_build_object('ok', true, 'productId', _product_id, 'quantityAvailable', _new_quantity);
end;
$$;

create or replace function public.process_showcase_sale(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _item record;
  _operation_id text := _payload->>'operationId';
  _sale_id text := _payload->>'saleId';
  _command_id text := nullif(_payload->>'commandId', '');
  _actor_id uuid := private.safe_showcase_uuid(_payload->>'userId');
  _created_at timestamptz := private.safe_showcase_timestamptz(_payload->>'createdAt', now());
  _product_id text;
  _requested_quantity numeric(12,3);
  _unit_price numeric(12,2);
  _current_quantity numeric(12,3);
  _stocked_quantity numeric(12,3);
  _missing_quantity numeric(12,3);
  _new_quantity numeric(12,3);
begin
  if not (
    private.current_profile_has_permission('sale.create')
    or private.current_profile_has_permission('sales.create')
  ) then
    raise exception 'Permissao insuficiente para baixar estoque da vitrine.';
  end if;

  if _operation_id is null or _operation_id = '' or _sale_id is null or _sale_id = '' then
    raise exception 'Operacao e venda sao obrigatorias.';
  end if;

  for _item in
    with grouped_sale_items as (
      select
        raw_item->>'productId' as product_id,
        sum(private.safe_showcase_numeric(raw_item->>'quantity', 0))::numeric(12,3) as quantity,
        sum(
          case
            when private.safe_showcase_numeric(raw_item->>'total', -1) >= 0 then private.safe_showcase_numeric(raw_item->>'total', 0)
            else private.safe_showcase_numeric(raw_item->>'quantity', 0)
              * coalesce(private.safe_showcase_numeric(raw_item->>'unitPrice', null), private.safe_showcase_numeric(raw_item->>'price', 0))
          end
        )::numeric(12,2) as total_price
      from jsonb_array_elements(coalesce(_payload->'items', '[]'::jsonb)) as payload_items(raw_item)
      where coalesce(raw_item->>'productId', '') <> ''
      group by raw_item->>'productId'
    )
    select
      product_id,
      quantity,
      case
        when quantity > 0 then (total_price / quantity)::numeric(12,2)
        else 0::numeric(12,2)
      end as unit_price,
      total_price
    from grouped_sale_items
    where quantity > 0
  loop
    _product_id := _item.product_id;
    _requested_quantity := _item.quantity;
    _unit_price := _item.unit_price;

    if _product_id is null or _product_id = '' or _requested_quantity <= 0 then
      continue;
    end if;

    if exists (
      select 1
      from public.showcase_movements sm
      where (sm.operation_id = _operation_id or sm.sale_id = _sale_id)
        and sm.product_id = _product_id
        and sm.movement_type in ('saida_venda', 'venda_sem_estoque')
    ) then
      continue;
    end if;

    insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
    values ('stock-' || _product_id, _product_id, 0, _actor_id, _created_at)
    on conflict (product_id) do nothing;

    select ps.quantity_available
      into _current_quantity
    from public.product_stock ps
    where ps.product_id = _product_id
    for update;

    _current_quantity := coalesce(_current_quantity, 0);
    _stocked_quantity := least(_current_quantity, _requested_quantity);
    _missing_quantity := greatest(_requested_quantity - _stocked_quantity, 0);
    _new_quantity := _current_quantity - _stocked_quantity;

    if _stocked_quantity > 0 then
      update public.product_stock ps
        set quantity_available = _new_quantity,
            updated_by = _actor_id,
            updated_at = _created_at
      where ps.product_id = _product_id;

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
        'mov-' || _operation_id || '-' || _product_id || '-saida_venda',
        _operation_id,
        _product_id,
        'saida_venda',
        _stocked_quantity,
        _current_quantity,
        _new_quantity,
        _sale_id,
        _command_id,
        _actor_id,
        'Baixa automatica por venda',
        _created_at
      );
    end if;

    if _missing_quantity > 0 then
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
        'out-' || _sale_id || '-' || _product_id,
        _operation_id,
        _product_id,
        _sale_id,
        _command_id,
        _missing_quantity,
        _unit_price,
        _missing_quantity * _unit_price,
        _actor_id,
        'ativa',
        _created_at
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
        'mov-' || _operation_id || '-' || _product_id || '-venda_sem_estoque',
        _operation_id,
        _product_id,
        'venda_sem_estoque',
        _missing_quantity,
        _new_quantity,
        _new_quantity,
        _sale_id,
        _command_id,
        _actor_id,
        'Produto vendido sem estoque na vitrine',
        _created_at
      );
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.reverse_showcase_sale(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _movement record;
  _operation_id text := _payload->>'operationId';
  _sale_id text := _payload->>'saleId';
  _command_id text := nullif(_payload->>'commandId', '');
  _actor_id uuid := private.safe_showcase_uuid(_payload->>'userId');
  _created_at timestamptz := private.safe_showcase_timestamptz(_payload->>'createdAt', now());
  _current_quantity numeric(12,3);
  _new_quantity numeric(12,3);
  _reverse_movement_id text;
begin
  if not (
    private.current_profile_has_permission('sale.cancel')
    or private.current_profile_has_permission('sales.cancel')
  ) then
    raise exception 'Permissao insuficiente para estornar estoque da vitrine.';
  end if;

  if _operation_id is null or _operation_id = '' or _sale_id is null or _sale_id = '' then
    raise exception 'Operacao e venda sao obrigatorias.';
  end if;

  for _movement in
    select sm.*
    from public.showcase_movements sm
    where sm.sale_id = _sale_id
      and sm.movement_type = 'saida_venda'
      and sm.status = 'ativa'
    order by sm.created_at, sm.id
    for update of sm
  loop
    if exists (
      select 1
      from public.showcase_movements existing_reverse
      where existing_reverse.operation_id = _operation_id
        and existing_reverse.product_id = _movement.product_id
        and existing_reverse.movement_type = 'estorno_venda'
    ) then
      continue;
    end if;

    insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
    values ('stock-' || _movement.product_id, _movement.product_id, 0, _actor_id, _created_at)
    on conflict (product_id) do nothing;

    select ps.quantity_available
      into _current_quantity
    from public.product_stock ps
    where ps.product_id = _movement.product_id
    for update;

    _current_quantity := coalesce(_current_quantity, 0);
    _new_quantity := _current_quantity + _movement.quantity;
    _reverse_movement_id := null;

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
      'mov-' || _operation_id || '-' || _movement.product_id || '-estorno_venda',
      _operation_id,
      _movement.product_id,
      'estorno_venda',
      _movement.quantity,
      _current_quantity,
      _new_quantity,
      _sale_id,
      coalesce(_command_id, _movement.command_id),
      _actor_id,
      'Estorno automatico por cancelamento de venda',
      _movement.id,
      _created_at
    )
    on conflict (reversed_movement_id) where movement_type = 'estorno_venda' do nothing
    returning id into _reverse_movement_id;

    if _reverse_movement_id is null then
      continue;
    end if;

    update public.product_stock ps
      set quantity_available = _new_quantity,
          updated_by = _actor_id,
          updated_at = _created_at
    where ps.product_id = _movement.product_id;

    update public.showcase_movements sm
      set status = 'estornada'
    where sm.id = _movement.id;
  end loop;

  update public.showcase_movements sm
    set status = 'estornada'
  where sm.sale_id = _sale_id
    and sm.movement_type in ('saida_venda', 'venda_sem_estoque')
    and sm.status = 'ativa';

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
  )
  select
    'mov-reverse-out-' || oos.sale_id || '-' || oos.product_id,
    'reverse-out-' || oos.sale_id,
    oos.product_id,
    'estorno_sem_estoque',
    oos.quantity,
    0,
    0,
    oos.sale_id,
    coalesce(_command_id, oos.command_id),
    _actor_id,
    'Estorno de venda sem estoque',
    _created_at
  from public.out_of_stock_sales oos
  where oos.sale_id = _sale_id and oos.status = 'ativa'
  on conflict (operation_id, product_id, movement_type) do nothing;

  update public.out_of_stock_sales oos
    set status = 'cancelada',
        canceled_at = coalesce(oos.canceled_at, _created_at),
        canceled_by = coalesce(oos.canceled_by, _actor_id)
  where oos.sale_id = _sale_id
    and oos.status = 'ativa';

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.adjust_showcase_stock(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _operation_id text := _payload->>'operationId';
  _product_id text := _payload->>'productId';
  _quantity_available numeric(12,3) := private.safe_showcase_numeric(_payload->>'quantityAvailable', 0);
  _actor_id uuid := private.safe_showcase_uuid(_payload->>'userId');
  _created_at timestamptz := private.safe_showcase_timestamptz(_payload->>'createdAt', now());
  _current_quantity numeric(12,3);
begin
  if not (
    private.current_profile_has_permission('stock.create')
    or private.current_profile_has_permission('showcase.launch')
  ) then
    raise exception 'Permissao insuficiente para ajustar estoque da vitrine.';
  end if;

  if _operation_id is null or _operation_id = '' or _product_id is null or _product_id = '' then
    raise exception 'Operacao e produto sao obrigatorios.';
  end if;

  if exists (
    select 1
    from public.showcase_movements sm
    where sm.operation_id = _operation_id
      and sm.product_id = _product_id
      and sm.movement_type = 'ajuste_manual'
  ) then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
  values ('stock-' || _product_id, _product_id, 0, _actor_id, _created_at)
  on conflict (product_id) do nothing;

  select ps.quantity_available
    into _current_quantity
  from public.product_stock ps
  where ps.product_id = _product_id
  for update;

  update public.product_stock ps
    set quantity_available = _quantity_available,
        updated_by = _actor_id,
        updated_at = _created_at
  where ps.product_id = _product_id;

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
    'mov-' || _operation_id || '-' || _product_id || '-ajuste_manual',
    _operation_id,
    _product_id,
    'ajuste_manual',
    abs(_quantity_available - coalesce(_current_quantity, 0)),
    coalesce(_current_quantity, 0),
    _quantity_available,
    _actor_id,
    btrim(concat_ws(' - ', nullif(_payload->>'reason', ''), nullif(_payload->>'notes', ''))),
    _created_at
  );

  return jsonb_build_object('ok', true, 'productId', _product_id, 'quantityAvailable', _quantity_available);
end;
$$;

grant execute on function public.process_showcase_production(jsonb) to authenticated;
grant execute on function public.process_showcase_sale(jsonb) to authenticated;
grant execute on function public.reverse_showcase_sale(jsonb) to authenticated;
grant execute on function public.adjust_showcase_stock(jsonb) to authenticated;

do $$
declare
  _table_name text;
  _realtime_tables text[] := array[
    'product_stock',
    'showcase_movements',
    'out_of_stock_sales',
    'stock_production'
  ];
begin
  foreach _table_name in array _realtime_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = _table_name
    ) then
      if _table_name = 'product_stock' then
        alter publication supabase_realtime add table public.product_stock;
      elsif _table_name = 'showcase_movements' then
        alter publication supabase_realtime add table public.showcase_movements;
      elsif _table_name = 'out_of_stock_sales' then
        alter publication supabase_realtime add table public.out_of_stock_sales;
      elsif _table_name = 'stock_production' then
        alter publication supabase_realtime add table public.stock_production;
      end if;
    end if;
  end loop;
end $$;
