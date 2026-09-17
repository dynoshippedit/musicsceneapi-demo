import { useCallback, useEffect, useRef, useState } from 'react';

export function useApiMutation(mutation) {
  const [state, setState] = useState({ loading: false, error: null });
  const controller = useRef(null);

  useEffect(() => () => controller.current?.abort(), []);

  const mutate = useCallback(async (input) => {
    controller.current?.abort();
    controller.current = new AbortController();
    setState({ loading: true, error: null });
    try {
      const result = await mutation(input, { signal: controller.current.signal });
      setState({ loading: false, error: null });
      return result;
    } catch (error) {
      if (error.name !== 'AbortError') setState({ loading: false, error });
      throw error;
    }
  }, [mutation]);

  const reset = useCallback(() => setState({ loading: false, error: null }), []);
  return { ...state, mutate, reset };
}
