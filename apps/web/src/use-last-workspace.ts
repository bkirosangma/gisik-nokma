import { useEffect, useState } from 'react';

/**
 * Follows the `gn-style` / `gn-theme` convention this shell already uses
 * (`style-toggle.tsx:61`, `theme-toggle.tsx:46`): one flat key, read and
 * written inside an effect, every access wrapped because a browser with site
 * data blocked throws on the ACCESSOR, not on the value.
 */
export const LAST_WORKSPACE_KEY = 'gn-last-workspace';

/**
 * THREE states, and the third one is the point.
 *
 * `unknown` is the window before the effect has read storage — first paint, and
 * every server render. It is distinct from `none` because the nav says
 * something different in each: with `none` it renders "No workspace selected",
 * and saying that during `unknown` would flash a false sentence at someone who
 * does have a remembered workspace. Collapsing these two into `undefined` is
 * exactly the bug this type exists to make unrepresentable.
 */
export type LastWorkspace =
  | { status: 'unknown' }
  | { status: 'none' }
  | { status: 'remembered'; workspaceId: string };

/**
 * The last workspace this person opened, remembered across pages (owner,
 * 2026-09-16: "keep the last opened workspace in local storage, and based on
 * that, the workspace scoped navbar items should be made visible. so that just
 * moving to a separate page (inbox, help, account, etc) does not automatically
 * hide them").
 *
 * ## The record is KEYED BY USER, and that is not caution for its own sake
 *
 * `localStorage` outlives a session. Sign out, hand the laptop over, and a bare
 * `gn-last-workspace` points the next person's nav at the previous person's
 * workspace — their workspace NAME rendered in someone else's chrome, which is
 * the same defect `InboxNavLink` carries a whole paragraph about (case 11.169:
 * "a count that outlives the session it was read for is not a stale honest
 * value, it is the previous viewer's"). The stored value therefore carries the
 * user it was written for, and a record belonging to anyone else answers
 * `none`. It is not cleared on sign-out — it is simply not honoured, which also
 * survives the case sign-out never runs at all: a cookie expiring in place,
 * which this shell explicitly handles elsewhere.
 *
 * ## What it does NOT do
 *
 * It does not check that the workspace still exists or is still yours. That is
 * deliberate, and it is not an omission: `useWorkspaceName` already resolves a
 * name out of `getMyWorkspaces()` and yields `null` for anything the caller
 * cannot reach, so `AppNav` gates the remembered links on that — the same
 * shared read, no second request, and no second notion of "reachable" to keep
 * in sync with the first.
 */
export function useLastWorkspace(
  routeWorkspaceId: string | undefined,
  userId: string | null,
): LastWorkspace {
  const [remembered, setRemembered] = useState<LastWorkspace>({ status: 'unknown' });

  useEffect(() => {
    // Signed out, or the session has not landed: nothing is remembered FOR
    // anybody. Answering `none` rather than reading means a signed-out viewer
    // never gets a workspace link at all, which is what they can reach.
    if (userId === null) {
      setRemembered({ status: 'none' });
      return;
    }

    // The route is authority. Opening a workspace is what makes it the last
    // one opened, so this is both the write and the answer.
    if (routeWorkspaceId !== undefined) {
      try {
        window.localStorage.setItem(
          LAST_WORKSPACE_KEY,
          JSON.stringify({ userId, workspaceId: routeWorkspaceId }),
        );
      } catch {
        // A private window, or site data blocked. The nav still works from the
        // route for this page; only the memory is lost, and a nav that refused
        // to render because it could not write a convenience would be worse.
      }
      setRemembered({ status: 'remembered', workspaceId: routeWorkspaceId });
      return;
    }

    setRemembered(readFor(userId));
  }, [routeWorkspaceId, userId]);

  return remembered;
}

/** Every failure answers `none`: an unreadable memory is no memory. */
function readFor(userId: string): LastWorkspace {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return { status: 'none' };
  }
  if (raw === null) return { status: 'none' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Hand-edited, or written by an older shape of this key.
    return { status: 'none' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { status: 'none' };

  const { userId: storedUserId, workspaceId } = parsed as {
    userId?: unknown;
    workspaceId?: unknown;
  };
  if (typeof storedUserId !== 'string' || typeof workspaceId !== 'string') return { status: 'none' };
  // SOMEONE ELSE'S. See the docblock — this is the whole reason for the key's
  // shape, and it is checked before the id is handed back, never after.
  if (storedUserId !== userId) return { status: 'none' };

  return { status: 'remembered', workspaceId };
}
