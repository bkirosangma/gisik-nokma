import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { buildEditorExtensions, EditorToolbar, PHONE_TOOLBAR_QUERY } from '@gisik-nokma/editor';
import { parseRules, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * Case 21.137 (§21.9) — the Notes toolbar is at most TWO rows at ≤40rem (plan 21.130 / 21.133; owner,
 * 2026-10-01). jsdom has no layout, so the row count is a MODEL: the real bar (rendered phone-side from
 * the real component) packed greedily by the width its CSS declares — group by group, wrapping at the
 * toolbar's content box. The model is anchored to a browser measurement: the same packing of the
 * PRE-FIX bar (every tool, the dividers) gives 5 rows, which is what T13 measured (256px) at 360 and
 * 390 on the dev stack; the fixed bar was measured at 2 rows / 106px at 360 in hig, minimal and neo.
 */
const PHONE = '@media (max-width: 40rem)';
const globals = readGlobalsCss();
const editorCss = readFileSync(resolve(__dirname, '../../../packages/editor/src/styles/editor.css'), 'utf8');

/** Measured in the browser at 360px (T13 / this task): the notes toolbar's border box. */
const TOOLBAR_AT_360 = 336;
/** Measured: the heading `<select>` ("Paragraph") at the phone's font, in hig, minimal and neo alike. */
const SELECT_WIDTH = 97.5;

const px = (value: string | null, fallback: number): number => {
  if (value === null) return fallback;
  const rem = /^([\d.]+)rem$/.exec(value.trim());
  if (rem !== null) return Number(rem[1]) * 16;
  const pixels = /^([\d.]+)px$/.exec(value.trim());
  return pixels === null ? fallback : Number(pixels[1]);
};

function toolbarRules() {
  const phoneArm = (selector: string) => ruleExactly(globals, selector, PHONE);
  const gap = px(valueOf(ruleExactly(editorCss, '.ticket-editor__toolbar'), 'gap'), 0);
  const groupGap = px(valueOf(ruleExactly(editorCss, '.ticket-editor__tool-group'), 'gap'), 0);
  const padding = (valueOf(ruleExactly(editorCss, '.ticket-editor__toolbar'), 'padding') ?? '').split(/\s+/).map((part) => px(part, 0));
  const dividerBase = ruleExactly(editorCss, '.ticket-editor__tool-divider');
  const dividerHidden = valueOf(phoneArm('.gn-notes .ticket-editor__tool-divider'), 'display') === 'none';
  const margin = (valueOf(dividerBase, 'margin') ?? '0 0').split(/\s+/).map((part) => px(part, 0));
  return {
    gap,
    groupGap,
    sidePadding: (padding[1] ?? 0) * 2,
    toolWidth: px(valueOf(phoneArm('.gn-notes .ticket-editor__tool'), 'min-width'), 0),
    dividerWidth: dividerHidden ? 0 : px(valueOf(dividerBase, 'width'), 0) + (margin[1] ?? 0) * 2 + groupGap,
  };
}

/** Rows the bar packs into, from the real DOM's groups and the CSS-declared widths. */
function rowsOf(toolbar: Element, width: number, rules: ReturnType<typeof toolbarRules>): number {
  const room = width - rules.sidePadding;
  const items = [...toolbar.children].filter((child) => child.matches('.ticket-editor__tool-group')).map((group) => {
    const tools = group.querySelectorAll('button.ticket-editor__tool').length;
    const select = group.querySelector('select') === null ? 0 : SELECT_WIDTH;
    const parts = tools + (select === 0 ? 0 : 1);
    const divider = group.querySelector('.ticket-editor__tool-divider') === null ? 0 : rules.dividerWidth;
    return tools * rules.toolWidth + select + Math.max(0, parts - 1) * rules.groupGap + divider;
  });
  let rows = 1;
  let used = 0;
  for (const item of items) {
    const need = used === 0 ? item : used + rules.gap + item;
    if (used !== 0 && need > room) {
      rows += 1;
      used = item;
    } else used = need;
    // A group wider than the row wraps inside itself (the phone arm sets `flex-wrap: wrap` on groups).
    // Its box is then as wide as the row, so the next group starts a new one.
    if (used > room) {
      rows += Math.ceil(used / room) - 1;
      used = room;
    }
  }
  return rows;
}

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
    const rules = toolbarRules();
    // The phone rules the model reads are the ones declared: 44px tools, the dividers dropped.
    expect(rules.toolWidth).toBe(44);
    expect(rules.dividerWidth).toBe(0);
    const phone = mountToolbar(true);
    // The toolbar is the viewport less the page's 12px side gutters (336 at 360); wider phones only add room.
    for (const viewport of [360, 375, 390, 412, 466]) {
      expect(rowsOf(phone.toolbar, viewport - 24, rules), `phone bar at viewport ${viewport}`).toBeLessThanOrEqual(2);
    }
    expect(rowsOf(phone.toolbar, TOOLBAR_AT_360, rules)).toBe(2);
    phone.editor.destroy();
    phone.view.unmount();

    // CONTROL (same `it`): the identical model on the desktop bar (all seventeen tools + select, the dividers
    // kept as the pre-fix sheet drew them) gives the FIVE rows T13 measured — so the model can fail.
    const desktop = mountToolbar(false);
    const old = { ...rules, dividerWidth: 5 + rules.groupGap };
    expect(rowsOf(desktop.toolbar, TOOLBAR_AT_360, old)).toBe(5);
    desktop.editor.destroy();
    desktop.view.unmount();
  });

  it('21.137 the phone arm drops the dividers under .gn-notes, after nothing else, and the group still wraps', () => {
    const arm = parseRules(globals).filter((rule) => rule.atRule === PHONE && rule.selectors.some((selector) => /ticket-editor__tool-divider/.test(selector)));
    expect(arm.map((rule) => rule.selectors.join(', '))).toEqual(['.gn-notes .ticket-editor__tool-divider']);
    expect(valueOf(arm[0]?.body ?? '', 'display')).toBe('none');
    // CONTROL: the base divider is drawn (so `none` is a change), and the tray is a full-width wrapping row.
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool-divider'), 'display')).toBeNull();
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tray'), 'flex-basis')).toBe('100%');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tray'), 'flex-wrap')).toBe('wrap');
  });
});
