-- Seed idempotente para ambiente isolado de homologacao.
-- Este arquivo nao remove dados. O reset completo deve passar pelo script
-- scripts/reset-supabase-homologation.ps1, que valida o project ref.

insert into public.categories (id, name, show_in_showcase)
values
  ('qa-lanches', 'QA Lanches', true),
  ('qa-bebidas', 'QA Bebidas', true),
  ('qa-combos', 'QA Combos', true)
on conflict (id) do update set
  name = excluded.name,
  show_in_showcase = excluded.show_in_showcase,
  updated_at = now();

insert into public.products (
  id,
  name,
  category_id,
  price,
  cost,
  stock,
  active,
  aliases,
  favorite
)
values
  ('qa-x-burger', 'QA X-Burger', 'qa-lanches', 16.00, 8.50, 100, true, '["qa-burger"]'::jsonb, true),
  ('qa-refrigerante', 'QA Refrigerante', 'qa-bebidas', 6.00, 3.20, 100, true, '["qa-refri"]'::jsonb, true),
  ('qa-combo', 'QA Combo', 'qa-combos', 35.00, 18.00, 50, true, '["qa-combo"]'::jsonb, false),
  ('qa-ultimo-item', 'QA Ultimo Item', 'qa-lanches', 12.00, 5.00, 1, true, '[]'::jsonb, false),
  ('qa-sem-estoque', 'QA Sem Estoque', 'qa-lanches', 10.00, 4.00, 0, true, '[]'::jsonb, false),
  ('qa-inativo', 'QA Produto Inativo', 'qa-lanches', 9.00, 3.00, 10, false, '[]'::jsonb, false)
on conflict (id) do update set
  name = excluded.name,
  category_id = excluded.category_id,
  price = excluded.price,
  cost = excluded.cost,
  stock = excluded.stock,
  active = excluded.active,
  aliases = excluded.aliases,
  favorite = excluded.favorite,
  updated_at = now();

-- Os usuarios devem ser criados primeiro pelo Supabase Auth. O seed associa
-- os e-mails conhecidos aos perfis sem criar, armazenar ou redefinir senhas.
insert into public.profiles (id, name, role_id, is_active)
select
  auth_user.id,
  qa_user.name,
  qa_user.role_id,
  true
from auth.users auth_user
join (
  values
    ('qa.admin@pdv.test', 'QA Administrador', 'admin'),
    ('qa.gerente@pdv.test', 'QA Gerente', 'gerente'),
    ('qa.caixa@pdv.test', 'QA Caixa', 'caixa'),
    ('qa.operador@pdv.test', 'QA Operador', 'operador')
) as qa_user(email, name, role_id)
  on lower(auth_user.email) = qa_user.email
on conflict (id) do update set
  name = excluded.name,
  role_id = excluded.role_id,
  is_active = true,
  updated_at = now();
