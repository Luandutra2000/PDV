-- Limpeza dos dados de teste da auditoria QA de novembro/2026 no Supabase de producao.
-- NAO e migracao: rode manualmente no SQL Editor, como dono do projeto.
--
-- Como a QA marcou os dados (qa-pdv/README.md):
--   * produtos e categorias com id iniciado por "qa-";
--   * vendas feitas pela automacao entre 25/10/2026 e 08/11/2026 (com itens "qa-");
--   * movimentos de caixa com descricao iniciada por "QA";
--   * fechamentos de caixa dessas datas (a QA registrou 18).
-- Numeros esperados segundo o relatorio da QA: cerca de 415 vendas, 18 fechamentos,
-- 13 produtos e 4 categorias "qa-".
--
-- Faca antes um backup (Database > Backups ou exportacao das tabelas).
-- A auditoria (audit_logs) NAO e apagada: ela e o registro do que aconteceu.
--
-- =====================================================================
-- PARTE 1 - CONFERIR (so leitura). Rode e compare com os numeros acima.
-- =====================================================================

with
  qa_sales as (
    select distinct s.id
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    where si.product_id like 'qa-%'
  ),
  qa_window_sales_without_qa_items as (
    select s.id
    from public.sales s
    where s.created_at >= timestamptz '2026-10-25 00:00:00-03'
      and s.created_at <  timestamptz '2026-11-09 00:00:00-03'
      and s.id not in (select id from qa_sales)
  )
select 'vendas com itens qa- (serao apagadas)' as item, count(*) as quantidade from qa_sales
union all select 'vendas do periodo QA SEM itens qa- (NAO serao apagadas; confira)', count(*) from qa_window_sales_without_qa_items
union all select 'comandas ligadas a essas vendas', count(distinct s.command_id) from public.sales s where s.id in (select id from qa_sales) and s.command_id is not null
union all select 'movimentos de caixa "QA..."', count(*) from public.cash_movements where description ilike 'qa%'
union all select 'lancamentos financeiros ligados', count(*) from public.financial_transactions ft
  where ft.cash_movement_id in (select id from public.cash_movements where description ilike 'qa%') or ft.description ilike 'qa%'
union all select 'fechamentos de 25/10 a 08/11/2026', count(*) from public.cash_closings
  where closed_at >= timestamptz '2026-10-25 00:00:00-03' and closed_at < timestamptz '2026-11-09 00:00:00-03'
union all select 'movimentos de vitrine de produtos qa-', count(*) from public.showcase_movements where product_id like 'qa-%'
union all select 'vendas sem estoque de produtos qa-', count(*) from public.out_of_stock_sales where product_id like 'qa-%'
union all select 'producao da vitrine de produtos qa-', count(*) from public.stock_production where product_id like 'qa-%'
union all select 'perdas da vitrine de produtos qa-', count(*) from public.showcase_write_offs where product_id like 'qa-%'
union all select 'saldo de vitrine de produtos qa-', count(*) from public.product_stock where product_id like 'qa-%'
union all select 'produtos qa-', count(*) from public.products where id like 'qa-%'
union all select 'categorias qa-', count(*) from public.categories where id like 'qa-%';

-- =====================================================================
-- PARTE 2 - APAGAR. Rode so depois de conferir a Parte 1.
-- Tudo acontece numa transacao: se algo falhar, nada e apagado.
-- =====================================================================

begin;

create temporary table qa_sale_ids on commit drop as
  select distinct s.id, s.command_id
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where si.product_id like 'qa-%';

create temporary table qa_movement_ids on commit drop as
  select id from public.cash_movements where description ilike 'qa%';

-- Vitrine e estoque dos produtos de teste
delete from public.showcase_movements where product_id like 'qa-%' or sale_id in (select id from qa_sale_ids);
delete from public.out_of_stock_sales where product_id like 'qa-%' or sale_id in (select id from qa_sale_ids);
delete from public.stock_production where product_id like 'qa-%';
delete from public.showcase_write_offs where product_id like 'qa-%';
delete from public.product_stock where product_id like 'qa-%';

-- Vendas (itens saem junto: on delete cascade) e comandas
delete from public.sales where id in (select id from qa_sale_ids);
delete from public.commands c
  where c.id in (select command_id from qa_sale_ids where command_id is not null)
    and not exists (select 1 from public.sales s where s.command_id = c.id);
delete from public.commands c
  where exists (select 1 from public.command_items ci where ci.command_id = c.id and ci.product_id like 'qa-%')
    and not exists (select 1 from public.sales s where s.command_id = c.id);

-- Caixa
delete from public.financial_transactions
  where cash_movement_id in (select id from qa_movement_ids) or description ilike 'qa%';
delete from public.cash_movements where id in (select id from qa_movement_ids);
delete from public.cash_closings
  where closed_at >= timestamptz '2026-10-25 00:00:00-03' and closed_at < timestamptz '2026-11-09 00:00:00-03';

do $$
begin
  if to_regclass('public.cash_sessions') is not null then
    delete from public.cash_sessions
      where opened_at >= timestamptz '2026-10-25 00:00:00-03' and opened_at < timestamptz '2026-11-09 00:00:00-03';
  end if;
end $$;

-- Catalogo de teste
delete from public.products where id like 'qa-%';
delete from public.categories where id like 'qa-%';

-- Conferencia final (tudo deve ser 0)
select 'vendas com itens qa-' as item, count(*) as quantidade
  from public.sale_items where product_id like 'qa-%'
union all select 'produtos qa-', count(*) from public.products where id like 'qa-%'
union all select 'movimentos "QA..."', count(*) from public.cash_movements where description ilike 'qa%';

commit;
-- Se a conferencia final nao der 0, troque o "commit;" acima por "rollback;" e me avise.
--
-- Depois, em cada aparelho que ja abriu o PDV publicado: a sincronizacao NAO remove da
-- copia local o que sumiu do servidor. Confira que o topo nao mostra envios pendentes,
-- saia do PDV e limpe os dados do site no navegador (Chrome: cadeado ao lado do
-- endereco > Configuracoes do site > Excluir dados). No proximo login o aparelho baixa
-- so o que esta no servidor, ja sem os dados de teste.
