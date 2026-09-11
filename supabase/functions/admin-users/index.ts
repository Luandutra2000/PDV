import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminAction = 'listUsers' | 'createUser' | 'updateUser' | 'deleteUser' | 'savePermissionOverrides';

type RequestBody = {
  action?: AdminAction;
  payload?: Record<string, unknown>;
};

type Profile = {
  id: string;
  name: string;
  role_id: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Metodo nao permitido.' }, 405);
  }

  try {
    const body = await request.json() as RequestBody;
    const actor = await getActor(request);

    if (body.action === 'listUsers') {
      return json({ users: await listManagedUsers(actor) });
    }

    if (body.action === 'createUser') {
      return json({ user: await createManagedUser(actor, body.payload || {}) });
    }

    if (body.action === 'updateUser') {
      return json({ user: await updateManagedUser(actor, body.payload || {}) });
    }

    if (body.action === 'deleteUser') {
      return json({ user: await deleteManagedUser(actor, body.payload || {}) });
    }

    if (body.action === 'savePermissionOverrides') {
      await savePermissionOverrides(actor, body.payload || {});
      return json({ ok: true });
    }

    return json({ error: 'Acao administrativa desconhecida.' }, 400);
  } catch (error) {
    return json({ error: getErrorMessage(error) }, getErrorStatus(error));
  }
});

async function listManagedUsers(actor: Profile) {
  await requirePermission(actor.id, 'users.manage', 'users.edit', 'users.delete');

  const { data: profiles, error: profilesError } = await adminClient
    .from('profiles')
    .select('id,name,role_id,is_active,created_at,updated_at')
    .order('created_at', { ascending: true });

  if (profilesError) {
    throw statusError(profilesError.message, 400);
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (authError) {
    throw statusError(authError.message, 400);
  }

  const emails = new Map((authData.users || []).map((user) => [user.id, user.email || '']));
  return (profiles || []).map((profile) => mapProfile(profile as Profile, emails.get(profile.id) || ''));
}

async function createManagedUser(actor: Profile, payload: Record<string, unknown>) {
  await requirePermission(actor.id, 'users.manage');

  const name = normalizeText(payload.name);
  const email = normalizeEmail(payload.username);
  const password = normalizeText(payload.password);
  const role = normalizeRole(payload.role);
  const active = payload.active !== false;

  if (!name || !email || !password || !role) {
    throw statusError('Preencha nome, e-mail, senha e perfil.', 400);
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name }
  });

  if (error || !data.user) {
    throw statusError(error?.message || 'Nao foi possivel criar usuario no Auth.', 400);
  }

  const profile = await upsertProfile({
    id: data.user.id,
    name,
    role_id: role,
    is_active: active
  });

  await recordAudit(actor, {
    action: 'user.create',
    entityType: 'user',
    entityId: profile.id,
    details: `Usuario ${name} criado`
  });

  return mapProfile(profile, email);
}

async function updateManagedUser(actor: Profile, payload: Record<string, unknown>) {
  await requirePermission(actor.id, 'users.edit');

  const id = normalizeText(payload.userId || payload.id);
  const patch = isRecord(payload.patch) ? payload.patch : payload;

  if (!id) {
    throw statusError('Usuario nao informado.', 400);
  }

  if (Object.hasOwn(patch, 'role') || Object.hasOwn(patch, 'active')) {
    await requirePermission(actor.id, 'users.manage');
  }

  const existing = await getProfile(id);
  const name = Object.hasOwn(patch, 'name') ? normalizeText(patch.name) : existing.name;
  const role = Object.hasOwn(patch, 'role') ? normalizeRole(patch.role) : existing.role_id;
  const active = Object.hasOwn(patch, 'active') ? patch.active !== false : existing.is_active;
  const username = Object.hasOwn(patch, 'email') || Object.hasOwn(patch, 'username')
    ? normalizeEmail(patch.email || patch.username)
    : '';
  const password = Object.hasOwn(patch, 'password') ? normalizeText(patch.password) : '';

  if (!name || !role) {
    throw statusError('Preencha nome e perfil.', 400);
  }

  await assertNotLastActiveAdmin(existing, { role, active });

  const authPatch: Record<string, unknown> = {};

  if (username) {
    authPatch.email = username;
  }

  if (password) {
    authPatch.password = password;
  }

  if (Object.keys(authPatch).length) {
    const { error } = await adminClient.auth.admin.updateUserById(id, authPatch);

    if (error) {
      throw statusError(error.message, 400);
    }
  }

  const profile = await upsertProfile({
    id,
    name,
    role_id: role,
    is_active: active
  });

  await recordAudit(actor, {
    action: 'user.update',
    entityType: 'user',
    entityId: profile.id,
    details: `Usuario ${name} editado`
  });

  return mapProfile(profile, username || id);
}

async function savePermissionOverrides(actor: Profile, payload: Record<string, unknown>) {
  await requirePermission(actor.id, 'permissions.manage');

  const userId = normalizeText(payload.userId);
  const overrides = normalizePermissionOverrides(payload.overrides);

  if (!userId) {
    throw statusError('Usuario nao informado.', 400);
  }

  const profile = await getProfile(userId);

  if (profile.role_id === 'admin') {
    return;
  }

  const { error: deleteError } = await adminClient
    .from('user_permission_overrides')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    throw statusError(deleteError.message, 400);
  }

  const rows = overrides
    .map((override) => ({
      user_id: userId,
      permission_id: normalizeText(override?.permissionId),
      state: normalizeText(override?.state)
    }))
    .filter((override) => override.permission_id && (override.state === 'allow' || override.state === 'deny'));

  if (rows.length) {
    const { error: insertError } = await adminClient
      .from('user_permission_overrides')
      .insert(rows);

    if (insertError) {
      throw statusError(insertError.message, 400);
    }
  }

  await recordAudit(actor, {
    action: 'permission.override',
    entityType: 'user',
    entityId: userId,
    details: 'Checklist de permissoes atualizado'
  });
}

async function deleteManagedUser(actor: Profile, payload: Record<string, unknown>) {
  await requirePermission(actor.id, 'users.delete');

  const id = normalizeText(payload.userId || payload.id);
  if (!id) {
    throw statusError('Usuario nao informado.', 400);
  }

  if (id === actor.id) {
    throw statusError('Nao e permitido excluir o usuario que esta conectado.', 400);
  }

  const existing = await getProfile(id);
  await assertNotLastActiveAdmin(existing, { role: existing.role_id, active: false });

  await recordAudit(actor, {
    action: 'user.delete',
    entityType: 'user',
    entityId: id,
    details: `Usuario ${existing.name} excluido`
  });

  const { error } = await adminClient.auth.admin.deleteUser(id);
  if (error) {
    throw statusError(
      'Nao foi possivel excluir este usuario. Desative-o caso ele possua registros vinculados.',
      400
    );
  }

  return mapProfile(existing);
}

async function getActor(request: Request) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    throw statusError('Sessao obrigatoria.', 401);
  }

  const { data, error } = await adminClient.auth.getUser(token);

  if (error || !data.user) {
    throw statusError('Sessao invalida.', 401);
  }

  return getProfile(data.user.id);
}

async function getProfile(id: string): Promise<Profile> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,name,role_id,is_active,created_at,updated_at')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw statusError('Perfil nao encontrado.', 404);
  }

  return data as Profile;
}

async function upsertProfile(profile: Pick<Profile, 'id' | 'name' | 'role_id' | 'is_active'>): Promise<Profile> {
  const { data, error } = await adminClient
    .from('profiles')
    .upsert({
      ...profile,
      updated_at: new Date().toISOString()
    })
    .select('id,name,role_id,is_active,created_at,updated_at')
    .single();

  if (error || !data) {
    throw statusError(error?.message || 'Nao foi possivel salvar perfil.', 400);
  }

  return data as Profile;
}

async function requirePermission(actorId: string, ...permissionIds: string[]) {
  const actor = await getProfile(actorId);

  if (actor.role_id === 'admin') {
    return;
  }

  const { data, error } = await adminClient
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', actor.role_id)
    .in('permission_id', permissionIds);

  if (error) {
    throw statusError(error.message, 400);
  }

  const { data: overrides, error: overridesError } = await adminClient
    .from('user_permission_overrides')
    .select('permission_id,state')
    .eq('user_id', actorId)
    .in('permission_id', permissionIds);

  if (overridesError) {
    throw statusError(overridesError.message, 400);
  }

  const allowedByRole = new Set((data || []).map((row) => row.permission_id));
  const allowed = permissionIds.some((permissionId) => {
    const override = (overrides || []).find((row) => row.permission_id === permissionId);

    if (override?.state === 'deny') {
      return false;
    }

    return override?.state === 'allow' || allowedByRole.has(permissionId);
  });

  if (!allowed) {
    throw statusError('Usuario sem permissao para esta acao.', 403);
  }
}

async function assertNotLastActiveAdmin(existing: Profile, next: { role: string; active: boolean }) {
  if (existing.role_id !== 'admin' || (next.role === 'admin' && next.active)) {
    return;
  }

  const { count, error } = await adminClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', 'admin')
    .eq('is_active', true);

  if (error) {
    throw statusError(error.message, 400);
  }

  if ((count || 0) <= 1) {
    throw statusError('Nao e permitido remover ou desativar o ultimo administrador ativo.', 400);
  }
}

async function recordAudit(
  actor: Profile,
  entry: { action: string; entityType: string; entityId: string; details: string }
) {
  await adminClient.from('audit_logs').insert({
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    user_id: actor.id,
    user_name: actor.name,
    metadata: {
      module: 'Sistema',
      details: entry.details
    }
  });
}

function mapProfile(profile: Profile, username = '') {
  return {
    id: profile.id,
    name: profile.name,
    username,
    role: profile.role_id,
    active: profile.is_active !== false,
    createdAt: profile.created_at || '',
    updatedAt: profile.updated_at || ''
  };
}

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/,com$/i, '.com');
}

function normalizeRole(value: unknown) {
  const role = normalizeText(value);
  const roles = new Set(['admin', 'gerente', 'caixa', 'operador', 'dono']);
  return roles.has(role) ? role : '';
}

function normalizePermissionOverrides(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).map(([permissionId, state]) => ({
    permissionId,
    state
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function statusError(message: string, status: number) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function getErrorStatus(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: number }).status || 500)
    : 500;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Erro administrativo inesperado.';
}
