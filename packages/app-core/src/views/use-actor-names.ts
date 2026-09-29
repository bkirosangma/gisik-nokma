import { useEffect, useState } from 'react';
import type { DataSource } from '../data-source.js';
import type { Actor } from '../view-types.js';

/**
 * The workspace's names-only read (`getActorNames`), fetched ONCE on mount and
 * again only if the workspace changes — the label join's second source
 * (`actorLabelFrom`).
 *
 * **Not a `useLiveQuery`, on purpose.** A live query opens a stream subscription
 * (the ticket sheet's own case pins "eight reads, eight subscriptions" so that
 * adding one is a decision), and a name list does not need one: it is read to
 * turn an id into words, a person's display name almost never changes while a
 * sheet is open, and the next mount reads it again. This is the same one-time
 * shape the sheet's `queryNotes` and the note document's roster use.
 *
 * `[]` until it arrives and for a refusal or a failure — "no name known" is what
 * every join reads an empty list as, and a screen is never withheld for it.
 */
export function useActorNames(dataSource: DataSource, workspaceId: string): Actor[] {
  const [names, setNames] = useState<Actor[]>([]);
  useEffect(() => {
    let cancelled = false;
    dataSource.query.getActorNames(workspaceId).then(
      (rows) => {
        if (!cancelled) setNames(rows);
      },
      () => {
        if (!cancelled) setNames([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, workspaceId]);
  return names;
}
