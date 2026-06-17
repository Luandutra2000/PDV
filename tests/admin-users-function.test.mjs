import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('../supabase/functions/admin-users/index.ts', import.meta.url)),
  'utf8'
);
const compactSource = source.replace(/\s+/g, ' ');

assert(source.includes("case 'createUser'"), 'function should handle createUser action');
assert(source.includes("await requirePermission(actor, 'users.manage')"), 'createUser should require users.manage');
assert(source.includes("case 'updateUser'"), 'function should handle updateUser action');
assert(
  source.includes("await requireAnyPermission(actor, ['users.edit', 'users.manage'])"),
  'updateUser should require users.edit or users.manage'
);
assert(source.includes("case 'savePermissionOverrides'"), 'function should handle savePermissionOverrides action');
assert(
  source.includes("await requirePermission(actor, 'permissions.manage')"),
  'savePermissionOverrides should require permissions.manage'
);
assert(source.includes('assertNotLastActiveAdmin'), 'function should protect last active admin');
assert(source.includes('user_permission_overrides'), 'function should use user_permission_overrides');
assert(source.includes('permission.denied'), 'function should record permission.denied');
assert(!source.includes('user_metadata.role'), 'function should not authorize from user_metadata.role');
assert(!source.includes('user_metadata?.role'), 'function should not authorize from optional user_metadata.role');
assert(
  compactSource.includes("if (role === 'caixa' || role === 'operator') { return 'operador'; }"),
  'function should normalize caixa/operator to operador'
);
assert(source.includes('SUPABASE_SERVICE_ROLE_KEY'), 'function should use service role env var inside Edge Function');
assert(!source.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE'), 'function should not use frontend service role env names');
assert(
  compactSource.includes("const { error } = await adminClient.from('audit_logs').insert"),
  'recordAudit should inspect audit_logs insert errors'
);
assert(
  compactSource.includes("if (error) { throw error; }"),
  'recordAudit should throw when audit_logs insert fails'
);

console.log('admin users function ok');
