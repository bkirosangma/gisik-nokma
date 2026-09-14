import { useEffect, useState } from 'react';
import { useAppServices, useSessionStatus } from './providers.js';

/**
 * The current workspace's own SERVED name (Round 19b, owner feedback item 2).
 *
 * Extracted from `app-nav.tsx` (Round 19c) when `/settings` became a second
 * caller: the workspace-name subtitle it shows needs the exact same lookup
 * `AppNav`'s own workspace-name nav item already made, and two places
 * re-deriving "what is this workspace called" is the shape of duplication
 * `src/workspace-viewer.ts`'s docblock argues against for `viewerOf` and
 * `restrictedLine`.
 *
 * `GET /v1/me/workspaces` — the ONE shared read, called from whichever
 * component needs the name rather than threaded as a prop through every page
 * that might. This is the SAME route Task 16's card and Task 19's home
 * already call; nothing new is served.
 *
 * Gated on a session exactly like `InboxNavLink`'s poll, and for the same
 * reason: a signed-out viewer transiently on a workspace-scoped route must not
 * fire a request that cannot succeed.
 *
 * **Fails silently, and the failure is OMISSION, never the id.** `getMyWorkspaces`
 * is one of the refusing reads elsewhere in this product, and while it is
 * pending or refused this hook holds `null` — a caller renders no name rather
 * than the raw id or a stale guess.
 */
export function useWorkspaceName(workspaceId: string | undefined): string | null {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const signedIn = session.kind === 'signed-in';
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId === undefined || !signedIn) {
      setName(null);
      return;
    }
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        if (cancelled) return;
        setName(rows.find((row) => row.id === workspaceId)?.name ?? null);
      },
      () => {
        if (!cancelled) setName(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, workspaceId, signedIn]);

  return name;
}
