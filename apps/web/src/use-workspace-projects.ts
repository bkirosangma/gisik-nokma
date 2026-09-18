import { useEffect, useState } from 'react';
import type { ProjectRef } from '@gisik-nokma/app-core';
import { useAppServices, useSessionStatus } from './providers.js';

/**
 * The projects of one workspace, out of the ONE shared read.
 *
 * A deliberate sibling of `use-workspace-name.ts`: the same
 * `GET /v1/me/workspaces` call, narrowed one level further — from the workspace
 * row to the `projects` array nested inside it — exactly as `use-project-name.ts`
 * narrows one level further again for a single name. `ProjectRef.name` and
 * `ProjectRef.archived` are both served on `WorkspaceRef.projects`, so nothing
 * new is served and no second request is made.
 *
 * ## The list is SERVED ORDER, archived rows INCLUDED — neither is decided here
 *
 * `/workspaces` renders `workspace.projects` with the archived ones filtered
 * out and does NOT sort (`app/workspaces/page.tsx`), and the nav's fallback is
 * "the first non-archived project in served order". A hook that sorted, or that
 * dropped archived rows on the way out, would put those two on different
 * answers to one question — so the filtering and the ordering belong to the
 * caller, and this is the rows. Cases 13.860 pins the order; the nav's own
 * cases pin the filter.
 *
 * ## `null` and `[]` are different claims
 *
 * `null` means "not known": pending, refused, or signed out. `[]` would mean
 * "this workspace exists and contains no projects", which is a claim about the
 * world this hook is not entitled to make — and one the nav's fallback would
 * act on. So a read that fails omits, and a workspace the read succeeds without
 * is also `null`: you were removed from it, or it was deleted.
 *
 * Gated on a session exactly like `useWorkspaceName`, and for the reason that
 * hook records: a signed-out viewer transiently on a workspace-scoped route
 * must not fire a request that cannot succeed.
 *
 * **Fails silently, and the failure is OMISSION, never the id.**
 */
/**
 * KEYED BY USER **AND** WORKSPACE, and the user half is not symmetry — it is
 * the whole of case 13.878.
 *
 * `use-workspace-name.ts` keys its cache by workspace id alone and is right to:
 * a workspace's NAME is the same for everyone who can see the workspace. A
 * project LIST is not. The server serves a non-owner only the projects they
 * hold a membership in (`apps/server/src/read/visible-projects.ts`: the owner
 * gets the row set, everybody else gets it filtered by `eff.projects`), so one
 * `workspaceId` is a DIFFERENT LIST for every viewer.
 *
 * Copying the name cache's key onto a viewer-filtered list serves one person's
 * project names to the next. The sequence is ordinary rather than exotic: sign
 * out (a CLIENT-SIDE navigation — `account-menu.tsx` pushes `/sign-in`, so
 * module state survives it), sign in as someone with narrower access, and the
 * nav's first paint names projects they cannot open. The window is a network
 * round trip, and it is unbounded when that read is slow or failing, because
 * the rejection arm deliberately does not evict.
 *
 * The two ids are serialised as a JSON ARRAY rather than joined with a
 * separator, because a separator is a guess about what the ids cannot contain:
 * `('a', 'b:c')` and `('a:b', 'c')` must not be able to spell one key, and no
 * single character is safe without assuming something about the id format.
 *
 * **The first version used a NUL byte, and it was replaced because of a
 * MEASURED consequence rather than a worry.** A NUL byte makes this file
 * *binary* to `grep`, `diff` and every other line-oriented tool:
 * `grep -n cacheKey use-workspace-projects.ts` printed `Binary file … matches`
 * instead of the line. A source file the repo's own inspection tools silently
 * refuse to search is a blind instrument — the precise failure this codebase
 * spends the most effort avoiding — and it would have stayed invisible until
 * someone needed a citation out of this file.
 */
function cacheKey(userId: string, workspaceId: string): string {
  return JSON.stringify([userId, workspaceId]);
}

const projectsCache = new Map<string, ProjectRef[]>();

/** Tests share one module, so they share this. Cleared between cases. */
export function clearWorkspaceProjectsCache(): void {
  projectsCache.clear();
}

export function useWorkspaceProjects(workspaceId: string | undefined): ProjectRef[] | null {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  // The user is read HERE rather than passed in, because this hook already
  // reads the session to gate the request — and because a caller that forgot to
  // pass it would silently fall back to the width of the cache this exists to
  // narrow.
  const userId = session.kind === 'signed-in' ? session.user.id : null;
  const [projects, setProjects] = useState<ProjectRef[] | null>(
    // The remount's head start; `useState`'s initialiser runs once per mount.
    // MODULE-SCOPED for the reason `use-workspace-name.ts` records for its own
    // cache: `AppNav` is rendered by each PAGE rather than by the root layout,
    // so it remounts on every client-side navigation, and without this the
    // project item would vanish for the tick it takes to read storage and then
    // come back — the flicker the owner reported for the workspace name.
    //
    // No session yet means no answer yet, NOT a cache hit: before the session
    // resolves there is no user to have read a list FOR.
    () =>
      workspaceId === undefined || userId === null
        ? null
        : (projectsCache.get(cacheKey(userId, workspaceId)) ?? null),
  );

  useEffect(() => {
    if (workspaceId === undefined || userId === null) {
      setProjects(null);
      return;
    }
    const key = cacheKey(userId, workspaceId);
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        if (cancelled) return;
        const found = rows.find((row) => row.id === workspaceId)?.projects ?? null;
        // A `null` here means the read SUCCEEDED and the workspace is not in
        // it. EVICTING rather than merely not writing is the load-bearing half,
        // for the reason the name cache gives: a stale entry left behind would
        // be re-read by `useState` on the next remount and the list would come
        // back, one navigation after the product learned it was wrong.
        //
        // `[]` is NOT evicted, because it is not a failure: a workspace with no
        // projects is a served fact, and caching it is what stops the nav
        // re-asking on every navigation for a workspace it already knows is
        // empty.
        if (found === null) projectsCache.delete(key);
        else projectsCache.set(key, found);
        setProjects(found);
      },
      () => {
        // Only SUCCESSFUL lookups are cached. A pending or refused read is not
        // a fact about the workspace's projects, and caching one would turn a
        // transient failure into a sticky wrong answer.
        if (!cancelled) setProjects(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, userId, workspaceId]);

  return projects;
}
