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
 *
 * `queryKey` names WHAT is being asked for — the project id for a board, and
 * whatever identifies the read for any other hook riding on this. It exists
 * because `load` is a fresh closure on every render, so keying the refetch on
 * `load`'s identity would refetch forever, while keying it on nothing at all
 * (the shape this hook shipped with) leaves the previous question's answer on
 * screen under the new question's heading: the hook went on serving project
 * A's board as project B's, self-correcting only if an unrelated stream frame
 * happened to arrive.
 *
 * The KEY drives the reload; the WORKSPACE drives the subscription. Two
 * effects, on purpose. Folding the key into the subscription's deps would
 * tear down and re-open the stream on every project switch, and `subscribe`
 * is called with cursor `0`, so each re-open replays the workspace from the
 * beginning — that hardcoded cursor is Plan 6 Task 8's to fix, and this hook
 * must not multiply it in the meantime.
 */
export function useLiveQuery<T>(
  source: DataSource,
  workspaceId: string,
  queryKey: string,
  load: () => Promise<T>,
  debounceMs = 200,
): LiveQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;

  const reload = useCallback(() => {
    // An answer is only an answer to the question that was asked. If the key
    // moved while this load was in flight, the resolved value describes a
    // query nobody is showing any more, and rendering it is the difference
    // between a stale view and a WRONG one.
    //
    // This does NOT order two loads for the SAME key: overlapping reloads
    // still resolve last-one-wins, and a failed reload still leaves the last
    // successful `data` in place with no staleness flag on `LiveQueryResult`
    // to say so. Both are recorded as F6 against this file — owner Plan 6
    // Task 7/8, when a real transport makes them reachable.
    const askedFor = keyRef.current;
    loadRef.current().then(
      (value) => {
        if (keyRef.current !== askedFor) return;
        setData(value);
        setError(null);
      },
      (cause: unknown) => {
        if (keyRef.current !== askedFor) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  }, []);

  useEffect(() => {
    // A new question clears the old answer before it asks. Without this the
    // view renders the previous key's data as the current key's for as long
    // as the load takes, with nothing on screen saying which it is.
    setData(null);
    setError(null);
    reload();
  }, [source, workspaceId, queryKey, reload]);

  useEffect(() => {
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
