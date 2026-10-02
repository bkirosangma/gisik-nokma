import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import {
  TicketEditorSlot,
  type EditorSlotUpload,
  type TicketEditorSlotProps,
} from '../src/components/TicketEditorSlot.js';
import type { EditorSubmission } from '../src/attachments/compose-editor-submission.js';

// Smoothness add-on G-6 (owner 2026-10-02): comment editors hide the formatting toolbar behind one small
// Format button. Cases 25.380-25.389. The slot is the one place every comment editor passes through: the
// ticket sheet's composer and its in-place edit (`ticket-sheet.tsx`), the note comments' composer and edit
// (`note-comments.tsx`) all mount it with `mode="comment"`.

const KEY = 'gn-comment-toolbar';

const UPLOADED: EditorSlotUpload = {
  attachmentId: '01J9GATA000000000000000000',
  url: '/v1/attachments/01J9GATA000000000000000000',
  mime: 'image/png',
  filename: 'a.png',
  size: 1,
  sha256: 'd'.repeat(64),
};

function makeProps(overrides: Partial<TicketEditorSlotProps> = {}): TicketEditorSlotProps {
  return {
    mode: 'comment',
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

async function mount(props: TicketEditorSlotProps) {
  const editorRef: React.MutableRefObject<Editor | null> = { current: null };
  const view = render(<TicketEditorSlot {...props} editorRef={editorRef} />);
  await vi.waitFor(() => {
    expect(view.container.querySelector('.ticket-editor .ProseMirror')).not.toBeNull();
    expect(editorRef.current).not.toBeNull();
  });
  return { view, editor: editorRef.current as Editor };
}

const toolbar = (root: HTMLElement) => root.querySelector('[role="toolbar"]');
const formatButton = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('.editor-slot__format');

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('G-6 the comment composers hide the formatting toolbar behind a Format button', () => {
  it('25.380 a comment composer, a comment edit editor and a read-write note-comment composer start with NO toolbar and one "Show formatting" button; the description and note-body editors keep their toolbars and have no such button', async () => {
    const composer = await mount(makeProps());
    expect(toolbar(composer.view.container)).toBeNull();
    const button = formatButton(composer.view.container);
    expect(button, 'no Format button in the comment composer').not.toBeNull();
    expect(button).toHaveAccessibleName('Show formatting');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    composer.view.unmount();

    // The in-place edit of a comment: the same mode, its own submit word (MCP everything T5, case 26.121).
    const edit = await mount(makeProps({ submitLabel: 'Save' }));
    expect(toolbar(edit.view.container)).toBeNull();
    expect(formatButton(edit.view.container)).not.toBeNull();
    edit.view.unmount();

    // Control: the other two writing surfaces are untouched, in the same `it()`.
    const description = await mount(makeProps({ mode: 'description' }));
    expect(toolbar(description.view.container)).not.toBeNull();
    expect(formatButton(description.view.container)).toBeNull();
    description.view.unmount();

    const note = await mount(makeProps({ mode: 'note' }));
    expect(toolbar(note.view.container)).not.toBeNull();
    expect(formatButton(note.view.container)).toBeNull();
    note.view.unmount();
  });

  it('25.381 the button shows the SAME toolbar and hides it again; its name, aria-expanded and aria-controls follow', async () => {
    const { view } = await mount(makeProps());
    const button = formatButton(view.container) as HTMLButtonElement;
    fireEvent.click(button);
    const bar = toolbar(view.container) as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar).toHaveAccessibleName('Formatting');
    expect(button).toHaveAccessibleName('Hide formatting');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(bar.id).not.toBe('');
    expect(button.getAttribute('aria-controls')).toBe(bar.id);
    // Nothing removed: the description editor's bar has the same tools.
    const full = await mount(makeProps({ mode: 'description' }));
    const tools = (el: Element) =>
      [...el.querySelectorAll('button')].map((n) => n.getAttribute('aria-label') ?? n.textContent);
    expect(tools(bar).length).toBeGreaterThan(5);
    expect(tools(bar)).toEqual(tools(toolbar(full.view.container) as Element));
    full.view.unmount();

    fireEvent.click(button);
    expect(toolbar(view.container)).toBeNull();
    expect(button).toHaveAccessibleName('Show formatting');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    view.unmount();
  });

  it('25.382 the choice is remembered per device under gn-comment-toolbar and shared by every comment editor on the page', async () => {
    const first = await mount(makeProps());
    const second = await mount(makeProps());
    fireEvent.click(formatButton(first.view.container) as HTMLButtonElement);
    expect(window.localStorage.getItem(KEY)).toBe('shown');
    // Another composer mounted at the same time follows without a reload.
    expect(toolbar(second.view.container)).not.toBeNull();
    first.view.unmount();
    second.view.unmount();

    // A fresh mount reads it back.
    const remounted = await mount(makeProps());
    expect(toolbar(remounted.view.container)).not.toBeNull();
    fireEvent.click(formatButton(remounted.view.container) as HTMLButtonElement);
    expect(window.localStorage.getItem(KEY)).toBe('hidden');
    expect(toolbar(remounted.view.container)).toBeNull();
    remounted.view.unmount();

    // Control: a value that is neither word is the default, hidden.
    window.localStorage.setItem(KEY, 'whatever');
    const junk = await mount(makeProps());
    expect(toolbar(junk.view.container)).toBeNull();
    junk.view.unmount();
  });

  it('25.383 storage that throws on read and on write leaves the composer hidden by default and still toggling', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { view } = await mount(makeProps());
    expect(toolbar(view.container)).toBeNull();
    const button = formatButton(view.container) as HTMLButtonElement;
    expect(() => fireEvent.click(button)).not.toThrow();
    expect(toolbar(view.container)).not.toBeNull();
    fireEvent.click(button);
    expect(toolbar(view.container)).toBeNull();
    view.unmount();
  });

  it('25.384 hidden is not disabled: Ctrl+B still bolds the selection with the toolbar hidden', async () => {
    const { view, editor } = await mount(makeProps());
    expect(toolbar(view.container)).toBeNull();
    act(() => {
      editor.commands.setContent('<p>the words</p>');
      editor.commands.selectAll();
    });
    fireEvent.keyDown(editor.view.dom, { key: 'b', ctrlKey: true });
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"bold"');
    // Control: without the keystroke the same text carries no bold mark.
    act(() => {
      editor.commands.setContent('<p>the words</p>');
    });
    expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"bold"');
    view.unmount();
  });

  it('25.385 Attach is reachable without opening Format, and sits right of the Format button in the footer', async () => {
    const { view } = await mount(makeProps());
    expect(toolbar(view.container)).toBeNull();
    const attach = view.container.querySelector('.editor-slot__attach') as HTMLButtonElement;
    expect(attach).not.toBeNull();
    const format = formatButton(view.container) as HTMLButtonElement;
    const footer = view.container.querySelector('.editor-slot__footer') as HTMLElement;
    expect(footer.contains(format)).toBe(true);
    expect(format.compareDocumentPosition(attach) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Control: opening the toolbar does not move Attach out of the footer or duplicate it.
    fireEvent.click(format);
    expect(view.container.querySelectorAll('.editor-slot__attach')).toHaveLength(1);
    expect(toolbar(view.container)?.querySelector('.editor-slot__attach')).toBeNull();
    view.unmount();
  });

  it('25.386 opening the toolbar leaves focus in the text; Escape inside the toolbar closes it and returns focus to the Format button', async () => {
    const { view, editor } = await mount(makeProps());
    const button = formatButton(view.container) as HTMLButtonElement;
    act(() => {
      editor.commands.focus();
    });
    const pm = view.container.querySelector('.ProseMirror') as HTMLElement;
    // jsdom does not focus a bare contenteditable; the real browser does, and the property under test is only that
    // opening the strip moves focus nowhere.
    pm.tabIndex = 0;
    act(() => pm.focus());
    expect(document.activeElement).toBe(pm);
    fireEvent.click(button);
    expect(toolbar(view.container)).not.toBeNull();
    expect(document.activeElement).toBe(pm);

    const firstTool = toolbar(view.container)?.querySelector<HTMLElement>('button:not([disabled])') as HTMLElement;
    act(() => firstTool.focus());
    expect(toolbar(view.container)?.contains(document.activeElement)).toBe(true);
    // A focused tool's tooltip takes the FIRST Escape (it stops it there, as it always has); the strip closes on the next.
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    if (toolbar(view.container) !== null) fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(toolbar(view.container)).toBeNull();
    expect(document.activeElement).toBe(button);
    view.unmount();
  });

  it('25.387 a read-only comment (nobody can type) draws no Format button and no toolbar', async () => {
    const { view } = await mount(makeProps({ readOnly: true }));
    expect(formatButton(view.container)).toBeNull();
    expect(toolbar(view.container)).toBeNull();
    // Control: the same mount, writable, has the button.
    view.unmount();
    const writable = await mount(makeProps());
    expect(formatButton(writable.view.container)).not.toBeNull();
    writable.view.unmount();
  });

  it('25.388 the button is a quiet ghost control: the toolbar tool size on desktop, a 44px floor on phones, no raised shadow, a focus ring', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/editor.css'), 'utf8');
    const rule = (selector: string, from = 0): string => {
      const at = css.indexOf(`${selector} {`, from);
      expect(at, `no rule for ${selector}`).toBeGreaterThanOrEqual(0);
      return css.slice(at, css.indexOf('}', at));
    };
    const base = rule('.editor-slot__format');
    expect(base).toContain('background: transparent');
    expect(base).toContain('min-height: 32px');
    expect(base).not.toContain('--gn-shadow-raised');
    expect(rule('.editor-slot__format:focus-visible')).toContain('--gn-focus-ring');
    // The phone arm must come AFTER the base rule (same specificity: source order decides).
    const baseAt = css.indexOf('.editor-slot__format {');
    const phone = css.indexOf('@media (max-width: 40rem)', baseAt);
    expect(phone, 'no phone arm after the base rule').toBeGreaterThan(baseAt);
    const arm = css.slice(phone, css.indexOf('\n}\n', phone));
    expect(arm).toMatch(/\.editor-slot__format\s*\{[^}]*min-height: 2\.75rem[^}]*min-width: 2\.75rem/);
    // Control: the Attach rule beside it IS raised, so the assertion above can fail.
    expect(rule('.editor-slot__attach')).toContain('--gn-shadow-raised');
  });

  it('25.389 every comment editor in the product reaches the slot as mode="comment" (four hosts), so the toggle covers the sheet composer, the comment edit and both note-comment editors', () => {
    const count = (file: string): number =>
      (readFileSync(resolve(process.cwd(), file), 'utf8').match(/mode="comment"/g) ?? []).length;
    expect(count('../app-core/src/views/ticket-sheet.tsx')).toBe(2);
    expect(count('../../apps/web/src/notes/note-comments.tsx')).toBe(2);
    // Control: the note-body host does not use the comment mode.
    expect(count('../../apps/web/src/notes/note-document.tsx')).toBe(0);
  });
});
