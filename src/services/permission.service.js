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
