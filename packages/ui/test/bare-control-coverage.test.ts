import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Case `13.1143` — P1 — the controls that painted as raw user-agent chrome now
 * match a selector block of their own.
 *
 * P1 swept every static `className` literal on a
 * `<button|input|select|textarea|summary|a>` across the product and required
 * that at least one of its class tokens match a selector block in one of the
 * three stylesheets. Six controls did not, and the mechanism was one line away:
 * `apps/web/app/globals.css:84` sets `button { font: inherit }` — font ONLY, no
 * `border`, no `background`, no `padding`. Measured in a browser on the members
 * that could be reached: `button.editor-slot__submit` "Save description"
 * **136.4×29.2** and "Comment" **86.9×29.2**, each `border: 2px outset
 * rgb(0,0,0)`, `background-color: rgb(239,239,239)`, `border-radius: 0px`,
 * `padding: 1px 6px`; `button.add-rule-menu__trigger` "Add rule" **76.6×29.2**
 * the same — beside a *Publish* button reading `1px solid rgb(51,98,159)`, the
 * control in the same paint.
 *
 * **FOUR OF THE SIX ARE ASSERTED HERE AND TWO ARE NOT, and the two are a
 * measurement rather than an omission.** `gn-attachment__link` and
 * `attachment-item__name` are `<a>` elements; the UA gives an anchor no border,
 * no background and no padding, so a bare-control reset is a NO-OP on them. The
 * reset's shape is a *button*'s problem. Their ink comes from `globals.css:39`
 * and the underline that stays is the link affordance. `attachment-item__name`
 * is additionally under an explicit both-directions contract in
 * `editor.css:218` and `test/attachment-list-item.test.tsx` — giving it a box
 * rule would falsify a deliberate record to fix nothing the UA had wrong. That
 * reasoning lives in `ui.css` above the reset, in `editor.css` above its own,
 * and here; it is not carried silently.
 *
 * A source scan, not a paint: `apps/web/e2e-*` is Playwright and is not in
 * `pnpm test`, and the property at issue is which class a selector block names,
 * on which the stylesheet is the authority.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../..');

const UI_CSS = readFileSync(resolve(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
const EDITOR_CSS = readFileSync(resolve(REPO_ROOT, 'packages/editor/src/styles/editor.css'), 'utf8');
const GLOBALS_CSS = readFileSync(resolve(REPO_ROOT, 'apps/web/app/globals.css'), 'utf8');

/**
 * Comments come out before anything is searched — `ui.css` is largely prose and
 * quotes its own selectors constantly, so a class merely DISCUSSED in a
 * docblock would answer for a rule that had been deleted. This is the same
 * strip `tap-target-density.test.ts` and `colour-scan.ts` apply, for the same
 * measured reason.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const STYLESHEETS = [UI_CSS, EDITOR_CSS, GLOBALS_CSS].map(stripComments);

/**
 * Every selector this stylesheet declares, split on commas so a grouped rule
 * contributes each of its heads. Braces bound a declaration body, so `{`/`}`
 * are not selector text.
 */
function selectorHeads(css: string): string[] {
  const heads: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    const body = m[1];
    if (body === undefined) continue;
    for (const part of body.split(',')) {
      const selector = part.trim();
      if (selector !== '' && !selector.startsWith('@')) heads.push(selector);
    }
  }
  return heads;
}

const HEADS = STYLESHEETS.flatMap(selectorHeads);

/**
 * Does `className` appear as a class token in any selector head? `(?<![\w-])`
 * and `(?![\w-])` are load-bearing: without them `gn-board__empty` would be
 * satisfied by `.gn-board__empty-create` and `attachment-item__name` by
 * `.attachment-item__name-suffix`, which is the defect class this whole case is
 * about — a name that LOOKS covered.
 */
function styledSomewhere(className: string): boolean {
  const re = new RegExp(`(?<![\\w-])\\.${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
  return HEADS.some((head) => re.test(head));
}

describe('13.1143 the controls P1 found with no rule of their own now have one', () => {
  it('13.1143 the extractor is not silently empty, and it can tell both ways', () => {
    // CONTROL, FIRST, and both directions — a needle that matched nothing would
    // make every assertion below depend on a broken extractor, and a needle
    // that matched everything would make them all pass unconditionally.
    expect(HEADS.length, 'no selector heads extracted — the extractor is broken').toBeGreaterThan(600);
    expect(styledSomewhere('gn-board-card__title'), 'a class WITH a rule reads as unstyled').toBe(true);
    expect(styledSomewhere('gn-zz-no-such-class-exists'), 'the extractor matches anything').toBe(false);
    // And the boundary guard itself, since it is what stops `gn-board__empty`
    // being satisfied by `gn-board__empty-create`:
    expect(styledSomewhere('gn-board')).toBe(true);
  });

  it('13.1143 each of the four BUTTONS matches a selector block', () => {
    for (const className of [
      'gn-board__empty-create',
      'add-rule-menu__trigger',
      'editor-slot__submit',
      'evidence-picker__cancel',
    ]) {
      expect(styledSomewhere(className), `${className} still matches no selector block`).toBe(true);
    }
  });

  it('13.1143 each of the four declares the reset, in the stylesheet that owns it', () => {
    // Not just "some rule exists" — the RIGHT rule, carrying the reset. A class
    // that matched an unrelated selector would satisfy the case above and leave
    // the UA `outset` edge in place.
    const RESET = /border:\s*none/;
    const uiReset = UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '').match(
      /\.gn-board__empty-create,\s*\.add-rule-menu__trigger\s*\{([^}]*)\}/,
    );
    expect(uiReset, 'ui.css carries no grouped reset for these two').not.toBeNull();
    expect(uiReset?.[1]).toMatch(RESET);
    expect(uiReset?.[1]).toMatch(/background:\s*none/);
    expect(uiReset?.[1]).toMatch(/padding:\s*0/);

    const editorReset = stripComments(EDITOR_CSS).match(
      /\.editor-slot__submit,\s*\.evidence-picker__cancel\s*\{([^}]*)\}/,
    );
    expect(editorReset, 'editor.css carries no grouped reset for these two').not.toBeNull();
    expect(editorReset?.[1]).toMatch(RESET);
    expect(editorReset?.[1]).toMatch(/background:\s*none/);
    expect(editorReset?.[1]).toMatch(/padding:\s*0/);
  });

  it('13.1143 the editor reset stays inside that file\'s no-colour rule', () => {
    // `editor.css`'s header forbids a bare colour keyword as well as literals,
    // which is why the reset writes `background: none` rather than the
    // reviewer's `transparent`. Asserted, because "none" and "transparent" are
    // one keystroke apart in intent and a later edit would look harmless.
    const editorReset = stripComments(EDITOR_CSS).match(
      /\.editor-slot__submit,\s*\.evidence-picker__cancel\s*\{([^}]*)\}/,
    );
    expect(editorReset?.[1], 'a bare colour keyword entered editor.css').not.toMatch(
      /\b(transparent|currentcolor|white|black|red|grey|gray)\b/i,
    );
  });
});
