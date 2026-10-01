import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * The web app on phones, Plan Task 9 — cases 21.130–21.132 (§21.9): Notes, a note's page, My work at
 * ≤40rem. (21.131's markup half — Copy / History / Delete behind a "⋯" — is `note-byline-phone.test.tsx`;
 * 21.133, typing a note with the keyboard up, is the controller's browser pass and stays 🧪.)
 *
 * Every phone rule is read from the ONE `@media (max-width: 40rem)` arm AND must come after the base
 * rule it overrides — `after()` reads source order from `parseRules`, and only compares two rules of
 * the SAME sheet (order across `ui.css`, `globals.css` and `editor.css` is the bundler's). The editor's
 * toolbar bases live in `editor.css`, so the phone rules for them are scoped under `.gn-notes__editor`
 * and win on specificity instead; `scopedOver()` asserts exactly that shape.
 */
const PHONE = '@media (max-width: 40rem)';
const TABLET = '@media (max-width: 60rem)';
const SPLIT = '@media (width > 60rem)';
const globals = readGlobalsCss();
const ui = readUiCss();
const editor = readFileSync(resolve(__dirname, '../../../packages/editor/src/styles/editor.css'), 'utf8');

const key = (selectors: string | readonly string[]): string => (typeof selectors === 'string' ? selectors : selectors.join(', '));
/** Position of the one rule whose selector list is `selectors` under `atRule` in the sheet's source order. */
function position(css: string, selectors: string | readonly string[], atRule: string | null): number {
  const wanted = key(selectors);
  const index = parseRules(css).findIndex((rule) => rule.atRule === atRule && rule.selectors.join(', ') === wanted);
  if (index === -1) throw new Error(`no rule "${wanted}" under ${atRule ?? 'top level'}`);
  return index;
}
/** The phone rule for `phoneSelector` comes AFTER the (top-level or tablet) base rule `baseSelector`. */
function after(css: string, baseSelector: string | readonly string[], baseAt: string | null, phoneSelector: string | readonly string[] = baseSelector): boolean {
  return position(css, baseSelector, baseAt) < position(css, phoneSelector, PHONE);
}
/** Every declaration block under the phone arm that names `selector`, joined. */
function phoneBodies(css: string, selector: string): string {
  return rulesNaming(css, selector)
    .filter((rule) => rule.atRule === PHONE)
    .map((rule) => rule.body)
    .join('\n');
}
/** A phone rule scoped under `.gn-notes__editor` outranks the editor sheet's single-class base. */
function scopedOver(base: string): string {
  const scoped = `.gn-notes__editor ${base}`;
  expect(position(globals, scoped, PHONE), `${scoped} must sit under the phone arm`).toBeGreaterThanOrEqual(0);
  return ruleExactly(globals, scoped, PHONE);
}

describe('21.130 Notes on a phone', () => {
  it('21.130 the tree toggle is a 44px target after its tablet rule, the document drops its side padding, and the toolbar controls are 44px (scoped over editor.css); the split scroll stays above 60rem', () => {
    // The tree is the existing toggle panel below 60rem — hidden unless open, opened from the toggle.
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree-toggle'), 'display')).toBe('none');
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree-toggle', TABLET), 'display')).toBe('inline-flex');
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree--drawer', TABLET), 'display')).toBe('none');
    expect(valueOf(ruleExactly(globals, ".gn-notes__tree--drawer[data-open='true']", TABLET), 'display')).toBe('block');
    // …and the toggle itself is a real target, AFTER both rules that style it.
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree-toggle', PHONE), 'min-height')).toBe('2.75rem');
    expect(after(globals, '.gn-notes__tree-toggle', null)).toBe(true);
    expect(after(globals, '.gn-notes__tree-toggle', TABLET)).toBe(true);

    // The document fills the width: the clamp()'s 1rem side padding is dropped, after its base.
    const documentRule = ruleExactly(globals, '.gn-notes__document', PHONE);
    expect(valueOf(documentRule, 'padding-left')).toBe('0');
    expect(valueOf(documentRule, 'padding-right')).toBe('0');
    expect(after(globals, '.gn-notes__document', null)).toBe(true);

    // The editor toolbar: every control 44px, the cluster wraps rather than overflowing 358px.
    expect(valueOf(scopedOver('.ticket-editor__tool'), 'min-height')).toBe('2.75rem');
    expect(valueOf(scopedOver('.ticket-editor__tool'), 'min-width')).toBe('2.75rem');
    expect(valueOf(scopedOver('.ticket-editor__heading-select'), 'min-height')).toBe('2.75rem');
    expect(valueOf(scopedOver('.ticket-editor__tool-group'), 'flex-wrap')).toBe('wrap');
    expect(after(globals, '.gn-notes__editor', null, '.gn-notes__editor .ticket-editor__tool')).toBe(true);
    // The toolbar row itself already wraps in the editor sheet (the base the phone rules rely on).
    expect(valueOf(ruleExactly(editor, '.ticket-editor__toolbar'), 'flex-wrap')).toBe('wrap');

    // CONTROL — the desktop toolbar keeps its 32px controls and the base group does not wrap.
    expect(valueOf(ruleExactly(editor, '.ticket-editor__tool'), 'min-height')).toBe('32px');
    expect(valueOf(ruleExactly(editor, '.ticket-editor__heading-select'), 'min-height')).toBe('32px');
    expect(valueOf(ruleExactly(editor, '.ticket-editor__tool-group'), 'flex-wrap')).toBeNull();

    // CONTROL — the split scroll (#828/#830) is the EXACT complement of the tablet arm, and no phone
    // rule touches the heights or scrollers it sets.
    expect(valueOf(ruleExactly(globals, '.gn-notes', SPLIT), 'height')).toBe('calc(100dvh - var(--app-nav-offset))');
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree', SPLIT), 'overflow-y')).toBe('auto');
    expect(valueOf(ruleExactly(globals, '.gn-notes__document', SPLIT), 'overflow-y')).toBe('auto');
    for (const selector of ['.gn-notes', '.gn-notes__body', '.gn-notes__tree', '.gn-notes__document']) {
      expect(phoneBodies(globals, selector), `${selector} on a phone`).not.toMatch(/overflow|height/);
    }
  });
});

describe('21.131 a note\'s page on a phone', () => {
  it('21.131 the title is one line that ellipsises (after its base) and the byline\'s "⋯" menu sits in the row; desktop keeps the inline actions\' own rule', () => {
    const title = ruleExactly(globals, '.gn-notes__title', PHONE);
    expect(valueOf(title, 'white-space')).toBe('nowrap');
    expect(valueOf(title, 'overflow')).toBe('hidden');
    expect(valueOf(title, 'text-overflow')).toBe('ellipsis');
    expect(after(globals, '.gn-notes__title', null)).toBe(true);

    // The menu is the workspace card's own, placed in flow instead of a card corner: the modifier follows the base.
    const inline = ruleExactly(globals, '.gn-card-menu--inline');
    expect(valueOf(inline, 'position')).toBe('relative');
    expect(position(globals, '.gn-card-menu', null)).toBeLessThan(position(globals, '.gn-card-menu--inline', null));
    // Its trigger is already a 44px target (the card menu's rule; the byline reuses the class).
    expect(valueOf(ruleExactly(globals, '.gn-card-menu__trigger'), 'min-height')).toBe('2.75rem');

    // CONTROL — the title carries no clipping outside the phone arm, so desktop titles wrap as before,
    // and the byline's actions keep their own base rule (pushed to the row's end).
    expect(valueOf(ruleExactly(globals, '.gn-notes__title'), 'white-space')).toBeNull();
    expect(valueOf(ruleExactly(globals, '.gn-card-menu'), 'position')).toBe('absolute');
    expect(valueOf(ruleExactly(globals, '.gn-notes__byline-actions'), 'margin-left')).toBe('auto');
  });
});

describe('21.132 My work on a phone', () => {
  it('21.132 the sections are one column, the My work rows and titles are 44px targets after their base rules, and both lists keep wrapping; desktop is unchanged', () => {
    expect(valueOf(ruleExactly(ui, '.gn-my-work', PHONE), 'flex-direction')).toBe('column');
    const rows = ruleExactly(ui, ['.gn-my-work__item', '.gn-my-work__contested'], PHONE);
    expect(valueOf(rows, 'min-height')).toBe('2.75rem');
    expect(valueOf(ruleExactly(ui, '.gn-my-work__title', PHONE), 'min-height')).toBe('2.75rem');
    expect(after(ui, '.gn-my-work', null)).toBe(true);
    expect(after(ui, ['.gn-my-work__item', '.gn-my-work__contested'], null)).toBe(true);
    expect(after(ui, '.gn-my-work__title', null)).toBe(true);
    // The strip's rows and My work's rows wrap their chip / project / due / reason — and no phone rule turns that off.
    // (The strip's own rows stay as the base draws them: 13.893 forbids a second `.gn-attention*` rule, so there is none here.)
    expect(valueOf(ruleExactly(ui, '.gn-attention__item'), 'flex-wrap')).toBe('wrap');
    expect(valueOf(ruleExactly(ui, ['.gn-my-work__item', '.gn-my-work__contested']), 'flex-wrap')).toBe('wrap');
    for (const selector of ['.gn-attention__item', '.gn-my-work__item', '.gn-my-work__contested', '.gn-my-work']) {
      expect(phoneBodies(ui, selector), `${selector} on a phone`).not.toMatch(/nowrap|grid-template-columns|flex-direction:\s*row/);
    }

    // CONTROL — desktop keeps the dense list: the base rows are not 44px and the base is still one column.
    expect(valueOf(ruleExactly(ui, '.gn-attention__item'), 'min-height')).toBe('1.5rem');
    expect(valueOf(ruleExactly(ui, '.gn-my-work__title'), 'min-height')).toBe('1.5rem');
    expect(valueOf(ruleExactly(ui, '.gn-my-work'), 'flex-direction')).toBe('column');
  });
});
