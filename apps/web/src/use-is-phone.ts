'use client';

import { useEffect, useState } from 'react';

/**
 * The phone breakpoint, as the query string `matchMedia` takes. It is the SAME `40rem` as the
 * stylesheet's phone arm (mobile-web plan FD1) — case 21.033 reads `globals.css` and fails if the two
 * ever name different widths. (The bottom bar's rules moved to the 64rem tablet arm in UX fixes Task 4, so 21.033 now
 * pins the PHONE top bar's rules to this arm, and 23.051 pins the bar's to `TABLET_BAR_QUERY`.)
 */
export const PHONE_QUERY = '(max-width: 40rem)';

/**
 * Is the viewport phone-sized right now? (≤40rem — NOT whether the bottom bar shows: since UX fixes Task 4 that is
 * `useTabletBar`, ≤64rem, in `use-tablet-bar.ts`, case 23.050.)
 *
 * What still reads this is what is phone-only: `note-byline.tsx`'s phone arrangement. The bar's own gate moved off it on
 * purpose (FD3): widening this query would also have moved the phone top bar's switcher, the dialogs' bottom sheets
 * (case 21.072) and the byline, none of which are wrong at 700px.
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
