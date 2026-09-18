import { useCallback } from 'react';
import { listProviders } from './aiClient.js';
import { useAuth } from '../auth/useAuth.js';
import { useApiQuery } from '../hooks/useApiQuery.js';

export function useAiProviders() {
  const { token } = useAuth();
  const query = useCallback(({ signal }) => listProviders(token, { signal }), [token]);
  const { data, loading, refetch } = useApiQuery(query);
  return { selectable: false, providers: [], defaultProvider: null, defaultModel: null,
    status: loading ? 'checking' : 'unavailable', ...data, resolved: !loading, refetch };
}
