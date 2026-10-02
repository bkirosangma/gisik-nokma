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
 * toolbar bases live in `editor.css`, and (AMENDED 2026-10-02, AUDIT BRD-08, cases 21.235–21.237) so do
 * the phone rules for them: `editor.css` has its own ≤40rem arm after its bases, for EVERY host of the editor.
 * They are no longer `.gn-notes …` rules in `globals.css`; this file asserts the Notes arm no longer carries them.
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
/**
 * Index of the LAST rule under `atRule` that names every one of `selectors` — a base rule may be split
 * across the file, and the cascade lets the LAST one win, so "after the base" means after THAT one.
 */
function lastBase(css: string, selectors: string | readonly string[], atRule: string | null): number {
  const wanted = typeof selectors === 'string' ? [selectors] : [...selectors];
  let found = -1;
  parseRules(css).forEach((rule, index) => {
    if (rule.atRule === atRule && wanted.every((selector) => rule.selectors.includes(selector))) found = index;
  });
  if (found === -1) throw new Error(`no rule names ${wanted.join(', ')} under ${atRule ?? 'top level'}`);
  return found;
}
/** The phone rule for `phoneSelector` comes AFTER the LAST (top-level or tablet) base rule `baseSelector`. */
function after(css: string, baseSelector: string | readonly string[], baseAt: string | null, phoneSelector: string | readonly string[] = baseSelector): boolean {
  return lastBase(css, baseSelector, baseAt) < position(css, phoneSelector, PHONE);
}
/** The property names a declaration block sets, in order. */
function propertiesOf(body: string): string[] {
  return [...body.matchAll(/(?:^|;|\{)\s*([a-z-]+)\s*:/g)].map((hit) => hit[1] ?? '');
}
/** Every declaration block under the phone arm that names `selector`, joined. */
function phoneBodies(css: string, selector: string): string {
  return rulesNaming(css, selector)
    .filter((rule) => rule.atRule === PHONE)
    .map((rule) => rule.body)
    .join('\n');
}
describe('21.130 Notes on a phone', () => {
  it('21.130 the tree toggle is a 44px target after its tablet rule, the document drops its side padding, and the toolbar controls are 44px (the editor.css phone arm, after its bases); the split scroll stays above 60rem', () => {
    // The tree is the existing toggle panel below 60rem — hidden unless open, opened from the toggle.
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree-toggle'), 'display')).toBe('none');
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree-toggle', TABLET), 'display')).toBe('inline-flex');
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree--drawer', TABLET), 'display')).toBe('none');
    expect(valueOf(ruleExactly(globals, ".gn-notes__tree--drawer[data-open='true']", TABLET), 'display')).toBe('block');
    // …and the toggle itself is a real target, AFTER both rules that style it.
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree-toggle', PHONE), 'min-height')).toBe('2.75rem');
    expect(valueOf(ruleExactly(globals, '.gn-notes__tree-toggle', PHONE), 'padding')).toBe('0 1rem');
    expect(after(globals, '.gn-notes__tree-toggle', null)).toBe(true);
    expect(after(globals, '.gn-notes__tree-toggle', TABLET)).toBe(true);

    // The document fills the width: the clamp()'s 1rem side padding is dropped, after its base.
    const documentRule = ruleExactly(globals, '.gn-notes__document', PHONE);
    expect(valueOf(documentRule, 'padding-left')).toBe('0');
    expect(valueOf(documentRule, 'padding-right')).toBe('0');
    expect(after(globals, '.gn-notes__document', null)).toBe(true);

    // The editor toolbar: every control 44px, the cluster wraps rather than overflowing 358px — from editor.css's OWN
    // phone arm (AMENDED 2026-10-02, BRD-08), which is after its bases and covers every host, not only `.gn-notes`.
    expect(valueOf(ruleExactly(editor, '.ticket-editor__tool', PHONE), 'min-height')).toBe('2.75rem');
    expect(valueOf(ruleExactly(editor, '.ticket-editor__tool', PHONE), 'min-width')).toBe('2.75rem');
    expect(valueOf(ruleExactly(editor, '.ticket-editor__heading-select', PHONE), 'min-height')).toBe('2.75rem');
    // AMENDED 2026-10-02 (smoothness G-7, the 25.40 block): the phone group no longer wraps — the bar is ONE row that scrolls, with
    // the overflow tools in the More sheet. CONTROL below: the base toolbar still wraps (the desktop and tablet row).
    expect(valueOf(ruleExactly(editor, '.ticket-editor__tool-group', PHONE), 'flex-wrap')).toBe('nowrap');
    expect(after(editor, '.ticket-editor__tool', null, '.ticket-editor__tool')).toBe(true);
    // The toolbar row itself already wraps in the editor sheet (the base the phone rules rely on).
    expect(valueOf(ruleExactly(editor, '.ticket-editor__toolbar'), 'flex-wrap')).toBe('wrap');

    // The notes phone arm is EXACTLY these three rules (AMENDED 2026-10-02, BRD-08: the four `.gn-notes .ticket-editor__*`
    // rules — tool, heading select, group wrap, divider — moved to editor.css's own arm, cases 21.235–21.237), each setting
    // EXACTLY these properties, in this order — so an added rule (`.gn-notes__editor { overflow-y: auto }`,
    // `.gn-notes__tree--drawer { overflow-y: auto }`, `.gn-notes__body { flex: 1 }`), a re-scoped toolbar rule or an added
    // declaration reddens here; 18.483 once ran a regex over the whole block and this restores that strength over the phone
    // arm (review of 6ad9f916, survivors 9–11).
    const armRules = parseRules(globals).filter((rule) => rule.atRule === PHONE && rule.selectors.some((selector) => /gn-note|ticket-editor/.test(selector)));
    expect(armRules.map((rule) => rule.selectors.join(', '))).toEqual([
      '.gn-notes__tree-toggle',
      '.gn-notes__document',
      '.gn-notes__title',
    ]);
    expect(armRules.map((rule) => propertiesOf(rule.body))).toEqual([
      ['min-height', 'padding'],
      ['padding-left', 'padding-right'],
      ['overflow', 'text-overflow', 'white-space'],
    ]);

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
    // `top`/`right` reset: without them the in-flow menu inherits `.gn-card-menu`'s 0.5rem corner offsets.
    expect(valueOf(inline, 'top')).toBe('auto');
    expect(valueOf(inline, 'right')).toBe('auto');
    expect(lastBase(globals, '.gn-card-menu', null)).toBeLessThan(position(globals, '.gn-card-menu--inline', null));
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
    expect(valueOf(rows, 'align-items')).toBe('center');
    expect(valueOf(ruleExactly(ui, '.gn-my-work__title', PHONE), 'min-height')).toBe('2.75rem');
    expect(after(ui, '.gn-my-work', null)).toBe(true);
    expect(after(ui, ['.gn-my-work__item', '.gn-my-work__contested'], null)).toBe(true);
    expect(after(ui, '.gn-my-work__title', null)).toBe(true);
    // The strip's rows and My work's rows wrap their chip / project / due / reason — and no phone rule turns that off.
    // (The strip's own row is lifted by its ONE phone rule, case 21.134 below.)
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

describe('21.134 the attention strip on a phone', () => {
  it('21.134 every clickable attention-strip row is at least 2.75rem (44px) tall at ≤40rem — measured as the DECLARED min-height — in ONE phone rule after the last base; desktop keeps its current row', () => {
    // MEASURE: the declared `min-height` of the row. The row is `box-sizing: border-box`, so its 0.4375rem
    // padding sits INSIDE the floor and the row is exactly 44px when its content is shorter — min-height alone
    // is the figure, not min-height + padding.
    const row = ruleExactly(ui, '.gn-attention__item', PHONE);
    const floor = valueOf(row, 'min-height') ?? '';
    expect(floor).toMatch(/^[\d.]+rem$/);
    expect(Number.parseFloat(floor)).toBeGreaterThanOrEqual(2.75);
    expect(valueOf(row, 'align-items')).toBe('center'); // content centred in the taller row, as My work's rows
    expect(propertiesOf(row)).toEqual(['min-height', 'align-items']); // no other declaration: the ::after click surface and the 8pt gap stay as the base draws them
    expect(after(ui, '.gn-attention__item', null)).toBe(true);

    // CONTROL — desktop keeps today's row: 24px floor, baseline alignment, wrapping, 7px of padding, the 4px rhythm
    // between rows, and the title's stretched click surface.
    const base = ruleExactly(ui, '.gn-attention__item');
    expect(valueOf(base, 'min-height')).toBe('1.5rem');
    expect(valueOf(base, 'align-items')).toBe('baseline');
    expect(valueOf(base, 'flex-wrap')).toBe('wrap');
    expect(valueOf(base, 'padding')).toBe('0.4375rem 0');
    expect(valueOf(ruleExactly(ui, '.gn-attention__items'), 'gap')).toBe('0.25rem');
    expect(valueOf(ruleExactly(ui, '.gn-attention__title::after'), 'inset')).toBe('0');
  });
});
