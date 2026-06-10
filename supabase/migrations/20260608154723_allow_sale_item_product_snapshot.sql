alter table if exists public.command_items
  drop constraint if exists command_items_product_id_fkey;

alter table if exists public.sale_items
  drop constraint if exists sale_items_product_id_fkey;

comment on column public.command_items.product_id is
  'Snapshot do produto no momento da comanda; pode apontar para produto local/removido.';

comment on column public.sale_items.product_id is
  'Snapshot do produto no momento da venda; pode apontar para produto local/removido.';
