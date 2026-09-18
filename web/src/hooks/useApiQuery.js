import { useCallback, useEffect, useState } from 'react';

export function useApiQuery(query) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const refetch = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // Drop the previous payload on query change AND on error. Keeping a prior
    // 200 body while a new artistId 403s (or while a new query loads) showed
    // the wrong resource as if it were the current one.
    setState({ data: null, loading: true, error: null });
    query({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ data: null, loading: false, error });
      });
    return () => controller.abort();
  }, [query, revision]);

  return { ...state, refetch };
}
