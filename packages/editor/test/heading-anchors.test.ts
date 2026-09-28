import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeadingAnchors, headingAnchorsKey } from '../src/extensions/heading-anchors.js';
import { createTestEditor } from './helpers/create-editor.js';
import { extractReadingMeta } from '../src/reading/reading-meta.js';

/**
 * 9.412–9.421 — KB `HeadingCopyLink` + the slugged heading node view, as a
 * decoration extension (see `extensions/heading-anchors.ts`).
 */
/** `navigator.clipboard` is a getter on the prototype; replace it on the instance and restore after. */
function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

afterEach(() => {
  delete (navigator as { clipboard?: unknown }).clipboard;
  for (const el of document.querySelectorAll('.editor-heading-link__status')) el.remove();
  vi.useRealTimers();
});

function heading(level: number, text: string) {
  return { type: 'heading', attrs: { level }, content: text === '' ? undefined : [{ type: 'text', text }] };
}
function doc(...blocks: unknown[]) {
  return { type: 'doc', content: blocks } as never;
}
function mount(content: unknown, headingLink?: (id: string) => string | null) {
  return createTestEditor(headingLink === undefined ? {} : { headingLink }, content as never);
}
const ids = (editor: { view: { dom: HTMLElement } }): Array<string | null> =>
  Array.from(editor.view.dom.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => h.getAttribute('id'));

describe('9.412 heading anchors are opt-in', () => {
  it('9.412 with no headingLink a heading has no id, no button and no live region; with it, all three', () => {
    const off = mount(doc(heading(2, 'Overview')));
    expect(ids(off)).toEqual([null]);
    expect(off.view.dom.querySelector('.editor-heading-link')).toBeNull();
    expect(document.querySelector('.editor-heading-link__status')).toBeNull();
    off.destroy();

    const on = mount(doc(heading(2, 'Overview')), (id) => `https://x/${id}`);
    expect(ids(on)).toEqual(['overview']);
    expect(on.view.dom.querySelector('h2')?.getAttribute('data-heading-id')).toBe('overview');
    expect(on.view.dom.querySelector('h2 > .editor-heading-link')).not.toBeNull();
    expect(document.querySelector('.editor-heading-link__status')).not.toBeNull();
    on.destroy();
    expect(document.querySelector('.editor-heading-link__status')).toBeNull(); // removed with the editor
  });

  it('9.412 the extension configured with no headingLink registers nothing (no plugin, no region)', () => {
    const bare = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, HeadingAnchors],
      content: doc(heading(2, 'Overview')),
    });
    expect(headingAnchorsKey.getState(bare.state)).toBeUndefined();
    expect(bare.view.dom.querySelector('.editor-heading-link')).toBeNull();
    expect(document.querySelector('.editor-heading-link__status')).toBeNull();
    bare.destroy();
  });
});

describe('9.413 ids over every level', () => {
  it('9.413 H1–H6 are all stamped, duplicates get -2/-3, an empty heading gets nothing, a punctuation one gets heading-N (N counts non-empty headings)', () => {
    const editor = mount(
      doc(
        heading(1, 'Notes'),
        heading(4, 'Notes'),
        heading(2, ''),
        heading(2, 'Notes'),
        heading(6, '...'),
        heading(5, 'Deep'),
      ),
      () => 'x',
    );
    expect(ids(editor)).toEqual(['notes', 'notes-2', null, 'notes-3', 'heading-4', 'deep']);
    editor.destroy();
  });

  it('9.413 the ids follow an edit', () => {
    const editor = mount(doc(heading(2, 'Overview')), () => 'x');
    editor.commands.setContent(doc(heading(2, 'Intro'), heading(2, 'Overview')));
    expect(ids(editor)).toEqual(['intro', 'overview']);
    editor.destroy();
  });
});

describe('9.414 one id function for the rail and the link', () => {
  it('9.414 extractReadingMeta lists H1–H3 with the same ids the extension stamped, H4+ stamped but not listed', () => {
    const editor = mount(
      doc(heading(4, 'Notes'), heading(2, 'Notes'), heading(3, 'Notes'), heading(1, 'Top')),
      () => 'x',
    );
    const root = editor.view.dom as HTMLElement;
    const meta = extractReadingMeta(root);
    expect(meta.headings.map((h) => h.id)).toEqual(['notes-2', 'notes-3', 'top']);
    // The copy-link fragment IS the rail's id, element for element.
    for (const entry of meta.headings) {
      expect(root.querySelector(`#${entry.id}`)?.getAttribute('data-heading-id')).toBe(entry.id);
    }
    expect(root.querySelector('h4')?.id).toBe('notes');
    editor.destroy();
  });

  it('9.414 a data-heading-id from the document wins over a reading of the rendered text', () => {
    const el = document.createElement('div');
    el.innerHTML = '<h2 data-heading-id="from-the-document">Rendered text differs</h2>';
    const meta = extractReadingMeta(el);
    expect(meta.headings[0]?.id).toBe('from-the-document');
    expect(el.querySelector('h2')?.id).toBe('from-the-document');
  });
});

function click(editor: { view: { dom: HTMLElement } }, index = 0): HTMLElement {
  const button = editor.view.dom.querySelectorAll<HTMLElement>('.editor-heading-link')[index] as HTMLElement;
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return button;
}

describe('9.415 the button copies the heading link', () => {
  it('9.415 writes headingLink(id) to the clipboard, once, and the click is not an edit or a selection change', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const link = vi.fn((id: string) => `https://app/notes/n1#${id}`);
    const editor = mount(doc(heading(2, 'Overview'), { type: 'paragraph', content: [{ type: 'text', text: 'body' }] }), link);
    const before = JSON.stringify(editor.getJSON());
    const selection = editor.state.selection.from;
    // Not evaluated until the click: a link built at render time would go stale.
    expect(link).not.toHaveBeenCalled();
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    editor.view.dom.querySelector('.editor-heading-link')?.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true); // the caret stays where it was
    // ProseMirror is told to leave the widget's events alone (the spec's contract).
    const specs = (headingAnchorsKey.getState(editor.state)?.find() ?? []).map(
      (decoration) => (decoration as unknown as { spec: { key?: string; stopEvent?: (e: Event) => boolean } }).spec,
    );
    const widgets = specs.filter((spec) => spec.key?.startsWith('heading-link:'));
    expect(widgets).toHaveLength(1);
    expect(widgets[0]?.stopEvent?.(new Event('mousedown'))).toBe(true);
    click(editor);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app/notes/n1#overview'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    expect(editor.state.selection.from).toBe(selection);
    editor.destroy();
  });

  it('9.415 a null link copies nothing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const editor = mount(doc(heading(2, 'Overview')), () => null);
    click(editor);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writeText).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('9.415 the link is read at CLICK time, so a renamed host is followed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    let origin = 'https://a';
    const editor = mount(doc(heading(2, 'Overview')), (id) => `${origin}#${id}`);
    origin = 'https://b';
    click(editor);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('https://b#overview'));
    editor.destroy();
  });
});

describe('9.416 feedback and the fallback', () => {
  it('9.416 marks the button copied for 1.5 s and announces it in the live region, then clears both', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const editor = mount(doc(heading(2, 'Overview')), () => 'https://x');
    const button = click(editor);
    await vi.advanceTimersByTimeAsync(0);
    expect(button.getAttribute('data-copied')).toBe('true');
    const status = document.querySelector('.editor-heading-link__status') as HTMLElement;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('Link copied');
    await vi.advanceTimersByTimeAsync(1501);
    expect(button.hasAttribute('data-copied')).toBe(false);
    expect(status.textContent).toBe('');
    editor.destroy();
  });

  it('9.416 with no clipboard API (the WebView) it falls back to execCommand and still says copied', async () => {
    setClipboard(undefined);
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    const editor = mount(doc(heading(2, 'Overview')), () => 'https://x');
    const button = click(editor);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(button.getAttribute('data-copied')).toBe('true');
    editor.destroy();
  });
});

describe('9.417 the button is not part of the heading', () => {
  it('9.417 has an accessible name, is not editable, is icon-only, and leaves the heading text and word count alone', () => {
    const editor = mount(doc(heading(2, 'Overview')), () => 'https://x');
    const button = editor.view.dom.querySelector('.editor-heading-link') as HTMLElement;
    expect(button.getAttribute('aria-label')).toBe('Copy link to this heading');
    expect(button.getAttribute('contenteditable')).toBe('false');
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    const meta = extractReadingMeta(editor.view.dom as HTMLElement);
    expect(meta.headings[0]?.text).toBe('Overview');
    expect(meta.wordCount).toBe(1);
    // The serialized document has no trace of it.
    expect(JSON.stringify(editor.getJSON())).not.toContain('heading-link');
    editor.destroy();
  });
});
