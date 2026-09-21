import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ruleFor } from './helpers/css-rule-scan.js';

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

/**
 * The scanner is SHARED as of P16 (2026-09-21), and this file is why it exists.
 *
 * It used to be local and single-line — `css.split('\n').find((line) =>
 * pattern.test(line) && line.includes('{'))` — which returns the SELECTOR LINE
 * rather than the rule. The third case below pins the ABSENCE of a declaration,
 * so it read only the line the declaration was not on, and stayed green with a
 * literal radius written one line underneath. It was latent only because
 * `.gn-sign-in` happens to be written on one line; the comment this replaces
 * said so in the confidence that the convention would hold.
 */

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

  /**
   * P16 (2026-09-21) — THE WITNESS FOR THE SCANNER ITSELF, and the reason this
   * case is not redundant with the one above.
   *
   * A one-line plant is exactly the shape the OLD scanner could see. This plants
   * the SAME regression across THREE LINES, with the declaration on its own line
   * — the ordinary way these stylesheets are written, and the shape in which the
   * old single-line `ruleFor` returned `.gn-sign-in {` and nothing else, so an
   * assertion about the declaration's absence read a string the declaration was
   * never in.
   *
   * **Under the old scanner this case fails; under the shared one it passes**,
   * which is the whole content of the change: the instrument can now fail on the
   * property it names. Measured against the real stylesheet as well — with a
   * multi-line `.gn-card.gn-invite` rule appended to `globals.css`, this file
   * goes red, and the body of that rule is what the message prints.
   */
  it('a MULTI-LINE literal is caught — the shape the old single-line scanner truncated', () => {
    const plant = ['.gn-card.gn-invite {', '  border-radius: 12px;', '}'].join('\n');
    const mutated = `${css}\n${plant}\n`;

    const rule = ruleFor(mutated, /\.gn-card\.gn-invite\s*\{/);
    expect(rule, 'the multi-line rule was not found at all').toBeDefined();
    // The declaration is IN the returned text, which is the property the old
    // scanner did not have: it returned the selector line alone.
    expect(rule?.includes('border-radius')).toBe(true);
    expect(rule?.split('\n'), 'the scanner returned one line, so it is still truncating').toHaveLength(
      3,
    );

    // And the case that exists for it now fires. This is the assertion the old
    // scanner would have passed while the literal sat there.
    //
    // The probe selector is deliberately one that is NOT in the stylesheet,
    // because `ruleFor` returns the FIRST match: planting a second
    // `.gn-sign-in` would be answered by the rule already there — which is a
    // live example of the same class of mistake (an assertion reading a rule
    // other than the one it means) and cost a run to notice.
    const probe = '.gn-p16-probe';
    const withProbe = `${css}\n${[`${probe} {`, '  border-radius: 12px;', '}'].join('\n')}\n`;
    const probeRule = ruleFor(withProbe, /\.gn-p16-probe\s*\{/);
    expect(probeRule, 'the planted probe rule was not found').toBeDefined();
    expect(
      probeRule?.includes('border-radius'),
      'the scanner reads a rule without its body — this is the shape the old single-line version had.',
    ).toBe(true);
  });
});
