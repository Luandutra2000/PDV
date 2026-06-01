import { STORAGE_KEYS } from '../database/schema.js';
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

function isValidRole(role) {
  return VALID_ROLES.has(role);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
