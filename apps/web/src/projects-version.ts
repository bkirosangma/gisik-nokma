import { useSyncExternalStore } from 'react';

/**
 * A counter that says "the served list of projects just changed", bumped after
 * a committed write that can change a project's name, description or archive
 * flag (MCP CRUD plan Task 2).
 *
 * `useProjectName` and `useWorkspaceProjects` read `GET /v1/me/workspaces` once
 * per mount and the second keeps a module-scoped cache, so without this the
 * project page's title, the tab title and the nav's project link would keep
 * showing the OLD name until the next navigation. The outcome is still
 * OBSERVED by re-reading — a bump never carries a name, it only makes the hooks
 * ask again.
 */
let version = 0;
const listeners = new Set<() => void>();

export function bumpProjectsVersion(): void {
  version += 1;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProjectsVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}
