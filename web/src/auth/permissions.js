// Nav-visibility contract (PHASE_4A_HANDOFF.md §10; pre-4C Decision 1):
//   - `pageAccess` is a per-user string array served by the backend on POST /v3/auth/login and
//     GET /v3/auth/me. It drives nav/UI visibility ONLY; the backend authorizes every request, so a
//     user who is shown nothing extra loses nothing and a user who is shown too little is never unsafe.
//   - Platform code carries NO role→permission table. The single role rule is admin → ['all'], which
//     mirrors the backend's own definition of an admin (src/models/index.js L100 seeds the admin with
//     pageAccess ['all']; src/routes/auth.js L66 — the ADMIN_EMAIL override login — returns
//     pageAccess ['all']).
//   - A user record without a pageAccess array resolves to [] (only the secondary nav, which has no
//     perm, stays visible) until GET /v3/auth/me reconciles the stored userData.
export function isAdmin(user) {
  return user?.role === 'admin';
}

export function effectivePageAccess(user) {
  if (Array.isArray(user?.pageAccess)) return user.pageAccess;
  if (isAdmin(user)) return ['all'];
  return [];
}

export function canSee(user, perm) {
  if (!user) return false;
  if (!perm) return true;
  const access = effectivePageAccess(user);
  return isAdmin(user) || access.includes('all') || access.includes(perm);
}
