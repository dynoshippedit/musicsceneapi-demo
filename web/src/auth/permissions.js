export function isAdmin(user) {
  return user?.role === 'admin';
}

export function effectivePageAccess(user) {
  if (Array.isArray(user?.pageAccess)) return user.pageAccess;
  if (isAdmin(user)) return ['all'];
  // The current login and /me responses omit pageAccess. These role defaults
  // match the seeded accounts until that field is included in an API contract.
  if (user?.role === 'artist') return ['overview', 'roster'];
  if (user?.role === 'viewer') return ['overview'];
  return [];
}

export function canSee(user, perm) {
  if (!user) return false;
  if (!perm) return true;
  const access = effectivePageAccess(user);
  return isAdmin(user) || access.includes('all') || access.includes(perm);
}
