-- Restaura o catálogo real fotografado imediatamente antes da limpeza equivocada.
insert into public.categories (id, name, show_in_showcase, updated_at)
values ('bebidas', 'Bebidas', true, now())
on conflict (id) do update set
  name = excluded.name,
  updated_at = excluded.updated_at;

insert into public.products (
  id,
  name,
  category_id,
  price,
  cost,
  stock,
  active,
  aliases,
  favorite,
  updated_at
) values
  ('agua', 'Agua Mineral', 'bebidas', 4.00, 0, 35, true, '[]'::jsonb, false, now()),
  ('coxinha', 'Coxinha', 'fritos', 9.00, 0, 0, true, '[]'::jsonb, false, now()),
  ('empada-de-costela', 'Empada de costela', 'empada', 9.00, 0, 32, true, '[]'::jsonb, false, now()),
  ('empada-de-frango', 'Empada de Frango', 'empada', 8.00, 0, 0, true, '[]'::jsonb, false, now()),
  ('empada-de-frango-com-bancon', 'Empada de Frango com Bancon', 'empada', 9.00, 0, 0, true, '[]'::jsonb, false, now()),
  ('hamburguer', 'Hamburguer', 'assados', 9.00, 0, 61, true, '[]'::jsonb, false, now()),
  ('ki-coco', 'KI-Coco', 'assados', 9.00, 0, 10, true, '[]'::jsonb, false, now()),
  ('pao-de-queijo', 'Pão de queijo', 'assados', 3.00, 0, 7, true, '[]'::jsonb, false, now()),
  ('pastel-gaucho', 'Pastel Gaucho', 'fritos', 9.00, 0, 10, true, '[]'::jsonb, false, now()),
  ('pizza-assada', 'Pizza Assada', 'assados', 10.00, 0, 20, true, '[]'::jsonb, false, now()),
  ('refrigerante-lata', 'Refrigerante Lata', 'bebidas', 6.00, 0, 48, true, '[]'::jsonb, false, now()),
  ('risole', 'Risole', 'fritos', 7.00, 0, 44, true, '[]'::jsonb, false, now()),
  ('suco-natural', 'Suco Natural', 'bebidas', 8.00, 0, 20, true, '[]'::jsonb, false, now())
on conflict (id) do update set
  name = excluded.name,
  category_id = excluded.category_id,
  price = excluded.price,
  stock = excluded.stock,
  active = excluded.active,
  updated_at = excluded.updated_at;
