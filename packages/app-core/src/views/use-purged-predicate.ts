import { useEffect, useMemo, useRef, useState } from 'react';
import { collectDocReferences, type PurgedPredicate } from '@gisik-nokma/domain';
import type { DataSourceQuery } from '../data-source.js';

export type PurgedLookupQuery = Pick<DataSourceQuery, 'purgedAmong'>;
export type PurgedPredicateState = { isPurged: PurgedPredicate; ready: boolean };

/**
 * Answers per data source for the life of the page (trash Plan 3, D7: "cache
 * per session"). An erasure is permanent, so a cached "purged" never goes
 * stale; a cached "live" may, until the next page load — the same bound every
 * other read on the page has. A FAILED lookup is not cached, so the next mount
 * asks again.
 */
const SESSION = new WeakMap<PurgedLookupQuery, Map<string, boolean>>();

function sessionCacheOf(query: PurgedLookupQuery): Map<string, boolean> {
  let cache = SESSION.get(query);
  if (cache === undefined) {
    cache = new Map();
    SESSION.set(query, cache);
  }
  return cache;
}

function referencedIds(docs: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const doc of docs) {
    const refs = collectDocReferences(doc);
    for (const id of refs.ticketIds) ids.add(id);
    for (const id of refs.noteIds) ids.add(id);
  }
  return [...ids].sort();
}

/**
 * The chips' predicate for a set of stored documents (trash series Plan 3).
 *
 * `ready` is the mount signal for an editor (a node view is built once and
 * does not redraw when a predicate changes later):
 * - it is false until the caller says its documents are `loaded` (the sheet's
 *   ticket read may still be in flight: an empty document list then means "not
 *   read yet", not "no chips");
 * - it becomes true in the SAME render in which every referenced id has an
 *   answer (cached this session, or tried by this instance) — so a document
 *   without chips mounts with no extra render;
 * - it is STICKY: a later lookup (a comment added, a document reloaded) never
 *   unmounts an editor.
 * A failed lookup settles as "nothing purged": the stored text is what a page
 * showed before this read existed.
 */
export function usePurgedPredicate(
  query: PurgedLookupQuery,
  docs: readonly unknown[],
  loaded = true,
): PurgedPredicateState {
  const cache = sessionCacheOf(query);
  const ids = referencedIds(docs);
  const key = ids.join(',');
  // Ids this instance has asked about whose answer did not reach the session
  // cache (the lookup failed) — they count as answered for `ready`.
  const attempted = useRef(new Set<string>());
  const readyRef = useRef(false);
  const [answered, setAnswered] = useState(0);

  if (!readyRef.current && loaded && ids.every((id) => cache.has(id) || attempted.current.has(id))) {
    readyRef.current = true;
  }

  useEffect(() => {
    const unknown = key === '' ? [] : key.split(',').filter((id) => !cache.has(id) && !attempted.current.has(id));
    if (unknown.length === 0) return;
    let live = true;
    void query
      .purgedAmong(unknown)
      .then(
        (refs) => {
          const hit = new Set(refs.map((ref) => ref.id));
          for (const id of unknown) cache.set(id, hit.has(id));
        },
        () => {
          // Fail open, uncached: see the docblock.
        },
      )
      .finally(() => {
        for (const id of unknown) attempted.current.add(id);
        if (live) setAnswered((n) => n + 1);
      });
    return () => {
      live = false;
    };
  }, [query, key, cache]);

  // A new function each time an answer lands, so a memoised child re-renders.
  const isPurged = useMemo<PurgedPredicate>(() => {
    void answered;
    return (_kind, id) => cache.get(id) === true;
  }, [cache, answered]);

  return { isPurged, ready: readyRef.current };
}
