import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Cases 13.1530–13.1534 — the signed-in bar is ONE line above 64rem and hands the links to the
 * bottom bar at or below it (case 23.042; it was a `Menu` disclosure below 70rem until 2026-10-02) (owner browser pass 2026-09-29:
 * "Settings" wrapped to a second row at 1280 with a real workspace name).
 *
 * MEASURED in a real browser on the dev stack before the fix, at the house 16px:
 *   1280, seed names            70px  one row
 *   1280, long workspace+project 130px  Settings alone on row 2
 *   1024, seed names            130px  Members + Settings on row 2
 *   768,  seed names            190px  four rows
 *   768,  long names            250px
 * and after: 70px at 1280, 1121 (the narrowest wide width) and 1024 and 768,
 * long names included (they truncate); no label below 16px; focus ring intact.
 *
 * AMENDED 2026-10-02 (UX fixes Task 4, owner ruling U3, case 23.042): the breakpoint moved from 70rem/70.0625rem to
 * 64rem/64.0625rem — below 64rem the bottom bar is the navigation, and there is no `Menu` disclosure between. The wide
 * arm now carries the row from 1025px (the 1121–1280px "Last project:" label hide is gone with it), with `gap: 0.25rem` and 0.5rem link padding (measured in Chrome so the label fits).
 * The painted numbers above are from the 70rem version and are kept as the history; the new ones are in 23.042's line.
 *
 * This is a SOURCE scan of the stylesheet (Playwright is not in `pnpm test`),
 * the shape `nav-phone-disclosure.test.ts` uses, with the same comment strip.
 * It cannot paint; the painted numbers above are the browser's.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(TEST_DIR, '../app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The `@media <query> { … }` block whose body contains `needle`, braces matched. */
function block(query: string, needle: string): string | undefined {
  const marker = `@media ${query} {`;
  let i = 0;
  for (;;) {
    const start = css.indexOf(marker, i);
    if (start === -1) return undefined;
    let depth = 0;
    let end = css.length - 1;
    for (let j = css.indexOf('{', start); j < css.length; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}' && --depth === 0) {
        end = j;
        break;
      }
    }
    const found = css.slice(start, end + 1);
    if (found.includes(needle)) return found;
    i = end + 1;
  }
}

/** The declarations of `selector` inside `body` (first exact `selector {` match). */
function decls(body: string, selector: string): string {
  const at = body.indexOf(`${selector} {`);
  if (at === -1) return '';
  return body.slice(at, body.indexOf('}', at) + 1);
}

const WIDE = block('(min-width: 64.0625rem)', '.gn-nav__label') as string;
const NARROW = block('(max-width: 64rem)', '.gn-nav__more') as string;

describe('13.1530–13.1534 the wide bar is one line; the narrow bar hands off to the bottom bar', () => {
  it('13.1530 above 64rem (was 70rem; amended 2026-10-02, case 23.042) the links row does not wrap', () => {
    expect(WIDE, 'no wide arm names .gn-nav__label').toBeDefined();
    expect(decls(WIDE, '.gn-nav__links')).toContain('flex-wrap: nowrap');
    // Tighter than the 1rem the row had (Task 4): the arm starts 95px narrower than it used to.
    expect(decls(WIDE, '.gn-nav__links')).toContain('gap: 0.25rem');
  });

  it('13.1531 the two data-driven names truncate; every fixed link keeps its full label', () => {
    const label = decls(WIDE, '.gn-nav__label');
    expect(label).toContain('overflow: hidden');
    expect(label).toContain('text-overflow: ellipsis');
    expect(label).toContain('white-space: nowrap');
    const fixed = decls(WIDE, '.gn-nav__links > a,\n  .gn-nav__more > a');
    expect(fixed).toContain('white-space: nowrap');
    expect(fixed).toContain('flex: none');
    // The truncating items are the ONLY ones allowed to shrink.
    const names = decls(WIDE, '.gn-nav__more > .gn-nav__workspace-group,\n  .gn-nav__more > .gn-nav__project');
    expect(names).toContain('flex: 0 1 auto');
    expect(names).toContain('max-width: 16rem');
  });

  it('13.1532 the bar arm and the wide arm meet at 64rem with no gap and no overlap, and no Menu toggle rule is left (amended 2026-10-02: was the 70rem disclosure, case 23.042)', () => {
    expect(NARROW, 'no (max-width: 64rem) block names .gn-nav__more').toBeDefined();
    expect(decls(NARROW, '.gn-nav__more')).toContain('display: none');
    expect(css).not.toContain('gn-nav__more-toggle');
    // 64rem and 64.0625rem are one CSS pixel apart: 1024 vs 1025.
    expect(64.0625 * 16 - 64 * 16).toBe(1);
  });

  it('13.1533 nothing in either arm shrinks the house text size to make the bar fit', () => {
    expect(WIDE).not.toMatch(/font-size/);
    expect(NARROW).not.toMatch(/font-size/);
  });

  it('13.1534 MUTATION WITNESS: a wrapping wide arm is a different reading the case catches', () => {
    const mutant = WIDE.replace('flex-wrap: nowrap', 'flex-wrap: wrap');
    expect(mutant, 'the planted text matched nothing — the witness is inert').not.toBe(WIDE);
    expect(decls(mutant, '.gn-nav__links')).not.toContain('flex-wrap: nowrap');
  });
});
