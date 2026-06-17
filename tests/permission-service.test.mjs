const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertThrows = (callback, expectedMessage, message) => {
  try {
    callback();
  } catch (error) {
    assert(
      error.message.includes(expectedMessage),
      `${message}: expected "${expectedMessage}", got "${error.message}"`
    );
    return;
  }

  throw new Error(message);
};

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const storage = await import('../src/services/storage.service.js');
const permissions = await import('../src/services/permission.service.js');

storage.ensureSeedData();

const admin = { id: 'admin-1', role: 'admin', active: true };
const gerente = { id: 'gerente-1', role: 'gerente', active: true };
const caixa = { id: 'caixa-1', role: 'caixa', active: true };
const operator = { id: 'operator-1', role: 'operador', active: true };
const owner = { id: 'owner-1', role: 'dono', active: true };
const inactive = { id: 'operator-2', role: 'operador', active: false };

assert(permissions.hasPermission(admin, 'owner_app.view'), 'admin should access owner app');
assert(permissions.hasPermission(admin, 'sales.discount'), 'admin should apply discounts');
assert(permissions.hasPermission(gerente, 'reports.view'), 'gerente should see reports');
assert(permissions.hasPermission(gerente, 'sales.discount'), 'gerente should apply discounts');
assert(permissions.hasPermission(gerente, 'financial.expense.access'), 'gerente should access expenses');
assert(permissions.hasPermission(gerente, 'financial.view'), 'gerente should view finance module');
assert(permissions.hasPermission(gerente, 'financial.transaction.create'), 'gerente should create finance transactions');
assert(permissions.hasPermission(gerente, 'financial.payable.pay'), 'gerente should mark payables as paid');
assert(!permissions.hasPermission(gerente, 'users.manage'), 'gerente should not manage users by default');
assert(permissions.hasPermission(caixa, 'cash.balance.view'), 'caixa should see cash balance');
assert(permissions.hasPermission(caixa, 'cash.close'), 'caixa should close cash');
assert(!permissions.hasPermission(caixa, 'financial.category.manage'), 'caixa should not manage finance categories by default');
assert(!permissions.hasPermission(caixa, 'sales.discount'), 'caixa should not discount by default');
assert(permissions.hasPermission(operator, 'sales.create'), 'operator should create sales');
assert(!permissions.hasPermission(operator, 'sales.cancel'), 'operator should not cancel sales by default');
assert(!permissions.hasPermission(operator, 'cash.close'), 'operator should not close cash by default');
assert(!permissions.hasPermission(operator, 'sales.discount'), 'operator should not apply discounts by default');
assert(!permissions.hasPermission(operator, 'owner_app.view'), 'operator should not access owner app by default');
assert(!permissions.hasPermission(operator, 'financial.view'), 'operator should not view finance module by default');
assert(permissions.hasPermission(owner, 'owner_app.view'), 'owner should access owner app');
assert(permissions.hasPermission(owner, 'financial.view'), 'owner should view finance in owner app');
assert(permissions.hasPermission(owner, 'financial.transaction.create'), 'owner should create finance transactions from owner app');
assert(permissions.hasPermission(owner, 'financial.payable.pay'), 'owner should mark payables as paid from owner app');
assert(!permissions.hasPermission(inactive, 'sales.create'), 'inactive user should not have permissions');

permissions.setUserPermissionOverride('operator-1', 'owner_app.view', 'allow');
assert(permissions.hasPermission(operator, 'owner_app.view'), 'allow override should grant permission');

permissions.setUserPermissionOverride('operator-1', 'showcase.launch', 'deny');
assert(!permissions.hasPermission(operator, 'showcase.launch'), 'deny override should block role permission');

permissions.setUserPermissionOverride('operator-1', 'showcase.launch', 'default');
assert(permissions.hasPermission(operator, 'showcase.launch'), 'default override should fall back to role permission');

let overrides = storage.getItem(STORAGE_KEYS.userPermissionOverrides, {});
assert(!overrides['operator-1']['showcase.launch'], 'default override should remove explicit override');

permissions.setUserPermissionOverride('operator-1', 'owner_app.view', 'default');
overrides = storage.getItem(STORAGE_KEYS.userPermissionOverrides, {});
assert(!overrides['operator-1'], 'default override should remove empty user override object');

assertThrows(
  () => permissions.setUserPermissionOverride('operator-1', 'sales.discount', 'denied'),
  'Estado de permissao invalido.',
  'invalid override state should throw'
);

assert(!permissions.hasPermission(operator, 'unknown.permission'), 'unknown permission should fail closed');

assertThrows(
  () => permissions.getUserPermissionOverride('operator-1', 'unknown.permission'),
  'Permissao desconhecida.',
  'unknown permission override read should throw'
);

assertThrows(
  () => permissions.setUserPermissionOverride('operator-1', 'unknown.permission', 'allow'),
  'Permissao desconhecida.',
  'unknown permission override write should throw'
);

permissions.assertPermission(operator, 'sales.create');
assertThrows(
  () => permissions.assertPermission(operator, 'sales.discount'),
  'Usuario sem permissao para esta acao.',
  'assertPermission should throw for denied actions'
);

const adminRolePermissions = permissions.getRolePermissions('admin');
assert(
  adminRolePermissions.length === permissions.PERMISSIONS.length,
  'admin role permissions should include every catalog permission'
);
assert(
  permissions.PERMISSIONS.every((permission) => adminRolePermissions.includes(permission.id)),
  'admin role permissions should match permission catalog'
);

const operatorRolePermissions = permissions.getRolePermissions('operador');
const expectedOperatorPermissions = [
  'sales.access',
  'sales.create',
  'cash.movement',
  'cash.withdrawal',
  'showcase.access',
  'showcase.launch'
];
assert(
  operatorRolePermissions.length === expectedOperatorPermissions.length,
  'operator role permissions should only include expected defaults'
);
assert(
  expectedOperatorPermissions.every((permissionId) => operatorRolePermissions.includes(permissionId)),
  'operator role permissions should include expected defaults'
);

permissions.setUserPermissionOverride('admin-1', 'sales.discount', 'deny');
assert(permissions.hasPermission(admin, 'sales.discount'), 'admin deny override should not block admin access');

const requiredCatalogShape = permissions.PERMISSIONS.every((permission) => (
  permission.id
    && permission.key === permission.id
    && permission.label
    && permission.name === permission.label
    && permission.description
    && permission.group
    && permission.module
    && Array.isArray(permission.defaultRoles)
));
assert(requiredCatalogShape, 'every permission should expose canonical catalog metadata');

const expectedPermissionIds = [
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
  'financial.expense.access',
  'financial.income.create',
  'financial.expense.create',
  'financial.entries.edit',
  'financial.entries.delete',
  'financial.categories.manage',
  'financial.bill.pay',
  'users.manage',
  'users.edit',
  'permissions.manage',
  'audit.view',
  'data.export'
];

assert(
  expectedPermissionIds.every((permissionId) => permissions.PERMISSIONS.some((permission) => permission.id === permissionId)),
  'catalog should include every requested permission'
);
assert(
  permissions.PERMISSIONS.every((permission) => expectedPermissionIds.includes(permission.id)),
  'catalog should not expose duplicate legacy permissions'
);
assert(permissions.resolvePermissionId('financial.view') === 'financial.expense.access', 'financial.view should map to canonical access permission');
assert(permissions.resolvePermissionId('financial.transaction.create') === 'financial.income.create', 'legacy create should map to income create by default');
assert(permissions.resolvePermissionId('financial.payable.pay') === 'financial.bill.pay', 'legacy payable pay should map to canonical bill pay');
assert(permissions.normalizeRole('caixa') === 'operador', 'caixa should normalize to operador');
assert(permissions.normalizeRole('operator') === 'operador', 'operator should normalize to operador');
assert(permissions.can('sales.create', operator), 'can should check an explicit user');
assertThrows(
  () => permissions.requirePermission('sales.discount', operator),
  'Usuario sem permissao para esta acao.',
  'requirePermission should throw for denied actions'
);
const auditLogs = storage.getItem(STORAGE_KEYS.auditLogs, []);
assert(auditLogs[0]?.action === 'permission.denied', 'requirePermission should record denied permission audit logs');
assert(auditLogs[0]?.entityId === 'sales.discount', 'denied permission audit should identify the permission');

console.log('permission service ok');
