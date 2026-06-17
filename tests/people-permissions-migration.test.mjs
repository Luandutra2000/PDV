import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationFile = '20260617115918_align_people_permissions_audit.sql';
const sql = readFileSync(
  fileURLToPath(new URL(`../supabase/migrations/${migrationFile}`, import.meta.url)),
  'utf8'
);
const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase();

const canonicalPermissionIds = [
  'sales.access',
  'sales.create',
  'sales.cancel',
  'sales.discount',
  'cash.movement',
  'cash.withdrawal',
  'cash.close',
  'cash.balance.view',
  'showcase.access',
  'showcase.launch',
  'showcase.edit',
  'stock.writeoff',
  'products.manage',
  'categories.manage',
  'reports.view',
  'crm.view',
  'owner_app.view',
  'financial.expense.access',
  'financial.income.create',
  'financial.expense.create',
  'financial.entries.edit',
  'financial.entries.delete',
  'financial.categories.manage',
  'financial.bill.pay',
  'users.manage',
  'users.edit',
  'permissions.manage',
  'audit.view',
  'data.export'
];

for (const permissionId of canonicalPermissionIds) {
  assert(sql.includes(`'${permissionId}'`), `migration should include ${permissionId}`);
}

const requiredSnippets = [
  'create table if not exists public.user_permission_overrides',
  'alter table public.user_permission_overrides enable row level security',
  'create or replace function private.current_profile_has_permission',
  'create or replace function public.update_profile_with_admin_guard',
  'returns table',
  'pg_advisory_xact_lock',
  'update public.profiles',
  'returning p.id, p.name, p.role_id, p.is_active',
  "p.role_id = 'admin'",
  "upo.state = 'allow'",
  "upo.state is distinct from 'deny'",
  "private.current_profile_has_permission('users.manage')",
  "private.current_profile_has_permission('users.edit')",
  "private.current_profile_has_permission('permissions.manage')",
  "update public.profiles set role_id = 'operador' where role_id in ('caixa', 'operator')",
  'grant select, insert, update, delete on public.user_permission_overrides to authenticated',
  'grant execute on function public.update_profile_with_admin_guard(uuid, text, text, boolean) to authenticated',
  'create policy "user managers read profiles" on public.profiles for select to authenticated'
];

for (const snippet of requiredSnippets) {
  assert(normalizedSql.includes(snippet), `migration should include: ${snippet}`);
}

assert(
  normalizedSql.includes("delete from public.role_permissions where role_id in ('admin', 'gerente', 'operador', 'dono')")
    || normalizedSql.includes("delete from public.role_permissions where role_id in ('admin','gerente','operador','dono')"),
  'migration should reset role permissions for managed roles'
);

assert(
  !normalizedSql.includes('create policy "user managers manage profiles" on public.profiles for all to authenticated'),
  'migration should not allow direct profile writes through a broad manager policy'
);

assert(
  !normalizedSql.includes('grant select on public.user_permission_overrides to anon'),
  'migration should not expose user_permission_overrides to anon'
);

assert(
  normalizedSql.includes('for update') || normalizedSql.includes('lock table'),
  'admin profile update guard should lock the profile row or table while checking last admin'
);

assert(
  !normalizedSql.includes('create or replace function public.assert_can_change_admin_profile'),
  'migration should not expose a preflight-only admin guard RPC'
);

const updateProfileFunctionSql = normalizedSql.slice(
  normalizedSql.indexOf('create or replace function public.update_profile_with_admin_guard')
);

assert(
  updateProfileFunctionSql.indexOf('pg_advisory_xact_lock') < updateProfileFunctionSql.indexOf('update public.profiles'),
  'admin profile update RPC should take the transaction lock before updating profiles'
);

console.log(`people permissions migration ok: ${migrationFile}`);
