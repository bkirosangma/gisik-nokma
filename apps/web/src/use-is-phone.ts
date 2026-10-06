'use client';

import { useSyncExternalStore } from 'react';

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
 * AMENDED 2026-10-02 (neo F-2, 23.330): the project page also reads it, to move the workflow picker and "Only tickets in
 * progress" into the Filters sheet on a phone (the header keeps them inline above 40rem).
 *
 * AMENDED 2026-10-06 (Knowledge Graph spec E T4): Home's graph reads it too, as the Knowledge Graph panel does (KG-C
 * T9): on a phone the view takes its phone form (`config: 'phone'`: one clear hop, the folded bar, the inspector card),
 * and Home offers no hop control.
 *
 * `false` on the server and wherever `matchMedia` does not exist. It is a `useSyncExternalStore` (smoothness T8, case 25.141/25.144,
 * audit SM-08): the server snapshot is `false`, so on a HARD LOAD the server markup paints and hydrates first (the CSS belt keeps the
 * corner links hidden in that frame) and the client answer follows the hydration commit. On every CLIENT mount (each route hop
 * remounts `AppNav`) the first render already has the answer, with no effect and no flash of the wrong shell; it follows a
 * foldable opening or a window resize through the `change` event.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches, () => false);
}

function subscribePhone(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
