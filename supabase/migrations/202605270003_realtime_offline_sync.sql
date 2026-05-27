alter table public.sales add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.cash_movements add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.stock_production add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.showcase_write_offs add column if not exists payload jsonb not null default '{}'::jsonb;

grant select, insert, update, delete on public.sales to authenticated;
grant select, insert, update, delete on public.sale_items to authenticated;
grant select, insert, update, delete on public.cash_movements to authenticated;
grant select, insert, update, delete on public.stock_production to authenticated;
grant select, insert, update, delete on public.showcase_write_offs to authenticated;

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.cash_movements enable row level security;
alter table public.stock_production enable row level security;
alter table public.showcase_write_offs enable row level security;

drop policy if exists "cash users read sales" on public.sales;
drop policy if exists "sale creators insert sales" on public.sales;
drop policy if exists "sale cancelers update sales" on public.sales;
drop policy if exists "cash users read sale items" on public.sale_items;
drop policy if exists "sale creators manage sale items" on public.sale_items;
drop policy if exists "cash users read cash movements" on public.cash_movements;
drop policy if exists "cash movement creators manage cash movements" on public.cash_movements;
drop policy if exists "stock viewers read stock production" on public.stock_production;
drop policy if exists "stock creators manage stock production" on public.stock_production;
drop policy if exists "stock viewers read showcase write offs" on public.showcase_write_offs;
drop policy if exists "stock creators manage showcase write offs" on public.showcase_write_offs;

create policy "cash users read sales" on public.sales
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access') or private.current_profile_has_permission('owner_app.view'));
create policy "sale creators insert sales" on public.sales
  for insert to authenticated with check (private.current_profile_has_permission('sale.create'));
create policy "sale cancelers update sales" on public.sales
  for update to authenticated using (private.current_profile_has_permission('sale.cancel') or private.current_profile_has_permission('sale.create')) with check (private.current_profile_has_permission('sale.cancel') or private.current_profile_has_permission('sale.create'));

create policy "cash users read sale items" on public.sale_items
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access') or private.current_profile_has_permission('owner_app.view'));
create policy "sale creators manage sale items" on public.sale_items
  for all to authenticated using (private.current_profile_has_permission('sale.create')) with check (private.current_profile_has_permission('sale.create'));

create policy "cash users read cash movements" on public.cash_movements
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access') or private.current_profile_has_permission('owner_app.view'));
create policy "cash movement creators manage cash movements" on public.cash_movements
  for all to authenticated using (private.current_profile_has_permission('cash.movement.create')) with check (private.current_profile_has_permission('cash.movement.create'));

create policy "stock viewers read stock production" on public.stock_production
  for select to authenticated using (private.current_profile_has_permission('stock.view') or private.current_profile_has_permission('owner_app.view'));
create policy "stock creators manage stock production" on public.stock_production
  for all to authenticated using (private.current_profile_has_permission('stock.create')) with check (private.current_profile_has_permission('stock.create'));

create policy "stock viewers read showcase write offs" on public.showcase_write_offs
  for select to authenticated using (private.current_profile_has_permission('stock.view') or private.current_profile_has_permission('owner_app.view'));
create policy "stock creators manage showcase write offs" on public.showcase_write_offs
  for all to authenticated using (private.current_profile_has_permission('stock.create')) with check (private.current_profile_has_permission('stock.create'));

do $$
declare
  target_table text;
begin
  foreach target_table in array array['sales', 'cash_movements', 'stock_production', 'showcase_write_offs']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end $$;
