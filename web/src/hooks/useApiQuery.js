import { useCallback, useEffect, useState } from 'react';

export function useApiQuery(query) {
  const [state, setState] = useState({ query, data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const refetch = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // Refresh the same resource without unmounting forms and losing edits.
    // A different artist/session or a failed request must discard old data.
    setState(previous => ({ query, data: previous.query === query ? previous.data : null, loading: true, error: null }));
    query({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ query, data, loading: false, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') setState({ query, data: null, loading: false, error });
      });
    return () => controller.abort();
  }, [query, revision]);

  const current = state.query === query ? state : { data: null, loading: true, error: null };
  return { ...current, refetch };
}
