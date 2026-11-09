-- QA 2026-11, BUG-011: a sessao de caixa (troco inicial) ficava so no aparelho.
-- As politicas de cash_sessions exigem 'cashier.access'/'dashboard.view', que so
-- o admin possui. Libera leitura e gravacao para quem opera o caixa e leitura
-- para o App do dono. Nao foi aplicada pelo QA: revisar e aplicar com
-- `npx supabase db push`.
begin;

drop policy if exists "cashiers read sessions" on public.cash_sessions;
create policy "cashiers read sessions" on public.cash_sessions
  for select to authenticated
  using (
    private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('cash.close')
    or private.current_profile_has_permission('owner_app.view')
  );

drop policy if exists "cashiers write sessions" on public.cash_sessions;
create policy "cashiers write sessions" on public.cash_sessions
  for insert to authenticated
  with check (
    private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('cash.close')
  );

drop policy if exists "cashiers update sessions" on public.cash_sessions;
create policy "cashiers update sessions" on public.cash_sessions
  for update to authenticated
  using (
    private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('cash.close')
  )
  with check (
    private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('cash.close')
  );

commit;
