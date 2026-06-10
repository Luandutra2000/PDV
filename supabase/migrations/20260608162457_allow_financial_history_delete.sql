grant delete on table
  public.command_items,
  public.commands,
  public.sale_items,
  public.sales,
  public.cash_movements,
  public.cash_closings
to anon;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'command_items',
    'commands',
    'sale_items',
    'sales',
    'cash_movements',
    'cash_closings'
  ]
  loop
    execute format('drop policy if exists "Anon can delete %I" on public.%I', target_table, target_table);
    execute format(
      'create policy "Anon can delete %I" on public.%I for delete to anon using (true)',
      target_table,
      target_table
    );
  end loop;
end $$;
