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
  role_id text not null default 'operador' references public.roles(id),
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

create table if not exists public.cash_sessions (
  id text primary key,
  status text not null default 'aberto' check (status in ('aberto', 'fechado', 'cancelado')),
  initial_amount numeric(12,2) not null default 0,
  current_amount numeric(12,2) not null default 0,
  opened_by uuid default auth.uid() references public.profiles(id),
  closed_by uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.commands (
  id text primary key,
  number integer not null,
  status text not null default 'aberta' check (status in ('aberta', 'fechada', 'cancelada')),
  total numeric(12,2) not null default 0,
  payment_method text,
  received_amount numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  canceled_at timestamptz
);

create table if not exists public.command_items (
  id uuid primary key default gen_random_uuid(),
  command_id text not null references public.commands(id) on delete cascade,
  product_id text not null references public.products(id),
  name text not null,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id text primary key,
  status text not null default 'ativa' check (status in ('ativa', 'cancelada')),
  command_id text references public.commands(id),
  command_number integer,
  total numeric(12,2) not null default 0,
  payment_method text not null,
  received_amount numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  cash_session_id text references public.cash_sessions(id),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.sale_items (
  id text primary key,
  sale_id text not null references public.sales(id) on delete cascade,
  product_id text not null references public.products(id),
  name text not null,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  total numeric(12,2) not null
);

create table if not exists public.cash_movements (
  id text primary key,
  type text not null check (type in ('entrada', 'saida', 'sangria')),
  status text not null default 'ativa' check (status in ('ativa', 'cancelada')),
  amount numeric(12,2) not null,
  category text not null default 'sem-categoria',
  description text not null default '',
  user_name text not null default 'Local',
  cash_session_id text references public.cash_sessions(id),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.cash_closings (
  id text primary key,
  status text not null default 'fechado' check (status in ('rascunho', 'fechado', 'cancelado')),
  cash_session_id text references public.cash_sessions(id),
  totals jsonb not null default '{}'::jsonb,
  payments jsonb not null default '{}'::jsonb,
  showcase jsonb not null default '[]'::jsonb,
  differences jsonb not null default '[]'::jsonb,
  input jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references public.profiles(id),
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
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.showcase_write_offs (
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
  status text not null default 'ativa' check (status in ('ativa', 'cancelada')),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.notifications (
  id text primary key,
  type text not null,
  level text not null default 'info' check (level in ('info', 'success', 'warning', 'danger')),
  title text not null,
  message text not null default '',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id),
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

create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_active_idx on public.products(active);
create index if not exists commands_created_at_idx on public.commands(created_at desc);
create index if not exists sales_created_at_idx on public.sales(created_at desc);
create index if not exists sales_status_idx on public.sales(status);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);
create index if not exists cash_movements_created_at_idx on public.cash_movements(created_at desc);
create index if not exists cash_closings_closed_at_idx on public.cash_closings(closed_at desc);
create index if not exists stock_production_created_at_idx on public.stock_production(created_at desc);
create index if not exists showcase_write_offs_created_at_idx on public.showcase_write_offs(created_at desc);
create index if not exists notifications_created_at_idx on public.notifications(created_at desc);

insert into public.roles (id, name) values
  ('admin', 'Administrador'),
  ('dono', 'Dono'),
  ('operador', 'Operador')
on conflict (id) do update set name = excluded.name;

insert into public.permissions (id, description) values
  ('dashboard.view', 'Ver dashboard e CRM gerencial'),
  ('owner_app.view', 'Ver App do Dono'),
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

insert into public.role_permissions (role_id, permission_id)
select 'dono', id from public.permissions
where id <> 'users.manage'
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
    left join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = auth.uid()
      and p.is_active = true
      and (p.role_id = 'admin' or rp.permission_id = _permission_id)
  );
$$;

create or replace function private.no_profiles_exist()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles);
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_profile_is_active() to authenticated;
grant execute on function private.current_profile_has_permission(text) to authenticated;
grant execute on function private.no_profiles_exist() to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.commands enable row level security;
alter table public.command_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_closings enable row level security;
alter table public.stock_production enable row level security;
alter table public.showcase_write_offs enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

do $$
declare
  current_policy record;
begin
  for current_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'roles',
        'permissions',
        'role_permissions',
        'categories',
        'products',
        'cash_sessions',
        'commands',
        'command_items',
        'sales',
        'sale_items',
        'cash_movements',
        'cash_closings',
        'stock_production',
        'showcase_write_offs',
        'notifications',
        'audit_logs'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', current_policy.policyname, current_policy.schemaname, current_policy.tablename);
  end loop;
end $$;

create policy "active users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() and is_active = true);
create policy "first user creates owner profile" on public.profiles
  for insert to authenticated with check (id = auth.uid() and role_id = 'admin' and private.no_profiles_exist());
create policy "user managers manage profiles" on public.profiles
  for all to authenticated using (private.current_profile_has_permission('users.manage')) with check (private.current_profile_has_permission('users.manage'));

create policy "active users read roles" on public.roles
  for select to authenticated using (private.current_profile_is_active());
create policy "user managers manage roles" on public.roles
  for all to authenticated using (private.current_profile_has_permission('users.manage')) with check (private.current_profile_has_permission('users.manage'));

create policy "active users read permissions" on public.permissions
  for select to authenticated using (private.current_profile_is_active());
create policy "user managers manage permissions" on public.permissions
  for all to authenticated using (private.current_profile_has_permission('users.manage')) with check (private.current_profile_has_permission('users.manage'));

create policy "active users read role permissions" on public.role_permissions
  for select to authenticated using (private.current_profile_is_active());
create policy "user managers manage role permissions" on public.role_permissions
  for all to authenticated using (private.current_profile_has_permission('users.manage')) with check (private.current_profile_has_permission('users.manage'));

create policy "product viewers read categories" on public.categories
  for select to authenticated using (private.current_profile_has_permission('products.view'));
create policy "product managers manage categories" on public.categories
  for all to authenticated using (private.current_profile_has_permission('products.manage')) with check (private.current_profile_has_permission('products.manage'));

create policy "product viewers read products" on public.products
  for select to authenticated using (private.current_profile_has_permission('products.view'));
create policy "product managers manage products" on public.products
  for all to authenticated using (private.current_profile_has_permission('products.manage')) with check (private.current_profile_has_permission('products.manage'));

create policy "cash users read sessions" on public.cash_sessions
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access'));
create policy "cash users manage sessions" on public.cash_sessions
  for all to authenticated using (private.current_profile_has_permission('cashier.access')) with check (private.current_profile_has_permission('cashier.access'));

create policy "cash users read commands" on public.commands
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access'));
create policy "cash users manage commands" on public.commands
  for all to authenticated using (private.current_profile_has_permission('cashier.access')) with check (private.current_profile_has_permission('cashier.access'));

create policy "cash users read command items" on public.command_items
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access'));
create policy "cash users manage command items" on public.command_items
  for all to authenticated using (private.current_profile_has_permission('cashier.access')) with check (private.current_profile_has_permission('cashier.access'));

create policy "cash users read sales" on public.sales
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access'));
create policy "sale creators insert sales" on public.sales
  for insert to authenticated with check (private.current_profile_has_permission('sale.create'));
create policy "sale cancelers update sales" on public.sales
  for update to authenticated using (private.current_profile_has_permission('sale.cancel')) with check (private.current_profile_has_permission('sale.cancel'));

create policy "cash users read sale items" on public.sale_items
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access'));
create policy "sale creators manage sale items" on public.sale_items
  for all to authenticated using (private.current_profile_has_permission('sale.create')) with check (private.current_profile_has_permission('sale.create'));

create policy "cash users read cash movements" on public.cash_movements
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cashier.access'));
create policy "cash movement creators manage cash movements" on public.cash_movements
  for all to authenticated using (private.current_profile_has_permission('cash.movement.create')) with check (private.current_profile_has_permission('cash.movement.create'));

create policy "cash closers read cash closings" on public.cash_closings
  for select to authenticated using (private.current_profile_has_permission('dashboard.view') or private.current_profile_has_permission('cash.close'));
create policy "cash closers manage cash closings" on public.cash_closings
  for all to authenticated using (private.current_profile_has_permission('cash.close')) with check (private.current_profile_has_permission('cash.close'));

create policy "stock viewers read stock production" on public.stock_production
  for select to authenticated using (private.current_profile_has_permission('stock.view'));
create policy "stock creators manage stock production" on public.stock_production
  for all to authenticated using (private.current_profile_has_permission('stock.create')) with check (private.current_profile_has_permission('stock.create'));

create policy "stock viewers read showcase write offs" on public.showcase_write_offs
  for select to authenticated using (private.current_profile_has_permission('stock.view'));
create policy "stock creators manage showcase write offs" on public.showcase_write_offs
  for all to authenticated using (private.current_profile_has_permission('stock.create')) with check (private.current_profile_has_permission('stock.create'));

create policy "owner app users read notifications" on public.notifications
  for select to authenticated using (private.current_profile_has_permission('owner_app.view'));
create policy "active users insert notifications" on public.notifications
  for insert to authenticated with check (private.current_profile_is_active());
create policy "owner app users update notifications" on public.notifications
  for update to authenticated using (private.current_profile_has_permission('owner_app.view')) with check (private.current_profile_has_permission('owner_app.view'));

create policy "active users insert audit logs" on public.audit_logs
  for insert to authenticated with check (private.current_profile_is_active());
create policy "audit viewers read audit logs" on public.audit_logs
  for select to authenticated using (private.current_profile_has_permission('audit.view'));
