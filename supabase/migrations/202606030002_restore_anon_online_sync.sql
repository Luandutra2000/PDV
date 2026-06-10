create policy "anon users read categories for pdv sync" on public.categories
  for select to anon using (true);
create policy "anon users insert categories for pdv sync" on public.categories
  for insert to anon with check (true);
create policy "anon users update categories for pdv sync" on public.categories
  for update to anon using (true) with check (true);

create policy "anon users read products for pdv sync" on public.products
  for select to anon using (true);
create policy "anon users insert products for pdv sync" on public.products
  for insert to anon with check (true);
create policy "anon users update products for pdv sync" on public.products
  for update to anon using (true) with check (true);

create policy "anon users read commands for pdv sync" on public.commands
  for select to anon using (true);
create policy "anon users insert commands for pdv sync" on public.commands
  for insert to anon with check (true);
create policy "anon users update commands for pdv sync" on public.commands
  for update to anon using (true) with check (true);

create policy "anon users read command items for pdv sync" on public.command_items
  for select to anon using (true);
create policy "anon users insert command items for pdv sync" on public.command_items
  for insert to anon with check (true);
create policy "anon users update command items for pdv sync" on public.command_items
  for update to anon using (true) with check (true);

create policy "anon users read sales for pdv sync" on public.sales
  for select to anon using (true);
create policy "anon users insert sales for pdv sync" on public.sales
  for insert to anon with check (true);
create policy "anon users update sales for pdv sync" on public.sales
  for update to anon using (true) with check (true);

create policy "anon users read sale items for pdv sync" on public.sale_items
  for select to anon using (true);
create policy "anon users insert sale items for pdv sync" on public.sale_items
  for insert to anon with check (true);
create policy "anon users update sale items for pdv sync" on public.sale_items
  for update to anon using (true) with check (true);

create policy "anon users read cash movements for pdv sync" on public.cash_movements
  for select to anon using (true);
create policy "anon users insert cash movements for pdv sync" on public.cash_movements
  for insert to anon with check (true);
create policy "anon users update cash movements for pdv sync" on public.cash_movements
  for update to anon using (true) with check (true);

create policy "anon users read cash closings for pdv sync" on public.cash_closings
  for select to anon using (true);
create policy "anon users insert cash closings for pdv sync" on public.cash_closings
  for insert to anon with check (true);
create policy "anon users update cash closings for pdv sync" on public.cash_closings
  for update to anon using (true) with check (true);

create policy "anon users read stock production for pdv sync" on public.stock_production
  for select to anon using (true);
create policy "anon users insert stock production for pdv sync" on public.stock_production
  for insert to anon with check (true);
create policy "anon users update stock production for pdv sync" on public.stock_production
  for update to anon using (true) with check (true);

create policy "anon users read showcase write offs for pdv sync" on public.showcase_write_offs
  for select to anon using (true);
create policy "anon users insert showcase write offs for pdv sync" on public.showcase_write_offs
  for insert to anon with check (true);
create policy "anon users update showcase write offs for pdv sync" on public.showcase_write_offs
  for update to anon using (true) with check (true);
