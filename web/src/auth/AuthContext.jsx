import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getMe, login as requestLogin } from '../api/endpoints.js';
import { setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const token = localStorage.getItem('authToken');
    // Stored profile fields cannot grant access to authenticated UI.
    return { token: token || null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);
  const [status, setStatus] = useState(session.token ? 'checking' : 'anonymous');
  const [revision, setRevision] = useState(0);
  const retrySession = useCallback(() => setRevision(value => value + 1), []);

  const logout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    setSession({ token: null, user: null });
    setStatus('anonymous');
  }, []);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  useEffect(() => {
    if (!session.token) return;
    const controller = new AbortController();
    setStatus('checking');
    getMe(session.token, { signal: controller.signal })
      .then((canonicalUser) => {
        if (controller.signal.aborted) return;
        const user = canonicalUser;
        localStorage.setItem('userData', JSON.stringify(user));
        setSession((current) => current.token === session.token ? { token: current.token, user } : current);
        setStatus('authenticated');
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        // PHASE_4A_HANDOFF.md §9 / FRONTEND_ARCHITECTURE.md §6: only 401/403 from /me end the session
        // (the backend answers 401 to a missing bearer and 403 to an invalid/expired one — src/auth/index.js).
        if (error.status === 401 || error.status === 403) { logout(); return; }
        // Preserve the token for retry; protected UI waits for verified user data.
        setStatus('error');
      });
    return () => controller.abort();
  }, [session.token, logout, revision]);

  const login = useCallback(async (credentials) => {
    const result = await requestLogin(credentials);
    if (!result.token || !result.user) throw new Error('Invalid session response');
    localStorage.setItem('authToken', result.token);
    localStorage.setItem('userData', JSON.stringify(result.user));
    setSession({ token: result.token, user: result.user });
    setStatus('authenticated');
    return result.user;
  }, []);

  return (
    <AuthContext.Provider value={{ ...session, status, login, logout, retrySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider is missing');
  return auth;
}
