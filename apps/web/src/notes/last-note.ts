/**
 * The last note opened, per device (smoothness G-3 addendum, cases 25.350–25.354).
 *
 * `localStorage` key `gn-last-note:<userId>:<workspaceId>` = note id. One key per user AND workspace, so a second
 * person on the same browser and a second workspace each keep their own, and nothing here ever crosses either.
 *
 * A key per workspace cannot say which workspace's note was opened LAST, so one pointer per user rides beside it,
 * `gn-last-note-workspace:<userId>` = that workspace's id (25.356). It is only a preference for which key to try
 * first: a missing, unreadable or stale pointer leaves the per-workspace keys exactly as they were.
 *
 * Every access is wrapped: storage is a convenience, never a dependency. A browser that blocks site data throws on
 * the accessor itself (private windows, "block all cookies", a full quota), and the page must then behave exactly
 * as it did before this file existed — the open note is simply not remembered.
 */
export function lastNoteKey(userId: string, workspaceId: string): string {
  return `gn-last-note:${userId}:${workspaceId}`;
}

export function lastWorkspaceKey(userId: string): string {
  return `gn-last-note-workspace:${userId}`;
}

export function readLastWorkspace(userId: string): string | null {
  try {
    const value = window.localStorage.getItem(lastWorkspaceKey(userId));
    return value === null || value === '' ? null : value;
  } catch {
    return null;
  }
}

export function readLastNote(userId: string, workspaceId: string): string | null {
  try {
    const value = window.localStorage.getItem(lastNoteKey(userId, workspaceId));
    return value === null || value === '' ? null : value;
  } catch {
    return null;
  }
}

export function writeLastNote(userId: string, workspaceId: string, noteId: string): void {
  try {
    window.localStorage.setItem(lastNoteKey(userId, workspaceId), noteId);
    window.localStorage.setItem(lastWorkspaceKey(userId), workspaceId);
  } catch {
    // Not remembered; nothing else changes.
  }
}

export function clearLastNote(userId: string, workspaceId: string): void {
  try {
    window.localStorage.removeItem(lastNoteKey(userId, workspaceId));
  } catch {
    // Same as above.
  }
}
