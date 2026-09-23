import { describe, expect, it, vi } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

/**
 * 9.276–9.279 — spec §8.5, wiki-links to notes.
 *
 * The four cases split by CONCERN, not by node: 9.276 is the `[[` suggestion
 * and the insertion, 9.277/9.278 are the three rendering outcomes of the
 * resolver, and 9.279 is what the document actually STORES. The last is
 * separate on purpose — the rendered text and the stored attrs are two
 * different answers to "what is this link", and a change that swapped one for
 * the other (storing the resolved title, say) would leave every rendering case
 * green while making the document wrong.
 */
const NOTES = [
  { noteId: 'n1', title: 'Cold room' },
  { noteId: 'n2', title: 'Compressor log' },
];

describe('9.276-9.279 wiki-links', () => {
  it('9.276 [[ opens the suggestion; Enter inserts the node; Escape keeps the text', async () => {
    const queryNotes = vi.fn(async (q: string) =>
      NOTES.filter((n) => n.title.toLowerCase().includes(q.toLowerCase())),
    );
    const editor = createTestEditor({ queryNotes });
    typeText(editor, 'see [[co');
    await vi.waitFor(() => {
      expect(queryNotes).toHaveBeenCalledWith('co');
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.wikilink-popup')).not.toBeNull();
    });
    // ⚠ WAITING FOR THE POPUP IS NOT WAITING FOR ITS ROWS, and the difference
    // is the whole case. `onStart` creates the container the moment `[[` is
    // typed; the candidates arrive a microtask later, and until they do the
    // popup's `onKeyDown` DECLINES every key by design (an empty list means
    // nothing to navigate — see `wiki-link-popup.ts`). Pressing Enter in that
    // window falls through to the base keymap and SPLITS THE PARAGRAPH. So the
    // case waits for a row.
    await vi.waitFor(() => {
      expect(document.querySelector('.wikilink-popup__item')).not.toBeNull();
    });
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const para = editor.getJSON().content?.[0];
    const link = para?.content?.find((n) => n.type === 'wikiLink');
    expect(link?.attrs).toEqual({ noteId: 'n1', title: 'Cold room' });
    editor.commands.clearContent();
    typeText(editor, '[[co');
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(editor.getText()).toBe('[[co');
    editor.destroy();
  });

  /**
   * THE THREE RENDERINGS, in one case, because they are three answers to one
   * question and the interesting property is that they are DISTINGUISHED: a
   * node view that always showed the stored title would pass the second arm
   * and fail the first, and one that always linked would pass the first two
   * and fail the third.
   */
  it('9.277/9.278 rendering follows the resolver: live title, stored title, or the missing pill', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Old title' } }],
        },
      ],
    };
    const live = createTestEditor({ resolveNoteTitle: () => 'New title' }, doc);
    expect(live.view.dom.querySelector('a.editor-wikilink')?.textContent).toBe('New title');
    expect(live.view.dom.querySelector('a.editor-wikilink')?.getAttribute('href')).toBe('/notes/n1');
    live.destroy();

    // No resolver at all: the STORED title is the best available answer, and it
    // is still a link — the target may be perfectly readable, this editor just
    // cannot check.
    const plain = createTestEditor(undefined, doc);
    expect(plain.view.dom.querySelector('a.editor-wikilink')?.textContent).toBe('Old title');
    plain.destroy();

    const missing = createTestEditor({ resolveNoteTitle: () => null }, doc);
    const pill = missing.view.dom.querySelector('.editor-wikilink--missing');
    expect(pill?.tagName).toBe('SPAN');
    expect(pill?.getAttribute('href')).toBeNull();
    expect(pill?.textContent).toBe('Old title');
    missing.destroy();
  });

  it('9.279 the stored attrs are exactly noteId and title', () => {
    const editor = createTestEditor();
    editor.commands.insertWikiLink({ noteId: 'n2', title: 'Compressor log' });
    const link = editor.getJSON().content?.[0]?.content?.find((n) => n.type === 'wikiLink');
    expect(Object.keys(link?.attrs ?? {}).sort()).toEqual(['noteId', 'title']);
    editor.destroy();
  });
});
