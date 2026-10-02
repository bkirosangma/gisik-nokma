import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ruleFor } from './helpers/css-rule-scan.js';

/**
 * Cases 13.887 and 13.888 — the members roster's styling, measured.
 *
 * The dispatch asked which of the prototype's treatments the shipped CSS is
 * MISSING. Measured against `design-system/interactive/desktop.dc.html` — every
 * bare `:NNN` in this file is that file, and the block is its `isMembers`,
 * `:651-798` — the answer is not readable off the JSX: four of the five it named
 * (`:658` card, `:662` tray header, `:659` 17px/820px table body, and the cell
 * padding at `:672`) are already the prototype's values, so a case here pins
 * them rather than changing them. The fifth (`:675`'s second line) WAS a wire
 * absence — the wire gained the address on 2026-09-19 and the line was drawn on
 * 2026-09-20 (`16.61`) — and what remains unwitnessed is the STRUCTURE that
 * stacks it, which is `16.62` below.
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
 * The scanner is now IMPORTED, not copied — P16, 2026-09-21.
 *
 * This note used to read *"duplicated rather than imported: no shared CSS-scan
 * helper exists in `test/helpers/` yet"*, and it was right for as long as it
 * stood: six files under this directory each carried their own `ruleFor`, three
 * of them the single-line form that returns the selector line rather than the
 * rule — which is the shape that truncates every rule in the members family,
 * whose declarations each sit on their own line. That helper now exists
 * (`./helpers/css-rule-scan.js`) and all six import it.
 *
 * The sentence this replaces is kept in essence because it was the only written
 * record of the duplication, and a migration that erases its own reason is how
 * the next copy gets made.
 */

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
    // Amended 2026-09-29 by 20.311 (styling refresh Plan B): the resting shadow is the lit-edge `lift`.
    expect(rule).toContain('box-shadow: var(--gn-shadow-lift)');
    expect(rule).toContain('border-radius: var(--gn-radius-card)');
    // `overflow:auto` is the prototype's own and it is load-bearing rather than
    // decorative: the table is 820px wide and this is what carries it on a
    // phone, in the card rather than on the document.
    expect(rule).toContain('overflow: auto');
  });

  it('the header row is the prototype’s tray: surface-well, 13px/18px/600, 11px 18px (desktop.dc.html:662)', () => {
    const rule = ruleFor(css, /^\.gn-members__th\s*\{/);
    expect(rule, `.gn-members__th rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('font-size: 0.8125rem'); // 13px
    expect(rule).toContain('line-height: 1.125rem'); // 18px
    expect(rule).toContain('font-weight: 600');
    expect(rule).toContain('color: var(--gn-text-muted)'); // --label2
    // Amended 2026-09-29 by 20.311 (styling refresh Plan B): the tray is the recessed `well`, not the 1.14:1 `surface-sunken`.
    expect(rule).toContain('background: var(--gn-surface-well)'); // --trayBg
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

/**
 * 13.887 — AMENDED by 23.095 (UX fixes Task 6, audit SET-13): the roster's every-second-row tint (the prototype's zebra,
 * `desktop.dc.html:671/3077`) read as a SELECTED row, which a roster that opens nothing on click never is. The rows now carry a
 * `--gn-border` hairline instead. Everything the old claim guarded still holds for the new rule: the value, the absence of a
 * competing parity rule, and the CASCADE claim (exactly one rule in either stylesheet names the row).
 */
describe('13.887 the roster’s rows carry a hairline, not a zebra (amended by 23.095)', () => {
  it('every row takes a --gn-border bottom border, and paints no tint of its own', () => {
    const rule = ruleFor(css, /^\.gn-members__row\s*\{/);
    expect(rule, `.gn-members__row rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('border-bottom: 1px solid var(--gn-border)');
    // CONTROL — the tint is gone from the row: no background rides on it.
    expect(rule).not.toMatch(/background/);
  });

  /*
   * THE ABSENCE IS THE CLAIM: neither parity may come back, as the old odd-child absence guarded the old claim. A
   * `:nth-child` rule on the row would be the zebra again under another spelling.
   */
  it('and no parity rule names the row, even or odd', () => {
    expect(ruleFor(css, /^\.gn-members__row:nth-child\(even\)\s*\{/), 'the zebra is back (even)').toBeUndefined();
    expect(ruleFor(css, /^\.gn-members__row:nth-child\(odd\)\s*\{/), 'a zebra is back (odd)').toBeUndefined();
  });

  /**
   * THE CASCADE CLAIM, kept from the zebra: everything above reads DECLARATIONS, and a later rule can neutralise the one they
   * read while every value assertion stays green. So the claim is a COUNT over BOTH stylesheets: exactly one rule in the product
   * NAMES this row at all. A second one — an override, a re-parity, a duplicate — reddens here whatever specificity it carries
   * and however it is laid out. `rowRuleSelectors` above reads selectors, not lines, so a two-line selector and a `*`-prefixed
   * one are seen (the two evasions an independent review measured against its first version).
   */
  it('exactly ONE rule in either stylesheet names the row, so nothing can silently override it', () => {
    const selectors = rowRuleSelectors(css, uiCss);
    expect(selectors, `row rule selectors found: ${JSON.stringify(selectors)}`).toHaveLength(1);
    expect(selectors[0]).toBe('.gn-members__row');
  });

  /**
   * MUTATION WITNESS. Each plant is asserted to have LANDED (`replace` matching nothing prints success), so this witness cannot
   * pass by having changed nothing.
   */
  it('the value, parity and cascade assertions each fail on their own plant', () => {
    const ANCHOR = '.gn-members__row { border-bottom: 1px solid var(--gn-border); }';
    expect(css.split(ANCHOR).length - 1, 'the witness anchor is not unique in globals.css').toBe(1);

    const plantedValue = css.replace(ANCHOR, '.gn-members__row { border-bottom: none; }');
    expect(plantedValue, 'the value plant did not land — the assertion below would be vacuous').not.toBe(css);
    expect(ruleFor(plantedValue, /^\.gn-members__row\s*\{/)).not.toContain('var(--gn-border)');

    const plantedZebra = `${css}\n.gn-members__row:nth-child(even) { background: var(--gn-fill-quaternary); }\n`;
    expect(plantedZebra, 'the zebra plant did not land').not.toBe(css);
    expect(ruleFor(plantedZebra, /^\.gn-members__row:nth-child\(even\)\s*\{/)).toBeDefined();
    expect(rowRuleSelectors(plantedZebra, uiCss)).toHaveLength(2);

    // The BLIND SPOT, stated as an assertion: a higher-specificity override leaves the hairline rule reading as before
    // (the declaration check is green) while the count has gone to two (the count check is red).
    const plantedOverride = `${css}\n.gn-members tbody .gn-members__row { border-bottom: none; }\n`;
    expect(plantedOverride, 'the override plant did not land').not.toBe(css);
    expect(ruleFor(plantedOverride, /^\.gn-members__row\s*\{/)).toContain('var(--gn-border)');
    expect(rowRuleSelectors(plantedOverride, uiCss)).toHaveLength(2);

    const twoLine = `${css}\n.gn-members tbody\n.gn-members__row { border-bottom: none; }\n`;
    expect(twoLine, 'the two-line plant did not land').not.toBe(css);
    expect(rowRuleSelectors(twoLine, uiCss)).toHaveLength(2);

    const starPrefixed = `${css}\n*.gn-members__row { border-bottom: none; }\n`;
    expect(starPrefixed, 'the star-prefixed plant did not land').not.toBe(css);
    expect(rowRuleSelectors(starPrefixed, uiCss)).toHaveLength(2);

    // THE OTHER DIRECTION, which reddens a CORRECT tree: prose that quotes the selector. Comments are stripped by context.
    const proseComment = css.replace(ANCHOR, `${ANCHOR}\n/* A note about .gn-members__row and its one rule. */`);
    expect(proseComment, 'the prose plant did not land').not.toBe(css);
    expect(rowRuleSelectors(proseComment, uiCss)).toHaveLength(1);
  });
});


/**
 * 16.62 — the two-line identity is a COLUMN, and the stylesheet says so.
 *
 * ⚠ **THIS IS THE ONLY INSTRUMENT THAT CAN SEE IT, which an independent reviewer
 * proved by deleting the declaration: every other check stayed green.** jsdom has
 * no layout engine, so two inline `<span>`s in this box render as ONE RUN OF
 * GLYPHS — `Anselma Marakanselma@example.test`, the same shape the subtask rows
 * shipped tonight — and the only real-browser instrument over `/members` measures
 * colour, not geometry. So the fix for the string defect is a declaration, and
 * the declaration had no witness until this case.
 *
 * The uniqueness claim is 13.887's doctrine, for 13.887's reason: a source scan
 * cannot see CASCADE LOSS, so asserting the declaration exists is not enough —
 * it also has to be the only rule that could be overridden into nothing.
 */
describe('16.62 the identity cell stacks, and exactly one rule says so', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  it('declares the column', () => {
    const rule = /\.gn-members__identity\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/display:\s*flex/);
    expect(rule).toMatch(/flex-direction:\s*column/);
    expect(rule).toMatch(/min-width:\s*0/);
  });

  it('and no other rule mentions the class, so nothing can override it away', () => {
    const mentions = css.match(/\.gn-members__identity/g) ?? [];
    expect(mentions).toHaveLength(1);
  });
});
