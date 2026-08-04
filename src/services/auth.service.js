import { STORAGE_KEYS } from '../database/schema.js?v=20260804-05';
import { getRuntimeConfig, isSupabaseEnabled } from './app-config.service.js?v=20260804-05';
import { getSupabaseClient, setSupabaseAuthSession } from './supabase-client.service.js?v=20260804-05';
import { getItem, setItem } from './storage.service.js?v=20260804-05';

const VALID_ROLES = new Set(['admin', 'gerente', 'operador', 'dono']);
const REQUIRED_FIELDS_ERROR = 'Preencha nome, usuario, senha e perfil.';

export function getUsers() {
  return getRawUsers().map(sanitizeUser);
}

export function getActiveUsers() {
  return getUsers().filter((user) => user.active !== false);
}

export function getCurrentUser() {
  const session = getItem(STORAGE_KEYS.currentSession, null);

  if (!session?.userId) {
    return null;
  }

  return sanitizeUser(getRawUsers().find((user) => user.id === session.userId));
}

export function login({ username, password }) {
  const normalizedUsername = String(username || '').trim();

  if (isSupabaseEnabled()) {
    return loginWithSupabase({ email: normalizedUsername, password });
  }

  throw new Error('Autenticacao central obrigatoria. Configure o Supabase.');
}

export function logout() {
  setItem(STORAGE_KEYS.currentSession, null);
}

export async function restoreSupabaseSession() {
  if (!isSupabaseEnabled() || getCurrentUser()) {
    return getCurrentUser();
  }

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getUser();

    if (error || !data?.user) {
      return null;
    }

    return await ensureSupabaseLocalSession(data.user, data.session);
  } catch (error) {
    return null;
  }
}

export function createUser(input) {
  if (!isSupabaseEnabled()) {
    throw new Error('Gerenciamento de usuarios exige autenticacao central.');
  }
  const users = getRawUsers();
  const name = String(input.name || '').trim();
  const username = String(input.username || '').trim();
  const password = String(input.password || '').trim();
  const role = normalizeRoleLocal(input.role);

  if (!name || !username || !password || !isValidRole(role)) {
    throw new Error(REQUIRED_FIELDS_ERROR);
  }

  if (users.some((user) => user.username === username)) {
    throw new Error('Ja existe usuario com este login.');
  }

  const now = new Date().toISOString();
  const user = {
    id: createId('user'),
    name,
    username,
    password,
    role,
    active: true,
    createdAt: now,
    updatedAt: now
  };

  setItem(STORAGE_KEYS.users, [...users, user]);

  return sanitizeUser(user);
}

export function updateUser(userId, patch) {
  if (!isSupabaseEnabled()) {
    throw new Error('Gerenciamento de usuarios exige autenticacao central.');
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Dados do usuario invalidos.');
  }

  const users = getRawUsers();
  const existingUser = users.find((user) => user.id === userId);

  if (!existingUser) {
    throw new Error('Usuario nao encontrado.');
  }

  const updatedUser = {
    ...existingUser,
    updatedAt: new Date().toISOString()
  };

  if (Object.hasOwn(patch, 'name')) {
    const name = String(patch.name || '').trim();
    if (!name) {
      throw new Error(REQUIRED_FIELDS_ERROR);
    }
    updatedUser.name = name;
  }

  if (Object.hasOwn(patch, 'username')) {
    const username = String(patch.username || '').trim();
    if (!username) {
      throw new Error(REQUIRED_FIELDS_ERROR);
    }
    if (users.some((user) => user.id !== userId && user.username === username)) {
      throw new Error('Ja existe usuario com este login.');
    }
    updatedUser.username = username;
  }

  if (Object.hasOwn(patch, 'password')) {
    const password = String(patch.password || '').trim();
    if (!password) {
      throw new Error(REQUIRED_FIELDS_ERROR);
    }
    updatedUser.password = password;
  }

  if (Object.hasOwn(patch, 'role')) {
    const role = normalizeRoleLocal(patch.role);
    if (!isValidRole(role)) {
      throw new Error(REQUIRED_FIELDS_ERROR);
    }
    updatedUser.role = role;
  }

  if (Object.hasOwn(patch, 'active')) {
    if (typeof patch.active !== 'boolean') {
      throw new Error('Status do usuario invalido.');
    }
    updatedUser.active = patch.active;
  }

  setItem(STORAGE_KEYS.users, users.map((user) => (user.id === userId ? updatedUser : user)));

  return sanitizeUser(updatedUser);
}

export function deleteUser(userId) {
  const users = getRawUsers();
  const existingUser = users.find((user) => user.id === userId);

  if (!existingUser) {
    throw new Error('Usuario nao encontrado.');
  }

  setItem(STORAGE_KEYS.users, users.filter((user) => user.id !== userId));

  return sanitizeUser(existingUser);
}

export function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const { password, ...safeUser } = user;
  return safeUser;
}

function getRawUsers() {
  return getItem(STORAGE_KEYS.users, []);
}

async function loginWithSupabase({ email, password }) {
  const config = getRuntimeConfig();
  const normalizedEmail = normalizeEmail(email);
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: normalizedEmail,
      password: String(password || '')
    })
  });

  if (!response.ok) {
    throw new Error('Usuario ou senha invalidos.');
  }

  const data = await response.json();

  if (!data?.user) {
    throw new Error('Usuario ou senha invalidos.');
  }

  await setSupabaseAuthSession(data);

  return {
    user: await ensureSupabaseLocalSession(data.user, data),
    session: data.session
  };
}

async function ensureSupabaseLocalSession(authUser, authSession = null) {
  const users = getRawUsers();
  const email = normalizeEmail(authUser.email || '');
  const existingUser = users.find((user) => user.id === authUser.id || user.username === email);
  const profile = await loadSupabaseProfile(authUser.id);
  const now = new Date().toISOString();
  const user = {
    ...(existingUser || {}),
    id: authUser.id,
    name: profile.name || authUser.user_metadata?.name || email || 'Usuario',
    username: email,
    role: normalizeRoleLocal(profile.role_id),
    empresaId: profile.empresa_id || existingUser?.empresaId || '',
    active: profile.active !== false,
    createdAt: existingUser?.createdAt || now,
    updatedAt: now
  };

  setItem(
    STORAGE_KEYS.users,
    existingUser
      ? users.map((candidate) => (candidate.id === existingUser.id ? user : candidate))
      : [...users, user]
  );

  const currentSession = {
    userId: user.id,
    startedAt: now
  };
  const accessToken = authSession?.access_token || authSession?.accessToken;
  const refreshToken = authSession?.refresh_token || authSession?.refreshToken;

  if (accessToken) {
    currentSession.accessToken = accessToken;
  }

  if (refreshToken) {
    currentSession.refreshToken = refreshToken;
  }

  setItem(STORAGE_KEYS.currentSession, currentSession);
  await hydrateSupabasePermissionOverrides(user.id);

  return sanitizeUser(user);
}

async function loadSupabaseProfile(userId) {
  const client = await getSupabaseClient();

  if (!client?.from) {
    throw new Error('Nao foi possivel carregar o perfil do usuario.');
  }

  const query = client
    .from('profiles')
    .select('id,name,role_id,is_active,empresa_id')
    .eq('id', userId);
  const result = typeof query.maybeSingle === 'function'
    ? await query.maybeSingle()
    : await query.single();
  const profile = Array.isArray(result.data) ? result.data[0] : result.data;

  if (result.error || !profile?.role_id) {
    throw new Error('Nao foi possivel carregar o perfil do usuario.');
  }

  if (profile.is_active === false) {
    throw new Error('Usuario inativo.');
  }

  return profile;
}

async function hydrateSupabasePermissionOverrides(userId) {
  const client = await getSupabaseClient();

  if (!client?.from) {
    return;
  }

  const query = client
    .from('user_permission_overrides')
    .select('permission_id,state')
    .eq('user_id', userId);
  const result = await query;

  if (result.error || !Array.isArray(result.data)) {
    return;
  }

  setItem(STORAGE_KEYS.userPermissionOverrides, {
    ...getItem(STORAGE_KEYS.userPermissionOverrides, {}),
    [userId]: result.data.reduce((overrides, row) => {
      if (row.state === 'allow' || row.state === 'deny') {
        overrides[row.permission_id] = row.state;
      }

      return overrides;
    }, {})
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().replace(/,com$/i, '.com');
}

function isValidRole(role) {
  return VALID_ROLES.has(role);
}

function normalizeRoleLocal(role) {
  const normalizedRole = String(role || '').trim();

  if (normalizedRole === 'caixa' || normalizedRole === 'operator') {
    return 'operador';
  }

  return normalizedRole;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
