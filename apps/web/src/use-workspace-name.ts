import { useEffect } from 'react';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { useSessionStatus } from './providers.js';
import { useMyWorkspaces } from './use-my-workspaces.js';

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

/**
 * The name AND the nav dropdown's rows out of the ONE `getMyWorkspaces` read (U-T14, cases 23.254–23.257).
 *
 * `others` is the viewer's other workspaces for the nav's workspace-name dropdown: **live only** (an archived one is not
 * somewhere `/workspaces` lists among the open ones — the rule Last project's dropdown follows for projects), **never
 * the one the bar is about** (the name beside it is that workspace; the list is where ELSE to go), served order kept,
 * neither sorted nor re-derived. `[]` is what the caller renders no dropdown for, so a pending read, a refused one and a
 * viewer with a single workspace all give the same answer: the name stays a plain link.
 *
 * It rides the shared read (`use-my-workspaces.ts`) rather than making a request of its own: the three hooks on it (this one, `useWorkspaceProjects`, `useProjectName`) send ONE `getMyWorkspaces` between them, which case 23.254 counts and case 25.041 pins. Readers still outside it (`useCanModerateComments`, kept off on purpose, and the direct readers) are named in `use-my-workspaces.ts`. `others` follows the shared rows, so a remount paints it at once and a stale list is refreshed by the shared read's own rules (a write that bumps `projects-version.ts`, or the next mount after 30 s); a cold start still shows the name a tick before the dropdown, and a refused read gives `[]`. The name's own semantics are exactly the ones documented above.
 */
export function useWorkspaceLookup(workspaceId: string | undefined): {
  name: string | null;
  others: readonly WorkspaceRef[];
} {
  const session = useSessionStatus();
  const signedIn = session.kind === 'signed-in';
  const { rows, error } = useMyWorkspaces(workspaceId !== undefined);

  // The read SUCCEEDED and the workspace is not in it: you were removed, or it is gone. EVICTING rather than
  // merely not writing is the load-bearing half: a stale entry left behind would be re-read by the next
  // remount and the name would come back, one navigation after the product learned it was wrong.
  const found = workspaceId === undefined || rows === null ? null : (rows.find((row) => row.id === workspaceId)?.name ?? null);
  useEffect(() => {
    if (workspaceId === undefined || rows === null) return;
    if (found === null) nameCache.delete(workspaceId);
    else nameCache.set(workspaceId, found);
  }, [workspaceId, rows, found]);

  if (workspaceId === undefined || !signedIn || error !== null) return { name: null, others: [] };
  // The remount's head start while the shared read is still pending; a settled read always wins.
  const name = rows === null ? (nameCache.get(workspaceId) ?? null) : found;
  const others = rows === null ? [] : rows.filter((row) => !row.archived && row.id !== workspaceId);
  return { name, others };
}

export function useWorkspaceName(workspaceId: string | undefined): string | null {
  return useWorkspaceLookup(workspaceId).name;
}
