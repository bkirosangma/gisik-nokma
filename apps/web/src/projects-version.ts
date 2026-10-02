import { useSyncExternalStore } from 'react';

/**
 * A counter that says "the served list of the person's workspaces or projects just
 * changed", bumped after a committed write that can change what `GET /v1/me/workspaces`
 * answers: a project's name, description or archive flag (MCP CRUD plan Task 2), and a
 * workspace joining, leaving or being renamed, archived or restored in the person's
 * list (founding, an invitation accepted, a workspace archived or deleted; smoothness
 * T4 FIX 1, case 25.049).
 *
 * `useMyWorkspaces` is the reader that re-asks: it keeps one settled answer for the
 * nav's workspace name and dropdown, Last project and the project name (the hooks that
 * read through it), and a bump is the only thing short of 30 s that makes it read
 * again. Without a bump a workspace founded a moment ago is missing from the next
 * page's nav. The outcome is still OBSERVED by re-reading — a bump never carries a
 * name, it only makes the reader ask again. A new client write that changes that list
 * calls this BEFORE it navigates or reloads.
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
