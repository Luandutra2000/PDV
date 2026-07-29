grant delete on table public.products to anon;
grant delete on table public.categories to anon;

drop policy if exists "anon users delete products for pdv sync" on public.products;
create policy "anon users delete products for pdv sync" on public.products
  for delete to anon using (true);

drop policy if exists "anon users delete categories for pdv sync" on public.categories;
create policy "anon users delete categories for pdv sync" on public.categories
  for delete to anon using (true);
