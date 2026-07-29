insert into public.roles (id, name) values
  ('admin', 'Administrador'),
  ('gerente', 'Gerente'),
  ('caixa', 'Caixa'),
  ('operador', 'Operador/Caixa'),
  ('dono', 'Visualizador/Dono')
on conflict (id) do update set name = excluded.name;

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

delete from public.role_permissions
where role_id in ('admin', 'gerente', 'caixa', 'operador', 'dono');

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
  ('caixa', 'sales.access'),
  ('caixa', 'sales.create'),
  ('caixa', 'cash.movement'),
  ('caixa', 'cash.withdrawal'),
  ('caixa', 'cash.close'),
  ('caixa', 'cash.balance.view'),
  ('caixa', 'showcase.access'),
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

drop policy if exists "active users read user permission overrides" on public.user_permission_overrides;
create policy "active users read user permission overrides" on public.user_permission_overrides
  for select to authenticated using (private.current_profile_is_active());

drop policy if exists "permission managers manage user permission overrides" on public.user_permission_overrides;
create policy "permission managers manage user permission overrides" on public.user_permission_overrides
  for all to authenticated
  using (private.current_profile_has_permission('permissions.manage'))
  with check (private.current_profile_has_permission('permissions.manage'));

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
    left join public.user_permission_overrides upo
      on upo.user_id = p.id and upo.permission_id = _permission_id
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role_id = 'admin'
        or upo.state = 'allow'
        or (upo.state is distinct from 'deny' and rp.permission_id = _permission_id)
      )
  );
$$;

drop policy if exists "user managers manage profiles" on public.profiles;
create policy "user managers manage profiles" on public.profiles
  for all to authenticated
  using (private.current_profile_has_permission('users.manage') or private.current_profile_has_permission('users.edit'))
  with check (private.current_profile_has_permission('users.manage') or private.current_profile_has_permission('users.edit'));

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

drop policy if exists "cash users manage movements" on public.cash_movements;
create policy "cash users manage movements" on public.cash_movements
  for all to authenticated
  using (private.current_profile_has_permission('cash.movement') or private.current_profile_has_permission('cash.withdrawal'))
  with check (private.current_profile_has_permission('cash.movement') or private.current_profile_has_permission('cash.withdrawal'));

drop policy if exists "stock viewers read production" on public.stock_production;
drop policy if exists "showcase users read production" on public.stock_production;
create policy "showcase users read production" on public.stock_production
  for select to authenticated using (private.current_profile_has_permission('showcase.access'));

drop policy if exists "stock creators manage production" on public.stock_production;
drop policy if exists "showcase launchers manage production" on public.stock_production;
create policy "showcase launchers manage production" on public.stock_production
  for all to authenticated using (private.current_profile_has_permission('showcase.launch')) with check (private.current_profile_has_permission('showcase.launch'));

drop policy if exists "stock viewers read showcase write offs" on public.showcase_write_offs;
drop policy if exists "showcase users read showcase write offs" on public.showcase_write_offs;
create policy "showcase users read showcase write offs" on public.showcase_write_offs
  for select to authenticated using (private.current_profile_has_permission('showcase.access'));

drop policy if exists "stock creators manage showcase write offs" on public.showcase_write_offs;
drop policy if exists "stock writeoff users manage showcase write offs" on public.showcase_write_offs;
create policy "stock writeoff users manage showcase write offs" on public.showcase_write_offs
  for all to authenticated using (private.current_profile_has_permission('stock.writeoff') or private.current_profile_has_permission('showcase.launch')) with check (private.current_profile_has_permission('stock.writeoff') or private.current_profile_has_permission('showcase.launch'));
