import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Case 13.355 — the radius inversion Task 14 flagged and Task 15 resolves.
 *
 * `.gn-workspace-list .gn-card`, the (removed) `.gn-card.gn-invite`, and
 * `.gn-sign-in` (a `.gn-card` sibling class via `<Card className="gn-sign-in">`)
 * each used to carry a literal `border-radius`. Under `hig`'s pre-neo 8px base
 * these were deliberate BUMPS; once Task 14 made `.gn-card`'s radius a
 * `--gn-radius-card` token that grows to 20px under `neo`, every one of these
 * literals had inverted into an unintended SHRINK, invisible to any test
 * because nothing here asserted the absence of a literal.
 *
 * This is a SOURCE scan, not a rendered one, because the fix is the absence of
 * a competing declaration — once no rule but `.gn-card`'s own sets the radius
 * on these elements, there is nothing left to measure that a browser could
 * disagree with the source about. `.gn-founding` is excluded on purpose: Task
 * 15 gave it `var(--gn-radius-card)` explicitly (its own bespoke surface, not
 * a `.gn-card` sibling), so a literal reappearing there is a different
 * regression from the one this case guards.
 */
// `new URL('../relative', import.meta.url)` is rewritten by Vite under Vitest
// (measured: `fileURLToPath` then throws "must be of scheme file"); the bare
// `import.meta.url` alone is not rewritten, so the relative join happens with
// `node:path` instead (the same pattern `packages/ui/test/helpers/colour-scan.ts`
// uses for `REPO_ROOT`).
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');

/** One CSS rule per line in this file — matches this scanner's own convention. */
function ruleFor(css: string, selectorPattern: RegExp): string | undefined {
  return css.split('\n').find((line) => selectorPattern.test(line) && line.includes('{'));
}

describe('13.355 — no page-specific literal radius competes with .gn-card\'s own token', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  it('.gn-workspace-list .gn-card declares no border-radius of its own', () => {
    const rule = ruleFor(css, /\.gn-workspace-list\s+\.gn-card\s*\{/);
    expect(rule, 'a rule now exists for .gn-workspace-list .gn-card').toBeUndefined();
  });

  it('.gn-card.gn-invite declares no border-radius of its own', () => {
    const rule = ruleFor(css, /\.gn-card\.gn-invite\s*\{/);
    expect(rule, 'a rule now exists for .gn-card.gn-invite').toBeUndefined();
  });

  it('.gn-sign-in (the sibling class on <Card className="gn-sign-in">) sets no border-radius', () => {
    const rule = ruleFor(css, /(?<!__)\.gn-sign-in\s*\{/);
    expect(rule, `.gn-sign-in rule: ${String(rule)}`).toBeDefined();
    expect(
      rule?.includes('border-radius'),
      `.gn-sign-in reintroduced a literal radius that will out-specify nothing and tie .gn-card's — ${rule}`,
    ).toBe(false);
  });

  /*
   * MUTATION WITNESS. Planting exactly the regression this case exists to
   * catch — reintroducing `.gn-card.gn-invite { border-radius: 12px; }` —
   * must redden the second test above, alone, naming that selector.
   */
  it('a planted literal on .gn-card.gn-invite is caught, by that test alone', () => {
    const mutated = `${css}\n.gn-card.gn-invite { border-radius: 12px; }\n`;
    const rule = ruleFor(mutated, /\.gn-card\.gn-invite\s*\{/);
    expect(rule).toBeDefined();
    // The other two selectors are unaffected by this planted line.
    expect(ruleFor(mutated, /\.gn-workspace-list\s+\.gn-card\s*\{/)).toBeUndefined();
    const signInRule = ruleFor(mutated, /(?<!__)\.gn-sign-in\s*\{/);
    expect(signInRule?.includes('border-radius')).toBe(false);
  });
});
