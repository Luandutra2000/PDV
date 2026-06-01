import { STORAGE_KEYS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';

export const ROLES = {
  admin: 'admin',
  operator: 'operator'
};

export const PERMISSIONS = [
  { id: 'sales.access', label: 'Acessar frente de caixa', group: 'Vendas' },
  { id: 'sales.create', label: 'Finalizar venda', group: 'Vendas' },
  { id: 'sales.cancel', label: 'Cancelar venda', group: 'Vendas' },
  { id: 'sales.discount', label: 'Aplicar desconto', group: 'Vendas' },
  { id: 'cash.movement', label: 'Registrar entrada, saida e sangria', group: 'Caixa' },
  { id: 'cash.close', label: 'Fechar caixa', group: 'Caixa' },
  { id: 'showcase.access', label: 'Acessar vitrine', group: 'Vitrine/Estoque' },
  { id: 'showcase.launch', label: 'Lancar vitrine/producao', group: 'Vitrine/Estoque' },
  { id: 'products.manage', label: 'Gerenciar produtos', group: 'Gestao' },
  { id: 'reports.view', label: 'Ver relatorios', group: 'Gestao' },
  { id: 'owner_app.view', label: 'Acessar App do Dono', group: 'Gestao' },
  { id: 'users.manage', label: 'Cadastrar e editar usuarios', group: 'Sistema' },
  { id: 'permissions.manage', label: 'Editar permissoes', group: 'Sistema' },
  { id: 'audit.view', label: 'Ver auditoria', group: 'Sistema' }
];

const OPERATOR_PERMISSIONS = new Set([
  'sales.access',
  'sales.create',
  'sales.cancel',
  'cash.movement',
  'cash.close',
  'showcase.access',
  'showcase.launch'
]);

const PERMISSION_IDS = new Set(PERMISSIONS.map((permission) => permission.id));
const VALID_OVERRIDE_STATES = new Set(['default', 'allow', 'deny']);

function isKnownPermission(permissionId) {
  return PERMISSION_IDS.has(permissionId);
}

function assertKnownPermission(permissionId) {
  if (!isKnownPermission(permissionId)) {
    throw new Error('Permissao desconhecida.');
  }
}

export function hasPermission(user, permissionId) {
  if (!isKnownPermission(permissionId)) {
    return false;
  }

  if (!user || user.active === false) {
    return false;
  }

  if (user.role === ROLES.admin) {
    return true;
  }

  const override = getUserPermissionOverride(user.id, permissionId);

  if (override === 'deny') {
    return false;
  }

  if (override === 'allow') {
    return true;
  }

  return user.role === ROLES.operator && OPERATOR_PERMISSIONS.has(permissionId);
}

export function assertPermission(user, permissionId) {
  if (!hasPermission(user, permissionId)) {
    throw new Error('Usuario sem permissao para esta acao.');
  }
}

export function getUserPermissionOverride(userId, permissionId) {
  assertKnownPermission(permissionId);

  const overrides = getItem(STORAGE_KEYS.userPermissionOverrides, {});
  return overrides[userId]?.[permissionId] || 'default';
}

export function setUserPermissionOverride(userId, permissionId, state) {
  assertKnownPermission(permissionId);

  if (!VALID_OVERRIDE_STATES.has(state)) {
    throw new Error('Estado de permissao invalido.');
  }

  const overrides = getItem(STORAGE_KEYS.userPermissionOverrides, {});
  const userOverrides = { ...(overrides[userId] || {}) };

  if (state === 'default') {
    delete userOverrides[permissionId];
  } else {
    userOverrides[permissionId] = state;
  }

  const nextOverrides = { ...overrides };

  if (Object.keys(userOverrides).length === 0) {
    delete nextOverrides[userId];
  } else {
    nextOverrides[userId] = userOverrides;
  }

  setItem(STORAGE_KEYS.userPermissionOverrides, nextOverrides);
}

export function getRolePermissions(role) {
  if (role === ROLES.admin) {
    return PERMISSIONS.map((permission) => permission.id);
  }

  if (role === ROLES.operator) {
    return Array.from(OPERATOR_PERMISSIONS);
  }

  return [];
}
