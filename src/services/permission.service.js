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

export const PERMISSIONS = [
  { id: 'sales.access', label: 'Acessar frente de caixa', group: 'Vendas', description: 'Permite abrir a frente de caixa e comandas.' },
  { id: 'sales.create', label: 'Finalizar venda', group: 'Vendas', description: 'Permite concluir comandas e registrar pagamentos.' },
  { id: 'sales.cancel', label: 'Cancelar venda', group: 'Vendas', description: 'Permite cancelar comandas ja lancadas.' },
  { id: 'sales.discount', label: 'Aplicar desconto', group: 'Vendas', description: 'Permite conceder descontos na venda.' },
  { id: 'cash.movement', label: 'Registrar entrada', group: 'Caixa', description: 'Permite lancar entradas no caixa.' },
  { id: 'cash.withdrawal', label: 'Registrar saida', group: 'Caixa', description: 'Permite lancar saidas e sangrias.' },
  { id: 'cash.close', label: 'Fechar caixa', group: 'Caixa', description: 'Permite conferir e fechar o caixa.' },
  { id: 'cash.balance.view', label: 'Ver saldo do caixa', group: 'Caixa', description: 'Permite visualizar saldo e resumo do caixa.' },
  { id: 'showcase.access', label: 'Acessar vitrine', group: 'Vitrine/Estoque', description: 'Permite abrir a tela de vitrine.' },
  { id: 'showcase.launch', label: 'Lancar producao', group: 'Vitrine/Estoque', description: 'Permite lancar ou atualizar producao.' },
  { id: 'showcase.edit', label: 'Editar vitrine', group: 'Vitrine/Estoque', description: 'Permite ajustar itens ja lancados.' },
  { id: 'stock.writeoff', label: 'Baixar estoque', group: 'Vitrine/Estoque', description: 'Permite registrar perdas e baixas.' },
  { id: 'products.manage', label: 'Gerenciar produtos', group: 'Gestao', description: 'Permite criar, editar e remover produtos.' },
  { id: 'categories.manage', label: 'Gerenciar categorias', group: 'Gestao', description: 'Permite organizar categorias do cardapio.' },
  { id: 'reports.view', label: 'Ver relatorios', group: 'Gestao', description: 'Permite consultar relatorios e historicos.' },
  { id: 'crm.view', label: 'Ver CRM', group: 'Gestao', description: 'Permite acessar clientes, fiado e CRM.' },
  { id: 'owner_app.view', label: 'Acessar App do Dono', group: 'Gestao', description: 'Permite acessar o painel mobile do dono.' },
  { id: 'financial.view', label: 'Acessar financeiro', group: 'Financeiro/Despesas', description: 'Permite abrir a aba Financeiro.' },
  { id: 'financial.transaction.create', label: 'Criar lancamento financeiro', group: 'Financeiro/Despesas', description: 'Permite registrar entradas, saidas e boletos.' },
  { id: 'financial.transaction.edit', label: 'Editar lancamento financeiro', group: 'Financeiro/Despesas', description: 'Permite corrigir lancamentos financeiros.' },
  { id: 'financial.transaction.cancel', label: 'Cancelar lancamento financeiro', group: 'Financeiro/Despesas', description: 'Permite cancelar lancamentos mantendo historico.' },
  { id: 'financial.category.manage', label: 'Gerenciar categorias financeiras', group: 'Financeiro/Despesas', description: 'Permite criar, editar e inativar categorias financeiras.' },
  { id: 'financial.payable.pay', label: 'Marcar conta como paga', group: 'Financeiro/Despesas', description: 'Permite baixar contas pendentes ou vencidas.' },
  { id: 'financial.expense.access', label: 'Acessar despesas', group: 'Financeiro/Despesas', description: 'Permite abrir despesas e financeiro.' },
  { id: 'financial.income.create', label: 'Criar entrada financeira', group: 'Financeiro/Despesas', description: 'Permite registrar receitas avulsas.' },
  { id: 'financial.expense.create', label: 'Criar saida financeira', group: 'Financeiro/Despesas', description: 'Permite registrar despesas e saidas.' },
  { id: 'financial.entries.edit', label: 'Editar lancamentos financeiros', group: 'Financeiro/Despesas', description: 'Permite corrigir lancamentos.' },
  { id: 'financial.entries.delete', label: 'Excluir lancamentos financeiros', group: 'Financeiro/Despesas', description: 'Permite remover lancamentos.' },
  { id: 'financial.categories.manage', label: 'Gerenciar categorias financeiras', group: 'Financeiro/Despesas', description: 'Permite criar e editar categorias financeiras.' },
  { id: 'financial.bill.pay', label: 'Marcar conta como paga', group: 'Financeiro/Despesas', description: 'Permite baixar contas em aberto.' },
  { id: 'users.manage', label: 'Cadastrar usuarios', group: 'Sistema', description: 'Permite criar novos usuarios.' },
  { id: 'users.edit', label: 'Editar usuarios', group: 'Sistema', description: 'Permite alterar dados e status de usuarios.' },
  { id: 'permissions.manage', label: 'Editar permissoes', group: 'Sistema', description: 'Permite alterar checklist de permissoes.' },
  { id: 'audit.view', label: 'Ver auditoria', group: 'Sistema', description: 'Permite ver historico completo de acoes.' },
  { id: 'data.export', label: 'Exportar dados', group: 'Sistema', description: 'Permite exportar dados do sistema.' }
];

export const ROLE_PERMISSION_DEFAULTS = {
  admin: PERMISSIONS.map((permission) => permission.id),
  gerente: [
    'sales.access',
    'sales.create',
    'sales.cancel',
    'sales.discount',
    'cash.movement',
    'cash.withdrawal',
    'cash.close',
    'cash.balance.view',
    'showcase.access',
    'showcase.launch',
    'showcase.edit',
    'stock.writeoff',
    'products.manage',
    'categories.manage',
    'reports.view',
    'crm.view',
    'owner_app.view',
    'financial.view',
    'financial.transaction.create',
    'financial.transaction.edit',
    'financial.category.manage',
    'financial.payable.pay',
    'financial.expense.access',
    'financial.income.create',
    'financial.expense.create',
    'financial.entries.edit',
    'financial.categories.manage',
    'financial.bill.pay',
    'audit.view'
  ],
  caixa: [
    'sales.access',
    'sales.create',
    'cash.movement',
    'cash.withdrawal',
    'cash.close',
    'cash.balance.view',
    'showcase.access'
  ],
  operador: [
    'sales.access',
    'sales.create',
    'cash.movement',
    'cash.withdrawal',
    'showcase.access',
    'showcase.launch'
  ],
  dono: [
    'cash.balance.view',
    'reports.view',
    'crm.view',
    'owner_app.view',
    'financial.view',
    'financial.transaction.create',
    'financial.transaction.edit',
    'financial.transaction.cancel',
    'financial.category.manage',
    'financial.payable.pay',
    'financial.expense.access',
    'audit.view'
  ]
};

ROLE_PERMISSION_DEFAULTS.operator = ROLE_PERMISSION_DEFAULTS.operador;

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

  return getRolePermissions(normalizeRole(user.role)).includes(permissionId);
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
  return [...(ROLE_PERMISSION_DEFAULTS[normalizeRole(role)] || [])];
}

export function normalizeRole(role) {
  if (role === ROLES.operator) {
    return ROLES.operador;
  }

  return role || ROLES.operador;
}
