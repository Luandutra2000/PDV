insert into public.permissions (id, description) values
  ('financial.view', 'Acessar financeiro'),
  ('financial.transaction.create', 'Criar lancamento financeiro'),
  ('financial.transaction.edit', 'Editar lancamento financeiro'),
  ('financial.transaction.cancel', 'Cancelar lancamento financeiro'),
  ('financial.category.manage', 'Gerenciar categorias financeiras'),
  ('financial.payable.pay', 'Marcar conta como paga')
on conflict (id) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id) values
  ('gerente', 'financial.view'),
  ('gerente', 'financial.transaction.create'),
  ('gerente', 'financial.transaction.edit'),
  ('gerente', 'financial.category.manage'),
  ('gerente', 'financial.payable.pay'),
  ('dono', 'financial.view'),
  ('dono', 'financial.transaction.create'),
  ('dono', 'financial.transaction.edit'),
  ('dono', 'financial.transaction.cancel'),
  ('dono', 'financial.category.manage'),
  ('dono', 'financial.payable.pay')
on conflict do nothing;
