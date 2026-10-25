import { useEffect, useState, type DependencyList } from 'react';
import type { IpcResult } from '../../shared/ipc';
import { unwrap } from './ipc';

export interface Loaded<T> {
  readonly data: T | null;
  readonly error: unknown;
  /** Loads again, e.g. after a change made on the same screen. */
  readonly reload: () => void;
}

/**
 * Loads data from the main process when the component appears and whenever `deps` change.
 * A response that arrives after the screen has been left is ignored.
 */
export function useLoad<T>(load: () => Promise<IpcResult<T>>, deps: DependencyList): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown }>({
    data: null,
    error: null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    load()
      .then((result) => {
        if (active) setState({ data: unwrap(result), error: null });
      })
      .catch((error: unknown) => {
        if (active) setState({ data: null, error });
      });
    return () => {
      active = false;
    };
    // `load` is recreated on every render; callers list what it depends on in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { ...state, reload: () => setVersion((current) => current + 1) };
}
