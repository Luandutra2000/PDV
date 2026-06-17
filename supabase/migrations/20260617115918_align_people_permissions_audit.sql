insert into public.roles (id, name) values
  ('admin', 'Administrador'),
  ('gerente', 'Gerente'),
  ('operador', 'Operador/Caixa'),
  ('dono', 'Visualizador/Dono')
on conflict (id) do update set name = excluded.name;

update public.profiles set role_id = 'operador' where role_id in ('caixa', 'operator');

insert into public.permissions (id, description) values
  ('sales.access', 'Acessar frente de caixa'),
  ('sales.create', 'Finalizar venda'),
  ('sales.cancel', 'Cancelar venda'),
  ('sales.discount', 'Aplicar desconto'),
  ('cash.movement', 'Registrar entrada'),
  ('cash.withdrawal', 'Registrar saida'),
  ('cash.close', 'Fechar caixa'),
  ('cash.balance.view', 'Ver saldo do caixa'),
  ('showcase.access', 'Acessar vitrine'),
  ('showcase.launch', 'Lancar producao'),
  ('showcase.edit', 'Editar vitrine'),
  ('stock.writeoff', 'Baixar estoque'),
  ('products.manage', 'Gerenciar produtos'),
  ('categories.manage', 'Gerenciar categorias'),
  ('reports.view', 'Ver relatorios'),
  ('crm.view', 'Ver CRM'),
  ('owner_app.view', 'Acessar App do Dono'),
  ('financial.expense.access', 'Acessar despesas'),
  ('financial.income.create', 'Criar entrada financeira'),
  ('financial.expense.create', 'Criar saida financeira'),
  ('financial.entries.edit', 'Editar lancamentos financeiros'),
  ('financial.entries.delete', 'Excluir lancamentos financeiros'),
  ('financial.categories.manage', 'Gerenciar categorias financeiras'),
  ('financial.bill.pay', 'Marcar conta como paga'),
  ('users.manage', 'Cadastrar usuarios'),
  ('users.edit', 'Editar usuarios'),
  ('permissions.manage', 'Editar permissoes'),
  ('audit.view', 'Ver auditoria'),
  ('data.export', 'Exportar dados')
on conflict (id) do update set description = excluded.description;

delete from public.role_permissions where role_id in ('admin', 'gerente', 'operador', 'dono');

insert into public.role_permissions (role_id, permission_id)
select 'admin', id from public.permissions
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id) values
  ('gerente', 'sales.access'),
  ('gerente', 'sales.create'),
  ('gerente', 'sales.cancel'),
  ('gerente', 'sales.discount'),
  ('gerente', 'cash.movement'),
  ('gerente', 'cash.withdrawal'),
  ('gerente', 'cash.close'),
  ('gerente', 'cash.balance.view'),
  ('gerente', 'showcase.access'),
  ('gerente', 'showcase.launch'),
  ('gerente', 'showcase.edit'),
  ('gerente', 'stock.writeoff'),
  ('gerente', 'products.manage'),
  ('gerente', 'categories.manage'),
  ('gerente', 'reports.view'),
  ('gerente', 'crm.view'),
  ('gerente', 'owner_app.view'),
  ('gerente', 'financial.expense.access'),
  ('gerente', 'financial.income.create'),
  ('gerente', 'financial.expense.create'),
  ('gerente', 'financial.entries.edit'),
  ('gerente', 'financial.categories.manage'),
  ('gerente', 'financial.bill.pay'),
  ('gerente', 'audit.view'),
  ('operador', 'sales.access'),
  ('operador', 'sales.create'),
  ('operador', 'cash.movement'),
  ('operador', 'cash.withdrawal'),
  ('operador', 'showcase.access'),
  ('operador', 'showcase.launch'),
  ('dono', 'cash.balance.view'),
  ('dono', 'reports.view'),
  ('dono', 'crm.view'),
  ('dono', 'owner_app.view'),
  ('dono', 'financial.expense.access'),
  ('dono', 'financial.income.create'),
  ('dono', 'financial.entries.edit'),
  ('dono', 'financial.entries.delete'),
  ('dono', 'financial.categories.manage'),
  ('dono', 'financial.bill.pay'),
  ('dono', 'audit.view')
on conflict do nothing;

create table if not exists public.user_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  state text not null check (state in ('allow', 'deny')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_id)
);

alter table public.user_permission_overrides enable row level security;

grant select, insert, update, delete on public.user_permission_overrides to authenticated;

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
    left join public.user_permission_overrides upo
      on upo.user_id = p.id and upo.permission_id = _permission_id
    left join public.role_permissions rp
      on rp.role_id = p.role_id and rp.permission_id = _permission_id
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role_id = 'admin'
        or upo.state = 'allow'
        or (upo.state is distinct from 'deny' and rp.permission_id = _permission_id)
      )
  );
$$;

grant execute on function private.current_profile_has_permission(text) to authenticated;

drop function if exists public.assert_can_change_admin_profile(uuid, text, boolean);
drop function if exists private.assert_can_change_admin_profile(uuid, text, boolean);

create or replace function public.update_profile_with_admin_guard(
  _profile_id uuid,
  _name text,
  _role_id text,
  _is_active boolean
)
returns table (
  id uuid,
  name text,
  role_id text,
  is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _current_role text;
  _current_active boolean;
  _other_active_admin_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('pvd.admin-profile-guard'));

  select p.role_id, p.is_active
    into _current_role, _current_active
  from public.profiles p
  where p.id = _profile_id
  for update;

  if not found then
    raise exception 'Usuario nao encontrado.' using errcode = 'P0002';
  end if;

  if _current_role = 'admin'
    and _current_active is true
    and (_role_id is distinct from 'admin' or _is_active is not true) then
    select count(*)
      into _other_active_admin_count
    from (
      select 1
      from public.profiles p
      where p.role_id = 'admin'
        and p.is_active = true
        and p.id <> _profile_id
      for update
    ) other_active_admins;

    if coalesce(_other_active_admin_count, 0) = 0 then
      raise exception 'Nao e permitido desativar o ultimo administrador ativo.' using errcode = 'P0001';
    end if;
  end if;

  return query
    update public.profiles p
    set
      name = _name,
      role_id = _role_id,
      is_active = _is_active,
      updated_at = now()
    where p.id = _profile_id
    returning p.id, p.name, p.role_id, p.is_active;
end;
$$;

revoke execute on function public.update_profile_with_admin_guard(uuid, text, text, boolean) from anon, authenticated;
grant execute on function public.update_profile_with_admin_guard(uuid, text, text, boolean) to service_role;

drop policy if exists "active users read user permission overrides" on public.user_permission_overrides;
create policy "active users read user permission overrides" on public.user_permission_overrides
  for select to authenticated using (private.current_profile_is_active());

drop policy if exists "permission managers manage user permission overrides" on public.user_permission_overrides;
create policy "permission managers manage user permission overrides" on public.user_permission_overrides
  for all to authenticated
  using (private.current_profile_has_permission('permissions.manage'))
  with check (private.current_profile_has_permission('permissions.manage'));

drop policy if exists "user managers manage profiles" on public.profiles;
drop policy if exists "user managers read profiles" on public.profiles;
create policy "user managers read profiles" on public.profiles
  for select to authenticated
  using (private.current_profile_has_permission('users.manage') or private.current_profile_has_permission('users.edit'));

drop policy if exists "user managers manage permissions" on public.permissions;
drop policy if exists "permission managers manage permissions" on public.permissions;
create policy "permission managers manage permissions" on public.permissions
  for all to authenticated
  using (private.current_profile_has_permission('permissions.manage'))
  with check (private.current_profile_has_permission('permissions.manage'));

drop policy if exists "user managers manage role permissions" on public.role_permissions;
drop policy if exists "permission managers manage role permissions" on public.role_permissions;
create policy "permission managers manage role permissions" on public.role_permissions
  for all to authenticated
  using (private.current_profile_has_permission('permissions.manage'))
  with check (private.current_profile_has_permission('permissions.manage'));
