create schema if not exists private;

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

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role_id'
  ) then
    execute $fn$
      create or replace function private.current_profile_has_permission(_permission_id text)
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select exists (
          select 1
          from public.profiles p
          left join public.role_permissions rp on rp.role_id = p.role_id
          where p.id = auth.uid()
            and p.is_active = true
            and (p.role_id = 'admin' or rp.permission_id = _permission_id)
        );
      $body$;
    $fn$;
  else
    execute $fn$
      create or replace function private.current_profile_has_permission(_permission_id text)
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select exists (
          select 1
          from public.profiles p
          left join public.role_permissions rp on rp.role_id = p.role
          where p.id = auth.uid()
            and p.is_active = true
            and (p.role = 'admin' or rp.permission_id = _permission_id)
        );
      $body$;
    $fn$;
  end if;
end $$;

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

grant usage on schema private to authenticated;
grant execute on function private.current_profile_is_active() to authenticated;
grant execute on function private.current_profile_has_permission(text) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select on public.role_permissions to authenticated;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "product viewers read categories" on public.categories;
drop policy if exists "product managers manage categories" on public.categories;
drop policy if exists "product viewers read products" on public.products;
drop policy if exists "product managers manage products" on public.products;
drop policy if exists "active users read own profile" on public.profiles;
drop policy if exists "user managers read profiles" on public.profiles;
drop policy if exists "user managers manage profiles" on public.profiles;

create policy "product viewers read categories" on public.categories
  for select to authenticated using (private.current_profile_has_permission('products.view'));

create policy "product managers manage categories" on public.categories
  for all to authenticated using (private.current_profile_has_permission('products.manage')) with check (private.current_profile_has_permission('products.manage'));

create policy "product viewers read products" on public.products
  for select to authenticated using (private.current_profile_has_permission('products.view'));

create policy "product managers manage products" on public.products
  for all to authenticated using (private.current_profile_has_permission('products.manage')) with check (private.current_profile_has_permission('products.manage'));

create policy "active users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() and is_active = true);

create policy "user managers manage profiles" on public.profiles
  for all to authenticated using (private.current_profile_has_permission('users.manage')) with check (private.current_profile_has_permission('users.manage'));
