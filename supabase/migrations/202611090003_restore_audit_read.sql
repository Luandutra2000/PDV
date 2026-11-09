-- QA 2026-11, BUG-018: o administrador grava auditoria (insert 201) mas le 0
-- linhas. O repositorio ja tem a politica "audit viewers read audit logs", mas
-- o banco de producao tem 8 migracoes aplicadas que existem aqui so como
-- placeholder; a leitura (politica ou GRANT) pode ter sido removida em uma
-- delas. Esta migracao e idempotente: recria a politica e o GRANT de leitura.
-- Nao foi aplicada pelo QA: conferir `select * from pg_policies where
-- tablename = 'audit_logs'` antes e depois de aplicar.
begin;

grant select on table public.audit_logs to authenticated;

drop policy if exists "audit viewers read audit logs" on public.audit_logs;
create policy "audit viewers read audit logs" on public.audit_logs
  for select to authenticated
  using (private.current_profile_has_permission('audit.view'));

commit;
