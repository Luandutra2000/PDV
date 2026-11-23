-- Ajustes de RLS para o envio de vendas, movimentos e fechamentos pelo PDV.
--
-- 1. Quem tem sale.cancel (administrador) pode cancelar qualquer venda, nao so as proprias.
-- 2. Operadores nao podem mais editar itens de venda depois de enviados.
-- 3. Movimentos de caixa (entrada/sangria) so podem ser alterados (cancelados) por quem tem sale.cancel.
--    Antes, o operador podia editar valor e status do proprio movimento a qualquer momento.
-- 4. Valores precisam ser validos (sem negativos, forma de pagamento conhecida).

drop policy if exists "sale cancelers update own sales" on public.sales;
drop policy if exists "sale cancelers update sales" on public.sales;
create policy "sale cancelers update sales" on public.sales
  for update to authenticated
  using (private.current_profile_has_permission(private.sale_cancel_permission_id()))
  with check (private.current_profile_has_permission(private.sale_cancel_permission_id()));

drop policy if exists "sale creators update sale items" on public.sale_items;
revoke update on public.sale_items from authenticated;

drop policy if exists "cash movement creators update cash movements" on public.cash_movements;
drop policy if exists "sale cancelers update cash movements" on public.cash_movements;
create policy "sale cancelers update cash movements" on public.cash_movements
  for update to authenticated
  using (private.current_profile_has_permission(private.sale_cancel_permission_id()))
  with check (private.current_profile_has_permission(private.sale_cancel_permission_id()));

alter table public.sales drop constraint if exists sales_values_check;
alter table public.sales add constraint sales_values_check check (
  total >= 0
  and received_amount >= 0
  and change_amount >= 0
  and payment_method in ('dinheiro', 'pix', 'debito', 'credito')
  and status in ('ativa', 'cancelada')
) not valid;

alter table public.sale_items drop constraint if exists sale_items_values_check;
alter table public.sale_items add constraint sale_items_values_check check (
  quantity > 0 and unit_price >= 0 and total >= 0
) not valid;

alter table public.cash_movements drop constraint if exists cash_movements_values_check;
alter table public.cash_movements add constraint cash_movements_values_check check (
  amount > 0 and status in ('ativa', 'cancelada')
) not valid;
