grant delete on table public.products to anon;
grant delete on table public.categories to anon;

create policy "anon users delete products for pdv sync" on public.products
  for delete to anon using (true);

create policy "anon users delete categories for pdv sync" on public.categories
  for delete to anon using (true);
