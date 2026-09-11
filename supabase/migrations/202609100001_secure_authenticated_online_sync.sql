do $$
declare
  target_table text;
  current_policy record;
begin
  foreach target_table in array array[
    'categories',
    'products',
    'commands',
    'command_items',
    'sales',
    'sale_items',
    'cash_movements',
    'cash_closings',
    'stock_production',
    'showcase_write_offs',
    'financial_categories',
    'financial_transactions'
  ]
  loop
    for current_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and roles @> array['anon']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', current_policy.policyname, target_table);
    end loop;

    execute format('revoke all on table public.%I from anon', target_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', target_table);
  end loop;
end $$;

create or replace function private.can_update_profile(
  target_user_id uuid,
  next_role_id text,
  next_is_active boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and actor.is_active = true
      and (
        private.current_profile_has_permission('users.manage')
        or (
          private.current_profile_has_permission('users.edit')
          and target_user_id = auth.uid()
          and next_role_id = actor.role_id
          and next_is_active = actor.is_active
        )
      )
  );
$$;

drop policy if exists "user managers manage profiles" on public.profiles;
drop policy if exists "profile managers manage profiles" on public.profiles;
drop policy if exists "profile editors update safe fields" on public.profiles;

create policy "profile managers manage profiles" on public.profiles
  for all to authenticated
  using (private.current_profile_has_permission('users.manage'))
  with check (private.current_profile_has_permission('users.manage'));

create policy "profile editors update safe fields" on public.profiles
  for update to authenticated
  using (private.can_update_profile(id, role_id, is_active))
  with check (private.can_update_profile(id, role_id, is_active));
