import { useEffect, useState } from 'react';
import { clearWorkspaceNameCache } from './use-workspace-name.js';

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
 *
 * ## Round 26 — the answer is held OUTSIDE React, see `cache` below
 */

/**
 * MODULE-SCOPED, and this is the whole fix for the nav's jitter.
 *
 * `AppNav` is rendered by each PAGE (`app/inbox/page.tsx:210` and fourteen
 * siblings), not by the root layout, so every client-side navigation unmounts
 * and remounts it. Per-component state therefore resets to `unknown` on every
 * page change, the workspace-scoped links vanish for the tick it takes to read
 * storage, and then come back — which is exactly the flicker the owner saw.
 *
 * Holding the last answer outside React survives that remount, so the second
 * and every later navigation starts from what is already known and paints the
 * links on the FIRST frame. The first load of the session still resolves
 * asynchronously, which is correct: nothing is known yet, and claiming
 * otherwise would be inventing state.
 *
 * Keyed by user, for the same reason the stored record is: a cache that
 * outlived a sign-out would hand the next person the previous one's workspace,
 * bypassing the guard in `readLastWorkspace` entirely by never reaching it.
 */
let cache: { userId: string; value: LastWorkspace } | null = null;

/** Tests share one module, so they share this. Cleared between cases. */
export function clearLastWorkspaceCache(): void {
  cache = null;
}

/** The last workspace this person opened. See the docblock above `cache`. */
export function useLastWorkspace(
  routeWorkspaceId: string | undefined,
  userId: string | null,
): LastWorkspace {
  const [remembered, setRemembered] = useState<LastWorkspace>(() =>
    // Only the initial value: `useState`'s initialiser runs once per mount, so
    // this is the remount's head start and never a source of staleness after.
    userId !== null && cache?.userId === userId ? cache.value : { status: 'unknown' },
  );

  useEffect(() => {
    // Signed out, or the session has not landed: nothing is remembered FOR
    // anybody. Answering `none` rather than reading means a signed-out viewer
    // never gets a workspace link at all, which is what they can reach.
    if (userId === null) {
      setRemembered({ status: 'none' });
      return;
    }

    // THE VIEWER CHANGED. Both module caches hold what the PREVIOUS person was
    // served, and neither is reached through `readLastWorkspace`'s user guard — the
    // remembered-workspace cache is checked before it, and the name cache is
    // keyed by workspace id alone. So they are dropped here, at the one place
    // in the shell that observes the identity changing.
    //
    // Without this, signing out and back in as someone else (a client-side
    // navigation, which does NOT reset module state) could paint the previous
    // viewer's workspace name for a frame — the flicker fix re-creating, in a
    // subtler form, exactly the leak the keyed storage record prevents.
    if (cache !== null && cache.userId !== userId) {
      cache = null;
      clearWorkspaceNameCache();
    }

    const remember = (value: LastWorkspace): void => {
      cache = { userId, value };
      setRemembered(value);
    };

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
      remember({ status: 'remembered', workspaceId: routeWorkspaceId });
      return;
    }

    remember(readLastWorkspace(userId));
  }, [routeWorkspaceId, userId]);

  return remembered;
}

/**
 * Every failure answers `none`: an unreadable memory is no memory. Exported for Home (`src/home/home-screen.tsx`),
 * which reads it synchronously for the user who is signed in NOW (27.628).
 */
export function readLastWorkspace(userId: string): LastWorkspace {
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
