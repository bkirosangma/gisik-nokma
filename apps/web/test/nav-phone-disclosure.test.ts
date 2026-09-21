import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Case `13.913` — E4-11 — at 390 px the signed-in shell's navigation bar was **390×310**
 * (`getBoundingClientRect` on `.gn-nav`): the destination links wrapped to five
 * 44-px rows, 37 % of an 844-px viewport, and with the board's own chrome above
 * it the first card sat 1105 px down — **no ticket was on screen when the board
 * opened**.
 *
 * The fix puts the workspace-scoped links behind one disclosure below 40rem.
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
 * `@media (max-width: 40rem)` blocks, so "the 40rem block" is not a thing that
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
  const phone = blockContaining(source, '(max-width: 40rem)', '.gn-nav__more');
  if (phone === undefined) return false;
  return (rule(phone, '.gn-nav__more') ?? '').includes('display: none');
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

  it('the toggle is painted nowhere above 40rem', () => {
    const wide = rule(withoutMediaBlocks(css), '.gn-nav__more-toggle');
    expect(wide, '.gn-nav__more-toggle has no unconditional rule').toBeDefined();
    expect(wide).toContain('display: none');
  });

  it('the 40rem block that carries the disclosure exists, and is the one read below', () => {
    // POSITIVE CONTROL for every assertion under it: if this is undefined they
    // fail for the wrong reason, and `rule()` of a missing block throws rather
    // than reddening on the declaration.
    expect(
      blockContaining(css, '(max-width: 40rem)', '.gn-nav__more'),
      'no 40rem block names .gn-nav__more',
    ).toBeDefined();
  });

  it('below 40rem the wrapper is hidden and the toggle is shown', () => {
    const phone = blockContaining(css, '(max-width: 40rem)', '.gn-nav__more') as string;
    expect(rule(phone, '.gn-nav__more-toggle')).toContain('display: inline-flex');
    expect(rule(phone, '.gn-nav__more')).toContain('display: none');
  });

  it('below 40rem the OPEN wrapper takes a line of its own', () => {
    const phone = blockContaining(css, '(max-width: 40rem)', '.gn-nav__more') as string;
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
