import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { TicketEditor, type TicketEditorProps } from '../src/components/TicketEditor.js';
import { placePopover } from '../src/components/popover-position.js';
import type { DocJson } from '../src/doc.js';

/**
 * The link editor popover — ported from the knowledge-base app's
 * `LinkEditorPopover.test.tsx` (its DOC-4.7-01/07/09/12 and DOC-4.12-03 arms;
 * the wiki-link arms have no counterpart, see the component docblock).
 *
 * Driven through the real `TicketEditor`, not a hand-built host: the focus gate
 * and the portal are properties of the mounted composition.
 */

const HREF = 'https://example.com/a';

function linkedDoc(href = HREF, extraMarks: { type: string }[] = []): DocJson {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'see ' },
          { type: 'text', text: 'the docs', marks: [{ type: 'link', attrs: { href } }, ...extraMarks] },
          { type: 'text', text: ' now' },
        ],
      },
    ],
  };
}

function makeProps(overrides: Partial<TicketEditorProps> = {}): TicketEditorProps {
  return { queryUsers: async () => [], uploadAttachment: vi.fn(), onAttachmentAdded: vi.fn(), ...overrides };
}

async function mount(doc: DocJson = linkedDoc(), props: Partial<TicketEditorProps> = {}) {
  const editorRef: React.MutableRefObject<Editor | null> = { current: null };
  const view = render(<TicketEditor {...makeProps(props)} editorRef={editorRef} initialDoc={doc} />);
  await vi.waitFor(() => {
    expect(editorRef.current).not.toBeNull();
  });
  return { view, editor: editorRef.current as Editor };
}

/** Caret inside "the docs" (paragraph opens at 0, 'see ' is 1-5, the link 5-13). */
function caretInLink(editor: Editor): void {
  editor.chain().focus().setTextSelection(8).run();
}

const panel = (): HTMLElement | null => document.body.querySelector('.link-editor');
const url = (): HTMLInputElement => panel()?.querySelector('input[type="url"]') as HTMLInputElement;
const text = (): HTMLInputElement => panel()?.querySelector('input[type="text"]') as HTMLInputElement;
const linkOf = (editor: Editor): { text: string; href: string | undefined; marks: string[] }[] =>
  (editor.getJSON().content?.[0]?.content ?? []).map((n) => ({
    text: n.text ?? '',
    href: n.marks?.find((m) => m.type === 'link')?.attrs?.['href'] as string | undefined,
    marks: (n.marks ?? []).map((m) => m.type),
  }));

describe('the link editor popover', () => {
  it('9.385 shows URL and Text prefilled when the caret is in a link, and not otherwise', async () => {
    const { view, editor } = await mount();
    expect(panel()).toBeNull();
    // caret in the plain text before the link
    editor.chain().focus().setTextSelection(2).run();
    await vi.waitFor(() => {
      expect(editor.isFocused).toBe(true);
    });
    expect(panel()).toBeNull();
    caretInLink(editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    expect(panel()?.getAttribute('role')).toBe('dialog');
    expect(panel()?.querySelector('label[for]')?.textContent).toBe('URL');
    expect(url().value).toBe(HREF);
    expect(text().value).toBe('the docs');
    // it is portalled to <body>, outside the editor's own tree
    expect(view.container.querySelector('.link-editor')).toBeNull();
    // and follows the caret out again
    editor.chain().focus().setTextSelection(2).run();
    await vi.waitFor(() => {
      expect(panel()).toBeNull();
    });
    view.unmount();
    expect(panel()).toBeNull();
  });

  it('9.386 Enter commits a changed URL onto the link and returns focus to the editor', async () => {
    const { view, editor } = await mount();
    caretInLink(editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    fireEvent.change(url(), { target: { value: 'https://example.org/b' } });
    fireEvent.keyDown(url(), { key: 'Enter' });
    await vi.waitFor(() => {
      expect(linkOf(editor).find((n) => n.text === 'the docs')?.href).toBe('https://example.org/b');
    });
    expect(linkOf(editor).map((n) => n.text).join('')).toBe('see the docs now');
    expect(document.activeElement).toBe(editor.view.dom);
    view.unmount();
  });

  it('9.387 Escape reverts the URL draft, and the blur that follows commits nothing', async () => {
    const { view, editor } = await mount();
    caretInLink(editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    url().focus();
    fireEvent.change(url(), { target: { value: 'https://changed.example' } });
    fireEvent.keyDown(url(), { key: 'Escape' });
    await vi.waitFor(() => {
      expect(url().value).toBe(HREF);
    });
    expect(linkOf(editor).find((n) => n.text === 'the docs')?.href).toBe(HREF);
    view.unmount();
  });

  it('9.388 Unlink removes the link and leaves the text', async () => {
    const { view, editor } = await mount();
    caretInLink(editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    (panel()?.querySelector('button[aria-label="Remove link"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(linkOf(editor).some((n) => n.href !== undefined)).toBe(false);
    });
    expect(linkOf(editor).map((n) => n.text).join('')).toBe('see the docs now');
    await vi.waitFor(() => {
      expect(panel()).toBeNull();
    });
    view.unmount();
  });

  it('9.389 editing the Text rewrites the link text and KEEPS its other marks', async () => {
    const { view, editor } = await mount(linkedDoc(HREF, [{ type: 'bold' }]));
    caretInLink(editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    fireEvent.change(text(), { target: { value: 'the manual' } });
    fireEvent.keyDown(text(), { key: 'Enter' });
    await vi.waitFor(() => {
      expect(linkOf(editor).some((n) => n.text === 'the manual')).toBe(true);
    });
    const node = linkOf(editor).find((n) => n.text === 'the manual');
    expect(node?.href).toBe(HREF);
    expect(node?.marks).toContain('bold');
    expect(linkOf(editor).map((n) => n.text).join('')).toBe('see the manual now');
    view.unmount();
  });

  it('9.390 an emptied URL removes the link; an emptied Text deletes it', async () => {
    const first = await mount();
    caretInLink(first.editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    fireEvent.change(url(), { target: { value: '   ' } });
    fireEvent.keyDown(url(), { key: 'Enter' });
    await vi.waitFor(() => {
      expect(linkOf(first.editor).some((n) => n.href !== undefined)).toBe(false);
    });
    expect(linkOf(first.editor).map((n) => n.text).join('')).toBe('see the docs now');
    first.view.unmount();

    const second = await mount();
    caretInLink(second.editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    fireEvent.change(text(), { target: { value: '' } });
    fireEvent.keyDown(text(), { key: 'Enter' });
    await vi.waitFor(() => {
      expect(linkOf(second.editor).map((n) => n.text).join('')).toBe('see  now');
    });
    second.view.unmount();
  });

  it('9.391 with two editors mounted only the one that has focus shows the panel', async () => {
    const a = await mount();
    const b = await mount();
    caretInLink(a.editor);
    b.editor.chain().setTextSelection(8).run(); // caret in b's link, but b is not focused
    await vi.waitFor(() => {
      expect(document.body.querySelectorAll('.link-editor')).toHaveLength(1);
    });
    caretInLink(b.editor);
    await vi.waitFor(() => {
      expect(a.editor.isFocused).toBe(false);
      expect(b.editor.isFocused).toBe(true);
    });
    await vi.waitFor(() => {
      expect(document.body.querySelectorAll('.link-editor')).toHaveLength(1);
    });
    a.view.unmount();
    b.view.unmount();
  });

  it('9.392 a read-only editor never shows the panel', async () => {
    const { view, editor } = await mount(linkedDoc(), { editable: false });
    editor.commands.setTextSelection(8);
    editor.commands.focus();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(panel()).toBeNull();
    view.unmount();
  });

  it('9.393 offers Open only for http(s), mailto and tel destinations', async () => {
    const web = await mount();
    caretInLink(web.editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    const open = panel()?.querySelector<HTMLAnchorElement>('a.link-editor__action');
    expect(open?.getAttribute('href')).toBe(HREF);
    expect(open?.getAttribute('target')).toBe('_blank');
    expect(open?.getAttribute('rel')).toBe('noopener noreferrer');
    web.view.unmount();

    const other = await mount(linkedDoc('ftp://files.example/x'));
    caretInLink(other.editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    expect(panel()?.querySelector('a.link-editor__action')).toBeNull();
    // Unlink is still there
    expect(panel()?.querySelector('button[aria-label="Remove link"]')).not.toBeNull();
    other.view.unmount();
  });

  it('9.394 Ctrl-K with the caret in a link moves focus into the URL field', async () => {
    const { view, editor } = await mount();
    caretInLink(editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    fireEvent.keyDown(editor.view.dom, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(url());
    // and the panel stays up while focus is inside it
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(panel()).not.toBeNull();
    view.unmount();
  });

  it('9.395 leaving the panel for another field commits the edit WITHOUT taking focus back', async () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    const { view, editor } = await mount();
    caretInLink(editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    url().focus();
    fireEvent.change(url(), { target: { value: 'https://example.net/c' } });
    const focusEditor = vi.spyOn(editor.view, 'focus');
    outside.focus();
    await vi.waitFor(() => {
      expect(linkOf(editor).find((n) => n.text === 'the docs')?.href).toBe('https://example.net/c');
    });
    expect(document.activeElement).toBe(outside);
    // Tiptap defers `focus()` to an animation frame, so wait one out first.
    await new Promise((resolve) => setTimeout(resolve, 50));
    // the blur commit does not ask the editor for focus (Enter does; a blur must not)
    expect(focusEditor).not.toHaveBeenCalled();
    outside.remove();
    view.unmount();
  });
});

describe('the popover skin', () => {
  it('9.397 every class the open panel renders has a rule in editor.css', async () => {
    const { view, editor } = await mount();
    caretInLink(editor);
    await vi.waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    const drawn = new Set<string>();
    for (const el of (panel() as HTMLElement).querySelectorAll('*')) for (const c of Array.from(el.classList)) drawn.add(c);
    for (const c of Array.from((panel() as HTMLElement).classList)) drawn.add(c);
    expect([...drawn].sort()).toEqual([
      'link-editor',
      'link-editor__action',
      'link-editor__actions',
      'link-editor__input',
      'link-editor__label',
      'link-editor__row',
    ]);
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, '../src/styles/editor.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const c of drawn) {
      expect(css, `editor.css has no rule for .${c}`).toMatch(new RegExp(`\\.${c}(?![\\w-])[^{]*\\{`));
    }
    view.unmount();
  });
});

describe('placePopover', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 320, height: 120 };

  it('9.396 sits below the anchor, flips above when it would clip, and is pinned inside the viewport', () => {
    // below
    expect(placePopover({ anchor: { top: 100, bottom: 120, left: 50 }, size, viewport })).toEqual({ top: 126, left: 50 });
    // no room below → above (anchor.top - height - gap)
    expect(placePopover({ anchor: { top: 700, bottom: 720, left: 50 }, size, viewport })).toEqual({ top: 574, left: 50 });
    // right edge → pulled back by width + margin
    expect(placePopover({ anchor: { top: 100, bottom: 120, left: 900 }, size, viewport }).left).toBe(672);
    // left edge → margin
    expect(placePopover({ anchor: { top: 100, bottom: 120, left: -40 }, size, viewport }).left).toBe(8);
    // flipped above but still off the top → margin
    expect(placePopover({ anchor: { top: 20, bottom: 790, left: 0 }, size, viewport }).top).toBe(8);
  });
});
