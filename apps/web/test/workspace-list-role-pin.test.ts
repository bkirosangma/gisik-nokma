import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ruleFor } from './helpers/css-rule-scan.js';

/**
 * Case 13.409 (test-cases/13-deployment-dogfooding.md) — minted by the
 * workspaces-prototype-port plan's Task 10, catalogue consolidation. This
 * whole file was new with Task 7 and left uncased at the time.
 *
 * ROUTED 3 — a cross-page leak Task 7's review routed from Task 6.
 *
 * `.gn-workspace-list__role` has THREE call sites: `/settings`
 * (`app/settings/page.tsx`), `/workspaces` (`app/workspaces/page.tsx`, the
 * card's own role sentence — the namesake caller), and the workspace home
 * header (`app/w/[workspaceId]/page.tsx`). Task 6 resized the shared rule
 * from `0.8rem` to `0.9375rem` for the card head's sake, which is correct for
 * the namesake but would silently hand the other two pages larger type they
 * never asked for, since they only ever borrowed the class.
 *
 * `.gn-workspace-list__role--pinned` pins those two borrowers back to
 * `0.8rem`. Fix round 1: this used to be the sibling combinator
 * `.gn-page-title + .gn-workspace-list__role`, verified against the real
 * markup — but a selector like that is only as true as the markup stays; the
 * reviewer caught that inserting any element between the `<h1>` and the role
 * `<p>` at either borrower would silently stop the pin from applying, with
 * every test (including the CSS-scan tests THIS file used to be) still
 * green. A DEDICATED class removes that precondition entirely: the pin
 * applies because the element carries the class, full stop.
 *
 * This file is the source-scan half — it proves the RULE exists in
 * `globals.css`. It does NOT prove either page's markup actually carries the
 * class; that gap (the same one IMPORTANT 2 named for `.gn-workspace-home__
 * restricted`) is closed instead by a rendered-DOM assertion in each page's
 * own render suite (`settings-page.test.tsx`, `workspace-home.test.tsx`).
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');

/** One CSS rule per line — see `workspace-restricted-spacing.test.ts`'s
 * identical helper for why every rule this file asserts on must stay
 * single-line in `globals.css`. */

describe('ROUTED 3 — .gn-workspace-list__role--pinned exists and stays 0.8rem', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  it('.gn-workspace-list__role--pinned exists and declares font-size: 0.8rem', () => {
    const rule = ruleFor(css, /^\.gn-workspace-list__role--pinned\s*\{/);
    expect(rule, 'no rule found for .gn-workspace-list__role--pinned').toBeDefined();
    expect(rule).toMatch(/font-size:\s*0\.8rem/);
  });

  it("the namesake .gn-workspace-list__role rule stays at the card head's 0.9375rem", () => {
    // The bare-selector rule is written MULTI-line (the card head's own
    // rule, predating this task, not one `ruleFor`'s single-line scan can
    // read its declarations from), so this asserts directly against the raw
    // text instead — confirming Task 6's resize is untouched by the pin,
    // which must narrow the two borrowers WITHOUT narrowing this one.
    expect(css).toMatch(/\.gn-workspace-list__role\s*\{\s*\n\s*margin:\s*0[^\n]*\n\s*font-size:\s*0\.9375rem/);
  });

  /*
   * MUTATION WITNESS. Deleting the pin rule — exactly the regression this
   * suite exists to catch — must be observable: with the rule text removed,
   * the first test's own scan can no longer find it.
   */
  it('a deleted pin rule is caught: the scan finds nothing where it used to', () => {
    const withoutPin = css.replace(/\.gn-workspace-list__role--pinned \{[^}]*\}\n?/, '');
    expect(withoutPin).not.toBe(css);
    const rule = ruleFor(withoutPin, /^\.gn-workspace-list__role--pinned\s*\{/);
    expect(rule).toBeUndefined();
  });
});
