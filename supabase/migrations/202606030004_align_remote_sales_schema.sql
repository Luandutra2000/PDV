alter table public.sales add column if not exists command_id text references public.commands(id);
alter table public.sales add column if not exists command_number integer;

update public.sales
set command_id = coalesce(command_id, comanda_id),
    command_number = coalesce(command_number, comanda_number)
where (command_id is null and comanda_id is not null)
   or (command_number is null and comanda_number is not null);

alter table public.sale_items alter column id drop default;
alter table public.sale_items alter column id type text using id::text;
