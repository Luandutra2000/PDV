begin;

-- Fail without changing existing rows if duplicate product balances need reconciliation.
-- The RPCs use ON CONFLICT(product_id), which requires a unique index.
create unique index if not exists product_stock_product_unique_idx
  on public.product_stock(product_id);

-- Lock before testing idempotence. Sale and reversal share a sale identity lock;
-- different sales acquire product rows in product order to avoid lock inversion.
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

  perform pg_advisory_xact_lock(hashtextextended('showcase-operation:' || v_operation_id, 0));

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

  perform pg_advisory_xact_lock(hashtextextended('showcase-operation:' || v_operation_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('showcase-sale:' || v_sale_id, 0));

  if not exists (select 1 from public.sales where id = v_sale_id) then
    raise exception 'Venda % ainda nao foi persistida', v_sale_id;
  end if;

  if exists (
    select 1 from public.showcase_movements
     where (operation_id = v_operation_id or sale_id = v_sale_id)
       and movement_type in ('saida_venda', 'venda_sem_estoque')
  ) then
    return jsonb_build_object('changed', false, 'reason', 'already-applied');
  end if;

  if jsonb_typeof(_payload->'items') is distinct from 'array' then
    raise exception 'items deve ser uma lista de produtos';
  end if;
  if exists (
    select 1 from jsonb_array_elements(_payload->'items') item
     where coalesce(nullif(item->>'product_id', ''), nullif(item->>'productId', '')) is null
        or item->>'quantity' is null or (item->>'quantity')::numeric < 0
  ) then
    raise exception 'items contem produto ou quantidade invalida';
  end if;

  for v_item in
    select coalesce(nullif(product_id, ''), "productId") as product_id,
           sum(quantity)::numeric(12,3) as quantity,
           (sum(quantity * coalesce(unit_price, "unitPrice", price, 0)) / sum(quantity))::numeric(12,2) as unit_price
      from jsonb_to_recordset(_payload->'items')
        as item(product_id text, "productId" text, quantity numeric, unit_price numeric, "unitPrice" numeric, price numeric)
     where quantity > 0
     group by coalesce(nullif(product_id, ''), "productId")
     order by coalesce(nullif(product_id, ''), "productId")
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

  if v_changed = 0 then
    raise exception 'Nenhum item de venda processado';
  end if;
  return jsonb_build_object('changed', true, 'changedItems', v_changed);
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

  perform pg_advisory_xact_lock(hashtextextended('showcase-operation:' || v_operation_id, 0));

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

  perform pg_advisory_xact_lock(hashtextextended('showcase-operation:' || v_operation_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('showcase-sale:' || v_sale_id, 0));

  if exists (
    select 1 from public.showcase_movements
     where (operation_id = v_operation_id or sale_id = v_sale_id)
       and movement_type in ('estorno_venda', 'estorno_sem_estoque')
  ) then
    return jsonb_build_object('changed', false, 'reversed', 0, 'reason', 'already-applied');
  end if;

  for v_movement in
    select * from public.showcase_movements
     where sale_id = v_sale_id and movement_type = 'saida_venda' and status <> 'estornada'
     order by product_id, id for update
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
     order by product_id, id for update
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


commit;
