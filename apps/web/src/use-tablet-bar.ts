'use client';

import { useEffect, useState } from 'react';

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
 * `false` on the server, on the first client render and wherever `matchMedia` does not exist, so the
 * markup the server sent is what hydrates; the real answer arrives in an effect and follows a
 * foldable opening or a window resize through the `change` event.
 */
export function useTabletBar(): boolean {
  const [bar, setBar] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(TABLET_BAR_QUERY);
    const update = (): void => setBar(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return bar;
}
