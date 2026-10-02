import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { buildEditorExtensions, EditorToolbar, PHONE_TOOLBAR_QUERY } from '@gisik-nokma/editor';
import { parseRules, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { PHONE, pack, packingRules, readEditorCss } from './helpers/toolbar-packing.js';

/**
 * Case 21.137 (§21.9) — the Notes toolbar is at most TWO rows at ≤40rem (plan 21.130 / 21.133; owner,
 * 2026-10-01). jsdom has no layout, so the row count is a MODEL: the real bar (rendered phone-side from
 * the real component) packed greedily by the width its CSS declares — group by group, wrapping at the
 * toolbar's content box (`helpers/toolbar-packing.ts`). The model is anchored to a browser measurement: the
 * same packing of the PRE-FIX bar (every tool, the dividers) gives 5 rows, which is what T13 measured (256px)
 * at 360 and 390 on the dev stack; the fixed bar was measured at 2 rows / 106px at 360 in hig, minimal and neo.
 *
 * AMENDED 2026-10-02 (AUDIT BRD-08): the phone rules the model reads moved from `.gn-notes .ticket-editor__*` in
 * `globals.css` to `editor.css`'s own ≤40rem arm (cases 21.235–21.237), so the sheet and the dialog get them too.
 */
const editorCss = readEditorCss();

/** Measured in the browser at 360px (T13 / this task): the notes toolbar's border box (the page's 12px gutters). */
const TOOLBAR_AT_360 = 336;

function stubMatchMedia(phone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query === PHONE_TOOLBAR_QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function mountToolbar(phone: boolean) {
  stubMatchMedia(phone);
  const editor = new Editor({ extensions: buildEditorExtensions(), content: '<p>x</p>' });
  const view = render(<EditorToolbar editor={editor} editable platform="other" />);
  return { view, toolbar: view.container.querySelector('.ticket-editor__toolbar') as Element, editor };
}

afterEach(() => vi.unstubAllGlobals());

describe('21.137 at ≤40rem the notes toolbar packs into at most two rows at 360px', () => {
  it('21.137 the phone bar is two rows at 360 and 390; the pre-fix bar (every tool, dividers) is five', () => {
    const rules = packingRules(editorCss, { phone: true });
    // The phone rules the model reads are the ones declared: 44px tools, the dividers dropped.
    expect(rules.toolWidth).toBe(44);
    expect(rules.dividerWidth).toBe(0);
    const phone = mountToolbar(true);
    // The toolbar is the viewport less the page's 12px side gutters (336 at 360); wider phones only add room.
    for (const viewport of [360, 375, 390, 412, 466]) {
      expect(pack(phone.toolbar, viewport - 24, rules).rows, `phone bar at viewport ${viewport}`).toBeLessThanOrEqual(2);
    }
    // AMENDED 2026-10-02 (G-7): the row count is no longer the contract: the phone bar is ONE row that scrolls sideways
    // (case 25.401), so the model's exact `2` at 360 is dropped and its `≤ 2` bound above stays as a backstop.
    expect(pack(phone.toolbar, TOOLBAR_AT_360, rules).rows).toBeLessThanOrEqual(2);
    phone.editor.destroy();
    phone.view.unmount();

    // CONTROL (same `it`): the identical model on the desktop bar (all seventeen tools + select, the dividers
    // kept as the pre-fix sheet drew them) gives the FIVE rows T13 measured — so the model can fail.
    const desktop = mountToolbar(false);
    const old = { ...rules, dividerWidth: 5 + rules.groupGap };
    expect(pack(desktop.toolbar, TOOLBAR_AT_360, old).rows).toBe(5);
    desktop.editor.destroy();
    desktop.view.unmount();
  });

  it('21.137 the phone arm drops the dividers (in editor.css, unscoped); AMENDED by G-7: the group no longer wraps and the tray rule is gone', () => {
    const arm = parseRules(editorCss).filter((rule) => rule.atRule === PHONE && rule.selectors.some((selector) => /ticket-editor__tool-divider/.test(selector)));
    expect(arm.map((rule) => rule.selectors.join(', '))).toEqual(['.ticket-editor__tool-divider']);
    expect(valueOf(arm[0]?.body ?? '', 'display')).toBe('none');
    // CONTROL: the base divider is drawn (so `none` is a change); the old tray (a full-width wrapping row) is gone, and the
    // group's phone rule is the one-row `nowrap` (25.401) while its base still wraps for the desktop.
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool-divider'), 'display')).toBeNull();
    expect(parseRules(editorCss).filter((rule) => rule.selectors.some((selector) => selector.includes('ticket-editor__tray')))).toEqual([]);
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool-group', PHONE), 'flex-wrap')).toBe('nowrap');
  });
});
