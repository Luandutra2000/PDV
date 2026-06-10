alter table public.sales alter column created_by drop not null;
alter table public.cash_movements alter column created_by drop not null;
alter table public.cash_closings alter column created_by drop not null;
alter table public.stock_production alter column created_by drop not null;
