import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource } from '../data-source.js';
import { readEpoch } from '../read-epoch.js';
import { forgetLiveQuery, liveQueryStoreKey, recallLiveQuery, rememberLiveQuery } from './live-query-cache.js';
import { scheduleReload, subscribeReloads } from './reload-scheduler.js';

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
   * every stream-driven refetch (with a `cacheKey`, smoothness T3, `data` serves the
   * cached answer for the new key instead of going null, and `settled` still goes false), which is correct for rendering the ANSWER and
   * wrong for deciding whether a control exists. A caller that withholds a
   * control while `data === null` retracts it on every reload, and the measured
   * cost of that was a visible flicker: toggling *Only tickets in progress*
   * changes the list's key, the rows reset to null, and the project header's
   * New ticket button (now *Create ticket*) was replaced by its "Preparing the New ticket form…" gate
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
 * `initial` is an answer the caller ALREADY HOLDS for one key (case 18.461) —
 * typically the read it made to decide that key. It is served for that key from
 * the first render of that key until the key's own load answers, so the view is
 * not reset to null for a round trip it did not need. It is never served for
 * another key, and the load's answer replaces it — a `null` included, so a real
 * loss of access still shows. The load still runs: the seed is a head start, not
 * a substitute for the read.
 *
 * `cacheKey` (smoothness T3, spec S4 and D1) names the read in the session-scoped
 * read cache (`live-query-cache.ts`): the caller's own namespaced key
 * (`board:<project>`, `list:<project>:<filter>`), stored under the workspace too.
 * With one, the first render and every key change serve the cache's last answer
 * for THAT key (never another's, `null` when it has none) while `settled` stays
 * false until the fresh read lands, and a resolved load writes it. A read the
 * server refuses evicts it and withdraws a stale answer it was serving (`data`
 * goes `null` beside `error`; an answer this key's own read produced is kept,
 * F6), and a read that was in flight when the cache was
 * cleared (sign-out) does not write back. `options` is the debounce in
 * milliseconds, as before, or an options object; the sixth argument stays the
 * `initial` seed for callers that pass a number.
 *
 * The stream's reload timer is one per WORKSPACE (`reload-scheduler.ts`), shared
 * by every hook on it: a frame fires one wave of reloads, not one per hook.
 *
 * The KEY drives the reload; the WORKSPACE drives the subscription. Two
 * effects, on purpose. Folding the key into the subscription's deps would
 * tear down and re-open the stream on every project switch, and `subscribe`
 * is called with cursor `0`, so each re-open replays the workspace from the
 * beginning — that hardcoded cursor is Plan 6 Task 8's to fix, and this hook
 * must not multiply it in the meantime.
 */
export type LiveQueryOptions<T> = { debounceMs?: number; initial?: { key: string; data: T }; cacheKey?: string };

export function useLiveQuery<T>(
  source: DataSource,
  workspaceId: string,
  queryKey: string,
  load: () => Promise<T>,
  options: number | LiveQueryOptions<T> = 200,
  legacyInitial?: { key: string; data: T },
): LiveQueryResult<T> {
  const opts: LiveQueryOptions<T> = typeof options === 'number' ? { debounceMs: options, initial: legacyInitial } : options;
  const debounceMs = opts.debounceMs ?? 200;
  const initial = opts.initial;
  const storeKey = opts.cacheKey === undefined ? undefined : liveQueryStoreKey(workspaceId, opts.cacheKey);
  const storeKeyRef = useRef(storeKey);
  storeKeyRef.current = storeKey;
  const [data, setData] = useState<T | null>(() => (storeKey === undefined ? null : (recallLiveQuery<T>(storeKey) ?? null)));
  const [error, setError] = useState<string | null>(null);
  // Whether the CURRENT question has been answered. Cleared when a load is issued
  // and set when one resolves, `isCurrent`-guarded the same way `data` is — a
  // superseded load's settlement says nothing about the question on screen now.
  const [settled, setSettled] = useState(false);
  // Lifetime, not per-key — see `hasAnswered` on LiveQueryResult.
  const [hasAnswered, setHasAnswered] = useState(false);
  // The key whose load has most recently answered (data OR error). It is what
  // retires `initial`: the seed serves only a key that has not yet answered.
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
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
  // Has the CURRENT key's load ever answered with data? Reset with the key. It is what lets
  // a refusal withdraw a STALE cached answer (never one a real read of this key produced).
  const keyAnsweredRef = useRef(false);

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
    const askedStore = storeKeyRef.current;
    const askedEpoch = readEpoch();
    const issued = (issuedRef.current += 1);
    const isCurrent = (): boolean => keyRef.current === askedFor && issued === issuedRef.current;
    setSettled(false);
    loadRef.current().then(
      (value) => {
        if (!isCurrent()) return;
        // Only while the epoch still reads as it did when the read was issued: a
        // sign-out in between means this answer belongs to the person who left.
        if (askedStore !== undefined && readEpoch() === askedEpoch) rememberLiveQuery(askedStore, value);
        keyAnsweredRef.current = true;
        setData(value);
        setError(null);
        setSettled(true);
        setHasAnswered(true);
        setAnsweredKey(askedFor);
      },
      (cause: unknown) => {
        if (!isCurrent()) return;
        // A refusal (a 404 for access lost, a 401) ends what the cache may serve for this key.
        if (askedStore !== undefined) forgetLiveQuery(askedStore);
        // A stale answer served from the cache is not an answer to a question the server has now
        // refused: withdraw it, so a view that checks `data` before `error` cannot draw the board
        // over its own refusal. An answer this key's own read produced is kept (F6, above).
        if (!keyAnsweredRef.current) setData(null);
        setError(cause instanceof Error ? cause.message : String(cause));
        setSettled(true);
        // An ERROR is an answer for this purpose: the question reached the
        // server and came back. A gate that waited for a SUCCESS would hold a
        // control hostage to a failing read forever.
        setHasAnswered(true);
        setAnsweredKey(askedFor);
      },
    );
  }, []);

  useEffect(() => {
    // A new question clears the old answer before it asks. Without this the
    // view renders the previous key's data as the current key's for as long
    // as the load takes, with nothing on screen saying which it is. The one
    // exception is the cache holding THIS question's last answer: it is served
    // stale and replaced when the read lands (S4).
    setData(storeKey === undefined ? null : (recallLiveQuery<T>(storeKey) ?? null));
    keyAnsweredRef.current = false;
    setError(null);
    setSettled(false);
    reload();
  }, [source, workspaceId, queryKey, storeKey, reload]);

  useEffect(() => {
    const unregister = subscribeReloads(workspaceId, reload);
    const unsubscribe = source.subscribe(workspaceId, 0, (item) => {
      // `refresh` refetches for the same reason `event` does — this key's data
      // may have changed — and it is the ONLY signal a pulled note gives:
      // `ReplicaDataSource.subscribe` emits it when a `reach-granted` pull
      // lands, after the stream has gone quiet, so nothing on the `event`
      // channel ever announces it. `caught-up` is still NOT accepted: it means
      // the cursor moved, not that this key's answer changed.
      if (item.type !== 'event' && item.type !== 'purge' && item.type !== 'refresh') return;
      scheduleReload(workspaceId, debounceMs);
    });
    return () => {
      unsubscribe();
      unregister();
    };
  }, [source, workspaceId, debounceMs, reload]);

  const seeded = initial !== undefined && initial.key === queryKey && answeredKey !== queryKey;
  return { data: seeded ? initial.data : data, error, settled, hasAnswered, reload };
}
