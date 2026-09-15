import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ROUTED 3 — a cross-page leak Task 7's review routed from Task 6.
 *
 * `.gn-workspace-list__role` has THREE call sites: `/settings`
 * (`app/settings/page.tsx:148`), `/workspaces` (`app/workspaces/page.tsx`,
 * the card's own role sentence — the namesake caller), and the workspace
 * home header (`app/w/[workspaceId]/page.tsx:588`). Task 6 resized the
 * shared rule from `0.8rem` to `0.9375rem` for the card head's sake, which is
 * correct for the namesake but would silently hand the other two pages
 * larger type they never asked for, since they only ever borrowed the class.
 * `.gn-page-title + .gn-workspace-list__role` pins those two borrowers back
 * to `0.8rem` — see its own comment in `globals.css` for why that selector
 * (an adjacent-sibling match, verified against the actual markup of all
 * three call sites) is the correct scope and matches no other page.
 *
 * The brief for this routed item asked only that the pin be COMMENTED, not
 * tested. This is added anyway because the CSS-scan harness already exists
 * in this suite (`workspace-restricted-spacing.test.ts`, for ROUTED 2) and
 * the failure mode is the same one that harness exists to catch: the rule
 * quietly deleted, or "cleaned up" into the base rule, with nothing noticing
 * the two borrowing pages grew their type. Cheap to add once the scanner
 * exists; not required to consider Task 7 complete without it.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');

/** One CSS rule per line — see `workspace-restricted-spacing.test.ts`'s
 * identical helper for why every rule this file asserts on must stay
 * single-line in `globals.css`. */
function ruleFor(css: string, selectorPattern: RegExp): string | undefined {
  return css.split('\n').find((line) => selectorPattern.test(line) && line.includes('{'));
}

describe('ROUTED 3 — the two .gn-workspace-list__role borrowers stay pinned at 0.8rem', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  it('.gn-page-title + .gn-workspace-list__role exists and declares font-size: 0.8rem', () => {
    const rule = ruleFor(css, /^\.gn-page-title \+ \.gn-workspace-list__role\s*\{/);
    expect(rule, 'no rule found for .gn-page-title + .gn-workspace-list__role').toBeDefined();
    expect(rule).toMatch(/font-size:\s*0\.8rem/);
  });

  it("the namesake .gn-workspace-list__role rule stays at the card head's 0.9375rem", () => {
    // The bare-selector rule is written MULTI-line (the card head's own
    // rule, predating this task, not one `ruleFor`'s single-line scan can
    // read its declarations from), so this asserts directly against the raw
    // text instead — confirming Task 6's resize is untouched by ROUTED 3's
    // pin, which must narrow the two borrowers WITHOUT narrowing this one.
    expect(css).toMatch(/\.gn-workspace-list__role\s*\{\s*\n\s*margin:\s*0[^\n]*\n\s*font-size:\s*0\.9375rem/);
  });

  /*
   * MUTATION WITNESS. Deleting the pin rule — exactly the regression this
   * suite exists to catch — must be observable: with the rule text removed,
   * the first test's own scan can no longer find it.
   */
  it('a deleted pin rule is caught: the scan finds nothing where it used to', () => {
    const withoutPin = css.replace(
      /\.gn-page-title \+ \.gn-workspace-list__role \{[^}]*\}\n?/,
      '',
    );
    expect(withoutPin).not.toBe(css);
    const rule = ruleFor(withoutPin, /^\.gn-page-title \+ \.gn-workspace-list__role\s*\{/);
    expect(rule).toBeUndefined();
  });
});
