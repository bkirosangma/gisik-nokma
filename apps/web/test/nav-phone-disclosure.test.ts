import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Case `13.1137` — E4-11 — at 390 px the signed-in shell's navigation bar was **390×310**
 * (`getBoundingClientRect` on `.gn-nav`): the destination links wrapped to five
 * 44-px rows, 37 % of an 844-px viewport, and with the board's own chrome above
 * it the first card sat 1105 px down — **no ticket was on screen when the board
 * opened**.
 *
 * The fix puts the workspace-scoped links behind one disclosure below 70rem
 * (it was 40rem until 2026-09-29, when a 1024 and a 768 bar were measured at two
 * and four rows — see the 70rem block's own docblock in `globals.css`).
 * That is a PAINT decision, and the gate has no browser (`apps/web/e2e-*` is
 * Playwright, not in `pnpm test`), so this is a SOURCE scan — the shape
 * `neo-card-radius.test.ts` uses next door, and for the same reason: the thing
 * asserted is which declarations a rule carries, and the stylesheet is the
 * authority on that.
 *
 * WHAT THIS FILE CANNOT DO, said rather than left to be discovered: it does not
 * measure the bar. The bar's new height is **not painted**, and the commit says
 * so in those words. What is asserted is that the phone breakpoint actually
 * hides the wrapper and the wide arm actually does not — the whole mechanism
 * the height depends on. The button that drives it is a component's job, so
 * that half is `app-nav.test.tsx`'s.
 *
 * The `display: contents` wide arm is load-bearing: it is what keeps the
 * DESKTOP bar unchanged rather than merely similar — the links must lay out as
 * direct flex children of `.gn-nav__links` exactly as before `.gn-nav__more`
 * existed. That is also why the wrapper is a `<div>` and not a `<details>`: a
 * closed `<details>` hides its content through internal slotting no stylesheet
 * can undo.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');
const RAW = readFileSync(GLOBALS_CSS_PATH, 'utf8');

/**
 * **Comments come out before anything is searched.** This file's docblocks
 * quote the selectors they explain, so a scan that keeps them can answer a
 * question about a RULE with a sentence about one — the failure mode is a green
 * assertion over prose. It is also not merely cosmetic: this stylesheet writes
 * brace characters inside comments (`{color: …}` examples), which unbalances
 * any brace counter that has not stripped them, and an unbalanced counter
 * silently swallows everything after the first `{`-in-comment to the end of the
 * file. That was measured here, not imagined: the first version of this scan
 * lost `.gn-nav__more`'s own wide rule and reported it as missing.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const css = stripComments(RAW);

/** Every `@media <query> { … }` block in the source, braces matched. */
function mediaBlocks(source: string, query: string): string[] {
  const marker = `@media ${query} {`;
  const blocks: string[] = [];
  let i = 0;
  for (;;) {
    const start = source.indexOf(marker, i);
    if (start === -1) return blocks;
    let depth = 0;
    let end = source.length - 1;
    for (let j = source.indexOf('{', start); j < source.length; j += 1) {
      if (source[j] === '{') depth += 1;
      else if (source[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    blocks.push(source.slice(start, end + 1));
    i = end + 1;
  }
}

/**
 * The block for `query` that CONTAINS `needle`. `globals.css` holds FOUR
 * `@media (max-width: 70rem)` blocks, so "the 70rem block" is not a thing that
 * exists — asking for the first one answers about `.gn-workspace-list`.
 */
function blockContaining(source: string, query: string, needle: string): string | undefined {
  return mediaBlocks(source, query).find((block) => block.includes(needle));
}

/**
 * Every `@media … { … }` block removed — what is left is the unconditional
 * cascade. Both arms define `.gn-nav__more`, so "first match in the file" would
 * answer with whichever comes first rather than with the wide one.
 */
function withoutMediaBlocks(source: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const at = source.indexOf('@media ', i);
    if (at === -1) return out + source.slice(i);
    out += source.slice(i, at);
    const open = source.indexOf('{', at);
    if (open === -1) return out + source.slice(at);
    let depth = 0;
    let end = source.length - 1;
    for (let j = open; j < source.length; j += 1) {
      if (source[j] === '{') depth += 1;
      else if (source[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    i = end + 1;
  }
}

/** The declaration block for `selector`, from its `{` to the matching `}`. */
function rule(block: string, selector: string): string | undefined {
  const start = block.indexOf(`${selector} {`);
  if (start === -1) return undefined;
  return block.slice(start, block.indexOf('}', start) + 1);
}

/**
 * THE MECHANISM, as one function — so the mutation witness below runs the SAME
 * code path as the assertion rather than a hand-assembled equivalent.
 */
function phoneHidesTheWrapper(source: string): boolean {
  const phone = blockContaining(source, '(max-width: 70rem)', '.gn-nav__more');
  if (phone === undefined) return false;
  return (rule(phone, '.gn-nav__more') ?? '').includes('display: none');
}

/**
 * ## THE CASCADE, NOT THE DECLARATION — because the declaration was green through the bug
 *
 * This file's first version asked whether `.gn-nav__more-toggle`'s own rule SAYS
 * `display: none`, and it did: the toggle was nonetheless PAINTED on the desktop
 * bar, because `.gn-nav a, .gn-nav button` (0,1,1) sets `display: inline-flex`
 * and outranks the bare class (0,1,0) wherever either rule sits. **Source order
 * only decides between EQUAL specificity**, so "is the rule there" and "does the
 * rule win" are different questions, and only the second one is a statement about
 * what the browser does. These three functions answer the second.
 *
 * WHAT THEY DO NOT DO, said rather than left to be discovered: the matcher
 * supports descendant combinators over tag/class compounds and NOTHING else — no
 * `:pseudo`, no `[attr]`, no `>`, `+`, `~`. An unsupported compound makes its
 * whole selector NON-matching, which is the conservative reading for a resting
 * state (`:hover` must not be credited with a `display`) and is why the colour
 * rules in this family are invisible to it. That is a limitation of the
 * instrument, not a claim about the stylesheet.
 */
type ElementModel = { path: { tag: string; classes: string[] }[] };

/** The `<button class="gn-nav__more-toggle">` as the browser sees its ancestry. */
const TOGGLE: ElementModel = {
  path: [
    { tag: 'main', classes: [] },
    { tag: 'nav', classes: ['gn-nav'] },
    { tag: 'div', classes: ['gn-nav__inner'] },
    { tag: 'div', classes: ['gn-nav__links'] },
    { tag: 'button', classes: ['gn-nav__more-toggle'] },
  ],
};

type Compound = { tag: string | undefined; classes: string[] };

/** `undefined` for anything the matcher does not support — see the limits above. */
function parseCompound(part: string): Compound | undefined {
  const match = /^([a-z]+)?((?:\.[A-Za-z0-9_-]+)*)$/.exec(part);
  if (match === null) return undefined;
  const classes = match[2] === '' || match[2] === undefined ? [] : match[2].slice(1).split('.');
  return { tag: match[1], classes };
}

function compoundMatches(compound: Compound, element: { tag: string; classes: string[] }): boolean {
  if (compound.tag !== undefined && compound.tag !== element.tag) return false;
  return compound.classes.every((cls) => element.classes.includes(cls));
}

/**
 * True when `selector` matches the model.
 *
 * **Descendant means ANY ancestor, not the immediate parent** — and getting this
 * wrong is invisible in the direction that matters here: `.gn-nav
 * .gn-nav__more-toggle`'s parent is `.gn-nav__links`, not `.gn-nav`, so a
 * contiguous-suffix matcher finds NO selector at all and every reading comes back
 * `undefined`. The last compound is the element itself; the rest walk up.
 */
function selectorMatches(selector: string, model: ElementModel): boolean {
  const compounds = selector.trim().split(/\s+/).map(parseCompound);
  if (compounds.some((compound) => compound === undefined)) return false;
  const need = compounds as Compound[];
  if (need.length === 0 || need.length > model.path.length) return false;
  if (!compoundMatches(need[need.length - 1] as Compound, model.path[model.path.length - 1] as { tag: string; classes: string[] })) {
    return false;
  }
  let at = model.path.length - 2;
  for (let i = need.length - 2; i >= 0; i -= 1) {
    let found = -1;
    for (let j = at; j >= 0; j -= 1) {
      if (compoundMatches(need[i] as Compound, model.path[j] as { tag: string; classes: string[] })) {
        found = j;
        break;
      }
    }
    if (found === -1) return false;
    at = found - 1;
  }
  return true;
}

/** [classes+attributes, elements] — ids are not used in this stylesheet's nav rules. */
function specificityOf(selector: string): [number, number] {
  const parts = selector.trim().split(/\s+/);
  let classes = 0;
  let elements = 0;
  for (const part of parts) {
    const match = /^([a-z]+)?((?:\.[A-Za-z0-9_-]+)*)$/.exec(part);
    if (match === null) return [0, 0];
    if (match[1] !== undefined && match[1] !== '') elements += 1;
    classes += match[2] === '' || match[2] === undefined ? 0 : match[2].split('.').length - 1;
  }
  return [classes, elements];
}

/** Every `selector { body }` pair in a comment-stripped, media-free stylesheet. */
function declarationRules(source: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  let i = 0;
  for (;;) {
    const open = source.indexOf('{', i);
    if (open === -1) return out;
    const close = source.indexOf('}', open);
    if (close === -1) return out;
    out.push({ selector: source.slice(i, open).trim(), body: source.slice(open + 1, close) });
    i = close + 1;
  }
}

/**
 * The VALUE of `property` on the model that actually wins — highest specificity,
 * ties broken by source order, exactly as the cascade does it. Built from ONE
 * code path for both widths, so the phone reading is the same instrument as the
 * desktop one rather than a hand-assembled equivalent.
 *
 * `phone` is the 70rem block, APPENDED: that is where the file puts it relative
 * to the rules it competes with at equal specificity, and a specificity-decided
 * pair cannot be moved by the concatenation either way.
 */
function winner(source: string, model: ElementModel, property: string): string | undefined {
  let best: { value: string; rank: [number, number]; order: number } | undefined;
  declarationRules(source).forEach((candidate, order) => {
    for (const selector of candidate.selector.split(',')) {
      if (!selectorMatches(selector, model)) continue;
      const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(candidate.body);
      if (match === null) continue;
      const rank = specificityOf(selector);
      const beats =
        best === undefined ||
        rank[0] > best.rank[0] ||
        (rank[0] === best.rank[0] &&
          (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && order >= best.order)));
      if (beats) best = { value: (match[1] as string).trim(), rank, order };
    }
  });
  return best?.value;
}

/**
 * The cascade a browser applies at 390 px: everything unconditional, then the
 * 70rem block's CONTENTS.
 *
 * **The `@media … {` wrapper is stripped before appending, and that is not
 * tidiness.** The splitter below is deliberately naive — it takes the first `}`
 * as the end of a body, with no nesting — so a wrapper left in place makes the
 * media's own opening brace the "rule", swallows the toggle's declaration as
 * that rule's BODY, and the toggle rule is never seen as a rule at all. The
 * reading then comes back `none`, which is the right answer for the WRONG reason
 * and is indistinguishable from the assertion passing. Measured here: that is
 * exactly what the first version of this function produced.
 */
function phoneContext(source: string): string {
  const block = blockContaining(source, '(max-width: 70rem)', '.gn-nav__more') ?? '';
  const open = block.indexOf('{');
  return withoutMediaBlocks(source) + (open === -1 ? '' : block.slice(open + 1, -1));
}

describe('E4-11 — the phone breakpoint collapses the workspace links into one disclosure', () => {
  it('the scan reads declarations, not the docblock that names them', () => {
    // The control for `stripComments`, in BOTH directions — a control that can
    // only read "true" is not a control. The selector is invented, so nothing
    // else in the file can answer for it.
    const planted = `${RAW}\n/* .gn-nav__zz-planted { display: block; } */\n`;
    // Direction 1: WITHOUT the strip, the SAME extractor reads that comment out
    // as a rule. This is the false answer the strip exists to prevent, and it is
    // the reading the first version of this file actually produced.
    expect(rule(planted, '.gn-nav__zz-planted')).toBe('.gn-nav__zz-planted { display: block; }');
    // Direction 2: with it, the comment is not a rule at all.
    expect(rule(stripComments(planted), '.gn-nav__zz-planted')).toBeUndefined();
  });

  it('the wide arm is `display: contents`, so the desktop bar is unchanged', () => {
    const wide = rule(withoutMediaBlocks(css), '.gn-nav__more');
    expect(wide, '.gn-nav__more has no unconditional rule').toBeDefined();
    expect(wide).toContain('display: contents');
  });

  /**
   * **THE ASSERTION THIS FILE GOT WRONG, kept as a case rather than replaced.**
   *
   * The first version asked only whether the toggle's own rule SAYS `display:
   * none`. It did, and the owner photographed the button on a desktop bar
   * anyway, because `.gn-nav a, .gn-nav button` (0,1,1) outranks the bare class
   * (0,1,0) — source order is not what decides that. So the case now reads the
   * WINNING value on both sides of the breakpoint.
   */
  it('13.1218 the toggle LOSES the cascade above 70rem and WINS it below', () => {
    // The declaration half is still pinned, now as a precondition rather than as
    // the property: a rule that is not there cannot win, and this names which
    // rule the reading below is about.
    expect(
      rule(withoutMediaBlocks(css), '.gn-nav .gn-nav__more-toggle'),
      'no unconditional .gn-nav .gn-nav__more-toggle rule',
    ).toContain('display: none');

    expect(winner(withoutMediaBlocks(css), TOGGLE, 'display')).toBe('none');
    expect(winner(phoneContext(css), TOGGLE, 'display')).toBe('inline-flex');
  });

  it('13.1218 CONTROL — the competitor really is in the reading, and the plant flips it', () => {
    // THE COMPETITOR, witnessed on its own: the generic rule that beat the bare
    // class is still in the stylesheet and still says `inline-flex`. Without
    // this, a tree that had dropped `.gn-nav button` entirely would satisfy the
    // assertion above for the wrong reason.
    expect(rule(withoutMediaBlocks(css), '.gn-nav button')).toContain('display: inline-flex');

    // MUTATION WITNESS — the PRE-FIX selector, planted, in the same path the
    // assertion runs. Reverting BOTH rules to the bare class is the exact tree
    // the owner photographed; the desktop reading must flip, and the phone one
    // must NOT (which is why the defect was invisible at 390: the phone arm is
    // later and wins its tie even when it is too weak to beat `.gn-nav button`
    // on its own — the button looked right at phone by luck, and wrong here).
    const mutant = css
      .split('.gn-nav .gn-nav__more-toggle')
      .join('.gn-nav__more-toggle');
    expect(mutant, 'the plant matched nothing — the witness is inert').not.toBe(css);
    expect(winner(withoutMediaBlocks(mutant), TOGGLE, 'display')).toBe('inline-flex');
    expect(winner(phoneContext(mutant), TOGGLE, 'display')).toBe('inline-flex');
  });

  it('the 70rem block that carries the disclosure exists, and is the one read below', () => {
    // POSITIVE CONTROL for every assertion under it: if this is undefined they
    // fail for the wrong reason, and `rule()` of a missing block throws rather
    // than reddening on the declaration.
    expect(
      blockContaining(css, '(max-width: 70rem)', '.gn-nav__more'),
      'no 70rem block names .gn-nav__more',
    ).toBeDefined();
  });

  it('below 70rem the wrapper is hidden and the toggle is shown', () => {
    const phone = blockContaining(css, '(max-width: 70rem)', '.gn-nav__more') as string;
    expect(rule(phone, '.gn-nav__more-toggle')).toContain('display: inline-flex');
    expect(rule(phone, '.gn-nav__more')).toContain('display: none');
  });

  it('below 70rem the OPEN wrapper takes a line of its own', () => {
    const phone = blockContaining(css, '(max-width: 70rem)', '.gn-nav__more') as string;
    const open = rule(phone, '.gn-nav__more[data-open="true"]');
    expect(open, 'no [data-open="true"] arm').toBeDefined();
    expect(open).toContain('display: flex');
    // Without this the panel would share row 1 with the toggle and re-wrap the
    // bar into the multi-row shape the finding measured.
    expect(open).toContain('flex-basis: 100%');
  });

  it('the mechanism, and a planted regression in the SAME path', () => {
    expect(phoneHidesTheWrapper(css), 'the phone arm does not hide the wrapper').toBe(true);

    // MUTATION WITNESS. Planting the regression this case exists to catch —
    // the phone arm reverted to the wide arm's `display: contents` — must flip
    // the function above. Asserting the replace MATCHED is part of the witness:
    // a plant that silently matched nothing leaves both readings true and reads
    // as a survivor.
    const mutant = css.replace(
      '.gn-nav__more { display: none; }',
      '.gn-nav__more { display: contents; }',
    );
    expect(mutant, 'the planted text matched nothing — the witness is inert').not.toBe(css);
    expect(phoneHidesTheWrapper(mutant), 'the plant did not flip the reading').toBe(false);
  });
});
