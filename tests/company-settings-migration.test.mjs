import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationName = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_add_company_visual_settings.sql'))
  .sort()
  .at(-1);

assert(migrationName, 'company visual settings migration should exist');

const sql = readFileSync(join('supabase/migrations', migrationName), 'utf8');
const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase();

const requiredSnippets = [
  'create table if not exists public.empresas',
  'alter table public.profiles add column if not exists empresa_id',
  'create table if not exists public.empresa_configuracoes',
  "('company_settings.manage'",
  'alter table public.empresas enable row level security',
  'alter table public.empresa_configuracoes enable row level security',
  'create policy "company users read own company"',
  'create policy "company settings managers upsert own settings"',
  'insert into storage.buckets (id, name, public)',
  "values ('logos', 'logos', true)",
  'storage.objects'
];

for (const snippet of requiredSnippets) {
  assert(
    normalizedSql.includes(snippet),
    `migration should include: ${snippet}`
  );
}

assert(
  !normalizedSql.includes('auth.role()'),
  'migration should not use deprecated auth.role()'
);

assert(
  normalizedSql.includes('to authenticated'),
  'migration should target authenticated with policy TO clauses or grants'
);

assert(
  normalizedSql.includes('with check'),
  'migration should use WITH CHECK for writes'
);

console.log('company settings migration ok');
