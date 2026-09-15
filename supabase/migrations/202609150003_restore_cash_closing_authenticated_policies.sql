drop policy if exists "cash closers read cash closings" on public.cash_closings;
drop policy if exists "cash closers manage cash closings" on public.cash_closings;

create policy "cash closers read cash closings" on public.cash_closings
  for select to authenticated
  using (
    private.current_profile_has_permission('dashboard.view')
    or private.current_profile_has_permission('cash.close')
  );

create policy "cash closers manage cash closings" on public.cash_closings
  for all to authenticated
  using (private.current_profile_has_permission('cash.close'))
  with check (private.current_profile_has_permission('cash.close'));
