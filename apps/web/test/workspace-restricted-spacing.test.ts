import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ruleFor } from './helpers/css-rule-scan.js';

/**
 * Case 13.408 (test-cases/13-deployment-dogfooding.md) — minted by the
 * workspaces-prototype-port plan's Task 10, catalogue consolidation. This
 * whole file was new with Task 7 and left uncased at the time.
 *
 * ROUTED 2 — a cross-page regression Task 7's review routed from Task 5.
 *
 * `.gn-workspace-card__restricted` renders at TWO call sites:
 * `app/workspaces/page.tsx` (inside `.gn-workspace-card__door`, the flex
 * column Task 5 built — its `gap: 0.75rem` supplies the top offset there, so
 * the shared rule's `margin: 0` is correct for it) and
 * `app/w/[workspaceId]/page.tsx` (a direct child of `<Card>`, OUTSIDE any
 * flex-gap door). Task 5 zeroed the shared rule's margin without noticing the
 * second call site had no other source of spacing, so it silently lost its
 * former 0.55rem top offset — flagged in a comment by Task 6, fixed here by
 * Task 7: a second class, `.gn-workspace-home__restricted`, on the
 * `/w/[workspaceId]` `<p>` alone, with its own scoped `margin-top`.
 *
 * This is a SOURCE scan of `globals.css`, not a rendered one — the same
 * convention `neo-card-radius.test.ts` (13.355) uses — because these
 * component tests never load the real stylesheet into jsdom, so nothing
 * rendered could confirm a margin value; the source text is the only thing
 * available to assert against. Both rules this file checks are written as a
 * SINGLE line each (matching every sibling rule in this block of
 * `globals.css`), which is what keeps the scan's one-line-per-rule
 * assumption valid — see `ruleFor`'s own comment.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');

/** One CSS rule per line in this file — matches `neo-card-radius.test.ts`'s
 * own scanner convention. A rule written across multiple lines would make
 * this return a bare selector with no declarations on it, so every rule this
 * file asserts on must stay single-line in `globals.css`. */

function lineIndexOf(css: string, selectorPattern: RegExp): number {
  return css.split('\n').findIndex((line) => selectorPattern.test(line) && line.includes('{'));
}

describe('ROUTED 2 — the workspace-home restricted line keeps its 0.55rem top offset', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  it('the shared .gn-workspace-card__restricted rule stays margin: 0, correct for the /workspaces door', () => {
    const rule = ruleFor(css, /^\.gn-workspace-card__restricted\s*\{/);
    expect(rule, 'no rule found for .gn-workspace-card__restricted').toBeDefined();
    expect(rule).toMatch(/margin:\s*0[;\s]/);
  });

  it('.gn-workspace-home__restricted declares margin-top: 0.55rem, scoped to the non-flex call site', () => {
    const rule = ruleFor(css, /^\.gn-workspace-home__restricted\s*\{/);
    expect(rule, 'no rule found for .gn-workspace-home__restricted').toBeDefined();
    expect(rule).toMatch(/margin-top:\s*0\.55rem/);
  });

  /*
   * The tie-break that makes the two tests above insufficient on their own:
   * `.gn-workspace-card__restricted` and `.gn-workspace-home__restricted` are
   * both single-class selectors — equal (0,1,0) specificity — so on a
   * shared property (here, `margin-top`, via the shared rule's `margin`
   * shorthand) SOURCE ORDER decides, not which rule merely "exists". A scan
   * that only checked existence would stay green even if someone moved the
   * override rule ABOVE the shared one, silently re-zeroing it.
   */
  it('the override rule comes AFTER the shared rule, so it wins the specificity tie', () => {
    const sharedIndex = lineIndexOf(css, /^\.gn-workspace-card__restricted\s*\{/);
    const overrideIndex = lineIndexOf(css, /^\.gn-workspace-home__restricted\s*\{/);
    expect(sharedIndex, 'shared rule not found').toBeGreaterThanOrEqual(0);
    expect(overrideIndex, 'override rule not found').toBeGreaterThanOrEqual(0);
    expect(overrideIndex).toBeGreaterThan(sharedIndex);
  });

  /*
   * MUTATION WITNESS for the ordering test above. Rather than assert the
   * check passes and trust it would also fail correctly, this actually
   * SWAPS the two rules' source lines — planting the exact regression (the
   * override moved above the shared rule) — and confirms the identical
   * ordering computation, re-run against the mutated source, flips to false.
   * A check that could not be observed failing would be exactly the kind
   * this suite exists to rule out.
   */
  it('swapping the two rules would flip the ordering check false — proving it is not vacuous', () => {
    const lines = css.split('\n');
    const sharedIdx = lines.findIndex((line) => /^\.gn-workspace-card__restricted\s*\{/.test(line));
    const overrideIdx = lines.findIndex((line) => /^\.gn-workspace-home__restricted\s*\{/.test(line));
    expect(sharedIdx).toBeGreaterThanOrEqual(0);
    expect(overrideIdx).toBeGreaterThan(sharedIdx);

    const swapped = [...lines];
    const sharedLine = swapped[sharedIdx]!;
    const overrideLine = swapped[overrideIdx]!;
    swapped[sharedIdx] = overrideLine;
    swapped[overrideIdx] = sharedLine;
    const swappedCss = swapped.join('\n');

    const swappedSharedIdx = lineIndexOf(swappedCss, /^\.gn-workspace-card__restricted\s*\{/);
    const swappedOverrideIdx = lineIndexOf(swappedCss, /^\.gn-workspace-home__restricted\s*\{/);
    expect(swappedOverrideIdx).toBeLessThan(swappedSharedIdx);
  });
});
