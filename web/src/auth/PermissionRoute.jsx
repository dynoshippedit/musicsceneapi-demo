import { Outlet } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { canSee, isAdmin } from './permissions.js';
import { useBrand } from '../brand/BrandContext.jsx';
import { ErrorState } from '../components/primitives/ErrorState.jsx';

/**
 * Per-route visibility guard for the PHASE_4A_HANDOFF.md §4 route map
 * (`/artists` authed · roster, `/marketing` authed · marketing, `/admin` authed · role admin …).
 *
 * This is the SAME nav-visibility contract the sidebar uses — it is NOT authorization.
 * The backend authorizes every request independently; a user who defeats this guard still
 * gets 401/403 from the API. It exists so a directly-typed URL behaves like the nav does.
 *
 * It renders ACCESS DENIED in place rather than redirecting: a redirect target is itself a
 * guarded route, so redirecting would loop for a user whose pageAccess is empty (which is the
 * documented resolution for a user record the /me reconciliation has not filled in yet —
 * permissions.js).
 */
export function PermissionRoute({ perm, adminOnly = false }) {
  const { user } = useAuth();
  const { text } = useBrand();
  const allowed = (!adminOnly || isAdmin(user)) && canSee(user, perm);
  if (allowed) return <Outlet />;
  return <ErrorState variant="fullscreen" status={403} message={text.accessDeniedDetail} />;
}
