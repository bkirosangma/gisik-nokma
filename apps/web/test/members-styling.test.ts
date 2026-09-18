import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Cases 13.887 and 13.888 — the members roster's styling, measured.
 *
 * The dispatch asked which of the prototype's treatments the shipped CSS is
 * MISSING. Measured against `design-system/interactive/desktop.dc.html` — every
 * bare `:NNN` in this file is that file, and the block is its `isMembers`,
 * `:651-798` — the answer is not readable off the JSX: four of the five it named
 * (`:658` card, `:662` tray header, `:659` 17px/820px table body, and the cell
 * padding at `:672`) are already the prototype's values, so a case here pins
 * them rather than changing them. The fifth (`:675`'s second line) is a wire
 * absence, recorded at `members/page.tsx:52-53` and not a styling gap.
 *
 * The one treatment the family really was missing is the ZEBRA, and it lives in
 * the prototype's DATA rather than its markup — `style: i % 2 ?
 * "background:var(--fill4)" : ""` at `:3077`, attached to the row at `:671` —
 * which is exactly the kind of declaration a port driven by reading the JSX
 * never sees. 13.887 is that treatment; 13.888 is the four that were already
 * right, pinned so a drift reddens instead of shipping quietly.
 *
 * WHY A SOURCE SCAN AND NOT A RENDERED READING. `globals.css` is not loaded by
 * jsdom in this suite, so a rendered assertion could only restate classes, not
 * values — and a case that asserts classes EXIST proves nothing about what they
 * do, which is the shape this repo has been bitten by repeatedly (a rule present
 * and doing nothing reads identically to one that works). The values below are
 * the declared ones, each compared against the prototype line it ports, and
 * 13.887 carries a MUTATION WITNESS proving the extraction can fail.
 *
 * **The one thing a source scan cannot see is CASCADE LOSS, and an independent
 * review measured that this file's first version could not either**: appending
 * `.gn-members tbody .gn-members__row:nth-child(even) { background: transparent; }`
 * — a higher-specificity later override — left the whole suite GREEN with the
 * zebra dead in a browser. 13.887 now asserts that EXACTLY ONE rule in either
 * stylesheet mentions `.gn-members__row` at all, which is the claim that catches
 * it, and its witness plants precisely that override. It is still not a rendered
 * measurement; the e2e-viewport suite is where one would live.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');
/**
 * The OTHER stylesheet a rule for this screen could hide in. Read by 13.887's
 * uniqueness claim, which is the check that catches a competing rule the
 * `.gn-members` family's own file would never show — see that case's docblock.
 */
const UI_CSS_PATH = resolve(TEST_DIR, '../../../packages/ui/src/ui.css');

/**
 * Full rule body, selector line through its matching closing brace — the
 * multi-line shape `workspaces-invitation-banner.test.ts:346` established and
 * `sign-in-neo-restyle.test.ts` shares (duplicated rather than imported: no
 * shared CSS-scan helper exists in `test/helpers/` yet, which is that file's own
 * note). `neo-card-radius.test.ts`'s single-line version truncates every rule in
 * the members family, whose declarations each sit on their own line.
 */
function ruleFor(css: string, selectorPattern: RegExp): string | undefined {
  const lines = css.split('\n');
  const startIndex = lines.findIndex((line) => selectorPattern.test(line));
  if (startIndex === -1) return undefined;
  const openIndex = lines.findIndex((line, i) => i >= startIndex && line.includes('{'));
  if (openIndex === -1) return undefined;
  const closeIndex = lines.findIndex((line, i) => i >= openIndex && line.includes('}'));
  if (closeIndex === -1) return undefined;
  return lines.slice(startIndex, closeIndex + 1).join('\n');
}

const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');
const uiCss = readFileSync(UI_CSS_PATH, 'utf8');

/**
 * Rule-header lines mentioning the roster row, across BOTH stylesheets. A rule
 * header is a line carrying the selector and an opening brace, and a line that
 * *starts* like a comment is excluded — `globals.css` documents this rule in
 * prose that names its own selector, and a sweep that counted comment lines
 * would report the family as twice its size.
 */
function rowRuleHeaders(...sheets: string[]): string[] {
  return sheets
    .flatMap((sheet) => sheet.split('\n'))
    .filter((line) => /\.gn-members__row/.test(line) && line.includes('{') && !/^\s*[*/]/.test(line));
}

describe('13.888 the roster table wears the prototype’s four card-and-table treatments', () => {
  it('the table card is the prototype’s raised card, and it scrolls (desktop.dc.html:658)', () => {
    const rule = ruleFor(css, /^\.gn-members\s*\{/);
    expect(rule, `.gn-members rule: ${String(rule)}`).toBeDefined();
    // `--cardBg`/`--cardShadow`/`--cardR` → the three roles below, per the
    // mapping table quoted at the head of this block in globals.css.
    expect(rule).toContain('background: var(--gn-surface-raised)');
    expect(rule).toContain('box-shadow: var(--gn-shadow-raised)');
    expect(rule).toContain('border-radius: var(--gn-radius-card)');
    // `overflow:auto` is the prototype's own and it is load-bearing rather than
    // decorative: the table is 820px wide and this is what carries it on a
    // phone, in the card rather than on the document.
    expect(rule).toContain('overflow: auto');
  });

  it('the header row is the prototype’s tray: surface-sunken, 13px/18px/600, 11px 18px (desktop.dc.html:662)', () => {
    const rule = ruleFor(css, /^\.gn-members__th\s*\{/);
    expect(rule, `.gn-members__th rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('font-size: 0.8125rem'); // 13px
    expect(rule).toContain('line-height: 1.125rem'); // 18px
    expect(rule).toContain('font-weight: 600');
    expect(rule).toContain('color: var(--gn-text-muted)'); // --label2
    expect(rule).toContain('background: var(--gn-surface-sunken)'); // --trayBg
    expect(rule).toContain('padding: 0.6875rem 1.125rem'); // 11px 18px
  });

  it('the body text is 17px over the prototype’s 820px floor (desktop.dc.html:659/672)', () => {
    const rule = ruleFor(css, /^\.gn-members__table\s*\{/);
    expect(rule, `.gn-members__table rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('font-size: 1.0625rem'); // 17px, the prototype's cell size
    expect(rule).toContain('min-width: 51.25rem'); // 820px
    expect(rule).toContain('border-collapse: collapse');
    expect(rule).toContain('width: 100%');
  });

  it('every cell carries the prototype’s 13px 18px (desktop.dc.html:672/678/691)', () => {
    const rule = ruleFor(css, /^\.gn-members__cell\s*\{/);
    expect(rule, `.gn-members__cell rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('padding: 0.8125rem 1.125rem'); // 13px 18px
  });
});

describe('13.887 the roster’s zebra, on the rows the prototype actually tints', () => {
  it('every second row takes --fill4 → --gn-fill-quaternary (desktop.dc.html:671/3077)', () => {
    const rule = ruleFor(css, /^\.gn-members__row:nth-child\(even\)\s*\{/);
    expect(rule, `.gn-members__row:nth-child(even) rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('background: var(--gn-fill-quaternary)');
  });

  /*
   * THE PARITY IS THE CLAIM, not just the fill. The prototype's `memberRows`
   * is 0-based, so `i % 2` tints the 1-indexed EVEN rows — and an odd-child rule
   * beside an even-child rule would tint every row, which is a table with no
   * zebra and no way to notice. Asserted as an absence for that reason.
   */
  it('and the ODD rows are left alone, so the stripe alternates rather than filling', () => {
    const odd = ruleFor(css, /^\.gn-members__row:nth-child\(odd\)\s*\{/);
    expect(odd, `an odd-child rule now exists: ${String(odd)}`).toBeUndefined();
  });

  /**
   * THE CASCADE CLAIM — and it is here because an independent review measured
   * this case blind to it. Everything above reads DECLARATIONS, and a later
   * higher-specificity rule can neutralise the one they read while every value
   * assertion stays green. Measured on this tree before this test existed:
   * appending `.gn-members tbody .gn-members__row:nth-child(even) { background:
   * transparent; }` left **36/36 passing with the zebra dead in a browser**.
   *
   * So the claim is a COUNT over BOTH stylesheets: exactly one rule header in
   * the product mentions this row at all. A second one — an override, a
   * re-parity, a duplicate — reddens here whatever specificity it carries,
   * because the count is the thing that changed.
   */
  it('exactly ONE rule in either stylesheet mentions the row, so nothing can silently override it', () => {
    const headers = rowRuleHeaders(css, uiCss);
    expect(headers, `row rule headers found: ${JSON.stringify(headers)}`).toHaveLength(1);
    expect(headers[0]).toContain('.gn-members__row:nth-child(even)');
  });

  /**
   * MUTATION WITNESS. Three plants, because the case makes three claims:
   *
   * 1. the VALUE — the same selector carrying a different role must redden it.
   *    Each plant is asserted to have LANDED (`replace` matching nothing prints
   *    success, the trap `checks-that-cannot-fail` records as its own mode), so
   *    this witness cannot pass by having changed nothing.
   * 2. the PARITY — the selector itself is what the first test matches on, so a
   *    rule written `:nth-child(odd)` in place of `even` leaves that test with
   *    no rule to find and it reddens on `toBeDefined`, not on a value.
   * 3. the CASCADE — the override above, which the value assertion CANNOT see.
   *    The plant asserts exactly that: the extracted rule still reads
   *    `--gn-fill-quaternary` (the old check green), while the count has gone to
   *    two (the new check red). A witness that only showed the new assertion
   *    reddening would not prove it is the one covering the gap.
   */
  it('the value, parity and cascade assertions each fail on their own plant', () => {
    const ANCHOR = '.gn-members__row:nth-child(even) { background: var(--gn-fill-quaternary); }';
    // The plants below depend on this literal occurring exactly once. Asserted,
    // so a second copy of the rule surfaces HERE as a named failure rather than
    // as a confusing false red from a witness that mutated the wrong one.
    expect(css.split(ANCHOR).length - 1, 'the witness anchor is not unique in globals.css').toBe(1);

    const plantedValue = css.replace(ANCHOR, '.gn-members__row:nth-child(even) { background: var(--gn-surface-sunken); }');
    expect(plantedValue, 'the value plant did not land — the assertion below would be vacuous').not.toBe(css);
    expect(ruleFor(plantedValue, /^\.gn-members__row:nth-child\(even\)\s*\{/)).not.toContain(
      'var(--gn-fill-quaternary)',
    );

    const plantedParity = css.replace(ANCHOR, '.gn-members__row:nth-child(odd) { background: var(--gn-fill-quaternary); }');
    expect(plantedParity, 'the parity plant did not land — the assertion below would be vacuous').not.toBe(css);
    expect(ruleFor(plantedParity, /^\.gn-members__row:nth-child\(even\)\s*\{/)).toBeUndefined();

    const plantedOverride = `${css}\n.gn-members tbody .gn-members__row:nth-child(even) { background: transparent; }\n`;
    expect(plantedOverride, 'the override plant did not land').not.toBe(css);
    // The blind spot, stated as an assertion rather than a comment: the check
    // that existed before this one is GREEN on the override.
    expect(ruleFor(plantedOverride, /^\.gn-members__row:nth-child\(even\)\s*\{/)).toContain(
      'var(--gn-fill-quaternary)',
    );
    expect(rowRuleHeaders(plantedOverride, uiCss)).toHaveLength(2);
  });
});
