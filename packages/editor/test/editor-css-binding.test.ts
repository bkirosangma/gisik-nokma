import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 13.1272 / 13.1274 — THE COMPOSER CHROME IS IN THE STYLESHEET.
 *
 * ## Why this is a css-binding case and not a rendered one
 *
 * **jsdom applies no stylesheet**, so `getComputedStyle` on a footer returns the
 * UA's default and every assertion about the chrome would pass against any CSS
 * at all — including none. The chrome this task ships is *only* CSS: the markup
 * (toolbar tray, sunken body, footer row) is asserted in
 * `ticket-editor-slot.test.tsx`, and what makes it look like the prototype is
 * the file read here. The repo already keeps this split —
 * `packages/app-core/test/views/ticket-sheet-crumb-css-binding.test.tsx` and
 * the several `*-css-binding.test.tsx` suites under `packages/ui` all read a
 * stylesheet for the same reason.
 *
 * ## ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH, and that is load-bearing
 *
 * The block this task adds to `editor.css` opens with a docblock that NAMES
 * `.editor-slot__footer`, `.editor-slot__hint` and the rest, because that is
 * what a reader needs to find them. A search over the raw file would therefore
 * find the selectors in the PROSE while the rules said something else — the
 * failure this repository has recorded as *"a sweep finds the docblock naming
 * the literal first, so the check reads the prose"*. Every assertion below
 * reads comment-stripped CSS, and closes the hole in the other direction too:
 * the comment could equally name `min-height: 2.75rem` over a rule that had
 * lost it.
 */

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const EDITOR_CSS = readFileSync(resolve(TEST_DIR, '../src/styles/editor.css'), 'utf8');

/** Comments stripped FIRST — see the header. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The declarations inside `${selector} { … }`, from comment-stripped CSS. */
function ruleBody(css: string, selector: string): string {
  const bare = stripComments(css);
  const start = bare.indexOf(`${selector} {`);
  expect(start, `no rule for \`${selector}\` in packages/editor/src/styles/editor.css`).toBeGreaterThan(-1);
  const end = bare.indexOf('}', start);
  return bare.slice(start, end);
}

/** One declaration's value, or `null` when the rule does not set it. */
function declared(body: string, property: string): string | null {
  // The opening brace is an ALTERNATIVE, so the rule's first declaration is
  // visible: a helper accepting only `^` or `;` reads the first declaration of
  // every rule as absent. (The same defect was measured once already, in the
  // crumb suite this file's pattern comes from.)
  const match = new RegExp(`(?:^|[{;])\\s*${property}\\s*:\\s*([^;}]+)`).exec(body);
  return match === null ? null : match[1]!.trim();
}

describe('13.1272 editor chrome css binding', () => {
  const BARE = stripComments(EDITOR_CSS);

  /**
   * CONTROL FIRST, and deliberately FIRST. An assertion placed above a control
   * masks it: if the extraction below were broken, this file's other case would
   * still fail for its own reason and the control's verdict would never be
   * read. Run it first and it means something.
   *
   * What it guards is the hole this shape of test always has — a `ruleBody`
   * that returned the whole file would make every `toContain` below vacuous,
   * because the file does contain `min-height: 2.75rem` somewhere.
   */
  it('13.1274 CONTROL — the extracted bodies are bounded rule bodies, not the file', () => {
    const hint = ruleBody(EDITOR_CSS, '.editor-slot__hint');
    // `min-height` IS declared in this file (on the submit control) and NOT on
    // the hint — so a body that swallowed the file reports a value here.
    expect(declared(hint, 'min-height')).toBeNull();
    expect(hint.length).toBeLessThan(EDITOR_CSS.length / 10);
    // And the submit rule is a body too, not the tail of the file.
    expect(ruleBody(EDITOR_CSS, '.editor-slot__submit').length).toBeLessThan(EDITOR_CSS.length / 10);
  });

  it('declares the footer, hint and sunken body rules the slot renders', () => {
    for (const selector of ['.editor-slot {', '.editor-slot__footer {', '.editor-slot__hint {', '.editor-slot .ticket-editor__toolbar {', '.editor-slot .ticket-editor__content {']) {
      expect(BARE, selector).toContain(selector);
    }
    expect(BARE).toMatch(/\.editor-slot__submit\s*\{[^}]*min-height:\s*2\.75rem/);
  });

  /**
   * The 44px floor and the two affordances every control in this product owes
   * (workspace `CLAUDE.md`: a `min-height: 2.75rem` target, a visible
   * `:focus-visible` ring, and `cursor: pointer`). Read from the SUBMIT rule's
   * own body rather than the file, so a floor declared on some neighbouring
   * rule cannot stand in for this one.
   */
  it('the submit control carries the 44px tap target, a focus ring and a pointer cursor', () => {
    const submit = ruleBody(EDITOR_CSS, '.editor-slot__submit');
    expect(declared(submit, 'min-height')).toBe('2.75rem');
    expect(declared(submit, 'cursor')).toBe('pointer');
    expect(BARE).toMatch(/\.editor-slot__submit:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--gn-focus-ring\)/);
  });
  /**
   * 13.1275 — THE TYPING AREA IS THE FIELD (owner, 2026-09-22: "description, and
   * comment text area should also follow the same style" as `#gn-new-project-name`).
   * That input is `.gn-field__input`; the body of both composers now wears the
   * SAME class, so its coat comes from `ui.css`'s base rule and its
   * `[data-style="neo"]` override, never from values copied here. What THIS file
   * owns is the slot-scoped geometry, the wrapper going transparent (the ground
   * and shadow moved onto the body), the placeholder rule the editor never had,
   * and the focus ring on the body.
   */
  it('13.1275 the slot body carries only geometry, the wrapper carries no ground, the placeholder and the focus ring are declared', () => {
    const body = ruleBody(EDITOR_CSS, '.editor-slot .ticket-editor__content');
    expect(declared(body, 'border-radius')).toBe('0');
    // The prototype's own box, not "taller than the bare editor's 4rem floor":
    // the owner measured the built composer against the prototype on 2026-09-22
    // and the field must be the description textarea's `rows="5"` height. The
    // derivation is in 13.1314; the pin lives here with the rest of this rule.
    expect(declared(body, 'min-height')).toBe('8.375rem');
    // NO ground here: `background` and `box-shadow` are the shared field class's.
    expect(declared(body, 'background')).toBeNull();
    expect(declared(body, 'box-shadow')).toBeNull();
    const wrapper = ruleBody(EDITOR_CSS, '.editor-slot');
    expect(declared(wrapper, 'background')).toBeNull();
    expect(declared(wrapper, 'box-shadow')).toBeNull();
    expect(declared(wrapper, 'overflow')).toBe('hidden');
    // The placeholder, drawn from the attribute Tiptap's Placeholder extension writes,
    // in the ink `.gn-field__input::placeholder` uses.
    const ph = ruleBody(EDITOR_CSS, '.ticket-editor__content .is-editor-empty:first-child::before');
    expect(declared(ph, 'content')).toBe('attr(data-placeholder)');
    expect(declared(ph, 'color')).toBe('var(--gn-text-muted)');
    expect(declared(ph, 'pointer-events')).toBe('none');
    expect(BARE).toMatch(/\.editor-slot \.ticket-editor__content:focus-within\s*\{[^}]*outline:\s*2px solid var\(--gn-focus-ring\)/);
  });
});

/**
 * 13.1312 / 13.1313 / 13.1314 — THE EDITABLE NODE FILLS THE FIELD, AND THE
 * FIELD PAINTS THE ONE RING (owner, 2026-09-22: *"on focus, it's like this …
 * and the actual text area is just that area where the placeholder is"*, with
 * the prototype beside it).
 *
 * TWO MEASURED DEFECTS in the composer at `5b26f70d`, both from PR #680's
 * change — it gave the body `gn-field__input` and its `:focus-within` ring, and
 * stopped there:
 *
 *   1. **The editable node is one line tall inside a taller box.** The body
 *      declares `min-height` + `padding` and no rule anywhere in the repo styles
 *      `.ProseMirror`, so Tiptap's contenteditable is exactly one line (measured
 *      body 605×96, `.ProseMirror` 577×22). Every pixel of the box below that
 *      line is not the typing area: a click there places no caret, because
 *      ProseMirror positions from the click's coordinates inside its own node.
 *   2. **Two rings.** The body paints ours (`outline: 2px solid`); the focused
 *      contenteditable ALSO paints the browser's own (`outline: auto 1px
 *      rgb(0, 95, 204)`), because nothing removes it. That inner rectangle is
 *      what the owner's screenshot shows around the placeholder line.
 *
 * The fill is `display: flex; flex-direction: column` on the body plus
 * `flex: 1 1 auto` on the child, and the child carries `outline: none` — legal
 * ONLY because the wrapper keeps its own ring, which is why 13.1313 asserts both
 * in one `it` (see the E4-21 note there).
 */
describe('13.1312 the editable node fills the field', () => {
  const BARE = stripComments(EDITOR_CSS);

  it('13.1312 the body is a column flex container and its ProseMirror child fills it — and the inset is still there', () => {
    const body = ruleBody(EDITOR_CSS, '.editor-slot .ticket-editor__content');
    const child = ruleBody(EDITOR_CSS, '.editor-slot .ticket-editor__content > .ProseMirror');
    expect(declared(body, 'display')).toBe('flex');
    expect(declared(body, 'flex-direction')).toBe('column');
    expect(declared(child, 'flex')).toBe('1 1 auto');
    // CONTROL, same `it`: the fill must come from the child GROWING, not from
    // the box having dropped its inset. A `pad: 0` body with a stretched child
    // would satisfy every assertion above while making the field hug its text
    // and losing `.gn-field__input`'s own geometry.
    expect(declared(body, 'padding')).toBe('0.75rem 0.875rem');
  });

  it('13.1313 the child removes the UA ring AND the wrapper still declares its own — the pair, in one assertion', () => {
    const child = ruleBody(EDITOR_CSS, '.editor-slot .ticket-editor__content > .ProseMirror');
    expect(declared(child, 'outline')).toBe('none');
    // E4-21 (`packages/ui/test/components.test.tsx`) is the product's ruling on
    // this shape: `.gn-select__trigger--searchable input:focus { outline: none }`
    // removes a focus indicator that WCAG 2.2 §2.4.7 requires, and it is
    // tolerated ONLY because the WRAPPER paints a `:focus-within` ring instead.
    // The same trade is made here, so the two halves live in one assertion: the
    // inner suppression cannot be dropped without this going red, and this ring
    // cannot be dropped without the suppression surviving it — the exact
    // "removal with no replacement" state E4-21 exists to catch.
    expect(BARE).toMatch(/\.editor-slot \.ticket-editor__content:focus-within\s*\{[^}]*outline:\s*2px solid var\(--gn-focus-ring\)/);
  });

  /**
   * 13.1314 — THE TWO HEIGHTS, derived rather than invented. The prototype's
   * own textareas are the numbers the owner pointed at:
   *
   *   - description (`design-system/interactive/desktop.dc.html:1171`):
   *     `rows="5"`, `font-size:17px;line-height:22px`, `padding:12px 14px`
   *     → 5 × 22 + 2 × 12 = 134px;
   *   - comment (`:1314`): `rows="3"`, the same 17/22, `padding:11px 14px`
   *     → 3 × 22 + 2 × 11 = 88px.
   *
   * Converted at 16px with the product's global `* { box-sizing: border-box }`
   * (`apps/web/app/globals.css:5`), so `min-height` INCLUDES the padding:
   * 134px = **8.375rem**, 88px = **5.5rem**. A box-sizing change would make both
   * of these wrong together, which is why the numbers are asserted as rem.
   */
  it('13.1314 the description field is the prototype rows=5 box and the comment field is its rows=3 box', () => {
    const body = ruleBody(EDITOR_CSS, '.editor-slot .ticket-editor__content');
    const comment = ruleBody(EDITOR_CSS, '.editor-slot--comment .ticket-editor__content');
    expect(declared(body, 'min-height')).toBe('8.375rem');
    expect(declared(comment, 'min-height')).toBe('5.5rem');
    // CONTROL, same `it`: the comment rule must not have replaced the shared
    // one. If the selector above were typo'd into the body rule itself, the
    // description arm would silently take the comment's height and this case
    // would still read two values.
    expect(declared(body, 'min-height')).not.toBe(declared(comment, 'min-height'));
  });
});

/**
 * 9.272 — THE COLLAPSIBLE BLOCK'S CHROME (spec §8.4, Plan 4 Task 3).
 *
 * Same reason as every other case in this file: jsdom applies no stylesheet, so
 * a rendered assertion would pass against any CSS at all — including none. What
 * makes a collapsible LOOK like one is the border that encloses it, the pointer
 * on the summary that says the summary is the fold control, and the padding
 * that keeps the summary off its own edge.
 *
 * The edge is drawn with `currentColor` and not a token, which is this file's
 * own standing rule (`editor.css`'s header): packages/editor must not depend on
 * packages/ui, and a colour named here would also be caught by the repo's
 * colour scanner. The assertion is written against the DECLARATION rather than
 * its colour, so a later hand choosing a different inheriting ink still passes
 * — that is not the property this case is for.
 */
describe('9.272 the collapsible block is styled', () => {
  it('9.272 .editor-details carries a border, a radius and padding; its summary is the fold control', () => {
    const box = ruleBody(EDITOR_CSS, '.editor-details');
    expect(declared(box, 'border')).not.toBeNull();
    expect(declared(box, 'border-radius')).not.toBeNull();
    expect(declared(box, 'padding')).not.toBeNull();

    const summary = ruleBody(EDITOR_CSS, '.editor-details > summary');
    expect(declared(summary, 'cursor')).toBe('pointer');

    // CONTROL, same `it`: the two selectors must reach DIFFERENT rules.
    // `ruleBody` is a first-match substring search, so a docblock that merely
    // named the summary selector above the box rule — or a box rule written
    // `.editor-details > summary` by mistake — would let the summary arm read
    // the box's declarations and pass with no summary rule in the file at all.
    expect(summary).not.toBe(box);
    expect(declared(box, 'cursor')).toBeNull();
  });
});

/**
 * 9.275 — THE CODE BLOCK'S COPY BUTTON (Plan 4 Task 4). Same split as
 * everything above: jsdom applies no stylesheet, so the only place the button's
 * placement can be checked is the file. `position: relative` on the block is
 * what makes the button's `position: absolute` mean "in this block's corner"
 * rather than "in the page's", and the pair is asserted together because either
 * one alone is a placement that does not work.
 */
describe('9.275 the code block copy button is placed', () => {
  it('9.275 .editor-codeblock is a containing block and the copy button is positioned in it', () => {
    const box = ruleBody(EDITOR_CSS, '.editor-codeblock');
    expect(declared(box, 'position')).toBe('relative');

    const copy = ruleBody(EDITOR_CSS, '.editor-codeblock__copy');
    expect(declared(copy, 'position')).toBe('absolute');

    // CONTROL, same `it`: the two selectors must reach DIFFERENT rules.
    // `ruleBody` is a first-match substring search, so a block rule written
    // `.editor-codeblock__copy` by mistake would let the box arm read the
    // button's declarations and pass with no block rule in the file.
    expect(copy).not.toBe(box);
  });
});

/**
 * 9.282 — THE WIKI-LINK'S TWO RENDERINGS (spec §8.5, Plan 4 Task 5).
 *
 * `renderNode`/the node view produce either an `<a>` or a `--missing` pill,
 * and the whole point of the pill is that a reader can TELL. jsdom applies no
 * stylesheet, so the only place that difference can be checked is this file.
 *
 * The distinction is drawn with `text-decoration`, not with an ink, and that is
 * this stylesheet's own rule rather than a preference: `editor.css`'s header
 * forbids every colour form — hex, function and bare keyword — and
 * packages/editor must not reach packages/ui's tokens. The assertion is on the
 * declaration and on the two rules really differing, never on a colour.
 */
describe('9.282 the wiki-link and its missing pill are styled apart', () => {
  it('9.282 .editor-wikilink has a rule and .editor-wikilink--missing reads differently', () => {
    const link = ruleBody(EDITOR_CSS, '.editor-wikilink');
    const missing = ruleBody(EDITOR_CSS, '.editor-wikilink--missing');
    // CONTROL, first: the two selectors must reach DIFFERENT rules. `ruleBody`
    // is a first-match substring search, so a missing-pill rule absent from the
    // file would let this arm read the base rule and pass with no pill styling
    // at all — which is the mutation this case names.
    expect(missing).not.toBe(link);
    expect(declared(missing, 'text-decoration')).not.toBeNull();
    // …and the base rule does NOT carry it, so the two renderings differ by a
    // declaration rather than by the pill merely repeating the link's rule.
    expect(declared(link, 'text-decoration')).toBeNull();
  });
});

/**
 * 9.288–9.290 — THE READING RAIL'S STYLES (Plan 4 Task 7). Same split as
 * everything above: the markup is asserted in `reading-toc.test.tsx`, and what
 * makes the rail READ as an outline is the per-level indent and the weight on
 * the active entry — neither of which jsdom can report.
 */
describe('9.290 the reading rail is styled', () => {
  it('9.290 each heading level is indented, and the active entry is marked by weight', () => {
    const h1 = ruleBody(EDITOR_CSS, '.reading-toc__item--h1 .reading-toc__link');
    const h2 = ruleBody(EDITOR_CSS, '.reading-toc__item--h2 .reading-toc__link');
    const h3 = ruleBody(EDITOR_CSS, '.reading-toc__item--h3 .reading-toc__link');
    expect(declared(h1, 'padding-left')).toBe('0');
    expect(declared(h2, 'padding-left')).toBe('1rem');
    expect(declared(h3, 'padding-left')).toBe('2rem');

    // The active entry is NOT colour: this stylesheet may not name one, and
    // colour alone is never the only indicator.
    const active = ruleBody(EDITOR_CSS, ".reading-toc__link[aria-current='true']");
    expect(declared(active, 'font-weight')).toBe('600');
  });
});

/**
 * 9.292 — THE NOTE MODE'S SAVE STATE HAS A RULE (Plan 4 Task 8), which it did
 * not until the plan-close audit listed the `editor-slot__*` classes DECLARED
 * against those EMITTED: three declared, four emitted, and mine was the fourth.
 *
 * The assertion is the SIZE, because that is the declaration that changes what a
 * reader sees: `.editor-slot__hint` in the same row is 0.75rem, so a span with
 * no rule draws at the page's size and the row shows two.
 */
describe('9.292 the save state is styled with its row', () => {
  it('9.292 .editor-slot__save-state takes the hint’s size and not its flex or opacity', () => {
    const state = ruleBody(EDITOR_CSS, '.editor-slot__save-state');
    expect(declared(state, 'font-size')).toBe('0.75rem');
    expect(declared(state, 'line-height')).toBe('1rem');
    // CONTROL, same `it`: it must NOT have taken the hint's two other
    // declarations. `flex: 1` would make the state grow and push the row's
    // right-hand control out of place, and `opacity: 0.7` would mark a
    // save-state warning as a whisper.
    expect(declared(state, 'flex')).toBeNull();
    expect(declared(state, 'opacity')).toBeNull();
  });
});
