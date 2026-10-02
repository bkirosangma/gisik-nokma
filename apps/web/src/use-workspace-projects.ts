import { useEffect } from 'react';
import type { ProjectRef } from '@gisik-nokma/app-core';
import { useSessionStatus } from './providers.js';
import { useMyWorkspaces } from './use-my-workspaces.js';

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
 * ## It re-asks when `projects-version.ts` is bumped
 *
 * A committed project write (an Edit's rename, an archive, a founding) bumps the
 * counter and this hook reads the list again, so the nav's project link does not
 * keep a name the product has just changed. The cache is overwritten by that
 * read, never edited.
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
 * `use-workspace-name.ts` keys its cache by workspace id alone. **What that
 * file caches is a NAME, and a workspace's name is the same for everyone who
 * can see the workspace** — the value is not viewer-dependent, so its key needs
 * no user in it. A project LIST is not that. The server serves a non-owner only
 * the projects they hold a membership in (`apps/server/src/read/visible-projects.ts`:
 * the owner gets the row set, everybody else gets it filtered by
 * `eff.projects`), so one `workspaceId` is a DIFFERENT LIST for every viewer.
 *
 * **That is a claim about the VALUE, not a clean bill for that file's cache,
 * and an earlier draft of this paragraph gave it one** ("keys its cache by
 * workspace id alone and is right to"). A reviewer checked it and the
 * endorsement was too broad: `nameCache` is not dropped on a user change by the
 * hook that owns it, and the only thing that clears it is
 * `use-last-workspace.ts`'s viewer-change branch — which runs only when its own
 * cache is non-empty. So a viewer who signs out and back in as someone else and
 * lands directly on a workspace route can see the previous person's workspace
 * NAME for one frame, which is the very survival-of-module-state the paragraph
 * above leans on.
 *
 * **Recorded, not fixed: it is outside this change and it is not the same
 * defect as the one above** — a first-frame window on a value both people are
 * entitled to see, against a window on a list one of them is not. **Owner:
 * whoever next touches `apps/web/src/use-workspace-name.ts`**, whose own
 * docblock justifies its key by id PROVENANCE ("the only way a caller obtains
 * an id is the route or `useLastWorkspace`") rather than by the value being
 * viewer-independent — a reason that is true and does not cover this.
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
  const session = useSessionStatus();
  // The user is read HERE rather than passed in, because this hook already reads the session to gate the
  // request, and because a caller that forgot to pass it would silently fall back to the width of the
  // cache this exists to narrow.
  const userId = session.kind === 'signed-in' ? session.user.id : null;
  // The ONE shared read (`use-my-workspaces.ts`): it re-asks after a committed project write (rename,
  // archive, founding, see `projects-version.ts`), which this hook used to do for itself.
  const { rows, error } = useMyWorkspaces(workspaceId !== undefined);
  const found =
    workspaceId === undefined || userId === null || rows === null
      ? null
      : (rows.find((row) => row.id === workspaceId)?.projects ?? null);

  useEffect(() => {
    if (workspaceId === undefined || userId === null || rows === null) return;
    const key = cacheKey(userId, workspaceId);
    // A `null` here means the read SUCCEEDED and the workspace is not in it. EVICTING rather than merely not
    // writing is the load-bearing half, for the reason the name cache gives. `[]` is NOT evicted: a
    // workspace with no projects is a served fact, and caching it stops the nav re-asking for it.
    if (found === null) projectsCache.delete(key);
    else projectsCache.set(key, found);
  }, [workspaceId, userId, rows, found]);

  // No session yet means no answer yet, NOT a cache hit: before the session resolves there is no user to
  // have read a list FOR. A refused read is omission, never a stale guess.
  if (workspaceId === undefined || userId === null || error !== null) return null;
  // The remount's head start while the shared read is pending; a settled read always wins.
  return rows === null ? (projectsCache.get(cacheKey(userId, workspaceId)) ?? null) : found;
}
