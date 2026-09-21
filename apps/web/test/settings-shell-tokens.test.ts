import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Cases 13.907–13.909 — `isSettingsShell`'s two token nits, and the one
 * prototype value this task deliberately does NOT port.
 *
 * Every bare `:NNN` below is `design-system/interactive/desktop.dc.html`, read
 * out of `main`, where the shell is `:800-1011`: its `<nav>` at `:808`, and its
 * nav-item style at `:3145`.
 *
 * WHY A SOURCE SCAN. `globals.css` is not loaded by jsdom here, so a rendered
 * assertion could only restate class names — and a case that asserts a class
 * EXISTS proves nothing about what it does. The three claims below are the
 * DECLARED values, each compared against the prototype line it ports, and each
 * carries a mutation witness that traverses the SAME path as the measurement
 * (this repo's idiom, established by `neo-card-radius.test.ts` and
 * `members-styling.test.ts`).
 *
 * **The claim that needed the most care is 13.908's, because the product is
 * self-consistent and the prototype is NOT.** The prototype draws its top nav's
 * current item as a *tint* (`background:var(--tintAccent);color:var(--accent)`
 * at `:2599`) and its settings SIDEBAR's current item as a *solid accent*
 * (`background:var(--accent);color:var(--onColor)` at `:3145`) — two different
 * treatments for the same idea, and the prototype even declares a named pair for
 * the second (`--sideOnBg:var(--accent); --sideOnColor:var(--onColor)` at `:31`,
 * which nothing in that file ever applies). The product had collapsed both onto
 * the top-nav tint, which is why `globals.css`'s own docblock could say the
 * sidebar reuses `.gn-nav`'s pattern "rather than inventing a second one" and be
 * describing a divergence rather than a decision. 13.908 restores the
 * prototype's second treatment; 13.909 is the value that stays a token.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');
/**
 * The OTHER stylesheet a rule for this screen could hide in — `apps/web/app/
 * layout.tsx:3-4` loads it first, so a tie also goes `globals.css`'s way. Read
 * by 13.910, which is the case that catches a competing rule the
 * `.gn-settings` family's own file would never show. Same pairing, and the same
 * reason, as `members-styling.test.ts:45-49`.
 */
const UI_CSS_PATH = resolve(TEST_DIR, '../../../packages/ui/src/ui.css');

/**
 * Full rule body, selector line through its matching closing brace — the shape
 * `members-styling.test.ts:53` established. The single-line version in
 * `neo-card-radius.test.ts` truncates every rule in this family, whose
 * declarations each sit on their own line.
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

/**
 * `property → value` for one rule body, comments dropped by CONTEXT rather than
 * by a line prefix: `globals.css` documents many of these rules in prose that
 * names their own selectors, so a prefix test both misses real rules and eats
 * sentences. Braces are located in the STRIPPED text — locating them in the
 * original and slicing the stripped copy is off by every comment's length.
 */
function declarations(rule: string): Map<string, string> {
  const out = new Map<string, string>();
  const stripped = rule.replace(/\/\*[\s\S]*?\*\//g, '');
  const body = stripped.slice(stripped.indexOf('{') + 1, stripped.lastIndexOf('}'));
  for (const part of body.split(';')) {
    const at = part.indexOf(':');
    if (at === -1) continue;
    out.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return out;
}

/** The rule's flex-basis in CSS px, resolving `rem` at the root's own 16px. */
function basisPx(rule: string): number | undefined {
  const decls = declarations(rule);
  const flex = decls.get('flex');
  const raw = flex !== undefined ? flex.split(/\s+/).at(-1) : decls.get('flex-basis') ?? decls.get('width');
  if (raw === undefined) return undefined;
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return undefined;
  if (raw.endsWith('rem')) return n * 16;
  if (raw.endsWith('px')) return n;
  return undefined;
}

/**
 * Replace the FIRST rule matching `selectorPattern` with `replacement`. Every
 * witness below plants through this, because appending a rule to the end of the
 * file would leave `ruleFor` — which returns the first match — reading the REAL
 * rule: a control that does not traverse the measurement's path is not a
 * control. Throws rather than returning the input unchanged, so a plant that
 * cannot apply is loud instead of silent.
 */
function withRule(css: string, selectorPattern: RegExp, replacement: string): string {
  const rule = ruleFor(css, selectorPattern);
  if (rule === undefined) throw new Error(`no rule matched ${String(selectorPattern)} to replace`);
  return css.replace(rule, replacement);
}

const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

const SIDEBAR = /\.gn-settings__sidebar\s*\{/;
const SIDEBAR_ITEM = /^\.gn-settings__sidebar a,$/;
const SIDEBAR_ACTIVE = /\.gn-settings__sidebar a\[aria-current='page'\]\s*\{/;

/** The prototype's active pair, as `:3145` spells it, in product token names. */
const ITEM_ACTIVE_BG = 'var(--gn-accent)';
const ITEM_ACTIVE_FG = 'var(--gn-accent-text)';

describe("13.907 — the settings sidebar is the prototype's 248px, not the 192px it shipped", () => {
  it("resolves the sidebar's flex-basis to the prototype's 248px", () => {
    const rule = ruleFor(css, SIDEBAR);
    expect(rule, 'no rule for .gn-settings__sidebar').toBeDefined();
    // 248/16 = 15.5rem — asserted as the RESOLVED pixel value, so that a later
    // edit to `14rem` reads as the 224px drift from the prototype it is, rather
    // than as a string that merely looks different.
    expect(basisPx(rule!), `sidebar basis in px, from: ${String(rule)}`).toBe(248);
  });

  /*
   * MUTATION WITNESS. Plant a basis that is NOT the prototype's through the same
   * extraction the case uses, and confirm it reads back as its own value — with
   * the old 12rem/192px called out, since that is the value this task removes.
   */
  it("a planted basis is read as its own value, and 12rem reads as the old 192", () => {
    const plant = (value: string) =>
      withRule(css, SIDEBAR, `.gn-settings__sidebar {\n  flex: 0 0 ${value};\n}`);
    expect(basisPx(ruleFor(plant('9rem'), SIDEBAR)!)).toBe(144);
    expect(basisPx(ruleFor(plant('12rem'), SIDEBAR)!)).toBe(192);
    // The property that matters, and it is a real one: a tree carrying any of
    // these planted bases would REDDEN the case above, because the extraction
    // reads the planted value back and none of them is the prototype's. Written
    // as a loop over the extraction rather than as `expect([144, 192]).not
    // .toContain(248)` — that shape is a check that cannot fail, since the array
    // is a literal written on the same line as the assertion.
    for (const planted of ['9rem', '12rem', '14rem']) {
      expect(basisPx(ruleFor(plant(planted), SIDEBAR)!), `planted ${planted}`).not.toBe(248);
    }
  });
});

describe("13.908 — the current sidebar item is the prototype's SOLID accent, not the top nav's tint", () => {
  const rule = ruleFor(css, SIDEBAR_ACTIVE);

  it('paints the current item with the accent PAIR the prototype names at :3145', () => {
    expect(rule, "no rule for .gn-settings__sidebar a[aria-current='page']").toBeDefined();
    const decls = declarations(rule!);
    expect(decls.get('background'), `background, from: ${String(rule)}`).toBe(ITEM_ACTIVE_BG);
    expect(decls.get('color')).toBe(ITEM_ACTIVE_FG);
  });

  /*
   * The pair is not a new guarantee: `tokens.ts`'s `CONTRAST_PAIRS` already
   * declares `{ fg: 'accentText', bg: 'accent', minimum: 4.5 }`, and
   * `packages/ui/test/tokens.test.ts` measures it against every style and theme.
   * This case is the other half — that the RULE actually uses that pair.
   */
  it("names neither of the top nav's tint roles — the near-miss `--gn-text-accent` included", () => {
    expect(rule?.includes('--gn-fill-tertiary'), `from: ${String(rule)}`).toBe(false);
    expect(rule?.includes('--gn-text-accent')).toBe(false);
  });

  it("adds no declaration the prototype's active delta does not carry", () => {
    // The prototype's active state is `:3145`'s base string with exactly two
    // declarations appended. `font-weight: 700` was the product's own addition,
    // and under a solid fill it is the kind of invented emphasis this repo
    // records rather than keeps.
    const extra = [...declarations(rule!).keys()].filter((n) => n !== 'background' && n !== 'color');
    expect(extra, `extra declarations in: ${String(rule)}`).toEqual([]);
  });

  /*
   * MUTATION WITNESSES — one per claim above, each planted into the SAME rule
   * the case reads, each aimed so a survivor would identify its own site.
   */
  it('a planted tint pair is caught by all three claims', () => {
    const mutated = withRule(
      css,
      SIDEBAR_ACTIVE,
      `.gn-settings__sidebar a[aria-current='page'] {\n  background: var(--gn-fill-tertiary);\n  color: var(--gn-text-accent);\n  font-weight: 700;\n}`,
    );
    const decls = declarations(ruleFor(mutated, SIDEBAR_ACTIVE)!);
    expect(decls.get('background')).not.toBe(ITEM_ACTIVE_BG);
    expect(decls.get('color')).not.toBe(ITEM_ACTIVE_FG);
    expect(ruleFor(mutated, SIDEBAR_ACTIVE)?.includes('--gn-fill-tertiary')).toBe(true);
    expect(ruleFor(mutated, SIDEBAR_ACTIVE)?.includes('--gn-text-accent')).toBe(true);
    expect(
      [...decls.keys()].filter((n) => n !== 'background' && n !== 'color'),
    ).toEqual(['font-weight']);
  });

  it('a font-weight planted ALONE is caught, by the extra-declaration claim alone', () => {
    const mutated = withRule(
      css,
      SIDEBAR_ACTIVE,
      `.gn-settings__sidebar a[aria-current='page'] {\n  background: var(${ITEM_ACTIVE_BG.slice(4, -1)});\n  color: var(${ITEM_ACTIVE_FG.slice(4, -1)});\n  font-weight: 700;\n}`,
    );
    const decls = declarations(ruleFor(mutated, SIDEBAR_ACTIVE)!);
    // The pair claims stay green — this plant changes only the extra claim.
    expect(decls.get('background')).toBe(ITEM_ACTIVE_BG);
    expect(decls.get('color')).toBe(ITEM_ACTIVE_FG);
    expect([...decls.keys()].filter((n) => n !== 'background' && n !== 'color')).toEqual(['font-weight']);
  });
});

describe('13.909 — the item radius stays `--gn-radius-control`, and that is a measured deviation', () => {
  it("the item's radius is the token, and no literal competes with it", () => {
    const rule = ruleFor(css, SIDEBAR_ITEM);
    expect(rule, 'no rule for .gn-settings__sidebar a').toBeDefined();
    const decls = declarations(rule!);
    expect(decls.get('border-radius'), `from: ${String(rule)}`).toBe('var(--gn-radius-control)');
    // The prototype hard-codes `border-radius:10px` here (`:3145`). It is NOT
    // the only control in that file that hard-codes a radius — a plain count
    // finds nine, including an `<input type="search">` at `:1676` and three
    // `<a>` doors at `:1855-1857` — and the first version of this docblock said
    // it was. The true and narrower claim is about NAV ITEMS, and it is the
    // stronger one: the top nav composes `NAV_BASE`, whose own radius is
    // `var(--ctlR)` (`:2011`, used at `:2598`), so `:3145` is the one nav item
    // that departs from the prototype's own control-radius token.
    //
    // Why that matters for the port: the prototype's neo block sets
    // `--ctlR:14px` at `:59`, and `tokens.ts`'s `radii` table mirrors it exactly
    // (`hig`/`minimal` 8px, `neo` 14px). A literal port would therefore leave
    // this one item at 10px while every other control under `neo` is 14px. The
    // token expresses the style axis the prototype's literal cannot, and this
    // rule is where the deviation is declared rather than left to look like an
    // oversight.
    expect(/border-radius:\s*[\d.]+\s*(px|rem)/.test(rule!)).toBe(false);
  });

  /*
   * MUTATION WITNESSES. The second claim is the one that distinguishes "a token
   * is used" from "no literal competes" — different properties, and only the
   * second is this case's real content. Each plant is aimed at one of them.
   */
  it("a planted literal radius is caught, by the literal claim alone", () => {
    const literal = withRule(
      css,
      SIDEBAR_ITEM,
      `.gn-settings__sidebar a,\n.gn-settings__sidebar-item--disabled {\n  border-radius: 10px;\n}`,
    );
    const decls = declarations(ruleFor(literal, SIDEBAR_ITEM)!);
    expect(/border-radius:\s*[\d.]+\s*(px|rem)/.test(ruleFor(literal, SIDEBAR_ITEM)!)).toBe(true);
    // The first claim survives this plant untouched — the two are separable.
    expect(decls.get('border-radius')).not.toBe('var(--gn-radius-control)');
  });

  it('a planted TOKEN of the wrong role is caught, by the token claim alone', () => {
    const wrongToken = withRule(
      css,
      SIDEBAR_ITEM,
      `.gn-settings__sidebar a,\n.gn-settings__sidebar-item--disabled {\n  border-radius: var(--gn-radius-card);\n}`,
    );
    const decls = declarations(ruleFor(wrongToken, SIDEBAR_ITEM)!);
    expect(decls.get('border-radius')).not.toBe('var(--gn-radius-control)');
    // No literal appears — this plant is invisible to the second claim, which is
    // why both claims exist.
    expect(/border-radius:\s*[\d.]+\s*(px|rem)/.test(ruleFor(wrongToken, SIDEBAR_ITEM)!)).toBe(false);
  });
});

/**
 * Every selector in one stylesheet, one entry per rule. Splits on `}` so each
 * chunk's text before its `{` IS the selector, which handles a selector written
 * across lines (`.a,` / `.b {`) without a line-prefix heuristic — and comments
 * are stripped by CONTEXT first, because `globals.css` documents these rules in
 * prose that names their own selectors, so a line test both misses real rules
 * and eats sentences. Same reasoning as `members-styling.test.ts`'s own helper,
 * which an independent review defeated twice before it reached this shape.
 */
function selectorsIn(sheet: string): string[] {
  const stripped = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const block of stripped.split('}')) {
    const at = block.indexOf('{');
    if (at === -1) continue;
    out.push(block.slice(0, at).trim().replace(/\s+/g, ' '));
  }
  return out;
}

describe('13.910 — exactly ONE rule carries the current item, across both stylesheets', () => {
  /*
   * WHY THIS CASE EXISTS, and it is the gap an independent review found in the
   * first version of this file: 13.907–13.909 read `globals.css` alone, so a
   * competing rule — equal specificity and later in source order, or higher
   * specificity anywhere — defeats the change INVISIBLY. The review measured
   * exactly that: two such rules appended to a copy left this file green with
   * the active item dead in a browser. 13.908's NAME is a claim about what gets
   * painted, so the instrument has to be able to see what else paints it.
   *
   * The claim is deliberately about the PATTERN, not the one literal selector:
   * `[data-style="neo"] .gn-settings__sidebar a[aria-current='page']` and
   * `.gn-settings a[aria-current='page']` both compete and neither is the same
   * string as the rule under test.
   */
  const matches = (sheet: string) =>
    selectorsIn(sheet).filter((s) => s.includes('gn-settings') && s.includes('aria-current'));

  const inGlobals = matches(css);
  const inUi = matches(readFileSync(UI_CSS_PATH, 'utf8'));

  it('one rule in globals.css names an `aria-current` state inside `.gn-settings`', () => {
    expect(inGlobals, `matching selectors: ${inGlobals.join(' | ')}`).toEqual([
      ".gn-settings__sidebar a[aria-current='page']",
    ]);
  });

  it('no rule in ui.css competes for the same state', () => {
    expect(inUi, `matching selectors: ${inUi.join(' | ')}`).toEqual([]);
  });

  /*
   * MUTATION WITNESS. Plant the exact override the review used — a later,
   * equal-specificity rule restoring the tint — and confirm the count moves.
   * Both plants go through `selectorsIn`, the same path the assertions read.
   */
  it('a planted competing rule is caught, at equal AND at higher specificity', () => {
    const equal = `${css}\n.gn-settings__sidebar a[aria-current='page'] { background: var(--gn-fill-tertiary); }\n`;
    expect(matches(equal)).toHaveLength(2);

    const higher = `${css}\n[data-style='neo'] .gn-settings__sidebar a[aria-current='page'] { background: var(--gn-fill-tertiary); }\n`;
    expect(matches(higher)).toHaveLength(2);

    // Positive control through the SAME path: a rule that does not name both
    // tokens is not counted, so the count above is not simply "number of rules".
    const unrelated = `${css}\n.gn-elsewhere a[aria-current='page'] { background: var(--gn-fill-tertiary); }\n`;
    expect(matches(unrelated)).toHaveLength(1);
  });
});

/**
 * Case `13.1149` — E4-25 — the settings sidebar's section links take the four
 * metrics `:3145` carries, which this file used to list as deliberately NOT
 * ported.
 *
 * `globals.css`'s own docblock recorded the deferral in those words —
 * *"`min-height:44px`, `padding:0 14px`, `font-size:15px`, `font-weight:500`
 * … outside this task's named scope"* — on the ground that they were
 * *"tap-target and type-scale questions rather than token ones"*. **That
 * position did not survive being measured:** the three section links rendered
 * **232×39**, `padding: 8px 11.2px`, `min-height: auto`. 44 here is a POINTER
 * floor (WCAG 2.5.5), not a keyboard one, and these three links are the
 * sidebar's only controls for changing section. A scope argument can defer a
 * metric; it cannot make 39 equal 44.
 *
 * **`padding: 0 14px` is asserted TOGETHER WITH `min-height`, and that pairing
 * is the point:** the prototype's item carries no vertical padding at all and
 * takes its height from `min-height`, so porting either alone leaves the row
 * able to drift off 44 again the moment the font does.
 */
describe('13.1149 the settings sidebar item ports the prototype\'s four metrics', () => {
  const measuredFour = (source: string): Record<string, boolean> => {
    const rule = ruleFor(source, SIDEBAR_ITEM);
    return {
      minHeight: /min-height:\s*2\.75rem/.test(rule ?? ''),
      padding: /padding:\s*0 0\.875rem/.test(rule ?? ''),
      fontSize: /font-size:\s*0\.9375rem/.test(rule ?? ''),
      fontWeight: /font-weight:\s*500/.test(rule ?? ''),
    };
  };

  it('13.1149 all four are declared', () => {
    const found = measuredFour(css);
    expect(
      Object.entries(found)
        .filter(([, ok]) => !ok)
        .map(([name]) => name),
      `missing at .gn-settings__sidebar a: ${JSON.stringify(found)}`,
    ).toEqual([]);
  });

  it('13.1149 the two halves that hold the row at 44 arrive together', () => {
    // `min-height` without `padding: 0` leaves 8px of vertical padding under a
    // 44px floor, and `padding: 0 0.875rem` without the floor is the 39 the
    // finding measured. Neither alone is the port.
    const rule = ruleFor(css, SIDEBAR_ITEM) ?? '';
    expect(rule).toMatch(/min-height:\s*2\.75rem/);
    expect(rule).toMatch(/padding:\s*0 0\.875rem/);
    expect(rule, 'the pre-fix two-axis padding came back').not.toMatch(/padding:\s*0\.5rem 0\.7rem/);
  });

  it('13.1149 a planted rule missing any one of the four is caught, in the same path', () => {
    // MUTATION WITNESS. `withRule` replaces the FIRST match through the same
    // `ruleFor` the case above reads, so each plant traverses the measurement's
    // path rather than being appended past it. Each plant drops exactly one
    // declaration, so a plant that reddened nothing would mean that declaration
    // is not what the case is reading.
    const plant = (body: string) =>
      withRule(css, SIDEBAR_ITEM, `.gn-settings__sidebar a,\n${body}`);
    for (const [name, body] of [
      ['minHeight', '  border-radius: 8px;\n  padding: 0 0.875rem;\n  font-size: 0.9375rem;\n  font-weight: 500;'],
      ['padding', '  min-height: 2.75rem;\n  padding: 0.5rem 0.7rem;\n  font-size: 0.9375rem;\n  font-weight: 500;'],
      ['fontSize', '  min-height: 2.75rem;\n  padding: 0 0.875rem;\n  font-weight: 500;'],
      ['fontWeight', '  min-height: 2.75rem;\n  padding: 0 0.875rem;\n  font-size: 0.9375rem;'],
    ] as const) {
      expect(measuredFour(plant(body))[name], `planted a rule missing ${name}`).toBe(false);
    }
  });
});
