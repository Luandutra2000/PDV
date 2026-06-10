create table if not exists public.financial_categories (
  id text primary key,
  name text not null,
  type text not null check (type in ('income', 'expense', 'both')),
  color text not null default '#ff6b1a',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_transactions (
  id text primary key,
  type text not null check (type in ('income', 'expense')),
  description text not null check (length(trim(description)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  category_id text references public.financial_categories(id),
  payment_method text not null default 'dinheiro',
  status text not null default 'paid' check (status in ('paid', 'pending', 'overdue', 'canceled')),
  transaction_date date not null default current_date,
  due_date date,
  paid_at timestamptz,
  notes text not null default '',
  origin text not null default 'finance' check (origin in ('finance', 'cashier')),
  cash_movement_id text references public.cash_movements(id),
  moves_cash_session boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id),
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_categories_active_idx on public.financial_categories(active);
create index if not exists financial_transactions_date_idx on public.financial_transactions(transaction_date desc);
create index if not exists financial_transactions_status_idx on public.financial_transactions(status);
create index if not exists financial_transactions_due_date_idx on public.financial_transactions(due_date);

insert into public.permissions (id, description) values
  ('financial.view', 'Acessar financeiro'),
  ('financial.transaction.create', 'Criar lancamento financeiro'),
  ('financial.transaction.edit', 'Editar lancamento financeiro'),
  ('financial.transaction.cancel', 'Cancelar lancamento financeiro'),
  ('financial.category.manage', 'Gerenciar categorias financeiras'),
  ('financial.payable.pay', 'Marcar conta como paga')
on conflict (id) do update set description = excluded.description;

insert into public.financial_categories (id, name, type, color) values
  ('compra-materiais', 'Compra de materiais', 'expense', '#c2413b'),
  ('fornecedor', 'Fornecedor', 'expense', '#c2413b'),
  ('boleto', 'Boleto', 'expense', '#ff6b1a'),
  ('aluguel', 'Aluguel', 'expense', '#c2413b'),
  ('energia', 'Energia', 'expense', '#c2413b'),
  ('agua', 'Agua', 'expense', '#c2413b'),
  ('internet', 'Internet', 'expense', '#c2413b'),
  ('funcionario', 'Funcionario', 'expense', '#c2413b'),
  ('retirada-dono', 'Retirada do dono', 'expense', '#c2413b'),
  ('manutencao', 'Manutencao', 'expense', '#c2413b'),
  ('reforco-caixa', 'Reforco de caixa', 'income', '#17824f'),
  ('aporte-dono', 'Aporte do dono', 'income', '#17824f'),
  ('reembolso', 'Reembolso', 'income', '#17824f'),
  ('outros-financeiro', 'Outros', 'both', '#ff6b1a')
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  color = excluded.color,
  active = true,
  updated_at = now();

alter table public.financial_categories enable row level security;
alter table public.financial_transactions enable row level security;

grant select, insert, update, delete on public.financial_categories to authenticated;
grant select, insert, update, delete on public.financial_transactions to authenticated;

drop policy if exists "financial users read categories" on public.financial_categories;
drop policy if exists "financial category managers manage categories" on public.financial_categories;
drop policy if exists "financial users read transactions" on public.financial_transactions;
drop policy if exists "financial creators insert transactions" on public.financial_transactions;
drop policy if exists "financial editors update transactions" on public.financial_transactions;

create policy "financial users read categories" on public.financial_categories
  for select to authenticated using (private.current_profile_has_permission('financial.view'));

create policy "financial category managers manage categories" on public.financial_categories
  for all to authenticated
  using (private.current_profile_has_permission('financial.category.manage'))
  with check (private.current_profile_has_permission('financial.category.manage'));

create policy "financial users read transactions" on public.financial_transactions
  for select to authenticated using (private.current_profile_has_permission('financial.view'));

create policy "financial creators insert transactions" on public.financial_transactions
  for insert to authenticated with check (private.current_profile_has_permission('financial.transaction.create'));

create policy "financial editors update transactions" on public.financial_transactions
  for update to authenticated
  using (
    private.current_profile_has_permission('financial.transaction.edit')
    or private.current_profile_has_permission('financial.transaction.cancel')
    or private.current_profile_has_permission('financial.payable.pay')
  )
  with check (
    private.current_profile_has_permission('financial.transaction.edit')
    or private.current_profile_has_permission('financial.transaction.cancel')
    or private.current_profile_has_permission('financial.payable.pay')
  );
