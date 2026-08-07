alter table if exists public.showcase_movements
  drop constraint if exists showcase_movements_product_id_fkey;

comment on column public.showcase_movements.product_id is
  'Snapshot textual do produto no movimento da vitrine; o produto pode ser removido do catalogo.';
