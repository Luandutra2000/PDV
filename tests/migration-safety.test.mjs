import { readFile } from 'node:fs/promises';

const secureMigration = await readFile(new URL('../supabase/migrations/202609100001_secure_authenticated_online_sync.sql', import.meta.url), 'utf8');
const roleMigration = await readFile(new URL('../supabase/migrations/202609100002_fix_profile_role_escalation.sql', import.meta.url), 'utf8');
const salesMigration = await readFile(new URL('../supabase/migrations/202606030004_align_remote_sales_schema.sql', import.meta.url), 'utf8');
const adminFunction = await readFile(new URL('../supabase/functions/admin-users/index.ts', import.meta.url), 'utf8');

if (/for\s+(select|insert|update|delete).*to\s+anon/i.test(secureMigration)) {
  throw new Error('secure online sync migration must not grant anon policies');
}
if (!secureMigration.includes('private.can_update_profile')) {
  throw new Error('profile policy must validate safe role updates on the server');
}
if (!roleMigration.includes('revoke update (role_id, is_active)')) {
  throw new Error('profile role and active status must not be writable by ordinary authenticated clients');
}
if (!salesMigration.includes('information_schema.columns') || !salesMigration.includes("execute 'update public.sales")) {
  throw new Error('sales schema alignment must guard legacy column references');
}
if (!adminFunction.includes("await requirePermission(actor.id, 'users.manage');")) {
  throw new Error('admin-users must require users.manage for role or active status changes');
}

console.log('migration safety ok');
