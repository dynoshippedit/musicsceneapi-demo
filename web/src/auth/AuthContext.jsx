import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getMe, login as requestLogin } from '../api/endpoints.js';
import { setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const token = localStorage.getItem('authToken');
    const user = JSON.parse(localStorage.getItem('userData') || 'null');
    return token && user ? { token, user } : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);
  const [status, setStatus] = useState(session.token ? 'authenticated' : 'anonymous');

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
    getMe(session.token, { signal: controller.signal })
      .then((canonicalUser) => {
        const user = { ...session.user, ...canonicalUser };
        localStorage.setItem('userData', JSON.stringify(user));
        setSession((current) => current.token === session.token ? { token: current.token, user } : current);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        if (error.status === 401 || error.status === 403 || error.status === 404) logout();
        // A temporary network failure does not destroy a locally valid session.
      });
    return () => controller.abort();
  }, [session.token, logout]);

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
    <AuthContext.Provider value={{ ...session, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider is missing');
  return auth;
}
