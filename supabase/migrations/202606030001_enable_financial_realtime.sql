do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'commands',
    'command_items',
    'sales',
    'sale_items',
    'cash_movements',
    'cash_closings'
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
