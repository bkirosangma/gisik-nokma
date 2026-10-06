import type { ConceptView } from '@gisik-nokma/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource } from '../data-source.js';

export type ConceptRead = {
  data: ConceptView | null;
  /** `'unavailable'` is the server's 404 (deleted, or holding an item this reader cannot see: D4); `'failed'` is anything else. */
  error: 'unavailable' | 'failed' | null;
  /** Reads the concept again. The answer on screen stays until the new one arrives, so a refresh never flashes "Loading…". */
  reload: () => void;
};

/**
 * The online source re-raises a 404 as its `HttpError`, which carries `status`. Read STRUCTURALLY: a view may not
 * import `online/` (case 3.35, `no-http-in-views.test.ts`), and the replica's `ReplicaGapError` has no status.
 */
function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 404;
}

/**
 * One concept, read once per id (Knowledge Graph spec D, KG-D Task 8): the `{ data, error, reload }` shape the ticket
 * sheet's loaders hand their sections (`ticket-notes-section.tsx`'s `notes`). Not a `useLiveQuery`, on purpose, for
 * `useActorNames`' reason: a live query opens a stream subscription, and the inspector re-reads after its own writes
 * (`reload`), which is the only change it needs to show at once. Only the latest read may answer.
 */
export function useConcept(dataSource: DataSource, conceptId: string | null): ConceptRead {
  const [data, setData] = useState<ConceptView | null>(null);
  const [error, setError] = useState<ConceptRead['error']>(null);
  const [attempt, setAttempt] = useState(0);
  const issued = useRef(0);
  useEffect(() => {
    if (conceptId === null) return;
    const mine = ++issued.current;
    dataSource.query.getConcept(conceptId).then(
      (view) => {
        if (mine !== issued.current) return;
        setData(view);
        setError(null);
      },
      (err: unknown) => {
        if (mine !== issued.current) return;
        setData(null);
        setError(isNotFound(err) ? 'unavailable' : 'failed');
      },
    );
  }, [dataSource, conceptId, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  // An answer for another id (the inspector moved on) is not this one's: it is never shown under the new id.
  return { data: data !== null && data.id === conceptId ? data : null, error, reload };
}
