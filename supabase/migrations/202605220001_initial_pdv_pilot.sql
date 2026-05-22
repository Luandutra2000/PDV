create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'operador',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  created_by uuid references public.profiles(id),
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
  created_by uuid references public.profiles(id),
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
  created_by uuid references public.profiles(id),
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
  created_by uuid references public.profiles(id),
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
  created_by uuid references public.profiles(id),
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

insert into public.roles (id, name) values
  ('admin', 'Administrador'),
  ('operador', 'Operador')
on conflict (id) do update set name = excluded.name;

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
  ('operador', 'products.view')
on conflict do nothing;

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

create policy "authenticated read profiles" on public.profiles
  for select to authenticated using (is_active = true);
create policy "authenticated read roles" on public.roles
  for select to authenticated using (true);
create policy "authenticated read permissions" on public.permissions
  for select to authenticated using (true);
create policy "authenticated read role permissions" on public.role_permissions
  for select to authenticated using (true);
create policy "authenticated all categories" on public.categories
  for all to authenticated using (true) with check (true);
create policy "authenticated all products" on public.products
  for all to authenticated using (true) with check (true);
create policy "authenticated all sales" on public.sales
  for all to authenticated using (true) with check (true);
create policy "authenticated all sale items" on public.sale_items
  for all to authenticated using (true) with check (true);
create policy "authenticated all cash movements" on public.cash_movements
  for all to authenticated using (true) with check (true);
create policy "authenticated all cash closings" on public.cash_closings
  for all to authenticated using (true) with check (true);
create policy "authenticated all stock production" on public.stock_production
  for all to authenticated using (true) with check (true);
create policy "authenticated all stock items" on public.stock_items
  for all to authenticated using (true) with check (true);
create policy "authenticated insert audit logs" on public.audit_logs
  for insert to authenticated with check (true);
create policy "authenticated read audit logs" on public.audit_logs
  for select to authenticated using (true);
