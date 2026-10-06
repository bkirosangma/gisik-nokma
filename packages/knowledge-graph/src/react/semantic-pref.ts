import { SEMANTIC_KEY } from '@gisik-nokma/domain';

/**
 * The semantic-layer switch's remembered value (spec §6.4); the key follows `gn-theme` / `gn-style` (`apps/web/src/theme-toggle.tsx`). It is a viewing choice: no event, no setting (ruling D6).
 * The key itself lives in domain (KG-D Task 9): the Concepts row on a ticket's and a note's Details (app-core) reads it too, and app-core never depends on this package.
 */
export { SEMANTIC_KEY };

/** Default On. A blocked store (it THROWS in Safari with site data blocked) gives the default (Review Focus 5). */
export function readSemantic(): boolean {
  try {
    return window.localStorage.getItem(SEMANTIC_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Best-effort: a blocked store leaves the choice in component state for the session. */
export function writeSemantic(on: boolean): void {
  try {
    window.localStorage.setItem(SEMANTIC_KEY, on ? 'on' : 'off');
  } catch {
    // the session still remembers it in component state
  }
}
