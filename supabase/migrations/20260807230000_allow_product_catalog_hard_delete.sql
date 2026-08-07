-- Products are catalog records, while stock and showcase rows keep their own
-- snapshots (product_name/category_name). They must not block catalog cleanup.
alter table if exists public.stock_production
  drop constraint if exists stock_production_product_id_fkey;

alter table if exists public.showcase_write_offs
  drop constraint if exists showcase_write_offs_product_id_fkey;

comment on column public.stock_production.product_id is
  'Snapshot reference to the product at the time of the stock entry; the product may be removed.';

comment on column public.showcase_write_offs.product_id is
  'Snapshot reference to the product at the time of the write-off; the product may be removed.';