/**
 * The workspace home's Grouped / Plain choice, remembered per person on each device
 * (prefixes and groups Task 7, ruling R7: *"the grouped/plain toggle is remembered per person
 * on each device"*). The shape is `new-ticket-start.ts`'s: one `localStorage` record per
 * workspace carrying the `userId` it was written for, EVERY storage access wrapped, and every
 * failure answering the default.
 *
 * ## Why a record per workspace and not one for the device
 *
 * A person who prefers Grouped in a workspace with a tree and Plain in one without would have
 * the second choice overwrite the first. The key carries the workspace; the value carries the
 * user, so a second person signing in on the same device reads the default, never a stranger's
 * choice (case 22.122).
 *
 * ## Why the default is `'plain'`
 *
 * A workspace whose owner has never made a group has nothing to nest, and a grouped view of
 * nothing is one "Ungrouped" heading over the same list. Plain is today's screen, unchanged.
 */
export type ProjectGrouping = 'grouped' | 'plain';

export const DEFAULT_PROJECT_GROUPING: ProjectGrouping = 'plain';

export const PROJECT_GROUPING_KEY_PREFIX = 'gn-project-grouping:';

export function projectGroupingKey(workspaceId: string): string {
  return `${PROJECT_GROUPING_KEY_PREFIX}${workspaceId}`;
}

export function readProjectGrouping(userId: string, workspaceId: string): ProjectGrouping {
  if (userId === '' || workspaceId === '') return DEFAULT_PROJECT_GROUPING;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(projectGroupingKey(workspaceId));
  } catch {
    return DEFAULT_PROJECT_GROUPING;
  }
  if (raw === null) return DEFAULT_PROJECT_GROUPING;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_PROJECT_GROUPING;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PROJECT_GROUPING;

  const { userId: storedUserId, choice } = parsed as { userId?: unknown; choice?: unknown };
  if (storedUserId !== userId) return DEFAULT_PROJECT_GROUPING;
  if (choice !== 'grouped' && choice !== 'plain') return DEFAULT_PROJECT_GROUPING;
  return choice;
}

export function rememberProjectGrouping(
  userId: string,
  workspaceId: string,
  choice: ProjectGrouping,
): void {
  if (userId === '' || workspaceId === '') return;
  try {
    window.localStorage.setItem(projectGroupingKey(workspaceId), JSON.stringify({ userId, choice }));
  } catch {
    // Private mode, a full quota, a blocked store: the choice holds for this visit and is not kept.
  }
}
