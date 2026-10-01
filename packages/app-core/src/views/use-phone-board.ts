import { useSyncExternalStore } from 'react';

/**
 * The phone breakpoint, spelled exactly as the stylesheet's `@media` arm spells it (`packages/ui/src/ui.css`) and
 * as the web app's own `PHONE_QUERY` does. Case 21.040 reads both and fails if they drift: a board that rendered
 * the phone layout at one width while the CSS switched at another would show a picker with no snap, or snap with
 * no picker.
 */
export const PHONE_BOARD_QUERY = '(max-width: 40rem)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(PHONE_BOARD_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function snapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(PHONE_BOARD_QUERY).matches
    : false;
}

/**
 * Is the board on a phone? Decides what the DOM CONTAINS — a collapsed column renders a strip INSTEAD of its
 * cards (so CSS alone cannot expand it), and the column picker is a control that only exists on a phone. Every
 * purely visual phone rule stays in the stylesheet. `false` on the server and wherever `matchMedia` is missing
 * (jsdom), which is the desktop board every existing suite already drives.
 */
export function usePhoneBoard(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
