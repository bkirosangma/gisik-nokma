import { useEffect, useRef, useState } from 'react';
import { GRAPH_MAX_HOPS, type GraphGroup } from '@gisik-nokma/domain';
import { emptyStore, mergeRing, type GraphStore } from '../engine/model.js';
import type { GraphSource } from './types.js';

type Entry = { store: GraphStore; loaded: number };
/** One shared empty store, so a key with nothing loaded yet does not hand the view a new store (and a new draw model) each render. */
const EMPTY: GraphStore = emptyStore();
export type RingState = { store: GraphStore; loading: boolean; failedHop: number | null; retry: () => void; key: string };
// Task 8 adds `forget(edgeId: string): void` and `restore(edge: GraphEdgeView): void` (planner ruling 2026-10-04, Undo restores the edge).

/**
 * Rings 1…`rings` for one (centre, scope, groups), fetched one at a time (§2.2) and cached for the session per that key
 * (§2.3), so Back is instant. Only the answer for the CURRENT key is ever shown: a late answer for an old centre lands in
 * the cache under its own key and is not drawn (Review Focus 2). "Everything" = `GRAPH_MAX_HOPS`, stopping at the first
 * empty ring. Only a ring's first page is fetched: 2,000 items is already past the 500 cap and the 2,000 fog budget.
 * Every answer carries its centre, which `mergeRing` seeds (planner ruling Q1).
 */
export function useGraphRings(source: GraphSource, q: { centre: string; workspaceIds: readonly string[]; projectIds: readonly string[]; groups: readonly GraphGroup[]; rings: number }): RingState {
  const key = `${q.centre}|${[...q.workspaceIds].sort()}|${[...q.projectIds].sort()}|${[...q.groups].sort()}`;
  const cache = useRef(new Map<string, Entry>());
  const current = useRef(key);
  current.current = key;
  const [, bump] = useState(0);
  const [failed, setFailed] = useState<{ key: string; hop: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const want = Math.min(q.rings, GRAPH_MAX_HOPS);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let entry = cache.current.get(key) ?? { store: emptyStore(), loaded: 0 };
      cache.current.set(key, entry);
      while (!cancelled && entry.loaded < want && !entry.store.exhausted) {
        const hop = entry.loaded + 1;
        try {
          const ring = await source.ring({ center: q.centre, hops: hop, workspaceIds: q.workspaceIds, projectIds: q.projectIds, groups: q.groups });
          entry = { store: mergeRing(entry.store, ring), loaded: hop };
          cache.current.set(key, entry); // cached even if stale: a later visit reuses it
        } catch {
          if (current.current === key) setFailed({ key, hop });
          return;
        }
        if (current.current === key) bump((n) => n + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
    // q.* are folded into `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, want, attempt, source]);

  const entry = cache.current.get(key);
  const failedHop = failed !== null && failed.key === key ? failed.hop : null;
  return {
    key,
    store: entry?.store ?? EMPTY,
    loading: failedHop === null && (entry === undefined || (entry.loaded < want && !entry.store.exhausted)),
    failedHop,
    retry: () => {
      setFailed(null);
      setAttempt((n) => n + 1);
    },
  };
}
