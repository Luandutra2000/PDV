import { STORAGE_KEYS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';

export function getUsers() {
  return getItem(STORAGE_KEYS.users, []);
}

export function getActiveUsers() {
  return getUsers().filter((user) => user.active !== false);
}

export function getCurrentUser() {
  const session = getItem(STORAGE_KEYS.currentSession, null);

  if (!session?.userId) {
    return null;
  }

  return getUsers().find((user) => user.id === session.userId) || null;
}

export function login({ username, password }) {
  const normalizedUsername = String(username || '').trim();
  const user = getUsers().find((candidate) => candidate.username === normalizedUsername);

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
  const users = getUsers();
  const name = String(input.name || '').trim();
  const username = String(input.username || '').trim();
  const role = String(input.role || '').trim();

  if (!name || !username || !input.password || !role) {
    throw new Error('Preencha nome, usuario, senha e perfil.');
  }

  if (users.some((user) => user.username === username)) {
    throw new Error('Ja existe usuario com este login.');
  }

  const now = new Date().toISOString();
  const user = {
    id: createId('user'),
    name,
    username,
    password: String(input.password),
    role,
    active: true,
    createdAt: now,
    updatedAt: now
  };

  setItem(STORAGE_KEYS.users, [...users, user]);

  return sanitizeUser(user);
}

export function updateUser(userId, patch) {
  let updatedUser = null;
  const users = getUsers().map((user) => {
    if (user.id !== userId) {
      return user;
    }

    updatedUser = {
      ...user,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    return updatedUser;
  });

  if (!updatedUser) {
    throw new Error('Usuario nao encontrado.');
  }

  setItem(STORAGE_KEYS.users, users);

  return sanitizeUser(updatedUser);
}

export function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const { password, ...safeUser } = user;
  return safeUser;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
