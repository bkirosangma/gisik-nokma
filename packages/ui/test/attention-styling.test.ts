import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';

/**
 * Case 13.893 — the attention strip's Part 2 styling, measured against the
 * prototype.
 *
 * Part 2 was held while four of its six deltas each met a record
 * (`test-cases/13-deployment-dogfooding.md`, "Part 2 — the prototype's styling,
 * measured, and why it is HELD"). The owner adopted the prototype's treatment
 * WHOLE on 2026-09-18, so rows 1–6 landed together. **Row 1's ruling was
 * SUPERSEDED as a design choice, not by a measurement**: `task-ledger.tsv`'s
 * `hig-per-screen/7a`/`8a` rows ruled the 4px left border STAYS because it
 * renders at 4.36 against a 3:1 floor — a conclusion that stands, and that this
 * case does not contradict. The border is gone because the owner chose the
 * prototype's tint card instead. 13.893 asserts BOTH halves: the tint is on, and
 * no border declaration remains anywhere in the family. A half-applied row 1 —
 * tint added, marker left in place — is the treatment neither document draws.
 *
 * ## WHY A SOURCE SCAN AND NOT A RENDERED READING
 *
 * `ui.css` is not loaded by jsdom in this suite, so a rendered assertion could
 * only restate class names, and a case proving a class is APPLIED says nothing
 * about what it does — a rule present and doing nothing reads identically to one
 * that works. The values below are the declared ones, each compared against the
 * prototype line it ports.
 *
 * ## WHAT A SOURCE SCAN CANNOT SEE, STATED RATHER THAN IMPLIED
 *
 * Cascade loss. A later rule of equal-or-higher specificity that re-declares
 * `background` on `.gn-attention` leaves every VALUE assertion here green with
 * the tint dead in a browser — the exact defect an independent review found in
 * `apps/web/test/members-styling.test.ts`'s first version, where an appended
 * override killed a zebra that a check of this same shape was pinning. The
 * mitigation is the uniqueness claim at the end: exactly ONE rule in either
 * stylesheet may name the `.gn-attention` container, and its witnesses append
 * precisely such an override. **It is a scan over a fixed list of SPELLINGS, not
 * a parser** — `containerSelectorLines` says which two forms it covers and names
 * the residual it does not. It is still not a rendered measurement;
 * `e2e-viewport` is where one would live, and it does not visit this route.
 *
 * **A second gap, found by the same review and now closed: the "no border-left"
 * claim below scanned `ui.css` only.** This docblock had already named
 * `globals.css` as the second stylesheet a rule could hide in, and `layout.tsx`
 * loads `ui.css` before `globals.css`, so a marker appended there wins. Both
 * stylesheets are now scanned and both are witnessed.
 *
 * ## AMENDED 2026-10-01 — one PHONE rule per family selector is allowed (mobile-web plan Task 9, fix 2)
 *
 * Orchestrator ruling (a): the plan's Global Constraint is "targets ≥44px", and a strip row is ~38px on a
 * phone. The uniqueness claim exists to stop a SECOND rule at the same cascade level silently overriding
 * the first; a single override inside the product's ONE phone arm, declared AFTER its base with the order
 * asserted, is the pattern every mobile task uses, so the guard is narrowed rather than the target
 * dropped. `familyViolations` now allows each family selector AT MOST ONCE at top level and AT MOST ONCE
 * inside `@media (max-width: 40rem)`, the phone rule after the base. A second rule in either place, a
 * phone rule before (or without) its base, or a rule in ANY other at-rule is still red — each is witnessed.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const UI_CSS_PATH = resolve(TEST_DIR, '../src/ui.css');
/** The other stylesheet a rule for this screen could hide in — a product-level override. */
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../../../apps/web/app/globals.css');

const uiCss = readFileSync(UI_CSS_PATH, 'utf8');
const globalsCss = readFileSync(GLOBALS_CSS_PATH, 'utf8');

/**
 * Comments are stripped BY CONTEXT, never by a line prefix. A prefix rule (skip
 * every line starting with `*`) was the members case's first version and it
 * silently skipped a real rule whose selector began with the universal
 * selector; here the same shortcut would swallow any override written as
 * `*.gn-attention { … }` (`*` adds no specificity, so such a rule ties and wins
 * on source order). Stripping the spans is the property; the prefix was the
 * symptom.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const cleanUiCss = stripComments(uiCss);
const cleanGlobalsCss = stripComments(globalsCss);

const FAMILY_SELECTOR = /^\.gn-attention/;

/** The one phone arm — the product's FD1 breakpoint (mobile-web plan), the only at-rule a family selector may sit in. */
const PHONE_ARM = '@media (max-width: 40rem)';

/**
 * Every way `css` breaks the family's cascade rule, as readable lines: a family selector declared more than
 * once at top level, more than once inside the phone arm, inside ANY other at-rule, or in the phone arm
 * before (or with no) top-level base. Empty means the family is clean. Reads the parsed rules (source order
 * kept), not lines, so an at-rule cannot be mistaken for the top level.
 */
function familyViolations(css: string): string[] {
  const declarations = parseRules(css).flatMap((rule, index) =>
    rule.selectors.filter((selector) => FAMILY_SELECTOR.test(selector)).map((selector) => ({ selector, atRule: rule.atRule, index })),
  );
  const violations: string[] = [];
  for (const selector of [...new Set(declarations.map((d) => d.selector))]) {
    const group = declarations.filter((d) => d.selector === selector);
    const top = group.filter((d) => d.atRule === null);
    const phone = group.filter((d) => d.atRule === PHONE_ARM);
    const other = group.filter((d) => d.atRule !== null && d.atRule !== PHONE_ARM);
    if (top.length > 1) violations.push(`${selector}: declared ${top.length} times at top level`);
    if (phone.length > 1) violations.push(`${selector}: declared ${phone.length} times in the phone arm`);
    for (const d of other) violations.push(`${selector}: declared inside ${d.atRule}, not the phone arm`);
    const firstPhone = phone[0];
    const base = top[0];
    if (firstPhone !== undefined && (base === undefined || firstPhone.index < base.index)) {
      violations.push(`${selector}: the phone rule comes ${base === undefined ? 'with no top-level base' : 'before its base'}`);
    }
  }
  return violations;
}

/**
 * The rule whose selector is EXACTLY `selector`, body included.
 *
 * Both shapes in this file must work: `.gn-attention { … }` written one
 * declaration per line, and `.gn-attention__icon { flex: none; color: …; }` on
 * one line. A helper that assumed the multi-line shape finds the NEXT rule's
 * closing brace for a single-line selector and returns a body belonging to a
 * different rule — a well-formed wrong answer, which is this repo's recurring
 * failure rather than a crash.
 *
 * The match is exact rather than `startsWith`, which matters here: `.gn-attention`
 * is a PREFIX of `.gn-attention__icon`, so `startsWith` would answer the
 * container's rule with the first of its many children.
 */
function ruleFor(css: string, selector: string): string | undefined {
  const lines = css.split('\n');
  const startIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === `${selector} {` || trimmed.startsWith(`${selector} {`);
  });
  if (startIndex === -1) return undefined;
  const startLine = lines[startIndex]!;
  if (startLine.includes('}')) return startLine.trim();
  const closeIndex = lines.findIndex((line, i) => i > startIndex && line.includes('}'));
  if (closeIndex === -1) return undefined;
  return lines.slice(startIndex, closeIndex + 1).join('\n');
}

/**
 * Every rule in the stylesheet whose selector begins with `.gn-attention`,
 * **walked sequentially**.
 *
 * The first version of this helper looped over the lines and called
 * `ruleFor(css, selector)` for each — which resolves by NAME to the FIRST
 * matching rule, so a LATER duplicate of a family selector was never read at
 * all. Its own witness caught it (`13.893`'s planted `border-left` on a second
 * `.gn-attention__items`: the scan answered `[]`). That is not a test-harness
 * curiosity — it is the cascade defect this whole file says a source scan
 * cannot see, reproduced inside the scan meant to look for it. `ruleFor` still
 * resolves by name, deliberately, for the value assertions; THIS walk is what
 * makes duplicates visible, and the uniqueness claim below is what consumes it.
 */
function familyRules(css: string): { selector: string; body: string }[] {
  const lines = css.split('\n');
  const found: { selector: string; body: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!FAMILY_SELECTOR.test(trimmed) || !trimmed.includes('{')) continue;
    const selector = trimmed.slice(0, trimmed.indexOf('{')).trim();
    if (trimmed.includes('}')) {
      found.push({ selector, body: trimmed });
      continue;
    }
    const closeIndex = lines.findIndex((line, j) => j > i && line.includes('}'));
    if (closeIndex === -1) continue;
    found.push({ selector, body: lines.slice(i, closeIndex + 1).join('\n') });
    i = closeIndex;
  }
  return found;
}

/**
 * Every non-comment line whose selector names the `.gn-attention` CONTAINER.
 *
 * The negative lookahead is load-bearing and is the difference between this and
 * a substring sweep: `.gn-attention__heading` and `.gn-attention__item` contain
 * `.gn-attention` as a PREFIX and are different classes entirely. Counting them
 * would make the uniqueness claim below either vacuous (raise the expected count
 * to whatever the family happens to have) or permanently red.
 *
 * ## The `[class~="gn-attention"]` spelling, and what is still not covered
 *
 * An independent review defeated the first version with
 * `[class~="gn-attention"] { background: transparent; }` — the same class, the
 * same specificity (0,1,0), later in source order, and neither this helper nor
 * `familyRules` saw it: one requires a literal `.` before the name, the other
 * requires the line to START with it. That spelling is now caught by the second
 * alternative below. **It is a fixed list of spellings, not a parser**, and the
 * residual is stated rather than implied: a selector reaching the container
 * without writing the class name in either of these two literal forms — an
 * escaped `\\2e`, a `:is()` alias built from another token — would still evade
 * both helpers. Two neighbouring spellings were probed by the same review and DO
 * redden (`:where(.gn-attention)` and a selector list split across two lines),
 * so the survivor class is narrow and contrived. A rendered measurement is the
 * only thing that closes it, and `e2e-viewport` does not visit this route.
 */
function containerSelectorLines(css: string): string[] {
  return css
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\.gn-attention(?![\w-])/.test(line) || /"gn-attention"/.test(line));
}

describe('13.893 — the attention strip is the prototype’s tint card, adopted whole', () => {
  /**
   * THE CONTROL, first, and it is not decoration: every assertion below is a
   * claim about a rule, and a rule that is not FOUND returns `undefined` —
   * against which a `toContain` fails for the wrong reason and an absence
   * assertion passes for the wrong one. This pins that the extraction has
   * something to read, and that it read a RULE rather than a fragment.
   */
  it('13.893a — the extraction finds the container rule, and it is a rule with a body', () => {
    const rule = ruleFor(cleanUiCss, '.gn-attention');
    expect(rule, 'no `.gn-attention {` rule found in ui.css at all').toBeDefined();
    expect(rule!.split('\n').length, 'the rule body is empty — the extraction is broken').toBeGreaterThan(2);
    // …and the exactness of the match is exercised, not assumed: the prefix
    // trap above is real, and `.gn-attention__heading` is where it would bite.
    expect(ruleFor(cleanUiCss, '.gn-attention__heading')).not.toContain('--gn-tint-warning');
  });

  it('13.893 — row 1: the tint card, and the left border marker is gone', () => {
    const rule = ruleFor(cleanUiCss, '.gn-attention')!;
    expect(rule).toContain('background: var(--gn-tint-warning)');
    expect(rule).toContain('border-radius: var(--gn-radius-card)');
    expect(rule).toContain('padding: 1.125rem 1.25rem');

    // The marker's removal, asserted across the WHOLE FAMILY and not on this
    // rule alone: a `border-left` moved onto a sibling — say
    // `.gn-attention__items` — would draw a line the prototype does not, and a
    // check that read only the container would not see it. `--gn-pending` is
    // the marker's colour, so its reappearance in any family body is the same
    // defect wearing a different selector.
    //
    // **BOTH STYLESHEETS, and the first version scanned only `ui.css`.** This
    // file's own docblock names `globals.css` as the second stylesheet a rule
    // could hide in, and an independent review measured the gap it left: a
    // `.gn-attention__items { border-left: … }` appended to `apps/web/app/globals.css`
    // left the suite 6/6 GREEN, while `layout.tsx` loads `ui.css` before
    // `globals.css` so the later rule draws the line in a real browser. The
    // half-applied row 1 this case exists to forbid was one line away, in the
    // file the docblock had already identified and the scan had not read.
    for (const [name, css] of [
      ['ui.css', cleanUiCss],
      ['globals.css', cleanGlobalsCss],
    ] as const) {
      const bordered = familyRules(css).filter(({ body }) => /border-left\s*:/.test(body));
      expect(bordered, `${name} declares border-left in a family rule: ${JSON.stringify(bordered)}`).toEqual([]);
      expect(
        familyRules(css).some(({ body }) => body.includes('--gn-pending')),
        `${name} paints a family rule with the removed marker's colour`,
      ).toBe(false);
    }
    expect(rule).not.toContain('--gn-surface-raised');
  });

  it('13.893 — row 2: the heading, on the token layer, at the prototype’s type', () => {
    const rule = ruleFor(cleanUiCss, '.gn-attention__heading')!;
    expect(rule).toContain('font-size: 1.0625rem');
    expect(rule).toContain('line-height: 1.375rem');
    expect(rule).toContain('font-weight: 600');
    expect(rule).toContain('gap: 0.625rem');
    expect(rule).toContain('align-items: center');

    // The icon is drawn `stroke="currentColor"` in the component, so this rule
    // is where its colour actually comes from — the split `.gn-invitations__icon`
    // uses, and for the reason recorded there: a saturated hue meant for a glyph
    // is a `color`, not a surface fill.
    expect(ruleFor(cleanUiCss, '.gn-attention__icon')!).toContain('color: var(--gn-warning)');
  });

  it('13.893 — rows 3–6: the rhythm, the row-as-door, and the muted reason', () => {
    const items = ruleFor(cleanUiCss, '.gn-attention__items')!;
    expect(items).toContain('gap: 0.25rem');
    expect(items).toContain('margin: 0.625rem 0 0');

    const item = ruleFor(cleanUiCss, '.gn-attention__item')!;
    expect(item).toContain('gap: 0.75rem');
    expect(item).toContain('min-height: 1.5rem');
    expect(item).toContain('padding: 0.4375rem 0');
    // `position: relative` is the half that makes the stretched target land on
    // the row rather than on the nearest positioned ancestor above it.
    expect(item).toContain('position: relative');

    const door = ruleFor(cleanUiCss, '.gn-attention__title::after')!;
    expect(door).toContain('position: absolute');
    expect(door).toContain('inset: 0');

    // The prototype draws `why` in `--label2` (`:574`); this product's name for
    // that role is `--gn-text-muted` — and `tokens.test.ts`'s `tintWarning`
    // composite block is what makes it legible on THIS wash.
    expect(ruleFor(cleanUiCss, '.gn-attention__reason')!).toContain('color: var(--gn-text-muted)');
  });

  it('13.893 — no family selector is declared twice, in either stylesheet', () => {
    const inUi = containerSelectorLines(cleanUiCss);
    const inGlobals = containerSelectorLines(cleanGlobalsCss);
    expect(inUi, `ui.css names .gn-attention on ${inUi.length} lines: ${JSON.stringify(inUi)}`).toEqual([
      '.gn-attention {',
    ]);
    expect(inGlobals, `globals.css names .gn-attention on ${inGlobals.length} lines`).toEqual([]);

    // …and the same property GENERALISED to every selector in the family, which
    // is what the value assertions above need in order to mean anything:
    // `ruleFor` answers the FIRST rule for a name, so a later duplicate of
    // `.gn-attention__reason` would beat the colour this file pins while every
    // assertion above stayed green.
    for (const [name, css] of [
      ['ui.css', cleanUiCss],
      ['globals.css', cleanGlobalsCss],
    ] as const) {
      expect(familyViolations(css), `${name} breaks the family's cascade rule`).toEqual([]);
    }
  });

  /**
   * WITNESSES. Each plants a real defect into the real stylesheet text and
   * asserts the check above reddens. Nothing is written to disk — these run
   * against the string in memory — and each plant asserts its OWN landing
   * first, because a `replace` that matches nothing prints success.
   */
  it('13.893 — and every assertion above can fail, each for its own reason', () => {
    const container = '.gn-attention {\n  background: var(--gn-tint-warning);\n}';

    // The plants below are measured AGAINST THE REAL FILE rather than against a
    // hard-coded count of it. The first version asserted `toHaveLength(2)`, which
    // made this witness fail whenever the real file was already wrong — noise
    // riding on the defect it is meant to be independent evidence about, and a
    // witness that reddens for a reason of its own is not a witness.
    const baseCount = containerSelectorLines(cleanUiCss).length;

    const detinted = container.replace('var(--gn-tint-warning)', 'var(--gn-surface-raised)');
    expect(detinted, 'plant did not land').not.toBe(container);
    expect(ruleFor(detinted, '.gn-attention')).not.toContain('background: var(--gn-tint-warning)');

    // BOTH stylesheets, because the first version of this witness planted into
    // `ui.css` only and so could not have shown the gap the review found.
    for (const [name, css] of [
      ['ui.css', cleanUiCss],
      ['globals.css', cleanGlobalsCss],
    ] as const) {
      const synthetic = `${css}\n.gn-attention__items {\n  border-left: 4px solid var(--gn-pending);\n}\n`;
      const plantedBorders = familyRules(synthetic).filter(({ body }) => /border-left\s*:/.test(body));
      expect(plantedBorders, `the family scan cannot see a border-left planted in ${name}`).not.toEqual([]);
    }

    // The cascade defect this uniquely-named rule exists for, planted exactly
    // as an independent review planted it against the members zebra: a LATER
    // rule, in the ordinary multi-line style, re-declaring the property. It
    // wins on source order, and every value assertion above stays green.
    const override = `${cleanUiCss}\n.gn-attention {\n  background: transparent;\n}\n`;
    expect(override).not.toBe(cleanUiCss);
    expect(containerSelectorLines(override)).toHaveLength(baseCount + 1);

    // …and the `*`-prefixed evasion the comment-stripping above exists to keep
    // visible: `*` adds no specificity, so that rule ties and wins on order.
    const universal = `${cleanUiCss}\n*.gn-attention {\n  background: transparent;\n}\n`;
    expect(containerSelectorLines(universal)).toHaveLength(baseCount + 1);

    // The attribute-selector spelling an independent review used to defeat the
    // first version: same class, same specificity, later in source order.
    const attributeForm = `${cleanUiCss}\n[class~="gn-attention"] {\n  background: transparent;\n}\n`;
    expect(
      containerSelectorLines(attributeForm),
      'the [class~="…"] spelling evades the container scan',
    ).toHaveLength(baseCount + 1);

    // A duplicate of a NON-container family selector — the case that defeated
    // this file's own first `familyRules`, which resolved by name and therefore
    // never read the second rule at all.
    const duplicated = `${cleanUiCss}\n.gn-attention__reason {\n  border-left: 4px solid var(--gn-pending);\n}\n`;
    expect(familyRules(duplicated).filter(({ body }) => /border-left\s*:/.test(body))).not.toEqual([]);
    // CONTROL first: the real files are clean, so each plant below is the only thing the scan can be reacting to.
    expect(familyViolations(cleanUiCss)).toEqual([]);
    expect(familyViolations(cleanGlobalsCss)).toEqual([]);
    // 2026-10-01 amendment — each way of breaking the narrowed rule is still red:
    // a planted SECOND top-level rule…
    expect(familyViolations(duplicated)).toEqual(['.gn-attention__reason: declared 2 times at top level']);
    // …a planted SECOND phone-arm rule (the real file has the one allowed)…
    const secondPhone = `${cleanUiCss}\n${PHONE_ARM} {\n  .gn-attention__item {\n    min-height: 3rem;\n  }\n}\n`;
    expect(familyViolations(secondPhone)).toEqual(['.gn-attention__item: declared 2 times in the phone arm']);
    // …a rule in ANOTHER media query, even a phone-like one…
    const tablet = `${cleanUiCss}\n@media (max-width: 60rem) {\n  .gn-attention__reason {\n    color: red;\n  }\n}\n`;
    expect(familyViolations(tablet)).toEqual(['.gn-attention__reason: declared inside @media (max-width: 60rem), not the phone arm']);
    // …and a phone rule placed BEFORE its base, or with no base at all. CONTROL: the same two rules in the right order are clean.
    const base = '.gn-attention__row {\n  min-height: 1rem;\n}\n';
    const phoneRule = `${PHONE_ARM} {\n  .gn-attention__row {\n    min-height: 2.75rem;\n  }\n}\n`;
    expect(familyViolations(`${base}${phoneRule}`)).toEqual([]);
    expect(familyViolations(`${phoneRule}${base}`)).toEqual(['.gn-attention__row: the phone rule comes before its base']);
    expect(familyViolations(phoneRule)).toEqual(['.gn-attention__row: the phone rule comes with no top-level base']);
  });
});
