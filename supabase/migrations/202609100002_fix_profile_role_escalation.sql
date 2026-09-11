alter table public.profiles
  add constraint profiles_role_id_valid
  check (role_id in ('admin', 'gerente', 'caixa', 'operador', 'dono'));

revoke update (role_id, is_active) on table public.profiles from authenticated;
grant update (name, empresa_id, updated_at) on table public.profiles to authenticated;
