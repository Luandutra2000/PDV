begin;

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
  v_reversed_count integer := 0;
begin
  if v_operation_id is null or v_sale_id is null then
    raise exception 'operationId e saleId sao obrigatorios';
  end if;

  if exists (
    select 1
      from public.showcase_movements
     where operation_id = v_operation_id
       and movement_type in ('estorno_venda', 'estorno_sem_estoque')
  ) then
    return jsonb_build_object('changed', false, 'reversed', 0, 'reason', 'already-applied');
  end if;

  for v_movement in
    select *
      from public.showcase_movements
     where sale_id = v_sale_id
       and movement_type = 'saida_venda'
       and status <> 'estornada'
     order by created_at, id
     for update
  loop
    insert into public.product_stock (id, product_id, quantity_available, updated_by, updated_at)
    values (
      'stock-' || v_movement.product_id,
      v_movement.product_id,
      v_movement.quantity,
      v_user_id,
      v_created_at
    )
    on conflict (product_id) do update
      set quantity_available = public.product_stock.quantity_available + excluded.quantity_available,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
    returning quantity_available - v_movement.quantity into v_previous;

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
      status,
      created_at
    ) values (
      'mov-' || v_operation_id || '-' || v_movement.product_id || '-estorno_venda',
      v_operation_id,
      v_movement.product_id,
      'estorno_venda',
      v_movement.quantity,
      v_previous,
      v_previous + v_movement.quantity,
      v_sale_id,
      coalesce(v_command_id, v_movement.command_id),
      v_user_id,
      'Estorno automatico por cancelamento de venda',
      v_movement.id,
      'ativa',
      v_created_at
    )
    on conflict (id) do nothing;

    update public.showcase_movements
       set status = 'estornada'
     where id = v_movement.id;

    v_reversed_count := v_reversed_count + 1;
  end loop;

  for v_movement in
    select *
      from public.showcase_movements
     where sale_id = v_sale_id
       and movement_type = 'venda_sem_estoque'
       and status <> 'estornada'
     order by created_at, id
     for update
  loop
    select quantity_available
      into v_previous
      from public.product_stock
     where product_id = v_movement.product_id;

    v_previous := coalesce(v_previous, 0);

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
      status,
      created_at
    ) values (
      'mov-' || v_operation_id || '-' || v_movement.product_id || '-estorno_sem_estoque',
      v_operation_id,
      v_movement.product_id,
      'estorno_sem_estoque',
      v_movement.quantity,
      v_previous,
      v_previous,
      v_sale_id,
      coalesce(v_command_id, v_movement.command_id),
      v_user_id,
      'Estorno de venda sem estoque',
      v_movement.id,
      'ativa',
      v_created_at
    )
    on conflict (id) do nothing;

    update public.showcase_movements
       set status = 'estornada'
     where id = v_movement.id;
  end loop;

  update public.out_of_stock_sales
     set status = 'cancelada',
         canceled_at = v_created_at,
         canceled_by = v_user_id
   where sale_id = v_sale_id
     and status <> 'cancelada';

  return jsonb_build_object('changed', v_reversed_count > 0, 'reversed', v_reversed_count);
end;
$$;

grant execute on function public.reverse_showcase_sale(jsonb) to anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'sales',
    'commands',
    'cash_movements',
    'cash_closings',
    'financial_transactions',
    'products',
    'categories',
    'product_stock',
    'showcase_movements',
    'out_of_stock_sales',
    'stock_production',
    'showcase_write_offs'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    exception
      when duplicate_object then null;
      when undefined_table then null;
    end;
  end loop;
end;
$$;

commit;
