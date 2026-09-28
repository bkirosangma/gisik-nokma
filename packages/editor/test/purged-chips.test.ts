import { describe, expect, it, vi } from 'vitest';
import { PURGED_ITEM_LABEL } from '@gisik-nokma/domain';
import { createTestEditor } from './helpers/create-editor.js';

/**
 * Trash series Plan 3, Task 8 (T11) — the editor draws a chip to an erased item
 * as "Deleted item" and keeps the stored bytes: the document round-trips
 * unchanged, which is what keeps the note editor's autosave from rewriting it.
 */

const para = (...content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
const isPurged = (_kind: 'ticket' | 'note', id: string) => id === 'gone';

describe('19.192 a purged ticketRef in the editor', () => {
  it('19.192 draws the label with no href in the node view, HTML and text, and keeps the stored attrs', () => {
    const doc = para(
      { type: 'ticketRef', attrs: { ticketId: 'gone', projectId: 'p1', key: 'SHOP-7', title: 'Invoice' } },
      { type: 'text', text: ' ' },
      { type: 'ticketRef', attrs: { ticketId: 'live', projectId: 'p1', key: 'SHOP-9', title: 'Fix the freezer' } },
    );
    const editor = createTestEditor({ isPurged, resolveTicketHref: () => '/w/x/p/p1?ticket=t' }, doc);
    const purged = editor.view.dom.querySelector('.editor-ticketref--purged');
    expect(purged?.tagName).toBe('SPAN');
    expect(purged?.textContent).toBe(PURGED_ITEM_LABEL);
    expect(purged?.getAttribute('href')).toBeNull();
    expect(purged?.getAttribute('data-ticket-id')).toBe('gone');
    expect(editor.getHTML()).toContain(`>${PURGED_ITEM_LABEL}<`);
    expect(editor.getText()).toContain(PURGED_ITEM_LABEL);
    expect(editor.getText()).not.toContain('Invoice');
    // The stored bytes are untouched (T11): the chip node still carries its key and title.
    const chipNode = (editor.getJSON() as { content: Array<{ content: Array<{ attrs: unknown }> }> }).content[0]!.content[0]!;
    expect(chipNode.attrs).toEqual({ ticketId: 'gone', projectId: 'p1', key: 'SHOP-7', title: 'Invoice' });
    // CONTROL
    const live = editor.view.dom.querySelector('a.editor-ticketref');
    expect(live?.textContent).toBe('SHOP-9 Fix the freezer');
    editor.destroy();
  });
});

describe('19.193 a purged wikiLink in the editor', () => {
  it('19.193 draws the label even when a title resolves, and does not navigate; a live link does', () => {
    const onNavigateNote = vi.fn();
    const doc = para(
      { type: 'wikiLink', attrs: { noteId: 'gone', title: 'Cold room' } },
      { type: 'text', text: ' ' },
      { type: 'wikiLink', attrs: { noteId: 'live', title: 'Old title' } },
    );
    const editor = createTestEditor({ isPurged, resolveNoteTitle: () => 'Resolved title', onNavigateNote }, doc);
    const purged = editor.view.dom.querySelector('.editor-wikilink--purged');
    expect(purged?.tagName).toBe('SPAN');
    expect(purged?.textContent).toBe(PURGED_ITEM_LABEL);
    expect(purged?.classList.contains('editor-wikilink--missing')).toBe(false);
    (purged as HTMLElement).click();
    expect(onNavigateNote).not.toHaveBeenCalled();
    const linkNode = (editor.getJSON() as { content: Array<{ content: Array<{ attrs: unknown }> }> }).content[0]!.content[0]!;
    expect(linkNode.attrs).toEqual({ noteId: 'gone', title: 'Cold room' });
    // CONTROL
    const live = editor.view.dom.querySelector('a.editor-wikilink');
    expect(live?.textContent).toBe('Resolved title');
    (live as HTMLElement).click();
    expect(onNavigateNote).toHaveBeenCalledWith('live');
    editor.destroy();
  });
});
