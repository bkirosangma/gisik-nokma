import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Case 20.661 — the Account page's Appearance controls reflow at 320 px (polish 2, 2026-10-01).
 *
 * The controller's browser pass measured `scrollWidth` 321 at 320 px in neo (light and dark), the right edge of
 * `BUTTON.gn-segmented__item` at 321, and read it as a neo-only rule. It is not: there is none. The Style control is three
 * labels — *Apple HIG*, *Minimal*, *Neomorphic* — and the SELECTED item is weight 600, so with neo selected the longest
 * label is bold and ~2 px wider. The real cause is wider than that: the card's content is 256 px at 320 (12 px shell padding
 * + 20 px card padding each side), the track keeps 4 px of its own, and the three items' `padding: 0 1rem` (ui.css) plus
 * their min-content labels need ~284 px, so the track already spilled ~36 px out of its card in EVERY style; hig and minimal
 * merely ended on the viewport's edge (320) and neo's bold label tipped it one pixel past. Measured on the real stylesheets
 * in headless Chromium at 320: before, right edge 320.9 / scrollWidth 321 (neo, Neomorphic selected); after, the track
 * ends inside its card (right edge 284 - no spill) in every selection.
 *
 * The fix is at the cause: the Appearance items lose half their side padding below 23rem (where the card starts to be
 * narrower than its three labels), in `apps/web/app/globals.css` beside the rules it adjusts — NOT in `ui.css`, whose
 * `.gn-segmented__item` is shared by sign-in, inbox, help and the ticket-type editor and is first-match-resolved by
 * `packages/ui/test/components.test.tsx` (see the note above `.gn-project__rail .gn-segmented__item`).
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const WEB = strip(readFileSync(resolve(TEST_DIR, '../app/globals.css'), 'utf8'));
const UI = strip(readFileSync(resolve(TEST_DIR, '../../../packages/ui/src/ui.css'), 'utf8'));

/** The body of every `selector { … }` directly inside `@media <query> { … }` (one level, which is all this file uses). */
function inMedia(css: string, query: string, selector: string): string[] {
  const out: string[] = [];
  const at = `@media ${query}`;
  let from = 0;
  for (;;) {
    const start = css.indexOf(at, from);
    if (start < 0) break;
    const open = css.indexOf('{', start);
    let depth = 1;
    let i = open + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    const block = css.slice(open + 1, i - 1);
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const hit of block.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))) out.push(hit[1]!);
    from = i;
  }
  return out;
}

describe('20.661 the Appearance segmented items fit their card at 320 px', () => {
  it('20.661 below 23rem the Appearance items take 0.5rem side padding; the shared item keeps 0 1rem and no other site changes', () => {
    const narrow = inMedia(WEB, '(max-width: 23rem)', '.gn-account__appearance .gn-segmented__item');
    expect(narrow).toHaveLength(1);
    expect(narrow[0]).toMatch(/padding:\s*0 0\.5rem;/);
    // CONTROL — the shared rule is untouched (this is not a global squeeze), so the override above is a reading of a real
    // difference: 1rem at rest, half of it only for this card and only when the card is narrower than its labels.
    expect(/\.gn-segmented__item\s*\{[^}]*padding:\s*0 1rem;/.test(UI)).toBe(true);
    expect(/\.gn-account__appearance \.gn-segmented__item\s*\{/.test(WEB.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, ''))).toBe(false);
    // The 44px tap floor is height, and is not touched by the narrowing.
    expect(narrow[0]).not.toMatch(/min-height/);
    // The breakpoint is pinned EXACTLY by the lookup above: 23rem (368px) is wider than the ~356px at which the card starts to be
    // narrower than its labels, so 320 and 360 are covered; a narrower query finds no rule and the length check goes red.
  });
});
