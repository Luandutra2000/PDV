alter table if exists public.out_of_stock_sales
  drop constraint if exists out_of_stock_sales_product_id_fkey;

comment on column public.out_of_stock_sales.product_id is
  'Snapshot textual do produto vendido sem estoque; o produto pode ser removido do catalogo.';
