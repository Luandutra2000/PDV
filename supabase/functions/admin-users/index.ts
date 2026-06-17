import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminAction = 'listUsers' | 'createUser' | 'updateUser' | 'savePermissionOverrides';
type RoleId = 'admin' | 'gerente' | 'operador' | 'dono';
type OverrideState = 'allow' | 'deny' | 'default';

type Profile = {
  id: string;
  name: string;
  role_id: RoleId;
  is_active: boolean;
};

type AuditPayload = {
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VALID_PERMISSION_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Metodo nao permitido.' }, 405);
  }

  try {
    const actor = await getActor(request);
    const body = await request.json();
    const action = body?.action as AdminAction;

    switch (action) {
      case 'listUsers':
        await requireAnyPermission(actor, ['users.manage', 'users.edit', 'permissions.manage', 'audit.view']);
        return jsonResponse({ users: await listManagedUsers() });
      case 'createUser':
        await requirePermission(actor, 'users.manage');
        return jsonResponse({ user: await createManagedUser(actor, body) });
      case 'updateUser':
        await requireAnyPermission(actor, ['users.edit', 'users.manage']);
        return jsonResponse({ user: await updateManagedUser(actor, body) });
      case 'savePermissionOverrides':
        await requirePermission(actor, 'permissions.manage');
        return jsonResponse({ user: await savePermissionOverrides(actor, body) });
      default:
        return jsonResponse({ error: 'Acao administrativa invalida.' }, 400);
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Erro inesperado.';
    return jsonResponse({ error: message }, status);
  }
});

async function getActor(request: Request): Promise<Profile> {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw new HttpError(401, 'Sessao administrativa obrigatoria.');
  }

  const token = match[1];
  const { data, error } = await adminClient.auth.getUser(token);

  if (error || !data.user?.id) {
    throw new HttpError(401, 'Sessao administrativa invalida.');
  }

  const profile = await loadProfile(data.user.id);

  if (!profile?.is_active) {
    throw new HttpError(403, 'Usuario administrativo inativo.');
  }

  return profile;
}

async function listManagedUsers() {
  const { data: profiles, error: profileError } = await adminClient
    .from('profiles')
    .select('id,name,role_id,is_active')
    .order('created_at', { ascending: true });

  if (profileError) {
    throw profileError;
  }

  const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();

  if (authError) {
    throw authError;
  }

  const emailById = new Map((authUsers.users ?? []).map((user) => [user.id, user.email ?? '']));

  return (profiles ?? []).map((profile) => toUser({
    id: profile.id,
    name: profile.name,
    role_id: normalizeRole(profile.role_id),
    is_active: profile.is_active
  }, emailById.get(profile.id)));
}

async function createManagedUser(actor: Profile, body: Record<string, unknown>) {
  const email = String(body.email ?? body.username ?? '').trim();
  const password = String(body.password ?? '').trim();
  const name = String(body.name ?? email).trim();
  const role = normalizeRole(body.role);

  if (!email || !password || !name) {
    throw new HttpError(400, 'Nome, email e senha sao obrigatorios.');
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error || !data.user?.id) {
    throw new HttpError(400, error?.message ?? 'Nao foi possivel criar usuario.');
  }

  try {
    const user = await upsertProfile(data.user.id, { name, role_id: role, is_active: true });

    await recordAudit(actor, {
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      metadata: { role }
    });

    return toUser(user, email);
  } catch (error) {
    await cleanupCreatedAuthUser(data.user.id);
    throw error;
  }
}

async function updateManagedUser(actor: Profile, body: Record<string, unknown>) {
  const userId = String(body.userId ?? body.id ?? '').trim();
  const patch = isRecord(body.patch) ? body.patch : body;

  if (!userId) {
    throw new HttpError(400, 'Usuario obrigatorio.');
  }

  const currentProfile = await loadProfile(userId);

  if (!currentProfile) {
    throw new HttpError(404, 'Usuario nao encontrado.');
  }

  const nextRole = Object.hasOwn(patch, 'role') ? normalizeRole(patch.role) : currentProfile.role_id;
  const nextActive = Object.hasOwn(patch, 'active')
    ? Boolean(patch.active)
    : Object.hasOwn(patch, 'is_active')
      ? Boolean(patch.is_active)
      : currentProfile.is_active;

  const nextName = typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : currentProfile.name;

  const authPatch: Record<string, unknown> = {};
  if (typeof patch.email === 'string' && patch.email.trim()) {
    authPatch.email = patch.email.trim();
  }
  if (typeof patch.password === 'string' && patch.password.trim()) {
    authPatch.password = patch.password.trim();
  }

  if (Object.keys(authPatch).length) {
    const { error } = await adminClient.auth.admin.updateUserById(userId, authPatch);

    if (error) {
      throw new HttpError(400, error.message);
    }
  }

  const user = await updateProfileWithAdminGuard(userId, {
    name: nextName,
    role_id: nextRole,
    is_active: nextActive
  });

  await recordAudit(actor, {
    action: 'user.update',
    entityType: 'user',
    entityId: user.id,
    metadata: { role: nextRole, isActive: nextActive }
  });

  if (currentProfile.role_id !== nextRole) {
    await recordAudit(actor, {
      action: 'user.role.change',
      entityType: 'user',
      entityId: user.id,
      metadata: { fromRole: currentProfile.role_id, toRole: nextRole }
    });
  }

  return toUser(user, typeof patch.email === 'string' ? patch.email : undefined);
}

async function savePermissionOverrides(actor: Profile, body: Record<string, unknown>) {
  const userId = String(body.userId ?? '').trim();
  const target = await loadProfile(userId);

  if (!target) {
    throw new HttpError(404, 'Usuario nao encontrado.');
  }

  if (target.role_id === 'admin') {
    return toUser(target);
  }

  const overrides = normalizeOverrides(body.overrides);

  const { data: existingRows, error: existingError } = await adminClient
    .from('user_permission_overrides')
    .select('permission_id,state')
    .eq('user_id', userId);

  if (existingError) {
    throw existingError;
  }

  const desiredRows = Object.entries(overrides)
    .filter(([, state]) => state === 'allow' || state === 'deny')
    .map(([permission_id, state]) => ({
      user_id: userId,
      permission_id,
      state
    }));

  if (desiredRows.length) {
    await throwIfError(
      adminClient
        .from('user_permission_overrides')
        .upsert(desiredRows, { onConflict: 'user_id,permission_id' })
    );
  }

  const desiredPermissionIds = new Set(desiredRows.map((row) => row.permission_id));
  const stalePermissionIds = (existingRows ?? [])
    .map((row) => String(row.permission_id))
    .filter((permissionId) => !desiredPermissionIds.has(permissionId));

  if (stalePermissionIds.length) {
    await throwIfError(
      adminClient
        .from('user_permission_overrides')
        .delete()
        .eq('user_id', userId)
        .in('permission_id', stalePermissionIds)
    );
  }

  await recordAudit(actor, {
    action: 'permission.override',
    entityType: 'user',
    entityId: userId,
    metadata: { overrides }
  });

  return toUser(target);
}

async function requireAnyPermission(actor: Profile, permissionIds: string[]) {
  for (const permissionId of permissionIds) {
    if (await hasPermission(actor, permissionId)) {
      return;
    }
  }

  await recordPermissionDenied(actor, permissionIds);
  throw new HttpError(403, 'Usuario sem permissao para esta acao.');
}

async function requirePermission(actor: Profile, permissionId: string) {
  if (await hasPermission(actor, permissionId)) {
    return;
  }

  await recordPermissionDenied(actor, [permissionId]);
  throw new HttpError(403, 'Usuario sem permissao para esta acao.');
}

async function hasPermission(actor: Profile, permissionId: string) {
  if (!actor.is_active) {
    return false;
  }

  if (actor.role_id === 'admin') {
    return true;
  }

  const { data: override, error: overrideError } = await adminClient
    .from('user_permission_overrides')
    .select('state')
    .eq('user_id', actor.id)
    .eq('permission_id', permissionId)
    .maybeSingle();

  if (overrideError) {
    throw overrideError;
  }

  if (override?.state === 'deny') {
    return false;
  }

  if (override?.state === 'allow') {
    return true;
  }

  const { data: rolePermission, error: rolePermissionError } = await adminClient
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', actor.role_id)
    .eq('permission_id', permissionId)
    .maybeSingle();

  if (rolePermissionError) {
    throw rolePermissionError;
  }

  return Boolean(rolePermission);
}

async function updateProfileWithAdminGuard(
  userId: string,
  patch: { name: string; role_id: RoleId; is_active: boolean }
) {
  const { data, error } = await adminClient.rpc('update_profile_with_admin_guard', {
    _profile_id: userId,
    _name: patch.name,
    _role_id: patch.role_id,
    _is_active: patch.is_active
  }).single();

  if (error) {
    throw new HttpError(400, error.message);
  }

  return {
    id: data.id,
    name: data.name,
    role_id: normalizeRole(data.role_id),
    is_active: data.is_active !== false
  };
}

async function cleanupCreatedAuthUser(userId: string) {
  await adminClient.auth.admin.deleteUser(userId);
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,name,role_id,is_active')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    role_id: normalizeRole(data.role_id),
    is_active: data.is_active !== false
  };
}

async function upsertProfile(userId: string, patch: { name: string; role_id: RoleId; is_active: boolean }) {
  const { data, error } = await adminClient
    .from('profiles')
    .upsert({
      id: userId,
      name: patch.name,
      role_id: patch.role_id,
      is_active: patch.is_active,
      updated_at: new Date().toISOString()
    })
    .select('id,name,role_id,is_active')
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    role_id: normalizeRole(data.role_id),
    is_active: data.is_active !== false
  };
}

async function recordPermissionDenied(actor: Profile, permissionIds: string[]) {
  await recordAudit(actor, {
    action: 'permission.denied',
    entityType: 'permission',
    entityId: permissionIds.join(','),
    metadata: {
      permissionIds,
      source: 'admin-users'
    }
  });
}

async function recordAudit(actor: Profile, payload: AuditPayload) {
  const { error } = await adminClient.from('audit_logs').insert({
    action: payload.action,
    entity_type: payload.entityType,
    entity_id: payload.entityId ?? null,
    user_id: actor.id,
    user_name: actor.name,
    metadata: payload.metadata ?? {}
  });

  if (error) {
    throw error;
  }
}

async function throwIfError(query: PromiseLike<{ error: Error | null }>) {
  const { error } = await query;

  if (error) {
    throw error;
  }
}

function normalizeRole(value: unknown): RoleId {
  const role = String(value ?? 'operador').trim().toLowerCase();

  if (role === 'caixa' || role === 'operator') {
    return 'operador';
  }

  if (role === 'admin' || role === 'gerente' || role === 'operador' || role === 'dono') {
    return role;
  }

  return 'operador';
}

function normalizeOverrides(value: unknown): Record<string, OverrideState> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, OverrideState>>((overrides, [permissionId, state]) => {
    if (!VALID_PERMISSION_ID_PATTERN.test(permissionId)) {
      throw new HttpError(400, 'Permissao invalida.');
    }

    if (state === 'allow' || state === 'deny' || state === 'default') {
      overrides[permissionId] = state;
    }

    return overrides;
  }, {});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toUser(profile: Profile, email?: string) {
  return {
    id: profile.id,
    name: profile.name,
    username: email,
    email,
    role: profile.role_id,
    active: profile.is_active
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
