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
assert(source.includes('updateProfileWithAdminGuard'), 'function should update profiles through the DB-side admin guard');
assert(source.includes(".rpc('update_profile_with_admin_guard'"), 'function should call the atomic DB-side admin profile update RPC');
assert(!source.includes('assertNotLastActiveAdmin'), 'function should not use a preflight-only last active admin guard');
assert(!source.includes(".rpc('assert_can_change_admin_profile'"), 'function should not call the preflight-only admin profile guard RPC');
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
assert(
  compactSource.includes('await cleanupCreatedAuthUser(data.user.id)'),
  'createUser should delete newly created Auth user when profile or audit persistence fails'
);
assert(
  !compactSource.includes(".from('user_permission_overrides') .delete() .eq('user_id', userId) const rows"),
  'savePermissionOverrides should not blanket delete existing overrides before inserting replacements'
);
assert(
  compactSource.includes(".from('user_permission_overrides') .select('permission_id,state') .eq('user_id', userId)"),
  'savePermissionOverrides should fetch existing overrides before applying a diff'
);
assert(
  source.includes('.upsert(desiredRows'),
  'savePermissionOverrides should upsert desired overrides before deleting stale rows'
);
assert(
  compactSource.includes(".delete() .eq('user_id', userId) .in('permission_id', stalePermissionIds)"),
  'savePermissionOverrides should delete only stale override rows after successful upsert'
);
assert(
  source.includes('const VALID_PERMISSION_ID_PATTERN'),
  'function should validate override permission ids before writing them'
);
assert(
  !compactSource.includes('await assertNotLastActiveAdmin(userId, nextRole, nextActive); const authPatch'),
  'updateUser should not preflight guard before a later profile upsert'
);
assert(
  !compactSource.includes('const user = await upsertProfile(userId,'),
  'updateUser should not update profiles through the non-guarded upsert helper'
);

console.log('admin users function ok');
