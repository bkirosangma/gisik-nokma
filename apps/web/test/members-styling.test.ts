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
 * The SELECTORS of every rule mentioning the roster row, across BOTH
 * stylesheets. A selector, not a line — and the first version of this helper
 * matched LINES, which an independent review then defeated twice:
 *
 * 1. it required the selector and its opening brace on the same line, so an
 *    override written in the ordinary multi-line style — selector on one line,
 *    `{` on the next — was invisible to it, leaving the suite green with the
 *    zebra dead in a browser (0,3,0 beats 0,2,0);
 * 2. it excluded any line STARTING with `*`, which was meant to skip comments
 *    and in fact skipped a real rule whose selector begins with the universal
 *    selector (`*.gn-members__row:nth-child(even)` — `*` adds no specificity,
 *    so that rule ties and wins on source order).
 *
 * COMMENTS ARE STRIPPED BY CONTEXT, NOT BY A LINE PREFIX, and the docblock that
 * justified the prefix was itself false: it claimed `globals.css` documents this
 * rule in prose naming its own selector, and `grep -n "gn-members__row"` on that
 * file returns exactly ONE line — the rule. Worse, had such a sentence ever been
 * written the guard would have FALSE-REDDENED a correct tree, because prose in
 * that file starts with bare text rather than `*`. Stripping comment spans is
 * right in both directions: a comment quoting the selector is not counted, and a
 * rule whose selector starts with `*` is.
 *
 * WHAT THIS STILL CANNOT SEE, stated rather than implied: a rule that overrides
 * the zebra by targeting the ELEMENT instead of naming the row (`tr`, `tbody`).
 * Neither stylesheet carries such a rule today — swept for the same instrument's
 * sake — so the count below is the whole of this screen's row styling as things
 * stand; a rendered measurement is the e2e-viewport suite's job, not this file's.
 */
function rowRuleSelectors(...sheets: string[]): string[] {
  const selectors: string[] = [];
  for (const sheet of sheets) {
    // Comment spans removed first, so a commented-out rule cannot be counted
    // and a live one cannot be skipped.
    const text = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
    // `[^{}]*` spans NEWLINES, so a selector split over two lines is captured
    // whole; the braces inside a nested at-rule are consumed one at a time, so
    // the rules inside `@media` are seen in turn.
    const pattern = /([^{}]*)\{/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // `?? ''` because `noUncheckedIndexedAccess` types a capture group as
      // `string | undefined`; the group in this pattern always participates, so
      // this is a type-level narrowing and not a behaviour change. **Vitest was
      // green over this line and `tsc` was not** — the two are different checks.
      const selector = match[1] ?? '';
      if (/\.gn-members__row\b/.test(selector)) selectors.push(selector.trim().replace(/\s+/g, ' '));
    }
  }
  return selectors;
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
   * this case blind to it. Everything above reads DECLARATIONS, and a later rule
   * can neutralise the one they read while every value assertion stays green.
   * Measured on this tree before this test existed: appending
   * `.gn-members tbody .gn-members__row:nth-child(even) { background: transparent; }`
   * left **36/36 passing with the zebra dead in a browser**.
   *
   * So the claim is a COUNT over BOTH stylesheets: exactly one rule in the
   * product NAMES this row at all. A second one — an override, a re-parity, a
   * duplicate — reddens here whatever specificity it carries and however it is
   * laid out, because the count is the thing that changed.
   *
   * **The first version of this check was defeated twice, and the second review
   * measured both**: a selector split across two lines, and a selector starting
   * with `*`. `rowRuleSelectors` above is the answer to both, and the witness
   * below plants each of them. What remains outside this instrument's reach is a
   * rule that targets the ELEMENT rather than naming the row, which no
   * stylesheet in the product does today.
   */
  it('exactly ONE rule in either stylesheet names the row, so nothing can silently override it', () => {
    const selectors = rowRuleSelectors(css, uiCss);
    expect(selectors, `row rule selectors found: ${JSON.stringify(selectors)}`).toHaveLength(1);
    expect(selectors[0]).toContain('.gn-members__row:nth-child(even)');
  });

  /**
   * MUTATION WITNESS. Four plants, because the case makes four claims:
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
   * 4. THE TWO EVASIONS the second review measured against the first version of
   *    this helper — a two-line selector and a `*`-prefixed one — plus a PROSE
   *    comment naming the selector, which is the false-red direction and must
   *    stay at one.
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
    expect(rowRuleSelectors(plantedOverride, uiCss)).toHaveLength(2);

    // EVASION 1 — the selector split across two lines. The first version of the
    // helper matched LINES and required the brace on the selector's own line, so
    // this plant was invisible to it and the zebra died in a browser with the
    // suite green. The selector-form scan sees it.
    const twoLine = `${css}\n.gn-members tbody\n.gn-members__row:nth-child(even) { background: transparent; }\n`;
    expect(twoLine, 'the two-line plant did not land').not.toBe(css);
    expect(rowRuleSelectors(twoLine, uiCss)).toHaveLength(2);

    // EVASION 2 — a `*`-prefixed selector. `*` adds no specificity, so the rule
    // TIES the shipped one and wins on source order; the first version skipped
    // it because the line started with `*`, which was meant for comments.
    const starPrefixed = `${css}\n*.gn-members__row:nth-child(even) { background: transparent; }\n`;
    expect(starPrefixed, 'the star-prefixed plant did not land').not.toBe(css);
    expect(rowRuleSelectors(starPrefixed, uiCss)).toHaveLength(2);

    // THE OTHER DIRECTION, which is the one that reddens a CORRECT tree: prose in
    // a docblock that quotes the selector. Comments are stripped by context, so
    // this stays at one — and the first version's line-prefix guard would have
    // counted it, because prose in `globals.css` starts with bare text.
    const proseComment = css.replace(ANCHOR, `${ANCHOR}\n/* A note about .gn-members__row and its one rule. */`);
    expect(proseComment, 'the prose plant did not land').not.toBe(css);
    expect(rowRuleSelectors(proseComment, uiCss)).toHaveLength(1);
  });
});
