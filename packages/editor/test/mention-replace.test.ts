import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { createTestEditor } from './helpers/create-editor.js';

/**
 * 9.456-9.462 — CLICKING A MENTION IN AN EDITABLE EDITOR REOPENS THE PICKER TO
 * REPLACE IT (owner request, 2026-09-29: "on edit mode, clicking on an @mention
 * should reopen the list to replace the clicked mention.").
 *
 * The editor is REAL and MOUNTED; the two input doors are driven the way the
 * browser drives them and the way this package's other cases do:
 *
 *  - the CLICK by calling the `handleClickOn` prop ProseMirror calls on mouseup
 *    — jsdom has no layout, so `posAtCoords` (which turns a real mouse event
 *    into that call) cannot run; the browser half is 9.462, measured by hand;
 *  - KEYS as real `keydown` events on the editor's host, which is what reaches
 *    the handlers a browser reaches (`someProp('handleKeyDown')` would skip the
 *    DOM-event layer this feature listens on).
 */
const ANSELMA = { userId: '01J9GUSA000000000000000000', name: 'Anselma' };
const ANAND = { userId: '01J9GUSB000000000000000000', name: 'Anand' };
const BEA = { userId: '01J9GUSD000000000000000000', name: 'Bea' };
const USERS = [ANSELMA, ANAND, BEA];
/** A directory row the editor could not store — never offered (9.457's control). */
const NAMELESS = { userId: '01J9GUSC000000000000000000', name: '   ' };

const chip = (person: { userId: string; name: string }): unknown => ({
  type: 'mention',
  attrs: { userId: person.userId, label: person.name },
});

/** `hi @Anand there` — the chip is the SECOND person, so "the default row" and "the current person" differ. */
function docWith(person = ANAND): unknown {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'hi ' }, chip(person), { type: 'text', text: ' there' }],
      },
    ],
  };
}

function mentionAt(editor: Editor): { pos: number; userId: string } {
  let found: { pos: number; userId: string } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'mention') found = { pos, userId: node.attrs.userId as string };
  });
  return found!;
}

function mentionIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'mention') ids.push(node.attrs.userId as string);
  });
  return ids;
}

/** What ProseMirror does on mouseup over a node: the `handleClickOn` prop, for the node the pointer is on. */
function click(editor: Editor, init: MouseEventInit = {}): boolean {
  const { pos } = mentionAt(editor);
  const view = editor.view;
  const node = view.state.doc.nodeAt(pos)!;
  return (
    view.someProp('handleClickOn', (handler) =>
      handler(view, pos, node, pos, new MouseEvent('click', { bubbles: true, cancelable: true, ...init }), true),
    ) ?? false
  );
}

function key(editor: Editor, name: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  editor.view.dom.dispatchEvent(event);
  return event;
}

const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.mention-popup__item')];
const popup = (): Element | null => document.querySelector('.mention-popup');
const selectedName = (): string | undefined =>
  rows().find((row) => row.getAttribute('aria-selected') === 'true')?.textContent ?? undefined;
const choose = (name: string): void => {
  rows()
    .find((row) => row.textContent === name)!
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
};

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.querySelectorAll('.mention-popup').forEach((el) => el.remove());
});

function mount(options: { readOnly?: boolean; people?: unknown[]; person?: typeof ANAND } = {}): {
  editor: Editor;
  queryUsers: ReturnType<typeof vi.fn>;
} {
  const queryUsers = vi.fn(async () => (options.people ?? USERS) as typeof USERS);
  const mounted = createTestEditor(
    { queryUsers, ...(options.readOnly === true ? { readOnly: true } : {}) },
    docWith(options.person),
  );
  editor = mounted;
  return { editor: mounted, queryUsers };
}

describe('9.456-9.462 clicking a mention replaces it', () => {
  it('9.456 a click on a mention in an editable editor opens the picker: the full list, the current person highlighted', async () => {
    const { editor: e, queryUsers } = mount();
    expect(click(e)).toBe(true);
    await vi.waitFor(() => expect(rows().length).toBe(3));
    // The FULL list: an empty query, not the chip's own name.
    expect(queryUsers).toHaveBeenCalledWith('');
    expect(rows().map((row) => row.textContent)).toEqual(['Anselma', 'Anand', 'Bea']);
    // The current person — the SECOND row — is the highlighted one, and the
    // chip is node-selected (the popup is anchored to something that is on show).
    expect(selectedName()).toBe('Anand');
    expect(e.state.selection).toBeInstanceOf(NodeSelection);
    // Nothing changed by opening.
    expect(mentionIds(e)).toEqual([ANAND.userId]);
  });

  it('9.457 choosing another person replaces the node in ONE undo step; only what queryUsers offers is listed', async () => {
    const { editor: e } = mount({ people: [...USERS, NAMELESS] });
    click(e);
    await vi.waitFor(() => expect(rows().length).toBe(3)); // NAMELESS is not a row
    choose('Bea');
    const after = e.getJSON();
    const mentions = JSON.stringify(after).match(/"type":"mention"/g) ?? [];
    expect(mentions).toHaveLength(1); // replaced, not added
    expect(mentionIds(e)).toEqual([BEA.userId]);
    expect(JSON.stringify(after)).toContain('"label":"Bea"');
    expect(e.getText()).toBe('hi @Bea there'); // the words around it are untouched
    expect(popup()).toBeNull();
    // ONE undo brings the old mention back.
    e.commands.undo();
    expect(mentionIds(e)).toEqual([ANAND.userId]);
    expect(e.getText()).toBe('hi @Anand there');
    expect(e.can().undo()).toBe(false);
  });

  it('9.458 choosing the SAME person is a no-op: the document is untouched and nothing is added to the history', async () => {
    const { editor: e } = mount();
    const before = JSON.stringify(e.getJSON());
    click(e);
    await vi.waitFor(() => expect(rows().length).toBe(3));
    choose('Anand');
    expect(popup()).toBeNull();
    expect(JSON.stringify(e.getJSON())).toBe(before);
    expect(e.can().undo()).toBe(false);
  });

  it('9.459 Escape and a click elsewhere close the picker and leave the mention unchanged', async () => {
    const { editor: e } = mount();
    const before = JSON.stringify(e.getJSON());

    click(e);
    await vi.waitFor(() => expect(popup()).not.toBeNull());
    const escape = key(e, 'Escape');
    expect(popup()).toBeNull();
    expect(escape.defaultPrevented).toBe(true);
    expect(JSON.stringify(e.getJSON())).toBe(before);

    click(e);
    await vi.waitFor(() => expect(popup()).not.toBeNull());
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(popup()).toBeNull();
    expect(JSON.stringify(e.getJSON())).toBe(before);

    // CONTROL, same `it`: a mousedown INSIDE the popup does not close it before
    // the row's own handler has chosen — the picker is reopened and used.
    click(e);
    await vi.waitFor(() => expect(rows().length).toBe(3));
    choose('Anselma');
    expect(mentionIds(e)).toEqual([ANSELMA.userId]);
  });

  it('9.460 from the keyboard: Enter on a node-selected chip opens the picker, the arrows move, Enter chooses', async () => {
    const { editor: e } = mount();
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, mentionAt(e).pos)));
    const enter = key(e, 'Enter');
    expect(enter.defaultPrevented).toBe(true); // the note is not split
    await vi.waitFor(() => expect(rows().length).toBe(3));
    expect(selectedName()).toBe('Anand');
    key(e, 'ArrowDown');
    expect(selectedName()).toBe('Bea');
    key(e, 'Enter');
    expect(mentionIds(e)).toEqual([BEA.userId]);
    expect(e.state.doc.childCount).toBe(1); // still ONE paragraph
    expect(popup()).toBeNull();
  });

  it('9.461 a read-only rendering never opens it — control: the same document, editable, does', async () => {
    const reader = mount({ readOnly: true });
    // `readOnly` in the schema options only stops the collapsible persisting;
    // what makes a view a reader is the editor's own `editable` flag, which
    // every read-only rendering (note view, comment bodies, webview) turns off.
    reader.editor.setEditable(false);
    expect(click(reader.editor)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(popup()).toBeNull();
    expect(reader.queryUsers).not.toHaveBeenCalled();
    reader.editor.destroy();

    const writer = mount();
    expect(click(writer.editor)).toBe(true);
    await vi.waitFor(() => expect(popup()).not.toBeNull());
  });
});
