import { useCallback, useEffect, useState } from 'react';

export function useApiQuery(query) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const refetch = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    query({ signal: controller.signal })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error }));
      });
    return () => controller.abort();
  }, [query, revision]);

  return { ...state, refetch };
}
