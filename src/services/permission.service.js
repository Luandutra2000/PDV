import { STORAGE_KEYS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';

export const ROLES = {
  admin: 'admin',
  gerente: 'gerente',
  caixa: 'caixa',
  operador: 'operador',
  operator: 'operator',
  dono: 'dono'
};

const PERMISSION_ALIASES = {
  'financial.view': 'financial.expense.access',
  'financial.transaction.create': 'financial.income.create',
  'financial.transaction.edit': 'financial.entries.edit',
  'financial.transaction.cancel': 'financial.entries.delete',
  'financial.category.manage': 'financial.categories.manage',
  'financial.payable.pay': 'financial.bill.pay'
};

const PERMISSION_DEFINITIONS = [
  {
    id: 'sales.access',
    label: 'Acessar frente de caixa',
    group: 'Vendas',
    module: 'sales',
    description: 'Permite abrir a frente de caixa e comandas.',
    defaultRoles: ['gerente', 'caixa', 'operador']
  },
  {
    id: 'sales.create',
    label: 'Finalizar venda',
    group: 'Vendas',
    module: 'sales',
    description: 'Permite concluir comandas e registrar pagamentos.',
    defaultRoles: ['gerente', 'caixa', 'operador']
  },
  {
    id: 'sales.cancel',
    label: 'Cancelar venda',
    group: 'Vendas',
    module: 'sales',
    description: 'Permite cancelar comandas ja lancadas.',
    defaultRoles: ['gerente']
  },
  {
    id: 'sales.discount',
    label: 'Aplicar desconto',
    group: 'Vendas',
    module: 'sales',
    description: 'Permite conceder descontos na venda.',
    defaultRoles: ['gerente']
  },
  {
    id: 'cash.movement',
    label: 'Registrar entrada',
    group: 'Caixa',
    module: 'cash',
    description: 'Permite lancar entradas no caixa.',
    defaultRoles: ['gerente', 'caixa', 'operador']
  },
  {
    id: 'cash.withdrawal',
    label: 'Registrar saida',
    group: 'Caixa',
    module: 'cash',
    description: 'Permite lancar saidas e sangrias.',
    defaultRoles: ['gerente', 'caixa', 'operador']
  },
  {
    id: 'cash.close',
    label: 'Fechar caixa',
    group: 'Caixa',
    module: 'cash',
    description: 'Permite conferir e fechar o caixa.',
    defaultRoles: ['gerente', 'caixa']
  },
  {
    id: 'cash.balance.view',
    label: 'Ver saldo do caixa',
    group: 'Caixa',
    module: 'cash',
    description: 'Permite visualizar saldo e resumo do caixa.',
    defaultRoles: ['gerente', 'caixa', 'dono']
  },
  {
    id: 'showcase.access',
    label: 'Acessar vitrine',
    group: 'Vitrine/Estoque',
    module: 'showcase',
    description: 'Permite abrir a tela de vitrine.',
    defaultRoles: ['gerente', 'caixa', 'operador']
  },
  {
    id: 'showcase.launch',
    label: 'Lancar producao',
    group: 'Vitrine/Estoque',
    module: 'showcase',
    description: 'Permite lancar ou atualizar producao.',
    defaultRoles: ['gerente', 'operador']
  },
  {
    id: 'showcase.edit',
    label: 'Editar vitrine',
    group: 'Vitrine/Estoque',
    module: 'showcase',
    description: 'Permite ajustar itens ja lancados.',
    defaultRoles: ['gerente']
  },
  {
    id: 'stock.writeoff',
    label: 'Baixar estoque',
    group: 'Vitrine/Estoque',
    module: 'stock',
    description: 'Permite registrar perdas e baixas.',
    defaultRoles: ['gerente']
  },
  {
    id: 'products.manage',
    label: 'Gerenciar produtos',
    group: 'Gestao',
    module: 'products',
    description: 'Permite criar, editar e remover produtos.',
    defaultRoles: ['gerente']
  },
  {
    id: 'categories.manage',
    label: 'Gerenciar categorias',
    group: 'Gestao',
    module: 'products',
    description: 'Permite organizar categorias do cardapio.',
    defaultRoles: ['gerente']
  },
  {
    id: 'reports.view',
    label: 'Ver relatorios',
    group: 'Gestao',
    module: 'reports',
    description: 'Permite consultar relatorios e historicos.',
    defaultRoles: ['gerente', 'dono']
  },
  {
    id: 'crm.view',
    label: 'Ver CRM',
    group: 'Gestao',
    module: 'crm',
    description: 'Permite acessar clientes, fiado e CRM.',
    defaultRoles: ['gerente', 'dono']
  },
  {
    id: 'owner_app.view',
    label: 'Acessar App do Dono',
    group: 'Gestao',
    module: 'owner_app',
    description: 'Permite acessar o painel mobile do dono.',
    defaultRoles: ['gerente', 'dono']
  },
  {
    id: 'financial.expense.access',
    label: 'Acessar despesas',
    group: 'Financeiro/Despesas',
    module: 'financial',
    description: 'Permite abrir despesas e financeiro.',
    defaultRoles: ['gerente', 'dono']
  },
  {
    id: 'financial.income.create',
    label: 'Criar entrada financeira',
    group: 'Financeiro/Despesas',
    module: 'financial',
    description: 'Permite registrar receitas avulsas.',
    defaultRoles: ['gerente', 'dono']
  },
  {
    id: 'financial.expense.create',
    label: 'Criar saida financeira',
    group: 'Financeiro/Despesas',
    module: 'financial',
    description: 'Permite registrar despesas e saidas.',
    defaultRoles: ['gerente']
  },
  {
    id: 'financial.entries.edit',
    label: 'Editar lancamentos financeiros',
    group: 'Financeiro/Despesas',
    module: 'financial',
    description: 'Permite corrigir lancamentos.',
    defaultRoles: ['gerente', 'dono']
  },
  {
    id: 'financial.entries.delete',
    label: 'Excluir lancamentos financeiros',
    group: 'Financeiro/Despesas',
    module: 'financial',
    description: 'Permite remover lancamentos.',
    defaultRoles: ['dono']
  },
  {
    id: 'financial.categories.manage',
    label: 'Gerenciar categorias financeiras',
    group: 'Financeiro/Despesas',
    module: 'financial',
    description: 'Permite criar e editar categorias financeiras.',
    defaultRoles: ['gerente', 'dono']
  },
  {
    id: 'financial.bill.pay',
    label: 'Marcar conta como paga',
    group: 'Financeiro/Despesas',
    module: 'financial',
    description: 'Permite baixar contas em aberto.',
    defaultRoles: ['gerente', 'dono']
  },
  {
    id: 'users.manage',
    label: 'Cadastrar usuarios',
    group: 'Sistema',
    module: 'users',
    description: 'Permite criar novos usuarios.',
    defaultRoles: []
  },
  {
    id: 'users.edit',
    label: 'Editar usuarios',
    group: 'Sistema',
    module: 'users',
    description: 'Permite alterar dados e status de usuarios.',
    defaultRoles: []
  },
  {
    id: 'users.delete',
    label: 'Excluir usuarios',
    group: 'Sistema',
    module: 'users',
    description: 'Permite remover usuarios cadastrados.',
    defaultRoles: []
  },
  {
    id: 'permissions.manage',
    label: 'Editar permissoes',
    group: 'Sistema',
    module: 'permissions',
    description: 'Permite alterar checklist de permissoes.',
    defaultRoles: []
  },
  {
    id: 'company_settings.manage',
    label: 'Configurar empresa',
    group: 'Sistema',
    module: 'company_settings',
    description: 'Permite alterar logo, nome e cores do sistema.',
    defaultRoles: ['dono']
  },
  {
    id: 'audit.view',
    label: 'Ver auditoria',
    group: 'Sistema',
    module: 'audit',
    description: 'Permite ver historico completo de acoes.',
    defaultRoles: ['gerente', 'dono']
  },
  {
    id: 'data.export',
    label: 'Exportar dados',
    group: 'Sistema',
    module: 'data',
    description: 'Permite exportar dados do sistema.',
    defaultRoles: []
  }
];

export const PERMISSIONS = PERMISSION_DEFINITIONS.map((permission) => ({
  ...permission,
  key: permission.id,
  name: permission.label,
  defaultRoles: [...permission.defaultRoles]
}));

export const ROLE_PERMISSION_DEFAULTS = buildRolePermissionDefaults();

const PERMISSION_IDS = new Set(PERMISSIONS.map((permission) => permission.id));
const VALID_OVERRIDE_STATES = new Set(['default', 'allow', 'deny']);
const DENIED_PERMISSION_ERROR = 'Usuario sem permissao para esta acao.';

function buildRolePermissionDefaults() {
  const defaults = {
    admin: PERMISSION_DEFINITIONS.map((permission) => permission.id),
    gerente: [],
    caixa: [],
    operador: [],
    dono: []
  };

  PERMISSION_DEFINITIONS.forEach((permission) => {
    permission.defaultRoles.forEach((role) => {
      defaults[role]?.push(permission.id);
    });
  });

  defaults.operator = defaults.operador;

  return defaults;
}

export function resolvePermissionId(permissionId) {
  return PERMISSION_ALIASES[permissionId] || permissionId;
}

function isKnownPermission(permissionId) {
  return PERMISSION_IDS.has(resolvePermissionId(permissionId));
}

function assertKnownPermission(permissionId) {
  if (!isKnownPermission(permissionId)) {
    throw new Error('Permissao desconhecida.');
  }
}

export function hasPermission(user, permissionId) {
  const resolvedPermissionId = resolvePermissionId(permissionId);

  if (!isKnownPermission(resolvedPermissionId)) {
    return false;
  }

  if (!user || user.active === false) {
    return false;
  }

  if (user.role === ROLES.admin) {
    return true;
  }

  const override = getUserPermissionOverride(user.id, resolvedPermissionId);

  if (override === 'deny') {
    return false;
  }

  if (override === 'allow') {
    return true;
  }

  return getRolePermissions(getPermissionRole(user.role)).includes(resolvedPermissionId);
}

export function can(permissionId, user) {
  return hasPermission(user, permissionId);
}

export function requirePermission(permissionId, user, metadata = {}) {
  const resolvedPermissionId = resolvePermissionId(permissionId);

  if (!hasPermission(user, resolvedPermissionId)) {
    recordPermissionDenied(user, resolvedPermissionId, metadata);
    throw new Error(DENIED_PERMISSION_ERROR);
  }
}

export function assertPermission(user, permissionId, metadata) {
  requirePermission(permissionId, user, metadata);
}

export function getUserPermissionOverride(userId, permissionId) {
  const resolvedPermissionId = resolvePermissionId(permissionId);
  assertKnownPermission(resolvedPermissionId);

  const overrides = getItem(STORAGE_KEYS.userPermissionOverrides, {});
  const userOverrides = overrides[userId] || {};

  if (userOverrides[resolvedPermissionId]) {
    return userOverrides[resolvedPermissionId];
  }

  const legacyPermissionId = getLegacyPermissionIds(resolvedPermissionId)
    .find((aliasPermissionId) => userOverrides[aliasPermissionId]);

  return legacyPermissionId ? userOverrides[legacyPermissionId] : 'default';
}

export function setUserPermissionOverride(userId, permissionId, state) {
  const resolvedPermissionId = resolvePermissionId(permissionId);
  assertKnownPermission(resolvedPermissionId);

  if (!VALID_OVERRIDE_STATES.has(state)) {
    throw new Error('Estado de permissao invalido.');
  }

  const overrides = getItem(STORAGE_KEYS.userPermissionOverrides, {});
  const userOverrides = { ...(overrides[userId] || {}) };
  const permissionKeys = [resolvedPermissionId, ...getLegacyPermissionIds(resolvedPermissionId)];

  if (state === 'default') {
    permissionKeys.forEach((permissionKey) => {
      delete userOverrides[permissionKey];
    });
  } else {
    getLegacyPermissionIds(resolvedPermissionId).forEach((permissionKey) => {
      delete userOverrides[permissionKey];
    });
    userOverrides[resolvedPermissionId] = state;
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
  const permissionRole = getPermissionRole(role);
  return [...(ROLE_PERMISSION_DEFAULTS[permissionRole] || [])];
}

export function normalizeRole(role) {
  if (role === ROLES.caixa || role === ROLES.operator) {
    return ROLES.operador;
  }

  return role || ROLES.operador;
}

function getPermissionRole(role) {
  if (role === ROLES.caixa) {
    return ROLES.caixa;
  }

  return normalizeRole(role);
}

function getLegacyPermissionIds(permissionId) {
  return Object.entries(PERMISSION_ALIASES)
    .filter(([, canonicalPermissionId]) => canonicalPermissionId === permissionId)
    .map(([aliasPermissionId]) => aliasPermissionId);
}

function recordPermissionDenied(user, permissionId, metadata) {
  const logs = getItem(STORAGE_KEYS.auditLogs, []);
  const entry = {
    id: createId('audit'),
    action: 'permission.denied',
    entityType: 'permission',
    entityId: permissionId,
    userId: user?.id || '',
    userName: user?.name || 'Sistema',
    reason: DENIED_PERMISSION_ERROR,
    metadata: {
      ...normalizeMetadata(metadata),
      permissionId
    },
    createdAt: new Date().toISOString()
  };

  setItem(STORAGE_KEYS.auditLogs, [entry, ...logs]);
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
