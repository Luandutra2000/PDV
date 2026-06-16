grant select, insert, update on table public.financial_categories to anon;
grant select, insert, update on table public.financial_transactions to anon;

drop policy if exists "anon users read financial categories for pdv sync" on public.financial_categories;
create policy "anon users read financial categories for pdv sync" on public.financial_categories
  for select to anon using (true);

drop policy if exists "anon users insert financial categories for pdv sync" on public.financial_categories;
create policy "anon users insert financial categories for pdv sync" on public.financial_categories
  for insert to anon with check (true);

drop policy if exists "anon users update financial categories for pdv sync" on public.financial_categories;
create policy "anon users update financial categories for pdv sync" on public.financial_categories
  for update to anon using (true) with check (true);

drop policy if exists "anon users read financial transactions for pdv sync" on public.financial_transactions;
create policy "anon users read financial transactions for pdv sync" on public.financial_transactions
  for select to anon using (true);

drop policy if exists "anon users insert financial transactions for pdv sync" on public.financial_transactions;
create policy "anon users insert financial transactions for pdv sync" on public.financial_transactions
  for insert to anon with check (true);

drop policy if exists "anon users update financial transactions for pdv sync" on public.financial_transactions;
create policy "anon users update financial transactions for pdv sync" on public.financial_transactions
  for update to anon using (true) with check (true);
