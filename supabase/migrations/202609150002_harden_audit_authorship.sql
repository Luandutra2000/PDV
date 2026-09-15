-- Client audit is insert-only. Administrative service-role writes keep their verified actor.
begin;

drop policy if exists "active users insert audit logs" on public.audit_logs;
create policy "active users insert audit logs" on public.audit_logs
  for insert to authenticated
  with check (private.current_profile_is_active() and user_id = auth.uid());

create or replace function private.verify_audit_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'Audit author must match authenticated user' using errcode = '42501';
    end if;
    select p.name into new.user_name from public.profiles p
    where p.id = auth.uid() and p.is_active = true;
    if not found then
      raise exception 'Active audit author required' using errcode = '42501';
    end if;
  elsif auth.role() is distinct from 'service_role' then
    raise exception 'Authentication required for audit' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.verify_audit_author() from public;
drop trigger if exists verify_audit_author on public.audit_logs;
create trigger verify_audit_author before insert on public.audit_logs
  for each row execute function private.verify_audit_author();

commit;
