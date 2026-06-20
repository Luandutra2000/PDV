create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.empresas (id, nome, slug, is_active)
values ('00000000-0000-0000-0000-000000000001', 'Lanchonete', 'lanchonete', true)
on conflict (id) do update set
  nome = excluded.nome,
  slug = excluded.slug,
  is_active = excluded.is_active,
  updated_at = now();

alter table public.profiles add column if not exists empresa_id uuid references public.empresas(id);

update public.profiles
set empresa_id = '00000000-0000-0000-0000-000000000001'
where empresa_id is null;

alter table public.profiles alter column empresa_id set default '00000000-0000-0000-0000-000000000001';
alter table public.profiles alter column empresa_id set not null;

create table if not exists public.empresa_configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  nome_sistema text not null default 'PVD Lanchonete',
  nome_fantasia text not null default 'Lanchonete',
  razao_social text,
  cnpj text,
  telefone text,
  whatsapp text,
  email text,
  endereco text,
  logo_url text,
  cor_primaria text not null default '#2563eb' check (cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  cor_secundaria text not null default '#0f172a' check (cor_secundaria ~ '^#[0-9a-fA-F]{6}$'),
  cor_destaque text not null default '#f97316' check (cor_destaque ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.empresa_configuracoes (
  empresa_id,
  nome_sistema,
  nome_fantasia,
  razao_social,
  cor_primaria,
  cor_secundaria,
  cor_destaque
)
values (
  '00000000-0000-0000-0000-000000000001',
  'PVD Lanchonete',
  'Lanchonete',
  'Lanchonete',
  '#2563eb',
  '#0f172a',
  '#f97316'
)
on conflict (empresa_id) do nothing;

insert into public.permissions (id, description) values
  ('company_settings.manage', 'Gerenciar identidade visual da empresa')
on conflict (id) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'company_settings.manage'),
  ('dono', 'company_settings.manage')
on conflict do nothing;

grant select on public.empresas to authenticated;
grant select, insert, update on public.empresa_configuracoes to authenticated;

alter table public.empresas enable row level security;
alter table public.empresa_configuracoes enable row level security;

drop policy if exists "company users read own company" on public.empresas;
create policy "company users read own company" on public.empresas
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresas.id
    )
  );

drop policy if exists "company settings users read own settings" on public.empresa_configuracoes;
create policy "company settings users read own settings" on public.empresa_configuracoes
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresa_configuracoes.empresa_id
    )
  );

drop policy if exists "company settings managers insert own settings" on public.empresa_configuracoes;
create policy "company settings managers insert own settings" on public.empresa_configuracoes
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresa_configuracoes.empresa_id
        and private.current_profile_has_permission('company_settings.manage')
    )
  );

drop policy if exists "company settings managers upsert own settings" on public.empresa_configuracoes;
create policy "company settings managers upsert own settings" on public.empresa_configuracoes
  for update to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresa_configuracoes.empresa_id
        and private.current_profile_has_permission('company_settings.manage')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresa_configuracoes.empresa_id
        and private.current_profile_has_permission('company_settings.manage')
    )
  );

-- Logos are public brand assets so the PWA can render them by URL without
-- refreshing signed links. Write policies below still restrict upload and
-- changes to managers from the matching empresa_id folder.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;

drop policy if exists "company users read own logos" on storage.objects;

drop policy if exists "company settings managers insert own logos" on storage.objects;
create policy "company settings managers insert own logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and (storage.foldername(name))[1] = p.empresa_id::text
        and private.current_profile_has_permission('company_settings.manage')
    )
  );

drop policy if exists "company settings managers update own logos" on storage.objects;
create policy "company settings managers update own logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and (storage.foldername(name))[1] = p.empresa_id::text
        and private.current_profile_has_permission('company_settings.manage')
    )
  )
  with check (
    bucket_id = 'logos'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and (storage.foldername(name))[1] = p.empresa_id::text
        and private.current_profile_has_permission('company_settings.manage')
    )
  );

drop policy if exists "company settings managers delete own logos" on storage.objects;
create policy "company settings managers delete own logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and (storage.foldername(name))[1] = p.empresa_id::text
        and private.current_profile_has_permission('company_settings.manage')
    )
  );
