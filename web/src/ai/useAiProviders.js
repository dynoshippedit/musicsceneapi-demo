import { useEffect, useState } from 'react';
import { listProviders } from './aiClient.js';
import { useAuth } from '../auth/useAuth.js';

/**
 * Resolves the provider catalogue the FIRST time an AI surface mounts, then caches it for the
 * session. It is deliberately not fetched at app boot: the route is absent on the current
 * backend, and a 404 on every page load would be noise on surfaces that use no AI at all.
 */
let cached = null;

export function useAiProviders() {
  const { token } = useAuth();
  const [state, setState] = useState(cached ?? { selectable: false, providers: [], defaultProvider: null, defaultModel: null, resolved: false });

  useEffect(() => {
    if (cached || !token) return undefined;
    const controller = new AbortController();
    listProviders(token, { signal: controller.signal })
      .then((result) => { cached = { ...result, resolved: true }; setState(cached); })
      .catch(() => { /* Aborted on unmount; the system-default path already covers failure. */ });
    return () => controller.abort();
  }, [token]);

  return state;
}
