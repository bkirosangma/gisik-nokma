import { useCallback, useEffect, useState } from 'react';

/**
 * Which project groups a person has collapsed, remembered on this device (smoothness add-on G-1, cases
 * 25.303 / 25.304 / 25.312).
 *
 * `use-last-project.ts`'s conventions, one question over:
 * - **Keyed by user AND workspace.** `localStorage` outlives a session, so a bare key would collapse the next
 *   person's groups; a workspace has its own group ids, so the record answers "what this person collapsed HERE".
 *   With no user (`undefined`: no session yet, or a caller that has none) nothing is read and nothing is written.
 * - **Every access is wrapped.** A browser with site data blocked throws on the accessor, so a `try`/`catch` is
 *   the only shape that survives it. A lost memory is a lost convenience; every failure answers "all open".
 * - **The value is a list of group ids** (a set; only the collapsed ones, so the default is the empty list). A
 *   value that is anything else is refused whole rather than half-honoured.
 * - **The first render is the default**, and the stored choice is read in an effect: the server has no storage, so
 *   reading during render would hydrate a different tree from the one it sent.
 *
 * The home's grouped view and Settings → Groups each keep their OWN set (`kind`), so opening a branch in one place
 * never moves the other.
 */
export type GroupCollapseKind = 'gn-groups-collapsed' | 'gn-groups-tree-collapsed';

const NONE: ReadonlySet<string> = new Set<string>();

function keyOf(kind: GroupCollapseKind, userId: string, workspaceId: string): string {
  return `${kind}:${userId}:${workspaceId}`;
}

/** The ids this person collapsed, or the empty set for every way there is nothing (or nothing trustworthy) to read. */
export function readCollapsedGroups(kind: GroupCollapseKind, userId: string, workspaceId: string): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(keyOf(kind, userId, workspaceId));
    if (raw === null) return NONE;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) return NONE;
    return new Set<string>(parsed as string[]);
  } catch {
    return NONE;
  }
}

/** Remembers the set. A failed write is swallowed: the toggle still moved, only its memory is lost. */
export function rememberCollapsedGroups(
  kind: GroupCollapseKind,
  userId: string,
  workspaceId: string,
  ids: ReadonlySet<string>,
): void {
  try {
    window.localStorage.setItem(keyOf(kind, userId, workspaceId), JSON.stringify([...ids]));
  } catch {
    /* blocked or full: see the docblock */
  }
}

/** The collapsed set for one screen, with `toggle` / `expand` that also remember it. */
export function useCollapsedGroups(
  kind: GroupCollapseKind,
  userId: string | undefined,
  workspaceId: string | undefined,
): { collapsed: ReadonlySet<string>; toggle: (id: string) => void; expand: (id: string) => void } {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(NONE);
  const scoped = userId !== undefined && userId !== '' && workspaceId !== undefined && workspaceId !== '';
  useEffect(() => {
    if (scoped) setCollapsed(readCollapsedGroups(kind, userId, workspaceId));
  }, [kind, scoped, userId, workspaceId]);
  const update = useCallback(
    (change: (ids: Set<string>) => void) => {
      setCollapsed((current) => {
        const next = new Set(current);
        change(next);
        if (scoped) rememberCollapsedGroups(kind, userId, workspaceId, next);
        return next;
      });
    },
    [kind, scoped, userId, workspaceId],
  );
  const toggle = useCallback(
    (id: string) =>
      update((ids) => {
        if (!ids.delete(id)) ids.add(id);
      }),
    [update],
  );
  const expand = useCallback((id: string) => update((ids) => void ids.delete(id)), [update]);
  return { collapsed, toggle, expand };
}
