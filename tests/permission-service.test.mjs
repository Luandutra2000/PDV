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

const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-02');
const storage = await import('../src/services/storage.service.js?v=20260804-02');
const permissions = await import('../src/services/permission.service.js?v=20260804-02');

storage.ensureSeedData();

const admin = { id: 'admin-1', role: 'admin', active: true };
const gerente = { id: 'gerente-1', role: 'gerente', active: true };
const caixa = { id: 'caixa-1', role: 'caixa', active: true };
const operator = { id: 'operator-1', role: 'operador', active: true };
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

console.log('permission service ok');
