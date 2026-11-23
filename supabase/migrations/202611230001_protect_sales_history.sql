-- Vendas, comandas e caixa sao registro permanente (2026-11-23).
--
-- Antes: "sales users manage sale items online" e "... command items online" eram
-- `for all`, entao qualquer perfil com sale.create (operador incluido) podia mudar
-- preco/quantidade ou apagar itens de vendas ja enviadas. O botao "Limpar historico"
-- (removido do app) apagava os itens no servidor, mas a venda ficava (sales nao tem
-- politica de delete), deixando vendas sem itens.
--
-- Depois: itens de venda e de comanda so podem ser inseridos; ninguem apaga venda,
-- item, comanda, movimento de caixa ou fechamento pelo app. Correcoes continuam
-- sendo feitas por cancelamento (update de status), que nao muda.
-- Limpeza administrativa (dados de teste) continua possivel no SQL Editor.

begin;

-- Itens de venda: leitura (politica existente) e insercao; sem update/delete.
drop policy if exists "sales users manage sale items online" on public.sale_items;
drop policy if exists "sales users insert sale items online" on public.sale_items;
create policy "sales users insert sale items online" on public.sale_items
  for insert to authenticated
  with check (private.current_profile_has_permission('sales.create') or private.current_profile_has_permission('sale.create'));

-- Itens de comanda: idem.
drop policy if exists "sales users manage command items online" on public.command_items;
drop policy if exists "sales users insert command items online" on public.command_items;
create policy "sales users insert command items online" on public.command_items
  for insert to authenticated
  with check (
    private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
  );

-- Comandas: criar e atualizar (cancelamento) continuam; apagar nao.
drop policy if exists "sales users manage commands online" on public.commands;
drop policy if exists "sales users insert commands online" on public.commands;
drop policy if exists "sales users update commands online" on public.commands;
create policy "sales users insert commands online" on public.commands
  for insert to authenticated
  with check (
    private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
  );
create policy "sales users update commands online" on public.commands
  for update to authenticated
  using (
    private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
  )
  with check (
    private.current_profile_has_permission('cashier.access')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('sales.create')
    or private.current_profile_has_permission('sale.create')
  );

-- Sem privilegio de apagar o historico, qualquer que seja a politica.
revoke delete on table
  public.sales,
  public.sale_items,
  public.commands,
  public.command_items,
  public.cash_movements,
  public.cash_closings
from authenticated, anon;

-- Itens nao mudam depois de gravados.
revoke update on table public.sale_items, public.command_items from authenticated, anon;

commit;
