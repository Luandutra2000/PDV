import { STORAGE_KEYS } from '../database/schema.js';
import { isSupabaseEnabled } from './app-config.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { getItem, setItem } from './storage.service.js';

const VALID_ROLES = new Set(['admin', 'operator']);
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

  if (isSupabaseEnabled() && normalizedUsername.includes('@')) {
    return loginWithSupabase({ email: normalizedUsername, password });
  }

  const user = getRawUsers().find((candidate) => candidate.username === normalizedUsername);

  if (!user || user.password !== password) {
    throw new Error('Usuario ou senha invalidos.');
  }

  if (user.active === false) {
    throw new Error('Usuario inativo.');
  }

  const session = {
    userId: user.id,
    startedAt: new Date().toISOString()
  };

  setItem(STORAGE_KEYS.currentSession, session);

  return { user: sanitizeUser(user), session };
}

export function logout() {
  setItem(STORAGE_KEYS.currentSession, null);
}

export async function restoreSupabaseSession() {
  if (!isSupabaseEnabled() || getCurrentUser()) {
    return getCurrentUser();
  }

  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getUser();

  if (error || !data?.user) {
    return null;
  }

  return ensureSupabaseLocalSession(data.user);
}

export function createUser(input) {
  const users = getRawUsers();
  const name = String(input.name || '').trim();
  const username = String(input.username || '').trim();
  const password = String(input.password || '').trim();
  const role = String(input.role || '').trim();

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
    const role = String(patch.role || '').trim();
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
  const client = await getSupabaseClient();
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizedEmail,
    password: String(password || '')
  });

  if (error || !data?.user) {
    throw new Error('Usuario ou senha invalidos.');
  }

  return {
    user: ensureSupabaseLocalSession(data.user),
    session: data.session
  };
}

function ensureSupabaseLocalSession(authUser) {
  const users = getRawUsers();
  const email = normalizeEmail(authUser.email || '');
  const existingUser = users.find((user) => user.id === authUser.id || user.username === email);
  const now = new Date().toISOString();
  const user = {
    ...(existingUser || {}),
    id: authUser.id,
    name: existingUser?.name || authUser.user_metadata?.name || email || 'Usuario',
    username: email,
    password: existingUser?.password || '',
    role: existingUser?.role || authUser.user_metadata?.role || 'admin',
    active: true,
    createdAt: existingUser?.createdAt || now,
    updatedAt: now
  };

  setItem(
    STORAGE_KEYS.users,
    existingUser
      ? users.map((candidate) => (candidate.id === existingUser.id ? user : candidate))
      : [...users, user]
  );

  setItem(STORAGE_KEYS.currentSession, {
    userId: user.id,
    startedAt: now
  });

  return sanitizeUser(user);
}

function normalizeEmail(email) {
  return String(email || '').trim().replace(/,com$/i, '.com');
}

function isValidRole(role) {
  return VALID_ROLES.has(role);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
