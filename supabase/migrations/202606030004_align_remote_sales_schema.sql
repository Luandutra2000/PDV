alter table public.sales add column if not exists command_id text references public.commands(id);
alter table public.sales add column if not exists command_number integer;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales'
      and column_name = 'comanda_id'
  ) then
    execute 'update public.sales set command_id = coalesce(command_id, comanda_id) where command_id is null and comanda_id is not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales'
      and column_name = 'comanda_number'
  ) then
    execute 'update public.sales set command_number = coalesce(command_number, comanda_number) where command_number is null and comanda_number is not null';
  end if;
end $$;

alter table public.sale_items alter column id drop default;
alter table public.sale_items alter column id type text using id::text;
