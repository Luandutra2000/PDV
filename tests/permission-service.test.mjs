const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const permissions = await import('../src/services/permission.service.js');

permissions.setCurrentProfileForTests({
  id: 'user-1',
  role: 'operador',
  permissions: ['cashier.access', 'sale.create']
});

assert(permissions.can('cashier.access') === true, 'operator should access cashier');
assert(permissions.can('users.manage') === false, 'operator should not manage users');

permissions.setCurrentProfileForTests({
  id: 'user-2',
  role: 'admin',
  permissions: ['*']
});

assert(permissions.can('users.manage') === true, 'admin wildcard should allow users');

console.log('permission service ok');
