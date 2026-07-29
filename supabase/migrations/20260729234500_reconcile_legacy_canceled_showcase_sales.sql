begin;

do $$
declare
  v_sale record;
begin
  for v_sale in
    select
      s.id,
      s.command_id,
      s.created_by,
      coalesce(s.canceled_at, now()) as canceled_at
    from public.sales s
    where s.status = 'cancelada'
      and exists (
        select 1
        from public.showcase_movements sm
        where sm.sale_id = s.id
          and sm.movement_type in ('saida_venda', 'venda_sem_estoque')
          and sm.status <> 'estornada'
      )
  loop
    perform public.reverse_showcase_sale(
      jsonb_build_object(
        'operationId', 'repair-canceled-' || v_sale.id,
        'saleId', v_sale.id,
        'commandId', v_sale.command_id,
        'userId', v_sale.created_by,
        'createdAt', v_sale.canceled_at
      )
    );
  end loop;
end;
$$;

commit;
