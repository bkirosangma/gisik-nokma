import { useEffect, useState } from 'react';
import { useProjectsVersion } from './projects-version.js';
import { useAppServices, useSessionStatus } from './providers.js';

/**
 * The current project's own SERVED name (board-prototype-port Task 2, fix
 * round 1 — coordinator Ruling 6).
 *
 * `ProjectRef.name` (`packages/app-core/src/view-types.ts`) is served on
 * `WorkspaceRef.projects`, over the SAME `GET /v1/me/workspaces` read
 * `use-workspace-name.ts` already makes for this very page's own nav bar (and
 * for `/settings`'s subtitle) — no new endpoint, no second derivation. This
 * hook narrows one step further than that one does: from the workspace row to
 * the project row nested inside it.
 *
 * Gated on a session exactly like `useWorkspaceName`, and for the same reason:
 * a signed-out viewer transiently on a project-scoped route must not fire a
 * request that cannot succeed.
 *
 * **Fails silently, and the failure is OMISSION, never the id.** Quoting
 * `use-workspace-name.ts`'s own docblock: "while it is pending or refused this
 * hook holds `null` — a caller renders no name rather than the raw id or a
 * stale guess." The same rule applies here, unchanged: a project this viewer
 * has not yet been told the name of is not licence to print its id instead.
 *
 * **Deliberately NOT module-cached, unlike `useWorkspaceName`.** Round 26 gave
 * that hook a module-scoped cache because `AppNav` is rendered per PAGE (not
 * by the root layout) and therefore remounts on every client-side navigation
 * — the cache is what stopped its workspace-name nav item flickering out and
 * back in on every page change that stayed inside the same workspace. This
 * hook has no analogous position: the project board page mounts it once per
 * page load, not once per navigation across an otherwise-unchanging page, so
 * there is no remount for a cache to survive and nothing it would buy here —
 * only a second stale-entry-eviction story to keep in sync with the first.
 * Stated as a decision, not an oversight.
 *
 * **It re-asks when `projects-version.ts` is bumped** (MCP CRUD plan Task 2): a
 * committed project write — an Edit's rename above all — would otherwise leave
 * this page's title on the old name until the next page load.
 */
export function useProjectName(
  workspaceId: string | undefined,
  projectId: string | undefined,
): string | null {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const signedIn = session.kind === 'signed-in';
  const [name, setName] = useState<string | null>(null);
  // Re-asks after a committed project write (an Edit's new name), see `projects-version.ts`.
  const version = useProjectsVersion();

  useEffect(() => {
    if (workspaceId === undefined || projectId === undefined || !signedIn) {
      setName(null);
      return;
    }
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        if (cancelled) return;
        const found =
          rows.find((row) => row.id === workspaceId)?.projects.find(
            (project) => project.id === projectId,
          )?.name ?? null;
        setName(found);
      },
      () => {
        if (!cancelled) setName(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, workspaceId, projectId, signedIn, version]);

  return name;
}
