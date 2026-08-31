import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource } from '../data-source.js';

export type LiveQueryResult<T> = { data: T | null; error: string | null; reload: () => void };

/**
 * Load once, then refetch (debounced) whenever the workspace stream moves.
 * Deliberately refetch-based: the stream is an invalidation signal, and the
 * projections remain the one source of rendered truth — the client never
 * patches views from raw events (that is Plan 10's replica, built on
 * reducers, not this).
 *
 * `source` is the ONLY seam to the world (coordination amendment 10). Nothing
 * in this module — or in any view riding on it — knows a URL, a socket or a
 * status code; the online implementation is Plan 6 Task 7/8 and the offline
 * replica is Plan 10, and both answer the same `DataSource` signatures.
 */
export function useLiveQuery<T>(
  source: DataSource,
  workspaceId: string,
  load: () => Promise<T>,
  debounceMs = 200,
): LiveQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => {
    loadRef.current().then(
      (value) => {
        setData(value);
        setError(null);
      },
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, []);

  useEffect(() => {
    reload();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = source.subscribe(workspaceId, 0, (item) => {
      if (item.type !== 'event' && item.type !== 'purge') return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(reload, debounceMs);
    });
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [source, workspaceId, debounceMs, reload]);

  return { data, error, reload };
}
