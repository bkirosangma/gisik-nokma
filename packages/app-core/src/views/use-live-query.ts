import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource } from '../data-source.js';

/**
 * `settled` says whether the CURRENT question has been answered yet — true once the
 * load for the current key resolves, whether it answered or rejected.
 *
 * **It exists because `data === null` alone is two different facts** (E4-23,
 * 2026-09-21): *"the read has not answered"* and *"the read answered `null`"*. On a
 * read whose honest answer includes `null` — `getTicket` returns the transport's
 * 404 affordance, and every `/v1` read door answers ONE frozen body for "no such
 * thing" and "not yours" — a view gating on `data === null` draws a server refusal
 * as a wait that never ends. The alternative readings are both worse: add an
 * `answered` sentinel to every `T` and every adapter grows a case; or overload
 * `error` with a `null`-meaning-404 convention, which would put a transport detail
 * in the domain of a hook that deliberately knows no status codes.
 */
export type LiveQueryResult<T> = {
  data: T | null;
  error: string | null;
  settled: boolean;
  /**
   * Has this hook EVER produced an answer — in its whole lifetime, not for the
   * current key (owner, 2026-09-23).
   *
   * `settled` and `data !== null` both go false/null on every key change and
   * every stream-driven refetch, which is correct for rendering the ANSWER and
   * wrong for deciding whether a control exists. A caller that withholds a
   * control while `data === null` retracts it on every reload, and the measured
   * cost of that was a visible flicker: toggling *Only tickets in progress*
   * changes the list's key, the rows reset to null, and the project header's
   * New ticket button was replaced by its "Preparing the New ticket form…" gate
   * — a differently-sized element, so the whole header row resized and snapped
   * back, for about 40 ms.
   *
   * So this one is deliberately NOT reset by the key-change effect below. It
   * answers "has this question ever been answerable", which is what a
   * first-load gate actually wants. It stays a distinct field rather than a
   * change to `settled`, because a caller rendering the DATA still needs to
   * know the current key has not answered yet.
   */
  hasAnswered: boolean;
  reload: () => void;
};

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
  // Whether the CURRENT question has been answered. Cleared when a load is issued
  // and set when one resolves, `isCurrent`-guarded the same way `data` is — a
  // superseded load's settlement says nothing about the question on screen now.
  const [settled, setSettled] = useState(false);
  // Lifetime, not per-key — see `hasAnswered` on LiveQueryResult.
  const [hasAnswered, setHasAnswered] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;
  /**
   * Which load is the current question's answer. Bumped when a load is ISSUED and
   * compared when it RESOLVES, so only the most recent one may apply.
   *
   * Guarding the key alone was not enough, and the gap was measured rather than
   * argued: with two loads in flight for the SAME key, whichever the network
   * answered second won, so a slow OLDER request overwrote a newer one with an
   * answer describing a moment that had passed. Reachable rather than theoretical —
   * `getTickets` walks paginated round trips through a recursive CTE and the refetch
   * debounce is 200ms, so a walk slower than the debounce overlaps two loads, and
   * the slower of the two is the more likely to be the older.
   *
   * The symptom is not a flicker: nothing re-renders until the next stream event,
   * so the stale answer stays on screen for as long as the workspace is quiet.
   */
  const issuedRef = useRef(0);

  const reload = useCallback(() => {
    // An answer is only an answer to the question that was asked. If the key
    // moved while this load was in flight, the resolved value describes a
    // query nobody is showing any more, and rendering it is the difference
    // between a stale view and a WRONG one.
    //
    // Two loads for the SAME key are now ordered by ISSUE, not by arrival: see
    // `issuedRef`. What is still NOT handled is that a failed reload leaves the
    // last successful `data` in place with no staleness flag on
    // `LiveQueryResult` to say so — recorded as F6 against this file, owner
    // Plan 6 Task 7/8.
    const askedFor = keyRef.current;
    const issued = (issuedRef.current += 1);
    const isCurrent = (): boolean => keyRef.current === askedFor && issued === issuedRef.current;
    setSettled(false);
    loadRef.current().then(
      (value) => {
        if (!isCurrent()) return;
        setData(value);
        setError(null);
        setSettled(true);
        setHasAnswered(true);
      },
      (cause: unknown) => {
        if (!isCurrent()) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setSettled(true);
        // An ERROR is an answer for this purpose: the question reached the
        // server and came back. A gate that waited for a SUCCESS would hold a
        // control hostage to a failing read forever.
        setHasAnswered(true);
      },
    );
  }, []);

  useEffect(() => {
    // A new question clears the old answer before it asks. Without this the
    // view renders the previous key's data as the current key's for as long
    // as the load takes, with nothing on screen saying which it is.
    setData(null);
    setError(null);
    setSettled(false);
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

  return { data, error, settled, hasAnswered, reload };
}
