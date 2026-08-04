import { STORAGE_KEYS } from '../database/schema.js?v=20260804-06';
import { getRuntimeConfig, isSupabaseEnabled } from './app-config.service.js?v=20260804-06';
import { createUser, deleteUser, getUsers, updateUser } from './auth.service.js?v=20260804-06';
import {
  PERMISSIONS,
  getRolePermissions,
  normalizeRole,
  setUserPermissionOverride
} from './permission.service.js?v=20260804-06';
import { getItem, setItem } from './storage.service.js?v=20260804-06';
import { getSupabaseAuthSession } from './supabase-client.service.js?v=20260804-06';

const LAST_ADMIN_ERROR = 'Nao e permitido desativar o ultimo administrador ativo.';

export function loadManagedUsers() {
  if (isSupabaseEnabled()) {
    return invokeAdminUsersFunction('listUsers', {}).then((result) => {
      const users = Array.isArray(result?.users) ? result.users : [];
      cacheManagedUsers(users);
      return getUsers();
    });
  }

  return Promise.resolve(getUsers());
}

export function createManagedUser(input) {
  const payload = {
    ...input,
    role: normalizeRole(input?.role)
  };

  if (isSupabaseEnabled()) {
    validateSupabaseCreatePayload(payload);
    return invokeAdminUsersFunction('createUser', payload).then((result) => cacheManagedUser(result?.user || result));
  }

  return createUser(payload);
}

function validateSupabaseCreatePayload(payload) {
  const username = String(payload?.username || payload?.email || '').trim();
  const password = String(payload?.password || '').trim();

  if (!isValidEmail(username)) {
    throw new Error('No modo online, o campo Usuario precisa ser um e-mail valido.');
  }

  if (password.length < 6) {
    throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function updateManagedUser(userId, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return updateUser(userId, patch);
  }

  const payload = { ...patch };

  if (Object.hasOwn(payload, 'role')) {
    payload.role = normalizeRole(payload.role);
  }

  if (isSupabaseEnabled()) {
    if (Object.hasOwn(payload, 'username')) {
      payload.email = payload.username;
      delete payload.username;
    }
    return invokeAdminUsersFunction('updateUser', { userId, patch: payload }).then((result) => cacheManagedUser(result?.user || result));
  }

  assertCanUpdateAdminStatus(userId, payload);
  return updateUser(userId, payload);
}

export function saveManagedPermissionChecklist(user, checklist) {
  const normalizedRole = normalizeRole(user?.role);

  if (!user?.id || normalizedRole === 'admin') {
    return user || null;
  }

  const overrides = buildPermissionOverrides(normalizedRole, checklist);

  if (isSupabaseEnabled()) {
    return invokeAdminUsersFunction('savePermissionOverrides', {
      userId: user.id,
      overrides
    }).then((result) => {
      const returnedUser = result?.user || result;

      if (returnedUser) {
        return cacheManagedUser(returnedUser);
      }

      writePermissionOverrides(user.id, overrides);
      return user;
    });
  }

  writePermissionOverrides(user.id, overrides);
  return user;
}

export function deleteManagedUser(userId) {
  if (isSupabaseEnabled()) {
    return invokeAdminUsersFunction('deleteUser', { userId }).then((result) => {
      const deletedUser = result?.user || result;
      removeCachedManagedUser(userId);
      return deletedUser;
    });
  }

  assertCanDeleteUser(userId);
  const deletedUser = deleteUser(userId);
  removeCachedPermissionOverrides(userId);
  return deletedUser;
}

function assertCanUpdateAdminStatus(userId, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return;
  }

  const willDeactivate = Object.hasOwn(patch, 'active') && patch.active === false;
  const willLeaveAdminRole = Object.hasOwn(patch, 'role') && normalizeRole(patch.role) !== 'admin';

  if (!willDeactivate && !willLeaveAdminRole) {
    return;
  }

  const users = getUsers();
  const existingUser = users.find((user) => user.id === userId);

  if (normalizeRole(existingUser?.role) !== 'admin' || existingUser.active === false) {
    return;
  }

  const activeAdminCount = users.filter((user) => (
    user.id !== userId
      && user.active !== false
      && normalizeRole(user.role) === 'admin'
  )).length;

  if (activeAdminCount === 0) {
    throw new Error(LAST_ADMIN_ERROR);
  }
}

function assertCanDeleteUser(userId) {
  const users = getUsers();
  const existingUser = users.find((user) => user.id === userId);

  if (!existingUser) {
    throw new Error('Usuario nao encontrado.');
  }

  if (existingUser.active === false || normalizeRole(existingUser.role) !== 'admin') {
    return;
  }

  const activeAdminCount = users.filter((user) => (
    user.id !== userId
      && user.active !== false
      && normalizeRole(user.role) === 'admin'
  )).length;

  if (activeAdminCount === 0) {
    throw new Error(LAST_ADMIN_ERROR);
  }
}

function buildPermissionOverrides(role, checklist) {
  const rolePermissions = new Set(getRolePermissions(role));

  return PERMISSIONS.reduce((overrides, permission) => {
    const desiredState = checklist?.[permission.id] === true;
    const defaultState = rolePermissions.has(permission.id);

    if (desiredState !== defaultState) {
      overrides[permission.id] = desiredState ? 'allow' : 'deny';
    } else {
      overrides[permission.id] = 'default';
    }

    return overrides;
  }, {});
}

function writePermissionOverrides(userId, overrides) {
  PERMISSIONS.forEach((permission) => {
    setUserPermissionOverride(userId, permission.id, overrides[permission.id] || 'default');
  });
}

async function invokeAdminUsersFunction(action, payload) {
  const config = getRuntimeConfig();
  const request = async (forceRefresh = false) => fetch(`${config.supabaseUrl}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${await getBearerToken({ forceRefresh })}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, payload })
  });
  let response = await request();

  if (response.status === 401) {
    response = await request(true);
  }

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel salvar o usuario.');
  }

  return data || null;
}

async function getBearerToken({ forceRefresh = false } = {}) {
  const cachedSession = getItem(STORAGE_KEYS.currentSession, null);
  let authSession = null;

  try {
    authSession = await getSupabaseAuthSession({ forceRefresh });
  } catch (error) {
    if (forceRefresh) {
      throw new Error('Sessao administrativa expirada. Entre novamente.');
    }
  }

  const token = authSession?.access_token
    || authSession?.accessToken
    || cachedSession?.access_token
    || cachedSession?.accessToken;

  if (!token) {
    throw new Error('Entre novamente com seu usuario Supabase para gerenciar usuarios.');
  }

  if (authSession?.access_token || authSession?.accessToken) {
    setItem(STORAGE_KEYS.currentSession, {
      ...cachedSession,
      accessToken: authSession.access_token || authSession.accessToken,
      refreshToken: authSession.refresh_token || authSession.refreshToken || cachedSession?.refreshToken,
      expiresAt: authSession.expires_at || authSession.expiresAt || cachedSession?.expiresAt
    });
  }

  return token;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function cacheManagedUser(user) {
  if (!user?.id) {
    return user;
  }

  const users = getItem(STORAGE_KEYS.users, []);
  const cachedUser = {
    ...user,
    role: normalizeRole(user.role)
  };
  const hasUser = users.some((candidate) => candidate.id === cachedUser.id);

  setItem(
    STORAGE_KEYS.users,
    hasUser
      ? users.map((candidate) => (candidate.id === cachedUser.id ? { ...candidate, ...cachedUser } : candidate))
      : [...users, cachedUser]
  );

  return cachedUser;
}

function cacheManagedUsers(remoteUsers) {
  if (!Array.isArray(remoteUsers)) {
    return;
  }

  setItem(
    STORAGE_KEYS.users,
    remoteUsers
      .filter((user) => user?.id)
      .map((user) => ({
        ...user,
        role: normalizeRole(user.role)
      }))
  );
}

function removeCachedManagedUser(userId) {
  const users = getItem(STORAGE_KEYS.users, []);
  setItem(STORAGE_KEYS.users, users.filter((user) => user.id !== userId));
  removeCachedPermissionOverrides(userId);
}

function removeCachedPermissionOverrides(userId) {
  const overrides = getItem(STORAGE_KEYS.userPermissionOverrides, {});

  if (!overrides || typeof overrides !== 'object') {
    return;
  }

  const nextOverrides = { ...overrides };
  delete nextOverrides[userId];
  setItem(STORAGE_KEYS.userPermissionOverrides, nextOverrides);
}
