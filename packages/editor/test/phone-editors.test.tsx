import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { TicketEditor, type TicketEditorProps } from '../src/components/TicketEditor.js';
import {
  TicketEditorSlot,
  type EditorSlotUpload,
  type TicketEditorSlotProps,
} from '../src/components/TicketEditorSlot.js';
import { PHONE_TOOLBAR_QUERY, PHONE_VISIBLE_TOOLS } from '../src/components/EditorToolbar.js';
import type { EditorSubmission } from '../src/attachments/compose-editor-submission.js';
import type { DocJson } from '../src/doc.js';
import { ruleExactly, valueOf } from '../../ui/test/helpers/css-rules.js';
import { SHADOW_REACH_VARIABLE, shadowReachOf } from '../../ui/src/tokens.js';

// Smoothness add-on G-7 (owner 2026-10-02, "all 5 in"): the phone editors. Cases 25.400-25.414.
//   1 unboxed long text · 2 slimmer comment boxes · 3 one docked toolbar row · 4 reordered tools · 5 More as a sheet.
// PHONES ONLY (<= 40rem): every case that pins a phone behaviour pairs it with the desktop mount as its control.

const DOC: DocJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the description of it' }] }],
};

const UPLOADED: EditorSlotUpload = {
  attachmentId: '01J9GATA000000000000000000',
  url: '/v1/attachments/01J9GATA000000000000000000',
  mime: 'image/png',
  filename: 'a.png',
  size: 1,
  sha256: 'd'.repeat(64),
};

/** The phone bar, left to right (the heading select sits after the task list). */
const BAR_ORDER = ['Bold', 'Italic', 'Bullet list', 'Task item', 'Heading level', 'Link', 'Insert ticket', 'Insert note'];
/** What the More sheet holds, in the brief's order: every tool that is not on the bar. */
const SHEET_NAMES = [
  'Undo',
  'Redo',
  'Numbered list',
  'Strikethrough',
  'Code',
  'Quote',
  'Code block',
  'Collapsible',
  'Horizontal rule',
  'Insert table',
];
const ALL_DESKTOP = [
  'Undo',
  'Redo',
  'Bold',
  'Italic',
  'Strikethrough',
  'Code',
  'Link',
  'Bullet list',
  'Numbered list',
  'Quote',
  'Task item',
  'Code block',
  'Collapsible',
  'Horizontal rule',
  'Insert table',
  'Insert note',
  'Insert ticket',
];

function stubPhone(phone: boolean, viewport?: { height: number; offsetTop?: number }): EventTarget & { height: number; offsetTop: number } {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query === PHONE_TOOLBAR_QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  // jsdom has no visualViewport: an EventTarget with the three numbers the bar reads.
  const vv = Object.assign(new EventTarget(), {
    height: viewport?.height ?? 844,
    offsetTop: viewport?.offsetTop ?? 0,
    offsetLeft: 0,
    width: 390,
    scale: 1,
  });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  return vv;
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'visualViewport');
  Reflect.deleteProperty(window, 'innerHeight');
  document.body.innerHTML = '';
});

function editorProps(overrides: Partial<TicketEditorProps> = {}): TicketEditorProps {
  return { queryUsers: async () => [], uploadAttachment: vi.fn(), onAttachmentAdded: vi.fn(), ...overrides };
}

async function mountEditor(phone: boolean, viewport?: { height: number; offsetTop?: number }) {
  const vv = stubPhone(phone, viewport);
  const editorRef: React.MutableRefObject<Editor | null> = { current: null };
  const ready = vi.fn();
  const view = render(<TicketEditor {...editorProps()} editorRef={editorRef} onEditorReady={ready} initialDoc={DOC} />);
  await vi.waitFor(() => {
    expect(ready).toHaveBeenCalled();
    expect(editorRef.current).not.toBeNull();
  });
  return { view, vv, editor: editorRef.current as Editor };
}

function slotProps(overrides: Partial<TicketEditorSlotProps> = {}): TicketEditorSlotProps {
  return {
    mode: 'note',
    doc: null,
    readOnly: false,
    workspaceId: 'ws_1',
    ticketId: '01J9GTKA000000000000000000',
    queryUsers: async () => [],
    uploadAttachment: vi.fn(async (_file: File) => UPLOADED),
    emitAttachmentAdded: vi.fn(async (_uploaded: EditorSlotUpload) => {}),
    submit: vi.fn(async (_submission: EditorSubmission) => true),
    ...overrides,
  };
}

type View = ReturnType<typeof render>;
const bar = (view: View): HTMLElement => view.container.querySelector('.ticket-editor__toolbar') as HTMLElement;
const anchor = (view: View): HTMLElement => view.container.querySelector('.ticket-editor__toolbar-anchor') as HTMLElement;
const scroller = (view: View): HTMLElement | null => view.container.querySelector('.ticket-editor__scroll');
const pm = (view: View): HTMLElement => {
  const el = view.container.querySelector('.ProseMirror') as HTMLElement;
  el.tabIndex = 0; // jsdom focuses a bare contenteditable only with a tabindex
  return el;
};
const nameOf = (el: Element): string | null => el.getAttribute('aria-label');
function tool(view: View, name: string): HTMLButtonElement {
  const el = view.container.querySelector<HTMLButtonElement>(`.ticket-editor__tool[aria-label="${name}"]`);
  if (el === null) throw new Error(`no bar control named ${name}`);
  return el;
}
const sheet = (): HTMLElement | null => document.body.querySelector('.ticket-editor__sheet');
const cells = (): HTMLButtonElement[] => [...document.body.querySelectorAll<HTMLButtonElement>('.ticket-editor__sheet-cell')];
const cellNamed = (name: string): HTMLButtonElement => {
  const hit = cells().find((cell) => cell.textContent === name);
  if (hit === undefined) throw new Error(`no sheet cell named ${name}`);
  return hit;
};
/** The docked bar's distance above the layout viewport's bottom, carried as a variable (the CSS adds the bottom bar's lift). */
const dockOffset = (el: HTMLElement): string => el.style.getPropertyValue('--ticket-editor-dock-bottom');
/** The phone bar's height in px for a given neo shadow reach (0 in hig/minimal/the webview): 44px tool + 2 × max(6px, reach). */
const barHeightPx = (reach: number): number => 2.75 * 16 + 2 * Math.max(0.375 * 16, reach);
const focusEditor = (view: View): void => {
  act(() => pm(view).focus());
};

const CSS = readFileSync(resolve(process.cwd(), 'src/styles/editor.css'), 'utf8');
const PHONE_ARM = '@media (max-width: 40rem)';
/** Every rule inside a `@media (max-width: 40rem)` arm, whichever arm it is in. */
const phoneRules = (): { selectors: string[]; body: string }[] => {
  const out: { selectors: string[]; body: string }[] = [];
  const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /@media \(max-width: 40rem\) \{/g;
  for (let m = re.exec(stripped); m !== null; m = re.exec(stripped)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (depth > 0 && i < stripped.length) {
      if (stripped[i] === '{') depth += 1;
      if (stripped[i] === '}') depth -= 1;
      i += 1;
    }
    const inner = stripped.slice(start, i - 1);
    for (const rule of inner.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ selectors: (rule[1] ?? '').split(',').map((s) => s.replace(/\s+/g, ' ').trim()), body: rule[2] ?? '' });
    }
  }
  return out;
};
const phoneRule = (selector: string): string => {
  const hits = phoneRules().filter((rule) => rule.selectors.includes(selector));
  if (hits.length === 0) throw new Error(`no ≤40rem rule for ${selector}`);
  return hits.map((hit) => hit.body).join(';');
};
const rem = (value: string | null): number => {
  if (value === null) throw new Error('missing value');
  return value.endsWith('rem') ? Number.parseFloat(value) : value.endsWith('px') ? Number.parseFloat(value) / 16 : Number.parseFloat(value);
};

describe('G-7 4: the phone bar is reordered', () => {
  it('25.400 at ≤40rem the bar is Bold, Italic, Bullet list, Task item, the heading select, Link, Insert ticket, Insert note, then More outside the scroll area; desktop keeps all seventeen in the old order', async () => {
    const phone = await mountEditor(true);
    expect(PHONE_VISIBLE_TOOLS).toEqual(['bold', 'italic', 'list', 'task', 'link', 'insertTicket', 'insertNote']);
    const scroll = scroller(phone.view) as HTMLElement;
    expect(scroll, 'the tools sit in one scroll area').not.toBeNull();
    const inside = [...scroll.querySelectorAll('button.ticket-editor__tool, select')].map(nameOf);
    expect(inside).toEqual(BAR_ORDER);
    // Undo, Redo, Numbered list and Strikethrough MOVED to More: none of them is on the bar.
    for (const gone of ['Undo', 'Redo', 'Numbered list', 'Strikethrough']) {
      expect(phone.view.container.querySelector(`[aria-label="${gone}"]`), `${gone} left the bar`).toBeNull();
    }
    // More is pinned at the right edge, OUTSIDE the scroller, and is the last control.
    const more = tool(phone.view, 'More tools');
    expect(scroll.contains(more)).toBe(false);
    const all = [...bar(phone.view).querySelectorAll('button.ticket-editor__tool, select')];
    expect(all[all.length - 1]).toBe(more);
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    phone.view.unmount();

    // CONTROL (same `it`): the identical mount above 40rem is the old strip, with no More and no scroller.
    const desktop = await mountEditor(false);
    expect(scroller(desktop.view)).toBeNull();
    expect(desktop.view.container.querySelector('[aria-label="More tools"]')).toBeNull();
    expect([...desktop.view.container.querySelectorAll('button.ticket-editor__tool')].map(nameOf)).toEqual(ALL_DESKTOP);
    desktop.view.unmount();
  });
});

describe('G-7 3: one docked toolbar row', () => {
  it('25.401 the phone bar is ONE row that never wraps: toolbar, scroll area and group are all nowrap, and the scroll area scrolls sideways', async () => {
    const { view } = await mountEditor(true);
    expect(view.container.querySelector('.ticket-editor__tray')).toBeNull();
    // All eight bar controls are in the one scroll area; More is the only other control.
    expect((scroller(view) as HTMLElement).querySelectorAll('button.ticket-editor__tool, select')).toHaveLength(8);
    view.unmount();

    // The CSS half. WHICH rule is restored by the mutation matters: the toolbar's own base `flex-wrap: wrap` (line ~225)
    // is beaten by the phone arm's `nowrap`; the group's wrap lives in the same arm.
    expect(valueOf(phoneRule('.ticket-editor__toolbar'), 'flex-wrap')).toBe('nowrap');
    expect(valueOf(phoneRule('.ticket-editor__tool-group'), 'flex-wrap')).toBe('nowrap');
    const scrollRule = phoneRule('.ticket-editor__scroll');
    expect(valueOf(scrollRule, 'flex-wrap')).toBe('nowrap');
    expect(valueOf(scrollRule, 'overflow-x')).toBe('auto');
    expect(valueOf(scrollRule, 'min-width')).toBe('0');
    // CONTROL: the base toolbar rule (desktop) still wraps.
    expect(valueOf(ruleExactly(CSS, '.ticket-editor__toolbar'), 'flex-wrap')).toBe('wrap');
  });

  it('25.402 the scroll area fades its right edge while tools lie past it (the 23.092 pattern, copied: the editor cannot import the ui hook) and More stays clear of the fade', async () => {
    const { view } = await mountEditor(true);
    const scroll = scroller(view) as HTMLElement;
    // Content wider than the box: the end edge is "false" (more past it), the start is "true".
    Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(scroll, 'scrollWidth', { configurable: true, value: 520 });
    Object.defineProperty(scroll, 'scrollLeft', { configurable: true, writable: true, value: 0 });
    act(() => {
      fireEvent.scroll(scroll);
    });
    expect(scroll).toHaveAttribute('data-at-start', 'true');
    expect(scroll).toHaveAttribute('data-at-end', 'false');
    act(() => {
      scroll.scrollLeft = 220;
      fireEvent.scroll(scroll);
    });
    expect(scroll).toHaveAttribute('data-at-start', 'false');
    expect(scroll).toHaveAttribute('data-at-end', 'true');
    // CONTROL: a scroll area that fits has no edge to fade.
    Object.defineProperty(scroll, 'scrollWidth', { configurable: true, value: 300 });
    act(() => {
      scroll.scrollLeft = 0;
      fireEvent.scroll(scroll);
    });
    expect(scroll).toHaveAttribute('data-at-end', 'true');
    view.unmount();

    const fade = phoneRule(".ticket-editor__scroll[data-at-end='false']");
    expect(fade).toContain('mask-image: linear-gradient');
    expect(fade).toContain('var(--ticket-editor-fade-size');
  });

  it('25.403 focus in the editor DOCKS the bar to the bottom of the VISUAL viewport (innerHeight − offsetTop − height), follows its resize and scroll, and blur returns it in flow; desktop never docks', async () => {
    const { view, vv } = await mountEditor(true, { height: 500 });
    expect(anchor(view)).toHaveAttribute('data-docked', 'false');
    expect(bar(view)).not.toHaveClass('ticket-editor__toolbar--docked');
    expect(dockOffset(bar(view))).toBe('');

    focusEditor(view);
    expect(anchor(view)).toHaveAttribute('data-docked', 'true');
    expect(bar(view)).toHaveClass('ticket-editor__toolbar--docked');
    // The keyboard is up: the visual viewport is 500 tall in an 844 layout viewport → the bar's bottom edge sits 344px up.
    expect(dockOffset(bar(view))).toBe('344px');
    expect(bar(view).style.bottom, 'the bar carries a variable, never an inline bottom (25.441)').toBe('');

    // The keyboard grows (visual viewport 400) and the page pans (offsetTop 30): the bar follows both events.
    vv.height = 400;
    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });
    expect(dockOffset(bar(view))).toBe('444px');
    vv.offsetTop = 30;
    act(() => {
      vv.dispatchEvent(new Event('scroll'));
    });
    expect(dockOffset(bar(view))).toBe('414px');

    // Blur (focus leaves the editor for the page): the bar returns to its place in the flow.
    const outside = document.createElement('button');
    document.body.append(outside);
    act(() => outside.focus());
    expect(anchor(view)).toHaveAttribute('data-docked', 'false');
    expect(dockOffset(bar(view))).toBe('');
    view.unmount();

    // CONTROL (same `it`): above 40rem there is no anchor and a focused editor draws the same bar, undocked.
    const desktop = await mountEditor(false, { height: 500 });
    focusEditor(desktop.view);
    expect(anchor(desktop.view)).toBeNull();
    expect(bar(desktop.view)).not.toHaveClass('ticket-editor__toolbar--docked');
    desktop.view.unmount();
  });

  it('25.404 pressing a bar tool keeps the caret in the text and the bar docked (the key stays up); the press prevents the focus steal on a phone and NOT on a desktop', async () => {
    const { view, editor } = await mountEditor(true, { height: 500 });
    focusEditor(view);
    act(() => {
      editor.commands.selectAll();
    });
    const user = userEvent.setup();
    await user.click(tool(view, 'Bold'));
    expect(pm(view).contains(document.activeElement), 'focus is still in the text').toBe(true);
    expect(anchor(view)).toHaveAttribute('data-docked', 'true');
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"bold"');
    // The press itself is what keeps focus: mousedown is cancelled for a bar tool …
    expect(fireEvent.mouseDown(tool(view, 'Italic'))).toBe(false);
    // … but NOT for the heading select, which must open its native picker.
    expect(fireEvent.mouseDown(view.container.querySelector('select') as HTMLElement)).toBe(true);
    view.unmount();

    // CONTROL: on a desktop the same press is left alone (phones only).
    const desktop = await mountEditor(false);
    expect(fireEvent.mouseDown(tool(desktop.view, 'Italic'))).toBe(true);
    desktop.view.unmount();
  });

  it('25.405 the shortcuts still work with the phone bar: Ctrl+B bolds, Ctrl+Shift+8 makes a bullet list', async () => {
    const { view, editor } = await mountEditor(true);
    focusEditor(view);
    act(() => {
      editor.commands.selectAll();
    });
    const user = userEvent.setup();
    await user.keyboard('{Control>}b{/Control}');
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"bold"');
    await user.keyboard('{Control>}{Shift>}8{/Shift}{/Control}');
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"bulletList"');
    view.unmount();
  });

  it('25.406 while docked the bar keeps its place (the anchor holds the bar height, no jump) and the content gains bottom padding equal to the bar', async () => {
    const rule = (selector: string): string => phoneRule(selector);
    const barHeight = valueOf(rule('.ticket-editor__toolbar'), 'height');
    expect(barHeight).toBe('var(--ticket-editor-bar-h)');
    const token = valueOf(rule('.ticket-editor'), '--ticket-editor-bar-h');
    // 44px tool + 2 × max(6px, the neo shadow reach); with no reach (hig, minimal, the webview) it is 3.5rem = 56px (25.419).
    expect(token).toBe('calc(2.75rem + 2 * max(0.375rem, var(--ticket-editor-reach)))');
    expect(barHeightPx(0)).toBe(56);
    // The anchor reserves the bar's place while it floats, and the content clears it.
    expect(valueOf(rule(".ticket-editor__toolbar-anchor[data-docked='true']"), 'min-height')).toBe('var(--ticket-editor-bar-h)');
    const clear = rule(".ticket-editor__toolbar-anchor[data-docked='true'] ~ .ticket-editor__content");
    expect(valueOf(clear, 'padding-bottom')).toContain('var(--ticket-editor-bar-h)');
    // The docked bar is fixed, full width, above the page and under the sheet scrims (z-index 40).
    const docked = rule('.ticket-editor__toolbar--docked');
    expect(valueOf(docked, 'position')).toBe('fixed');
    expect(valueOf(docked, 'left')).toBe('0');
    expect(valueOf(docked, 'right')).toBe('0');
    expect(Number(valueOf(docked, 'z-index'))).toBeLessThan(40);
    // CONTROL: the base rules (desktop) have no dock.
    expect(CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/^\.ticket-editor__toolbar--docked/m);
  });
});

describe('G-7 5: More is a bottom sheet', () => {
  it('25.407 More opens a labelled bottom sheet (a modal dialog) holding EXACTLY the tools that are not on the bar, icon + label, and nothing is removed', async () => {
    const { view } = await mountEditor(true);
    const more = tool(view, 'More tools');
    expect(sheet()).toBeNull();
    const user = userEvent.setup();
    await user.click(more);
    const panel = sheet() as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAccessibleName('More tools');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(more.getAttribute('aria-controls')).toBe(panel.id);
    // Exactly the ten, in the brief's order; each cell has a decorative icon and a visible label.
    expect(cells().map((cell) => cell.textContent)).toEqual([
      'Undo', 'Redo', 'Numbered list', 'Strikethrough', 'Code', 'Quote', 'Code block', 'Collapsible', 'Horizontal rule', 'Insert table',
    ]);
    for (const cell of cells()) {
      expect(cell.querySelectorAll('svg[aria-hidden="true"]'), `${cell.textContent} has one icon`).toHaveLength(1);
      expect(cell).toHaveAccessibleName(cell.textContent ?? '');
    }
    // Nothing removed: bar ∪ sheet is every tool the desktop strip has (plus the heading select and More).
    const onBar = [...(scroller(view) as HTMLElement).querySelectorAll('button.ticket-editor__tool')].map(nameOf);
    expect([...onBar, ...cells().map((cell) => cell.textContent)].sort()).toEqual([...ALL_DESKTOP].sort());
    expect(SHEET_NAMES).toHaveLength(10);
    // The cells are NOT `.ticket-editor__tool` (21.136: a bar tool never shows a word).
    expect(document.body.querySelectorAll('.ticket-editor__sheet .ticket-editor__tool')).toHaveLength(0);
    view.unmount();
  });

  it('25.408 picking a tool applies it, closes the sheet, and the focus AND the selection are back in the editor where they were', async () => {
    const { view, editor } = await mountEditor(true);
    focusEditor(view);
    act(() => {
      editor.commands.setTextSelection({ from: 5, to: 12 });
    });
    const before = { from: editor.state.selection.from, to: editor.state.selection.to };
    const user = userEvent.setup();
    await user.click(tool(view, 'More tools'));
    expect(sheet()).not.toBeNull();
    await user.click(cellNamed('Strikethrough'));
    expect(sheet(), 'the sheet closed after one pick').toBeNull();
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"strike"');
    expect(pm(view).contains(document.activeElement), 'focus is in the text').toBe(true);
    expect({ from: editor.state.selection.from, to: editor.state.selection.to }).toEqual(before);
    expect(tool(view, 'More tools')).toHaveAttribute('aria-expanded', 'false');
    // Undo is a sheet cell too: it ran against the same selection.
    await user.click(tool(view, 'More tools'));
    await user.click(cellNamed('Undo'));
    expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"strike"');
    view.unmount();
  });

  it('25.409 Escape and a tap on the backdrop close the sheet WITHOUT applying anything and return focus and selection to the editor; a tap inside the sheet does not close it', async () => {
    const { view, editor } = await mountEditor(true);
    focusEditor(view);
    act(() => {
      editor.commands.setTextSelection({ from: 3, to: 9 });
    });
    const before = { from: editor.state.selection.from, to: editor.state.selection.to };
    const doc = JSON.stringify(editor.getJSON());
    const user = userEvent.setup();

    await user.click(tool(view, 'More tools'));
    // CONTROL: a press on the panel's own padding stays open.
    await user.click(sheet() as HTMLElement);
    expect(sheet()).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(sheet(), 'Escape closes').toBeNull();
    expect(pm(view).contains(document.activeElement)).toBe(true);
    expect({ from: editor.state.selection.from, to: editor.state.selection.to }).toEqual(before);

    await user.click(tool(view, 'More tools'));
    await user.click(document.body.querySelector('.ticket-editor__sheet-scrim') as HTMLElement);
    expect(sheet(), 'a backdrop tap closes').toBeNull();
    expect(pm(view).contains(document.activeElement)).toBe(true);
    expect({ from: editor.state.selection.from, to: editor.state.selection.to }).toEqual(before);
    expect(JSON.stringify(editor.getJSON())).toBe(doc);
    view.unmount();
  });

  it('25.410 the table cell shows the size grid IN the sheet, picking a size inserts the table and closes the sheet, and the cell is off inside a table', async () => {
    const { view, editor } = await mountEditor(true);
    const user = userEvent.setup();
    focusEditor(view);
    await user.click(tool(view, 'More tools'));
    await user.click(cellNamed('Insert table'));
    expect(sheet()).not.toBeNull();
    const picker = (sheet() as HTMLElement).querySelector('.ticket-editor__table-picker');
    expect(picker, 'the grid is inside the sheet').not.toBeNull();
    await user.click((picker as HTMLElement).querySelector('.ticket-editor__table-cell[aria-label="2 × 3 table"]') as HTMLElement);
    expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(true);
    expect(sheet()).toBeNull();

    // Inside the new table the cell is disabled and says why, in words.
    await user.click(tool(view, 'More tools'));
    expect(cellNamed('Insert table')).toBeDisabled();
    expect((sheet() as HTMLElement).textContent).toContain('inside another table');
    // CONTROL: outside a table it was enabled (the first open above).
    view.unmount();
  });

  it('25.411 the sheet is one phone control: its CSS is a bottom sheet with 44px cells, after-the-base source order, tokens only; the bar exists only at ≤40rem', () => {
    const panel = phoneRule('.ticket-editor__sheet');
    expect(valueOf(panel, 'position')).toBe('fixed');
    expect(valueOf(panel, 'bottom')).toBe('0');
    expect(valueOf(panel, 'left')).toBe('0');
    expect(valueOf(panel, 'right')).toBe('0');
    expect(valueOf(phoneRule('.ticket-editor__sheet-scrim'), 'z-index')).toBe('50');
    const cell = phoneRule('.ticket-editor__sheet-cell');
    expect(rem(valueOf(cell, 'min-height'))).toBeGreaterThanOrEqual(2.75);
    expect(valueOf(phoneRule('.ticket-editor__sheet-grid'), 'grid-template-columns')).toBe('repeat(4, 1fr)');
    // No colour literal in any new rule (token-discipline, locally): every colour reads a token.
    const novel = [panel, cell, phoneRule('.ticket-editor__toolbar--docked'), phoneRule('.ticket-editor__scroll')].join('\n');
    expect(novel).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    // CONTROL: none of the sheet's classes has a rule outside the phone arm.
    const outside = CSS.replace(/@media \(max-width: 40rem\) \{[\s\S]*?\n\}\n/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(outside).not.toContain('.ticket-editor__sheet');
  });

  it('25.412 the phone tooltip is drawn above the bar with fixed coordinates (the scroll area would clip it and below is under the keyboard), from a long-press', async () => {
    const { view } = await mountEditor(true, { height: 500 });
    focusEditor(view);
    const bold = tool(view, 'Bold');
    vi.spyOn(bold, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 744, left: 40, right: 84, width: 44, height: 44, x: 40, y: 700, toJSON: () => ({}) });
    await act(async () => {
      fireEvent.mouseEnter(bold.parentElement as HTMLElement);
    });
    const tip = view.container.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tip).not.toBeNull();
    expect(tip.style.position).toBe('fixed');
    // bottom = visual viewport bottom (500) − button top (700) … clamped into the viewport: the tip sits above the button.
    expect(tip.style.bottom).not.toBe('');
    view.unmount();

    // CONTROL: on a desktop the tip keeps the stylesheet's placement (no inline position).
    const desktop = await mountEditor(false);
    await act(async () => {
      fireEvent.mouseEnter(tool(desktop.view, 'Bold').parentElement as HTMLElement);
    });
    expect((desktop.view.container.querySelector('[role="tooltip"]') as HTMLElement).style.position).toBe('');
    desktop.view.unmount();
  });

  it('25.413 on a phone the Link field opens as ONE field over the bar (the row stays one row); Enter applies the link, Escape closes it', async () => {
    const { view, editor } = await mountEditor(true);
    focusEditor(view);
    act(() => {
      editor.commands.selectAll();
    });
    const user = userEvent.setup();
    await user.click(tool(view, 'Link'));
    const field = view.container.querySelector<HTMLInputElement>('.ticket-editor__link-url') as HTMLInputElement;
    expect(field).not.toBeNull();
    expect(bar(view).contains(field)).toBe(true);
    // The field floats above the bar rather than joining the row: one row stays one row.
    expect(valueOf(phoneRule('.ticket-editor__link-url'), 'position')).toBe('absolute');
    expect(valueOf(phoneRule('.ticket-editor__link-url'), 'bottom')).toBe('100%');
    await user.type(field, 'https://example.com{Enter}');
    expect(JSON.stringify(editor.getJSON())).toContain('https://example.com');
    expect(view.container.querySelector('.ticket-editor__link-url')).toBeNull();
    view.unmount();
  });
});

describe('G-7 1 + 2: unboxed long text and slimmer comment boxes', () => {
  it('25.414 at ≤40rem the note body and the description drop the field frame (no border, side padding, ground or shadow) and the text lines up with the page gutter; desktop keeps the frame', () => {
    const selectors = ['.editor-slot.editor-slot--note .ticket-editor__content', '.editor-slot.editor-slot--description .ticket-editor__content'];
    const body = ruleExactly(CSS, selectors, PHONE_ARM);
    expect(valueOf(body, 'border')).toBe('none');
    expect(valueOf(body, 'background')).toBe('transparent');
    expect(valueOf(body, 'box-shadow')).toBe('none');
    expect(valueOf(body, 'border-radius')).toBe('0');
    // The text's left edge IS the gutter: the content's negative margin is exactly its side padding.
    const pad = (valueOf(body, 'padding') ?? '').split(' ');
    const side = rem(pad[1] ?? null);
    expect(rem(valueOf(body, 'margin-inline'))).toBe(-side);
    // The specificity (0,3,0) beats ui.css's `[data-style="neo"] .gn-field__input` (0,2,0) without leaning on load order.
    for (const selector of selectors) expect(selector.split('.').length - 1).toBe(3);
    // The focus state survives the frame: an accent bar in the freed margin, not a ring over the glyphs.
    const focus = ruleExactly(
      CSS,
      ['.editor-slot.editor-slot--note .ticket-editor__content:focus-within', '.editor-slot.editor-slot--description .ticket-editor__content:focus-within'],
      PHONE_ARM,
    );
    expect(valueOf(focus, 'outline')).toBe('none');
    expect(valueOf(focus, 'box-shadow')).toContain('var(--gn-focus-ring)');
    // The slot does not clip the freed margin.
    expect(valueOf(ruleExactly(CSS, ['.editor-slot.editor-slot--note', '.editor-slot.editor-slot--description'], PHONE_ARM), 'overflow')).toBe('visible');

    // CONTROL: the desktop base rule still has the frame's padding and no unbox declarations.
    const base = ruleExactly(CSS, '.editor-slot .ticket-editor__content');
    expect(valueOf(base, 'padding')).toBe('0.75rem 0.875rem');
    expect(valueOf(base, 'border')).toBeNull();
    // And the comment slot is NOT in the unbox rule.
    for (const selector of selectors) expect(selector).not.toContain('comment');
  });

  it('25.415 a comment composer and a comment edit editor KEEP their box, with the side padding 0.875rem → 0.625rem', async () => {
    const body = ruleExactly(CSS, '.editor-slot.editor-slot--comment .ticket-editor__content', PHONE_ARM);
    expect(valueOf(body, 'padding-left')).toBe('0.625rem');
    expect(valueOf(body, 'padding-right')).toBe('0.625rem');
    expect(valueOf(body, 'border')).toBeNull();
    expect(valueOf(body, 'background')).toBeNull();
    expect(valueOf(body, 'box-shadow')).toBeNull();
    // The vertical padding is not touched (it stays the base 0.75rem).
    expect(valueOf(body, 'padding-top')).toBeNull();
    // The mode classes the three rules key on are really on the slot.
    stubPhone(true);
    for (const mode of ['note', 'description', 'comment'] as const) {
      const view = render(<TicketEditorSlot {...slotProps({ mode })} />);
      await vi.waitFor(() => expect(view.container.querySelector('.ticket-editor .ProseMirror')).not.toBeNull());
      expect(view.container.querySelector(`.editor-slot--${mode}`), mode).not.toBeNull();
      view.unmount();
    }
    // CONTROL: the base padding the box keeps on a desktop.
    expect(valueOf(ruleExactly(CSS, '.editor-slot .ticket-editor__content'), 'padding')).toBe('0.75rem 0.875rem');
  });

  it('25.416 every G-7 rule is inside the ≤40rem arm: the base stylesheet has no sheet, scroll, dock or unbox rule (desktop and tablet unchanged)', () => {
    const outside = CSS.replace(/@media \(max-width: 40rem\) \{[\s\S]*?\n\}\n/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const needle of ['.ticket-editor__scroll', '.ticket-editor__toolbar-anchor', '--docked', '.ticket-editor__sheet', 'editor-slot--note .ticket-editor__content', 'editor-slot--description .ticket-editor__content']) {
      expect(outside, needle).not.toContain(needle);
    }
    // CONTROL: the scan sees real rules (the phone arm has them).
    expect(phoneRules().length).toBeGreaterThan(10);
    expect(phoneRule('.ticket-editor__scroll')).toContain('overflow-x');
  });
});

describe('G-7 5: the sheet keeps its Escape and its clicks from the host around the editor', () => {
  it('25.418 an Escape inside the More sheet and a tap on its scrim or panel never reach the editor\'s React ancestors (a dialog around it would close, the note page would refocus), and a comment\'s Format strip stays open', async () => {
    window.localStorage.clear();
    stubPhone(true);
    const keys = vi.fn();
    const clicks = vi.fn();
    // The new-ticket dialog closes on an unconditional document CAPTURE listener: stands in for it (measured on the lane
    // port: one Escape in the sheet closed the sheet AND the dialog).
    const dialogLike = vi.fn();
    const onDocumentKey = (event: KeyboardEvent): void => dialogLike(event.key);
    document.addEventListener('keydown', onDocumentKey, true);
    const view = render(
      <div onKeyDown={(event) => keys(event.key)} onClick={() => clicks()}>
        <TicketEditorSlot {...slotProps({ mode: 'comment' })} />
      </div>,
    );
    await vi.waitFor(() => expect(view.container.querySelector('.ticket-editor .ProseMirror')).not.toBeNull());
    const user = userEvent.setup();
    const format = view.container.querySelector('.editor-slot__format') as HTMLButtonElement;
    await user.click(format);
    await user.click(tool(view, 'More tools'));
    expect(sheet()).not.toBeNull();
    clicks.mockClear();
    keys.mockClear();

    await user.click(sheet() as HTMLElement);
    expect(clicks, 'a tap on the panel stays inside the sheet').not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(sheet(), 'Escape closes the sheet').toBeNull();
    expect(keys, 'the ancestor never saw the Escape').not.toHaveBeenCalledWith('Escape');
    expect(dialogLike, 'a document capture listener (the dialog) never saw the Escape').not.toHaveBeenCalledWith('Escape');
    // The strip is untouched: it is a sibling of the portal, not a parent of it.
    expect(format).toHaveAttribute('aria-expanded', 'true');
    expect(view.container.querySelector('[role="toolbar"]')).not.toBeNull();

    await user.click(tool(view, 'More tools'));
    clicks.mockClear();
    await user.click(document.body.querySelector('.ticket-editor__sheet-scrim') as HTMLElement);
    expect(sheet(), 'a backdrop tap closes').toBeNull();
    expect(clicks, 'a tap on the scrim stays inside the sheet').not.toHaveBeenCalled();

    // With the table grid open, Escape closes ONLY the grid (the sheet stays) and is hidden from the host as well.
    await user.click(tool(view, 'More tools'));
    await user.click(cellNamed('Insert table'));
    expect(document.body.querySelector('.ticket-editor__table-picker')).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(document.body.querySelector('.ticket-editor__table-picker'), 'the grid closed').toBeNull();
    expect(sheet(), 'the sheet stayed').not.toBeNull();
    expect(document.activeElement, 'focus is back on the table cell').toBe(cellNamed('Insert table'));
    expect(dialogLike).not.toHaveBeenCalledWith('Escape');
    await user.keyboard('{Escape}');
    expect(sheet()).toBeNull();

    // CONTROL (same it): a plain Escape on the editor's own text DOES reach the ancestor and the document listener.
    const control = view.container.querySelector('.ProseMirror') as HTMLElement;
    fireEvent.keyDown(control, { key: 'Escape' });
    expect(keys).toHaveBeenCalledWith('Escape');
    expect(dialogLike).toHaveBeenCalledWith('Escape');
    document.removeEventListener('keydown', onDocumentKey, true);
    view.unmount();
    window.localStorage.clear();
  });
});

describe('G-7 FIX 1 (reviewer A, 2026-10-03): shadow room, the caret, the bottom bar and the dialog contract', () => {
  it('25.419 (F1) in neo the phone scroller is not the clip: it pads the raised tools\' shadow reach and hands the room back with an equal negative margin, and the bar grows to hold it; with no reach (hig) nothing changes', () => {
    // The reach is the token's own variable, read with a 0 fallback: hig, minimal and the mobile webview (no token) get 0.
    expect(SHADOW_REACH_VARIABLE).toBe('--gn-shadow-reach');
    const root = phoneRule('.ticket-editor');
    expect(valueOf(root, '--ticket-editor-reach')).toBe('var(--gn-shadow-reach, 0px)');
    const scroll = phoneRule('.ticket-editor__scroll');
    expect(valueOf(scroll, 'padding')).toBe('var(--ticket-editor-reach)');
    expect(valueOf(scroll, 'margin')).toBe('calc(-1 * var(--ticket-editor-reach))');
    expect(valueOf(scroll, 'scroll-padding-inline')).toBe('var(--ticket-editor-reach)');
    // The last tool's room is not taken from the pinned More cell: More steps one reach further away.
    expect(valueOf(phoneRule('.ticket-editor__more'), 'margin-left')).toBe('calc(0.25rem + var(--ticket-editor-reach))');
    // The fade is measured from the PADDED edge, so it still spans 1.5rem of tools.
    expect(valueOf(scroll, '--ticket-editor-fade-size')).toBe('calc(1.5rem + var(--ticket-editor-reach))');
    // The bar holds the tool plus the room above and below: neo is taller by exactly 2 × (reach − 6px); hig is the old 56px.
    const neo = shadowReachOf('neo');
    expect(neo).toBeGreaterThan(6);
    expect(barHeightPx(neo)).toBe(44 + 2 * neo);
    expect(barHeightPx(0)).toBe(56); // CONTROL: hig, minimal and the webview keep the 3.5rem bar
  });

  it('25.440 (F2) while docked the view keeps the caret above the bar: scrollMargin and scrollThreshold have a bottom of at least the bar plus a gap, and undocking (blur, or a desktop mount) restores ProseMirror\'s default', async () => {
    const barHeight = 84;
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function offsetHeight(this: HTMLElement) {
      return this.classList.contains('ticket-editor__toolbar') ? barHeight : 0;
    });
    try {
      const { view, editor } = await mountEditor(true, { height: 500 });
      // CONTROL: not docked → no prop, so ProseMirror's own 5px margin applies.
      expect(editor.view.someProp('scrollMargin')).toBeUndefined();
      expect(editor.view.someProp('scrollThreshold')).toBeUndefined();
      focusEditor(view);
      const margin = editor.view.someProp('scrollMargin') as { top: number; right: number; bottom: number; left: number };
      const threshold = editor.view.someProp('scrollThreshold') as { top: number; right: number; bottom: number; left: number };
      expect(margin.bottom).toBeGreaterThan(barHeight);
      expect(threshold.bottom).toBe(margin.bottom);
      // The other three sides keep ProseMirror's defaults (margin 5, threshold 0).
      expect([margin.top, margin.left, margin.right]).toEqual([5, 5, 5]);
      expect([threshold.top, threshold.left, threshold.right]).toEqual([0, 0, 0]);
      // Blur → restored.
      const outside = document.createElement('button');
      document.body.append(outside);
      act(() => outside.focus());
      expect(editor.view.someProp('scrollMargin')).toBeUndefined();
      expect(editor.view.someProp('scrollThreshold')).toBeUndefined();
      view.unmount();

      // CONTROL (same `it`): a desktop mount never docks and never sets it.
      const desktop = await mountEditor(false, { height: 500 });
      focusEditor(desktop.view);
      expect(desktop.editor.view.someProp('scrollMargin')).toBeUndefined();
      desktop.view.unmount();
    } finally {
      spy.mockRestore();
    }
  });

  it('25.441 (F3) the docked bar clears the phone bottom bar when no keyboard is up: its bottom is the dock offset PLUS `--gn-bar-lift`, the offset is a variable the bar carries (0px with no keyboard), and inside a modal dialog or sheet (over the bottom bar) the lift is 0', async () => {
    const docked = phoneRule('.ticket-editor__toolbar--docked');
    expect(valueOf(docked, 'bottom')).toBe('calc(var(--ticket-editor-dock-bottom, 0px) + var(--gn-bar-lift, 0px))');
    // No keyboard: the visual viewport is the layout viewport → the variable is 0px (and the lift alone clears the nav).
    const { view } = await mountEditor(true, { height: 844 });
    focusEditor(view);
    expect(dockOffset(bar(view))).toBe('0px');
    expect(bar(view).style.bottom).toBe('');
    // Not inside a dialog: the bar is lifted by the page's variable, it declares none of its own.
    expect(bar(view).style.getPropertyValue('--gn-bar-lift')).toBe('');
    view.unmount();
    // Inside a MODAL dialog or sheet (drawn over the bottom bar) there is nothing to clear: the lift is 0 there.
    stubPhone(true, { height: 844 });
    const editorRef: React.MutableRefObject<Editor | null> = { current: null };
    const ready = vi.fn();
    const inDialog = render(
      <div role="dialog" aria-modal="true">
        <TicketEditor {...editorProps()} editorRef={editorRef} onEditorReady={ready} initialDoc={DOC} />
      </div>,
    );
    await vi.waitFor(() => expect(ready).toHaveBeenCalled());
    focusEditor(inDialog);
    expect(bar(inDialog)).toHaveClass('ticket-editor__toolbar--docked');
    expect(bar(inDialog).style.getPropertyValue('--gn-bar-lift')).toBe('0px');
    inDialog.unmount();
    // CONTROL: the base rules (desktop) never mention the lift.
    expect(CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/^\.ticket-editor__toolbar[^{]*\{[^}]*gn-bar-lift/m);
  });

  it('25.442 (F4) the sheet is a dialog: focus moves into it on open, Tab from the last cell wraps to the first and Shift+Tab from the first wraps to the last', async () => {
    const { view } = await mountEditor(true);
    const user = userEvent.setup();
    focusEditor(view);
    await user.click(tool(view, 'More tools'));
    const panel = sheet() as HTMLElement;
    // Focus is in the sheet, not still on the More button behind it.
    expect(panel.contains(document.activeElement), 'focus moved into the sheet on open').toBe(true);
    expect(tool(view, 'More tools').contains(document.activeElement)).toBe(false);
    const live = cells().filter((cell) => !cell.disabled);
    expect(live.length).toBeGreaterThan(2);
    const first = live[0] as HTMLElement;
    const last = live[live.length - 1] as HTMLElement;
    act(() => last.focus());
    await user.tab();
    expect(document.activeElement, 'Tab from the last cell wraps to the first').toBe(first);
    await user.tab({ shift: true });
    expect(document.activeElement, 'Shift+Tab from the first cell wraps to the last').toBe(last);
    // CONTROL: a Tab in the middle just moves on (the trap only acts at the ends).
    act(() => first.focus());
    await user.tab();
    expect(document.activeElement).toBe(live[1]);
    view.unmount();
  });
});
