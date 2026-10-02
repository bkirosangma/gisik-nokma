import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { TicketEditor, type TicketEditorProps } from '../src/components/TicketEditor.js';
import { PHONE_TOOLBAR_QUERY, PHONE_VISIBLE_TOOLS } from '../src/components/EditorToolbar.js';
import type { DocJson } from '../src/doc.js';
import { ruleExactly, valueOf } from '../../ui/test/helpers/css-rules.js';

/**
 * Mobile web — the Notes toolbar: icons instead of word labels (every width), a visible name on hover /
 * focus / long-press, and at ≤40rem a "More tools" tray so the bar is at most two rows (21.136/138/140 AMENDED 2026-10-02 by G-7: one docked row and a bottom sheet, cases 25.400–25.416). Cases 21.135 –
 * 21.139 (§21.9). The two-row WIDTH budget is `apps/web/test/notes-toolbar-phone.test.tsx` (21.137): it
 * needs the web app's stylesheet.
 */
const DOC: DocJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the description' }] }],
};

/** Every tool, in bar order, by accessible name — the single list the cases below compare against. */
const ALL_NAMES = [
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
/** G-7 (25.400): the phone bar's tools in order, the heading select after the task list; More is outside the scroller. */
const PHONE_BAR_NAMES = ['Bold', 'Italic', 'Bullet list', 'Task item', 'Link', 'Insert ticket', 'Insert note'];
/** G-7 (25.407): the bottom sheet holds exactly the other ten, in this order. */
const SHEET_NAMES = ['Undo', 'Redo', 'Numbered list', 'Strikethrough', 'Code', 'Quote', 'Code block', 'Collapsible', 'Horizontal rule', 'Insert table'];
const sheetCell = (name: string): HTMLButtonElement => {
  const cell = [...document.body.querySelectorAll<HTMLButtonElement>('.ticket-editor__sheet-cell')].find((c) => c.querySelector('.ticket-editor__sheet-label')?.textContent === name);
  if (cell === undefined) throw new Error(`no sheet cell named ${name}`);
  return cell;
};
const sheetOpen = (): boolean => document.body.querySelector('.ticket-editor__sheet') !== null;

/** jsdom has no `PointerEvent`, so `fireEvent.pointerDown(el, { pointerType })` would drop the type. */
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

function stubMatchMedia(phone: boolean): void {
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query === PHONE_TOOLBAR_QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function makeProps(overrides: Partial<TicketEditorProps> = {}): TicketEditorProps {
  return { queryUsers: async () => [], uploadAttachment: vi.fn(), onAttachmentAdded: vi.fn(), ...overrides };
}

async function mount(phone: boolean) {
  stubMatchMedia(phone);
  const editorRef: React.MutableRefObject<Editor | null> = { current: null };
  const ready = vi.fn();
  const view = render(<TicketEditor {...makeProps()} editorRef={editorRef} onEditorReady={ready} initialDoc={DOC} />);
  await vi.waitFor(() => {
    expect(ready).toHaveBeenCalled();
    expect(editorRef.current).not.toBeNull();
  });
  return { view, editor: editorRef.current as Editor };
}

type View = ReturnType<typeof render>;
const toolButtons = (view: View): HTMLButtonElement[] => [...view.container.querySelectorAll<HTMLButtonElement>('.ticket-editor__tool')];
const namesOf = (buttons: readonly HTMLElement[]): (string | null)[] => buttons.map((button) => button.getAttribute('aria-label'));
function tool(view: View, name: string): HTMLButtonElement {
  const el = view.container.querySelector<HTMLButtonElement>(`.ticket-editor__tool[aria-label="${name}"]`);
  if (el === null) throw new Error(`no toolbar control named ${name}`);
  return el;
}
const tooltipFor = (view: View, button: HTMLElement): Element | null => {
  const id = button.getAttribute('aria-describedby');
  return id === null ? null : view.container.querySelector(`#${id}`);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const el of document.querySelectorAll('.wikilink-popup, .ticketref-popup')) el.remove();
});

describe('21.135 every tool button keeps its accessible name AND shows it as a tooltip', () => {
  it('21.135 each button is named by aria-label and its tooltip carries the same name on hover and on focus', async () => {
    const { view } = await mount(false);
    const buttons = toolButtons(view);
    // CONTROL (same `it`): the loop below is over all seventeen, so it cannot pass by finding none.
    expect(namesOf(buttons)).toEqual(ALL_NAMES);
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') as string;
      expect(button.getAttribute('aria-describedby'), `${name} shows no tooltip at rest`).toBeNull();
      fireEvent.mouseEnter(button.closest('.ticket-editor__tool-wrap') as HTMLElement);
      expect(tooltipFor(view, button)?.getAttribute('role'), `${name} hover`).toBe('tooltip');
      expect(tooltipFor(view, button)?.textContent, `${name} hover`).toContain(name.replace(/ \(not allowed.*/, ''));
      fireEvent.mouseLeave(button.closest('.ticket-editor__tool-wrap') as HTMLElement);
      fireEvent.focus(button);
      expect(tooltipFor(view, button)?.textContent, `${name} focus`).toContain(name.replace(/ \(not allowed.*/, ''));
      fireEvent.blur(button);
      expect(button.getAttribute('aria-describedby'), `${name} hides on blur`).toBeNull();
    }
    view.unmount();
  });

  it('21.135 a long-press (touch, 500ms) shows the name and does NOT run the tool; a short tap runs it', async () => {
    const { view, editor } = await mount(false);
    editor.commands.selectAll();
    const bold = tool(view, 'Bold');
    // Fake only the timers the long-press uses, after the mount has settled.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // A SHORT tap — finger down, up before the threshold, then the click: the tool runs, no tooltip.
    fireEvent.pointerDown(bold, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerUp(bold, { pointerType: 'touch' });
    fireEvent.click(bold);
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"bold"');
    expect(tooltipFor(view, bold)).toBeNull();
    editor.commands.unsetBold();
    expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"bold"');

    // A LONG press: the name shows once the finger has rested, the click that follows is swallowed.
    fireEvent.pointerDown(bold, { pointerType: 'touch' });
    expect(tooltipFor(view, bold)).toBeNull();
    act(() => vi.advanceTimersByTime(600));
    expect(tooltipFor(view, bold)?.textContent).toContain('Bold');
    fireEvent.pointerUp(bold, { pointerType: 'touch' });
    fireEvent.click(bold);
    expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"bold"');
    // The name lingers a moment after the finger lifts, then goes.
    expect(tooltipFor(view, bold)).not.toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(tooltipFor(view, bold)).toBeNull();

    // The press AFTER a long-press is a normal tap again (the swallow does not stick).
    fireEvent.pointerDown(bold, { pointerType: 'touch' });
    fireEvent.pointerUp(bold, { pointerType: 'touch' });
    fireEvent.click(bold);
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"bold"');

    // A MOUSE press never starts the timer (hover is its tooltip).
    editor.commands.unsetBold();
    fireEvent.pointerDown(bold, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(600));
    expect(tooltipFor(view, bold)).toBeNull();
    // And a cancelled touch (the browser took it for a scroll) shows nothing.
    fireEvent.pointerDown(bold, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerCancel(bold, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(600));
    expect(tooltipFor(view, bold)).toBeNull();

    // The platform's CONTEXT MENU a long-press can raise is suppressed while a touch press is held (the name is the
    // answer to the press)...
    fireEvent.pointerDown(bold, { pointerType: 'touch' });
    expect(fireEvent.contextMenu(bold), 'contextmenu during a touch press').toBe(false);
    fireEvent.pointerUp(bold, { pointerType: 'touch' });
    // ...and ONLY then. CONTROL: with no press in progress, or a mouse press, a right-click keeps its menu.
    expect(fireEvent.contextMenu(bold), 'contextmenu at rest').toBe(true);
    fireEvent.pointerDown(bold, { pointerType: 'mouse' });
    expect(fireEvent.contextMenu(bold), 'contextmenu on a mouse press').toBe(true);
    view.unmount();
  });

  it('21.135 CSS half: `.ticket-editor__tool` carries `-webkit-touch-callout: none` (iOS raises no callout over the long-press)', () => {
    const editorCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/editor.css'), 'utf8');
    const rule = ruleExactly(editorCss, '.ticket-editor__tool');
    expect(valueOf(rule, '-webkit-touch-callout')).toBe('none');
    // CONTROL: the same rule still carries its other declarations, so a read of the wrong rule would fail here.
    expect(valueOf(rule, 'cursor')).toBe('pointer');
  });
});

describe('21.136 no tool button shows a bare word — every one is one decorative SVG', () => {
  for (const phone of [false, true]) {
    it(`21.136 every .ticket-editor__tool has no text and exactly one aria-hidden svg (${phone ? 'phone bar; AMENDED by G-7: the sheet cells carry a label by design, 25.407' : 'desktop'})`, async () => {
      const { view } = await mount(phone);
      const buttons = toolButtons(view);
      // CONTROL: the loop covers every tool (and More on a phone), not an empty list.
      expect(buttons.length).toBe(phone ? PHONE_BAR_NAMES.length + 1 : ALL_NAMES.length);
      for (const button of buttons) {
        const name = button.getAttribute('aria-label');
        expect(button.textContent, `${name} has visible text`).toBe('');
        const svgs = button.querySelectorAll('svg');
        expect(svgs.length, `${name} svg count`).toBe(1);
        expect(svgs[0]?.getAttribute('aria-hidden'), `${name} svg is decorative`).toBe('true');
        expect(svgs[0]?.getAttribute('stroke'), `${name} svg stroke`).toBe('currentColor');
        expect(svgs[0]?.getAttribute('width'), `${name} svg size`).toBe('16');
      }
      view.unmount();
    });
  }

  it('21.136 the phone query is the one the stylesheets and `PHONE_BOARD_QUERY` use', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const appCore = readFileSync(resolve(here, '../../app-core/src/views/use-phone-board.ts'), 'utf8');
    expect(appCore).toContain(`PHONE_BOARD_QUERY = '${PHONE_TOOLBAR_QUERY}'`);
    expect(PHONE_TOOLBAR_QUERY).toBe('(max-width: 40rem)');
  });
});

describe('21.138 (AMENDED 2026-10-02 by G-7) at ≤40rem the bar keeps seven tools plus the heading select, and the rest sit in the "More tools" sheet', () => {
  it('21.138 the bar is bold, italic, bullet, task, heading select, link, insert ticket, insert note, More; the sheet holds the other ten', async () => {
    const { view } = await mount(true);
    const toolbar = view.container.querySelector('.ticket-editor__toolbar') as HTMLElement;
    expect(PHONE_VISIBLE_TOOLS).toEqual(['bold', 'italic', 'list', 'task', 'link', 'insertTicket', 'insertNote']);

    // Closed: only the seven and More are buttons; the ten are not in the DOM at all.
    expect(namesOf(toolButtons(view))).toEqual([...PHONE_BAR_NAMES, 'More tools']);
    for (const name of SHEET_NAMES) expect(view.container.querySelector(`[aria-label="${name}"]`), `${name} is hidden`).toBeNull();
    // Visual order: the heading select follows the task list, and More is last.
    const order = [...toolbar.querySelectorAll('button.ticket-editor__tool, select')].map((el) => el.getAttribute('aria-label'));
    expect(order).toEqual(['Bold', 'Italic', 'Bullet list', 'Task item', 'Heading level', 'Link', 'Insert ticket', 'Insert note', 'More tools']);
    const more = tool(view, 'More tools');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.getAttribute('aria-controls')).toBeNull();
    expect(more.hasAttribute('aria-pressed')).toBe(false);

    // Open: the ten appear, in order, in ONE dialog that More controls.
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const sheet = document.body.querySelector('.ticket-editor__sheet') as HTMLElement;
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-label')).toBe('More tools');
    expect(more.getAttribute('aria-controls')).toBe(sheet.id);
    expect([...sheet.querySelectorAll('.ticket-editor__sheet-label')].map((el) => el.textContent)).toEqual(SHEET_NAMES);
    // The bar's own tools did not move.
    expect(namesOf(toolButtons(view))).toEqual([...PHONE_BAR_NAMES, 'More tools']);
    fireEvent.keyDown(sheet, { key: 'Escape' });
    view.unmount();
  });
});

describe('21.139 desktop has no "More tools": all seventeen tools and the heading select sit on the bar', () => {
  it('21.139 above 40rem (and where matchMedia is missing) there is no More and no tray', async () => {
    const desktop = await mount(false);
    expect(desktop.view.container.querySelector('[aria-label="More tools"]')).toBeNull();
    expect(desktop.view.container.querySelector('.ticket-editor__tray')).toBeNull();
    expect(namesOf(toolButtons(desktop.view))).toEqual(ALL_NAMES);
    const order = [...desktop.view.container.querySelectorAll('button.ticket-editor__tool, select')].map((el) => el.getAttribute('aria-label'));
    // The heading select keeps its place at the head of the blocks group.
    expect(order.indexOf('Heading level')).toBe(order.indexOf('Bullet list') - 1);
    desktop.view.unmount();

    // CONTROL (same `it`): the identical mount on a phone DOES have it.
    const phone = await mount(true);
    expect(phone.view.container.querySelector('[aria-label="More tools"]')).not.toBeNull();
    phone.view.unmount();

    // matchMedia absent (jsdom's own state, SSR): desktop behaviour.
    vi.unstubAllGlobals();
    const bare = render(<TicketEditor {...makeProps()} initialDoc={DOC} />);
    await vi.waitFor(() => expect(bare.container.querySelector('.ticket-editor__toolbar')).not.toBeNull());
    expect(bare.container.querySelector('[aria-label="More tools"]')).toBeNull();
    bare.unmount();
  });
});

describe('21.140 (AMENDED 2026-10-02 by G-7) the "More tools" sheet behaves like a disclosure', () => {
  it('21.140 a sheet tool runs its command and closes the sheet; Escape closes it and returns focus to the editor; More toggles it', async () => {
    const { view, editor } = await mount(true);
    editor.commands.selectAll();
    const more = tool(view, 'More tools');

    // A sheet tool is the same command: it toggles a mark and reports `aria-pressed`.
    fireEvent.click(more);
    const strike = sheetCell('Strikethrough');
    expect(strike.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(strike);
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"strike"');
    expect(sheetOpen()).toBe(false);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(sheetCell('Strikethrough').getAttribute('aria-pressed')).toBe('true');

    // Escape inside the sheet closes it; focus goes back to the text (G-7: the editor, not More).
    fireEvent.keyDown(sheetCell('Quote'), { key: 'Escape' });
    expect(sheetOpen()).toBe(false);
    expect(view.container.querySelector('.ProseMirror')?.contains(document.activeElement)).toBe(true);

    // CONTROL: a second More press shuts it; the table cell keeps the sheet open for its size grid.
    fireEvent.click(more);
    expect(sheetOpen()).toBe(true);
    fireEvent.click(more);
    expect(sheetOpen()).toBe(false);
    fireEvent.click(more);
    fireEvent.click(sheetCell('Insert table'));
    expect(sheetOpen()).toBe(true);
    expect(document.body.querySelector('.ticket-editor__table-picker')).not.toBeNull();

    // Picking a size inserts the table AND closes the sheet.
    const cell = document.body.querySelector('.ticket-editor__table-cell[aria-label="2 × 3 table"]') as HTMLElement;
    fireEvent.click(cell);
    expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(true);
    expect(sheetOpen()).toBe(false);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    view.unmount();
  });
});
