create extension if not exists "pgcrypto";

create schema if not exists private;

create table if not exists public.roles (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id text primary key,
  description text not null
);

create table if not exists public.role_permissions (
  role_id text not null references public.roles(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'operador' references public.roles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key,
  name text not null,
  show_in_showcase boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  category_id text not null references public.categories(id),
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  stock numeric(12,3) not null default 0,
  active boolean not null default true,
  aliases jsonb not null default '[]'::jsonb,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id text primary key,
  status text not null default 'ativa',
  comanda_id text,
  comanda_number integer,
  total numeric(12,2) not null default 0,
  payment_method text not null,
  received_amount numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id text not null references public.sales(id) on delete cascade,
  product_id text not null references public.products(id),
  name text not null,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  total numeric(12,2) not null
);

create table if not exists public.cash_movements (
  id text primary key,
  type text not null check (type in ('entrada', 'saida')),
  status text not null default 'ativa',
  amount numeric(12,2) not null,
  category text not null default 'sem-categoria',
  description text not null default '',
  user_name text not null default 'Local',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.cash_closings (
  id text primary key,
  status text not null default 'fechado',
  totals jsonb not null default '{}'::jsonb,
  payments jsonb not null default '{}'::jsonb,
  showcase jsonb not null default '[]'::jsonb,
  differences jsonb not null default '[]'::jsonb,
  input jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_production (
  id text primary key,
  product_id text not null references public.products(id),
  product_name text not null,
  category_id text not null,
  category_name text not null,
  quantity numeric(12,3) not null,
  unit_value numeric(12,2) not null,
  total_value numeric(12,2) not null,
  status text not null default 'ativo',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.stock_items (
  id text primary key,
  product_id text not null references public.products(id),
  product_name text not null,
  category_id text not null,
  category_name text not null,
  quantity numeric(12,3) not null,
  unit_value numeric(12,2) not null,
  total_value numeric(12,2) not null,
  reason text not null,
  note text not null default '',
  status text not null default 'ativa',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  user_id uuid references public.profiles(id),
  user_name text not null default 'Sistema',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.sales
  alter column created_by set default auth.uid(),
  alter column created_by set not null;

alter table public.cash_movements
  alter column created_by set default auth.uid(),
  alter column created_by set not null;

alter table public.cash_closings
  alter column created_by set default auth.uid(),
  alter column created_by set not null;

alter table public.stock_production
  alter column created_by set default auth.uid(),
  alter column created_by set not null;

alter table public.stock_items
  alter column created_by set default auth.uid(),
  alter column created_by set not null;

insert into public.roles (id, name) values
  ('admin', 'Administrador'),
  ('operador', 'Operador')
on conflict (id) do update set name = excluded.name;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_fkey foreign key (role) references public.roles(id);
  end if;
end $$;

insert into public.permissions (id, description) values
  ('dashboard.view', 'Ver dashboard e CRM gerencial'),
  ('cashier.access', 'Acessar frente de caixa'),
  ('sale.create', 'Finalizar vendas'),
  ('sale.cancel', 'Cancelar vendas'),
  ('cash.movement.create', 'Criar entradas e saidas'),
  ('cash.close', 'Fechar caixa'),
  ('stock.view', 'Ver estoque'),
  ('stock.create', 'Criar lancamentos de estoque'),
  ('products.view', 'Ver produtos'),
  ('products.manage', 'Gerenciar produtos'),
  ('users.manage', 'Gerenciar usuarios'),
  ('audit.view', 'Ver auditoria')
on conflict (id) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select 'admin', id from public.permissions
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id) values
  ('operador', 'cashier.access'),
  ('operador', 'sale.create'),
  ('operador', 'cash.movement.create'),
  ('operador', 'stock.view'),
  ('operador', 'stock.create'),
  ('operador', 'products.view')
on conflict do nothing;

create or replace function private.current_profile_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
  );
$$;

create or replace function private.current_profile_has_permission(_permission_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.role_permissions rp on rp.role_id = p.role
    where p.id = auth.uid()
      and p.is_active = true
      and (p.role = 'admin' or rp.permission_id = _permission_id)
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_profile_is_active() to authenticated;
grant execute on function private.current_profile_has_permission(text) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.permissions to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update on public.sales to authenticated;
grant select, insert, update on public.sale_items to authenticated;
grant select, insert, update on public.cash_movements to authenticated;
grant select, insert, update on public.cash_closings to authenticated;
grant select, insert, update on public.stock_production to authenticated;
grant select, insert, update on public.stock_items to authenticated;
grant select, insert on public.audit_logs to authenticated;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_closings enable row level security;
alter table public.stock_production enable row level security;
alter table public.stock_items enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "authenticated read profiles" on public.profiles;
drop policy if exists "authenticated read roles" on public.roles;
drop policy if exists "authenticated read permissions" on public.permissions;
drop policy if exists "authenticated read role permissions" on public.role_permissions;
drop policy if exists "authenticated all categories" on public.categories;
drop policy if exists "authenticated all products" on public.products;
drop policy if exists "authenticated all sales" on public.sales;
drop policy if exists "authenticated all sale items" on public.sale_items;
drop policy if exists "authenticated all cash movements" on public.cash_movements;
drop policy if exists "authenticated all cash closings" on public.cash_closings;
drop policy if exists "authenticated all stock production" on public.stock_production;
drop policy if exists "authenticated all stock items" on public.stock_items;
drop policy if exists "authenticated insert audit logs" on public.audit_logs;
drop policy if exists "authenticated read audit logs" on public.audit_logs;
drop policy if exists "active users read profiles" on public.profiles;
drop policy if exists "active users read own profile" on public.profiles;
drop policy if exists "user managers read profiles" on public.profiles;
drop policy if exists "user managers insert profiles" on public.profiles;
drop policy if exists "user managers update profiles" on public.profiles;
drop policy if exists "user managers delete profiles" on public.profiles;
drop policy if exists "active users read roles" on public.roles;
drop policy if exists "user managers read roles" on public.roles;
drop policy if exists "user managers write roles" on public.roles;
drop policy if exists "active users read permissions" on public.permissions;
drop policy if exists "user managers read permissions" on public.permissions;
drop policy if exists "user managers write permissions" on public.permissions;
drop policy if exists "active users read role permissions" on public.role_permissions;
drop policy if exists "user managers read role permissions" on public.role_permissions;
drop policy if exists "user managers write role permissions" on public.role_permissions;
drop policy if exists "product viewers read categories" on public.categories;
drop policy if exists "product managers insert categories" on public.categories;
drop policy if exists "product managers update categories" on public.categories;
drop policy if exists "product managers delete categories" on public.categories;
drop policy if exists "product viewers read products" on public.products;
drop policy if exists "product managers insert products" on public.products;
drop policy if exists "product managers update products" on public.products;
drop policy if exists "product managers delete products" on public.products;
drop policy if exists "cashier or dashboard read sales" on public.sales;
drop policy if exists "sale creators insert sales" on public.sales;
drop policy if exists "sale creators update sales" on public.sales;
drop policy if exists "sale cancelers update own sales" on public.sales;
drop policy if exists "cashier or dashboard read sale items" on public.sale_items;
drop policy if exists "sale creators insert sale items" on public.sale_items;
drop policy if exists "sale creators update sale items" on public.sale_items;
drop policy if exists "cashier or dashboard read cash movements" on public.cash_movements;
drop policy if exists "cash movement creators insert cash movements" on public.cash_movements;
drop policy if exists "cash movement creators update cash movements" on public.cash_movements;
drop policy if exists "cash closers or dashboard read cash closings" on public.cash_closings;
drop policy if exists "cash closers insert cash closings" on public.cash_closings;
drop policy if exists "cash closers update cash closings" on public.cash_closings;
drop policy if exists "stock viewers read stock production" on public.stock_production;
drop policy if exists "stock creators insert stock production" on public.stock_production;
drop policy if exists "stock creators update stock production" on public.stock_production;
drop policy if exists "stock viewers read stock items" on public.stock_items;
drop policy if exists "stock creators insert stock items" on public.stock_items;
drop policy if exists "stock creators update stock items" on public.stock_items;
drop policy if exists "active users insert own audit logs" on public.audit_logs;
drop policy if exists "audit viewers read audit logs" on public.audit_logs;

create policy "active users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() and is_active = true);
create policy "user managers read profiles" on public.profiles
  for select to authenticated using (private.current_profile_has_permission('users.manage'));
create policy "user managers insert profiles" on public.profiles
  for insert to authenticated with check (private.current_profile_has_permission('users.manage'));
create policy "user managers update profiles" on public.profiles
  for update to authenticated using (private.current_profile_has_permission('users.manage')) with check (private.current_profile_has_permission('users.manage'));
create policy "user managers delete profiles" on public.profiles
  for delete to authenticated using (private.current_profile_has_permission('users.manage'));

create policy "user managers read roles" on public.roles
  for select to authenticated using (private.current_profile_has_permission('users.manage'));
create policy "user managers write roles" on public.roles
  for all to authenticated using (private.current_profile_has_permission('users.manage')) with check (private.current_profile_has_permission('users.manage'));

create policy "user managers read permissions" on public.permissions
  for select to authenticated using (private.current_profile_has_permission('users.manage'));
create policy "user managers write permissions" on public.permissions
  for all to authenticated using (private.current_profile_has_permission('users.manage')) with check (private.current_profile_has_permission('users.manage'));

create policy "user managers read role permissions" on public.role_permissions
  for select to authenticated using (private.current_profile_has_permission('users.manage'));
create policy "user managers write role permissions" on public.role_permissions
  for all to authenticated using (private.current_profile_has_permission('users.manage')) with check (private.current_profile_has_permission('users.manage'));

create policy "product viewers read categories" on public.categories
  for select to authenticated using (private.current_profile_has_permission('products.view'));
create policy "product managers insert categories" on public.categories
  for insert to authenticated with check (private.current_profile_has_permission('products.manage'));
create policy "product managers update categories" on public.categories
  for update to authenticated using (private.current_profile_has_permission('products.manage')) with check (private.current_profile_has_permission('products.manage'));
create policy "product managers delete categories" on public.categories
  for delete to authenticated using (private.current_profile_has_permission('products.manage'));

create policy "product viewers read products" on public.products
  for select to authenticated using (private.current_profile_has_permission('products.view'));
create policy "product managers insert products" on public.products
  for insert to authenticated with check (private.current_profile_has_permission('products.manage'));
create policy "product managers update products" on public.products
  for update to authenticated using (private.current_profile_has_permission('products.manage')) with check (private.current_profile_has_permission('products.manage'));
create policy "product managers delete products" on public.products
  for delete to authenticated using (private.current_profile_has_permission('products.manage'));

create policy "cashier or dashboard read sales" on public.sales
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access'));
create policy "sale creators insert sales" on public.sales
  for insert to authenticated with check (private.current_profile_has_permission('sale.create') and created_by = auth.uid());
create policy "sale cancelers update own sales" on public.sales
  for update to authenticated using (private.current_profile_has_permission('sale.cancel') and created_by = auth.uid()) with check (private.current_profile_has_permission('sale.cancel') and created_by = auth.uid());

create policy "cashier or dashboard read sale items" on public.sale_items
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access'));
create policy "sale creators insert sale items" on public.sale_items
  for insert to authenticated with check (
    private.current_profile_has_permission('sale.create')
    and exists (
      select 1
      from public.sales s
      where s.id = sale_id
        and s.created_by = auth.uid()
    )
  );
create policy "sale creators update sale items" on public.sale_items
  for update to authenticated using (
    private.current_profile_has_permission('sale.create')
    and exists (
      select 1
      from public.sales s
      where s.id = sale_id
        and s.created_by = auth.uid()
    )
  ) with check (
    private.current_profile_has_permission('sale.create')
    and exists (
      select 1
      from public.sales s
      where s.id = sale_id
        and s.created_by = auth.uid()
    )
  );

create policy "cashier or dashboard read cash movements" on public.cash_movements
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access'));
create policy "cash movement creators insert cash movements" on public.cash_movements
  for insert to authenticated with check (private.current_profile_has_permission('cash.movement.create') and created_by = auth.uid());
create policy "cash movement creators update cash movements" on public.cash_movements
  for update to authenticated using (private.current_profile_has_permission('cash.movement.create') and created_by = auth.uid()) with check (private.current_profile_has_permission('cash.movement.create') and created_by = auth.uid());

create policy "cash closers or dashboard read cash closings" on public.cash_closings
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cash.close'));
create policy "cash closers insert cash closings" on public.cash_closings
  for insert to authenticated with check (private.current_profile_has_permission('cash.close') and created_by = auth.uid());
create policy "cash closers update cash closings" on public.cash_closings
  for update to authenticated using (private.current_profile_has_permission('cash.close') and created_by = auth.uid()) with check (private.current_profile_has_permission('cash.close') and created_by = auth.uid());

create policy "stock viewers read stock production" on public.stock_production
  for select to authenticated using (private.current_profile_has_permission('stock.view'));
create policy "stock creators insert stock production" on public.stock_production
  for insert to authenticated with check (private.current_profile_has_permission('stock.create') and created_by = auth.uid());
create policy "stock creators update stock production" on public.stock_production
  for update to authenticated using (private.current_profile_has_permission('stock.create') and created_by = auth.uid()) with check (private.current_profile_has_permission('stock.create') and created_by = auth.uid());

create policy "stock viewers read stock items" on public.stock_items
  for select to authenticated using (private.current_profile_has_permission('stock.view'));
create policy "stock creators insert stock items" on public.stock_items
  for insert to authenticated with check (private.current_profile_has_permission('stock.create') and created_by = auth.uid());
create policy "stock creators update stock items" on public.stock_items
  for update to authenticated using (private.current_profile_has_permission('stock.create') and created_by = auth.uid()) with check (private.current_profile_has_permission('stock.create') and created_by = auth.uid());

create policy "active users insert own audit logs" on public.audit_logs
  for insert to authenticated with check (private.current_profile_is_active() and user_id = auth.uid());
create policy "audit viewers read audit logs" on public.audit_logs
  for select to authenticated using (private.current_profile_has_permission('audit.view'));
