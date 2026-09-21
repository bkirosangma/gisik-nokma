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
});
