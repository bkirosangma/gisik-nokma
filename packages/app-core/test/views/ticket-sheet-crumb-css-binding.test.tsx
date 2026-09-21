import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 17.025 / E4-30 — THE THREE CRUMB ARMS ARE THREE INKS.
 *
 * ## Why this is a CSS-binding case and not a rendered one
 *
 * **jsdom applies no stylesheet**, so `getComputedStyle` on a crumb returns the
 * UA's default and every assertion about ink would pass against any CSS at
 * all. The defect was measured on a PAINTED page (`color: rgb(60,60,67)` on
 * both arms, `text-decoration: none`, no weight change, `cursor: pointer` and
 * the UA focus ring the only tells), and the only place a jsdom suite can hold
 * that fact is the stylesheet itself — which is the split this repo already
 * keeps: `ticket-list-css-binding.test.tsx`, `sync-ux-css-binding.test.tsx` and
 * `inbox-css-binding.test.tsx` read `packages/ui/src/ui.css` for the same
 * reason, and a ui-side edit to these blocks reddens an app-core suite on
 * purpose.
 *
 * ## The defect
 *
 * The ancestor crumb renders as a real `<button>` (this repo's rule for a
 * control) and its rule declared `color: inherit`, while the PLAIN and CURRENT
 * crumbs take the nav's `var(--gn-text-muted)`. So the crumb that OPENS A TICKET
 * was painted in exactly the ink of the crumbs that do not — identical ink, no
 * underline, no weight change — and a reader could not tell them apart.
 *
 * The rule's own docblock justified that with the prototype: *"its `<a>` sits
 * in a nav declaring `color:var(--label2)` and sets no colour of its own
 * (`:1101`, `:1103`)"*. **The premise was true and the inference was false.** A
 * `<button>` inherits; an `<a>` does not, because the export carries
 * `a{color:var(--accent);…}` at **`:86`** — a TYPE selector, which applies to
 * every anchor in the document and beats inheritance.
 *
 * ## ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH, and that is load-bearing here
 *
 * The rule's rewritten docblock NAMES `var(--gn-text-accent)` and quotes the
 * old `color: inherit`, because that is what a reader needs. A search over the
 * raw file would therefore find the fix in the PROSE while the declaration said
 * something else — the failure this repository has recorded as *"a sweep finds
 * the docblock naming the literal first, so the check reads the prose"*. Every
 * assertion below reads a rule BODY extracted from comment-stripped CSS.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const UI_CSS = readFileSync(resolve(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

/**
 * Comments stripped FIRST. The blocks this case reads open with paragraphs of
 * explanatory prose that name every value asserted below, so leaving them in
 * would let a reverted declaration stay green out of its own documentation.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The declarations inside `${selector} { … }`, from comment-stripped CSS. */
function ruleBody(css: string, selector: string): string {
  const bare = stripComments(css);
  const start = bare.indexOf(`${selector} {`);
  expect(start, `no rule for \`${selector}\` in packages/ui/src/ui.css`).toBeGreaterThan(-1);
  const end = bare.indexOf('}', start);
  return bare.slice(start, end);
}

/** One declaration's value, or `null` when the rule does not set it. */
function declared(body: string, property: string): string | null {
  // ⚠ THE OPENING BRACE IS AN ALTERNATIVE AND IT HAS TO BE. The first draft of
  // this helper accepted only `^` or `;` before a declaration, so the FIRST
  // declaration of every rule — the one sitting right after `{` — was
  // invisible: `color` read as `null` on a rule that plainly declares it, and
  // the case failed against correct CSS. The control above did not catch it
  // because `cursor` happens to be the second declaration in the rule it reads.
  const match = new RegExp(`(?:^|[{;])\\s*${property}\\s*:\\s*([^;}]+)`).exec(body);
  return match === null ? null : match[1]!.trim();
}

describe('17.025 / E4-30 — the crumb arms take three different inks', () => {
  const link = ruleBody(UI_CSS, 'button.gn-ticket-sheet__crumb--link');
  const restricted = ruleBody(UI_CSS, '.gn-ticket-sheet__crumb--restricted');
  const nav = ruleBody(UI_CSS, '.gn-ticket-sheet__crumbs');

  /**
   * CONTROL — the extraction reads a rule BODY and not the whole file. If
   * `ruleBody` returned the file or an empty string, every assertion below
   * would be measuring something else; a property this rule deliberately does
   * NOT set is the cheapest way to show that it returns a bounded body.
   */
  it('CONTROL — the extracted bodies are bounded rule bodies, not the file', () => {
    expect(declared(link, 'cursor')).toBe('pointer');
    // `cursor` appears on many rules in the file and NOT on this one — so a
    // body that swallowed the file would report a value here.
    expect(declared(nav, 'cursor')).toBeNull();
    expect(link.length).toBeLessThan(UI_CSS.length / 10);
  });

  /**
   * THE FIX. `--gn-text-accent`, not `--gn-accent`: `accent` is not text-safe
   * (`.gn-button`'s note, Round 2d), and `textAccent` is the role this product
   * resolves the prototype's `accent` to FOR TEXT — the same one `.gn-button`
   * and `.gn-board-card__move` already wear.
   */
  it('an ancestor crumb that OPENS a ticket is painted in the text-accent role', () => {
    expect(declared(link, 'color')).toBe('var(--gn-text-accent)');
    // Not the prototype's raw `accent`, which is not text-safe.
    expect(declared(link, 'color')).not.toBe('var(--gn-accent)');
  });

  /**
   * THE PROPERTY THE DEFECT WAS: three arms, three inks, so a reader can tell
   * which crumbs open something.
   *
   * ⚠ **`new Set([...]).size === 3` ALONE IS NOT THIS PROPERTY, AND THE
   * MUTATION PROVED IT.** With the declaration reverted to `inherit` the three
   * strings are still distinct — `inherit`, `var(--gn-text-muted)`,
   * `var(--gn-restricted)` — so a set-size check stays GREEN over the exact
   * defect and is a control that cannot fail here. `inherit` is not a colour;
   * it is the ABSENCE of a decision, and the readback is that a crumb which
   * opens a ticket must be painted in a ROLE. That assertion is what reddens.
   */
  it('the three arms differ: the nav, the link and the restricted crumb are three inks', () => {
    const navInk = declared(nav, 'color');
    const linkInk = declared(link, 'color');
    const restrictedInk = declared(restricted, 'color');

    expect(navInk).toBe('var(--gn-text-muted)');
    expect(restrictedInk).toBe('var(--gn-restricted)');
    // THE DISCRIMINATING ONE: a ROLE, never inheritance. `inherit` would make
    // this arm's ink whatever the nav happens to declare — which is the defect.
    expect(linkInk).toMatch(/^var\(--gn-/);
    expect(linkInk).not.toBe('inherit');
    // Three distinct strings, kept as a secondary reading of "three arms".
    expect(new Set([navInk, linkInk, restrictedInk]).size).toBe(3);
    expect(linkInk).not.toBe(navInk);
  });

  /**
   * The REST of the reset still stands — this change is one declaration, and a
   * reader of the diff should be able to see that. Without these the crumb
   * would draw the UA's button chrome on top of the new ink.
   */
  it('the rest of the reset is untouched by the ink change', () => {
    expect(declared(link, 'border')).toBe('none');
    expect(declared(link, 'background')).toBe('transparent');
    expect(declared(link, 'padding')).toBe('0');
    expect(declared(link, 'font')).toBe('inherit');
  });
});

/**
 * 17.028 / P4 — "THE SAME PLAIN SPAN" IS NOT THE SAME SPAN.
 *
 * The `onOpenTicket`-less arm's docblock said the crumb *"degrades to the SAME
 * plain span the restricted arm uses"*, and that sentence was the only thing
 * making the two arms look alike. They share a SHAPE — a plain `<span>` with the
 * base class — and not an INK:
 *
 *   - the RESTRICTED arm carries the modifier and `var(--gn-restricted)`;
 *   - the NO-CALLBACK arm carries the bare class, has **no rule of its own at
 *     all**, and inherits `var(--gn-text-muted)` from the nav.
 *
 * **The inks stay different on purpose**, so the remedy is the SENTENCE and not
 * the CSS: *"you cannot open this here"* and *"you may not see this"* are
 * different facts, and this surface keeps them apart everywhere else. A case is
 * still owed, because a corrected sentence with nothing behind it drifts back —
 * and the cheapest way to make the two arms the same span is to give the bare
 * class the restricted modifier, which is exactly what this reddens on.
 */
describe('17.028 / P4 — the no-callback crumb is the same SHAPE as the restricted one, not the same ink', () => {
  it('the bare crumb has NO rule of its own — the arm is the ABSENCE of a modifier', () => {
    // An absence, which is the only way to see it: a `.gn-ticket-sheet__crumb`
    // rule of its own would mean the no-callback arm had been given a colour
    // (most plausibly the restricted one, "to match"), and the sentence this
    // case guards would become true in the direction that removes the
    // distinction.
    expect(stripComments(UI_CSS)).not.toMatch(/^\.gn-ticket-sheet__crumb\s*\{/m);
  });

  it('the two arms therefore take different inks — restricted, vs the nav’s muted ink', () => {
    const restricted = ruleBody(UI_CSS, '.gn-ticket-sheet__crumb--restricted');
    const nav = ruleBody(UI_CSS, '.gn-ticket-sheet__crumbs');
    const restrictedInk = declared(restricted, 'color');
    const inheritedInk = declared(nav, 'color');
    expect(restrictedInk).toBe('var(--gn-restricted)');
    expect(inheritedInk).toBe('var(--gn-text-muted)');
    // THE PROPERTY THE SENTENCE DENIED.
    expect(restrictedInk).not.toBe(inheritedInk);
  });
});
