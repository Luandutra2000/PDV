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
const operator = { id: 'operator-1', role: 'operator', active: true };
const inactive = { id: 'operator-2', role: 'operator', active: false };

assert(permissions.hasPermission(admin, 'owner_app.view'), 'admin should access owner app');
assert(permissions.hasPermission(admin, 'sales.discount'), 'admin should apply discounts');
assert(permissions.hasPermission(operator, 'sales.create'), 'operator should create sales');
assert(permissions.hasPermission(operator, 'sales.cancel'), 'operator should cancel sales');
assert(permissions.hasPermission(operator, 'cash.close'), 'operator should close cash');
assert(!permissions.hasPermission(operator, 'sales.discount'), 'operator should not apply discounts by default');
assert(!permissions.hasPermission(operator, 'owner_app.view'), 'operator should not access owner app by default');
assert(!permissions.hasPermission(inactive, 'sales.create'), 'inactive user should not have permissions');

permissions.setUserPermissionOverride('operator-1', 'owner_app.view', 'allow');
assert(permissions.hasPermission(operator, 'owner_app.view'), 'allow override should grant permission');

permissions.setUserPermissionOverride('operator-1', 'sales.cancel', 'deny');
assert(!permissions.hasPermission(operator, 'sales.cancel'), 'deny override should block role permission');

permissions.setUserPermissionOverride('operator-1', 'sales.cancel', 'default');
assert(permissions.hasPermission(operator, 'sales.cancel'), 'default override should fall back to role permission');

let overrides = storage.getItem(STORAGE_KEYS.userPermissionOverrides, {});
assert(!overrides['operator-1']['sales.cancel'], 'default override should remove explicit override');

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

const operatorRolePermissions = permissions.getRolePermissions('operator');
const expectedOperatorPermissions = [
  'sales.access',
  'sales.create',
  'sales.cancel',
  'cash.movement',
  'cash.close',
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
