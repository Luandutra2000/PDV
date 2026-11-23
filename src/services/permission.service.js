let currentProfile = null;

export function setCurrentProfile(profile) {
  currentProfile = profile;
}

export function setCurrentProfileForTests(profile) {
  setCurrentProfile(profile);
}

export function getCurrentProfile() {
  return currentProfile;
}

export function can(permissionId) {
  const permissions = currentProfile?.permissions || [];
  return permissions.includes('*') || permissions.includes(permissionId);
}

export function requirePermission(permissionId) {
  if (!can(permissionId)) {
    throw new Error('Usuario sem permissao para esta acao.');
  }
}

// Mirrors the role_permissions seed in supabase/migrations. The server (RLS)
// stays the real guard; this only decides what the screen shows.
export const ROLE_PERMISSIONS = {
  admin: ['*'],
  operador: [
    'cashier.access',
    'sale.create',
    'cash.movement.create',
    'stock.view',
    'stock.create',
    'products.view'
  ]
};

export const LOCAL_PROFILE = {
  id: 'local',
  name: 'Local',
  role: 'admin',
  permissions: ['*']
};

export function buildProfile({ id, name, role }) {
  return {
    id,
    name,
    role,
    permissions: ROLE_PERMISSIONS[role] || []
  };
}
