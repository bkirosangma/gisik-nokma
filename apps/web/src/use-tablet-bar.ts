'use client';

import { useSyncExternalStore } from 'react';

/**
 * The width up to which the bottom bar replaces the top bar's destination links, as the query string
 * `matchMedia` takes (UX fixes Task 4, owner ruling U3, case 23.050): 64rem = 1024px, the largest
 * tablet. It is the SAME `64rem` as the stylesheet's tablet arm (`globals.css`: the bar's own rules,
 * the nav's collapse) and case 23.051 reads both and fails if they ever name different widths.
 *
 * It is deliberately NOT `PHONE_QUERY` (`use-is-phone.ts`, 40rem): that one still drives the phone
 * top bar — the project switcher in place of the link row — and every phone-only rule, and widening
 * it would have moved all of those to tablets that never asked for them (plan FD3).
 */
export const TABLET_BAR_QUERY = '(max-width: 64rem)';

/**
 * Does the bottom bar belong on this viewport right now?
 *
 * The reason a script reads this when CSS already knows is the one `useIsPhone` records: the bar is a
 * SECOND set of Notes / Inbox / My work links, and a `display: none` copy is a second unread poller and
 * a duplicate of every destination for anything that reads the DOM. So at ≤64rem `AppNav` renders the
 * bar INSTEAD of the corner's Notes and Inbox links, and above it renders the corner alone. CSS
 * (`.gn-bottom-bar { display: none }` above 64rem) stays as the belt: the paint is right even in the
 * first frame, before this effect has run.
 *
 * `false` on the server and wherever `matchMedia` does not exist. It is a `useSyncExternalStore` (smoothness T8, case 25.141/25.144,
 * audit SM-08): the server snapshot is `false`, so the markup the server sent is what hydrates, and React then re-renders with the
 * client snapshot BEFORE paint, so the first painted frame already has the real answer (no effect, no flash of the wrong shell);
 * it follows a foldable opening or a window resize through the `change` event.
 */
export function useTabletBar(): boolean {
  return useSyncExternalStore(subscribeTabletBar, () => typeof window.matchMedia === 'function' && window.matchMedia(TABLET_BAR_QUERY).matches, () => false);
}

function subscribeTabletBar(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(TABLET_BAR_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
