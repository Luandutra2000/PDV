alter table public.stock_production
  add column if not exists note text not null default '';
