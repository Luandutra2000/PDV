-- QA 2026-11, BUG-017: operador e caixa nao conseguem ler o catalogo.
--
-- As politicas de leitura de products/categories exigem 'products.view', que
-- so o perfil admin possui. Desde 202609100001 (remocao do acesso anonimo),
-- operador, caixa e dono recebem 0 produtos e 0 categorias: a frente de caixa
-- fica vazia e nao e possivel vender nem lancar vitrine.
--
-- Esta migracao so ADICIONA leitura (politicas permissivas sao combinadas com
-- OR). Escrita continua exigindo 'products.manage'.
-- Nao foi aplicada pelo QA: revisar e aplicar com `npx supabase db push`.
begin;

drop policy if exists "catalog readers read products" on public.products;
create policy "catalog readers read products" on public.products
  for select to authenticated
  using (
    private.current_profile_has_permission('products.view')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('showcase.access')
    or private.current_profile_has_permission('owner_app.view')
    or private.current_profile_has_permission('reports.view')
  );

drop policy if exists "catalog readers read categories" on public.categories;
create policy "catalog readers read categories" on public.categories
  for select to authenticated
  using (
    private.current_profile_has_permission('products.view')
    or private.current_profile_has_permission('sales.access')
    or private.current_profile_has_permission('showcase.access')
    or private.current_profile_has_permission('owner_app.view')
    or private.current_profile_has_permission('reports.view')
  );

commit;
