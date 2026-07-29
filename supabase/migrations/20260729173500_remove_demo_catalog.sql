-- Remove o catalogo demonstrativo que era semeado pelo cliente antigo.
-- Historicos de venda mantêm nome/preço como snapshot e não dependem mais da FK de produtos.
do $$
declare
  _demo_product_ids text[] := array[
    'agua',
    'batata-frita',
    'combo-casal',
    'combo-familia',
    'coxinha',
    'empada-de-costela',
    'empada-de-frango',
    'empada-de-frango-com-bancon',
    'frango-passarinho',
    'hamburguer',
    'ki-coco',
    'misto-quente',
    'pao-de-queijo',
    'pastel-gaucho',
    'pizza-assada',
    'refrigerante-lata',
    'risole',
    'suco-natural',
    'x-bacon',
    'x-burger',
    'x-salada'
  ];
begin
  delete from public.out_of_stock_sales where product_id = any(_demo_product_ids);
  delete from public.showcase_movements where product_id = any(_demo_product_ids);
  delete from public.showcase_write_offs where product_id = any(_demo_product_ids);
  delete from public.stock_production where product_id = any(_demo_product_ids);
  delete from public.products where id = any(_demo_product_ids);

  delete from public.categories
  where id in ('todos', 'lanches', 'bebidas', 'porcoes', 'combos')
    and not exists (
      select 1 from public.products where products.category_id = categories.id
    );
end
$$;
