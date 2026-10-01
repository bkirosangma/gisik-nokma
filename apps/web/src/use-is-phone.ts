'use client';

import { useEffect, useState } from 'react';

/**
 * The phone breakpoint, as the query string `matchMedia` takes. It is the SAME `40rem` as the
 * stylesheet's phone arm (mobile-web plan FD1) — case 21.033 reads `globals.css` and fails if the two
 * ever name different widths.
 */
export const PHONE_QUERY = '(max-width: 40rem)';

/**
 * Is the viewport phone-sized right now?
 *
 * Why a script reads this when CSS already knows: the bottom bar is a SECOND set of Notes / Inbox /
 * My work links, and a `display: none` copy is not free — it is a second poller for the unread count,
 * and a duplicate of every destination for anything that reads the DOM rather than the painted page.
 * So at phone width `AppNav` renders the bar INSTEAD of the corner's Notes and Inbox links, and above
 * it renders the corner alone. CSS (`.gn-bottom-bar { display: none }` above 40rem) stays as the
 * belt: the paint is right even in the first frame, before this effect has run.
 *
 * `false` on the server, on the first client render and wherever `matchMedia` does not exist, so the
 * markup the server sent is what hydrates; the real answer arrives in an effect and follows a
 * foldable opening or a window resize through the `change` event.
 */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(PHONE_QUERY);
    const update = (): void => setPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return phone;
}
