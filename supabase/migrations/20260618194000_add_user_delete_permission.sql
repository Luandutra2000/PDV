insert into public.permissions (id, description)
values ('users.delete', 'Excluir usuarios')
on conflict (id) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
values ('admin', 'users.delete')
on conflict do nothing;
