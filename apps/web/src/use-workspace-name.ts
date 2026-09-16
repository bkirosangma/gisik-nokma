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
/**
 * MODULE-SCOPED name cache — the second half of the nav's jitter fix.
 *
 * `AppNav` is rendered per PAGE, not by the root layout, so it remounts on
 * every client-side navigation and this hook restarted at `null` each time.
 * The workspace-name item therefore vanished and reappeared on every page
 * change, INCLUDING navigation between two pages of the same workspace — a
 * flicker that predates the remembered-workspace work and was simply less
 * visible when it was the only item affected.
 *
 * Only SUCCESSFUL lookups are cached. A pending or refused read is not a fact
 * about the workspace's name, and caching one would turn a transient failure
 * into a sticky wrong answer. The contract in this hook's own docblock is
 * unchanged: a failure still yields `null`, and the caller still omits.
 *
 * Keyed by workspace id alone, which is safe because the only way a caller
 * obtains an id is the route or `useLastWorkspace`, and the latter already
 * refuses another user's record. A name reached through this cache is one this
 * viewer had already been served.
 */
const nameCache = new Map<string, string>();

/** Tests share one module, so they share this. Cleared between cases. */
export function clearWorkspaceNameCache(): void {
  nameCache.clear();
}

export function useWorkspaceName(workspaceId: string | undefined): string | null {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const signedIn = session.kind === 'signed-in';
  const [name, setName] = useState<string | null>(
    // The remount's head start; `useState`'s initialiser runs once per mount.
    () => (workspaceId === undefined ? null : (nameCache.get(workspaceId) ?? null)),
  );

  useEffect(() => {
    if (workspaceId === undefined || !signedIn) {
      setName(null);
      return;
    }
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        if (cancelled) return;
        const found = rows.find((row) => row.id === workspaceId)?.name ?? null;
        // A `null` here means the read SUCCEEDED and the workspace is not in
        // it — you were removed, or it is gone. EVICTING rather than merely not
        // writing is the load-bearing half: a stale entry left behind would be
        // re-read by `useState` on the next remount and the name would come
        // back, one navigation after the product learned it was wrong.
        if (found === null) nameCache.delete(workspaceId);
        else nameCache.set(workspaceId, found);
        setName(found);
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
