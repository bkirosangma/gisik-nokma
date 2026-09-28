import { describe, expect, it } from 'vitest';
import { chunkDoc, collectDocReferences, docToPlainText, PURGED_ITEM_LABEL } from '../src/index.js';

/** Trash series Plan 2, Task 7 — cases 19.128, 19.129 (`test-cases/19-trash.md` §19.15). */

const T = 'ticket-purged';
const T2 = 'ticket-deep';
const N = 'note-purged';
const ref = (ticketId: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: 'p', key: 'PG-1', title: 'Invoice' } });
const link = (noteId: string) => ({ type: 'wikiLink', attrs: { noteId, title: 'Minutes' } });
const txt = (text: string) => ({ type: 'text', text });

const body = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [txt('see '), ref(T), txt(' and '), link(N)] }],
};
const purged = (kind: 'ticket' | 'note', id: string) => (kind === 'ticket' && id === T) || (kind === 'note' && id === N);

describe('19.128 a purged chip renders as Deleted item', () => {
  it('replaces both chip kinds, passes through chunkDoc (body and heading), and is inert without the option', () => {
    expect(docToPlainText(body, { isPurged: purged })).toBe(`see ${PURGED_ITEM_LABEL} and ${PURGED_ITEM_LABEL}`);
    expect(chunkDoc(body, { isPurged: purged })).toEqual([
      { headingPath: '', text: `see ${PURGED_ITEM_LABEL} and ${PURGED_ITEM_LABEL}` },
    ]);
    const headed = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [ref(T)] },
        { type: 'paragraph', content: [txt('body')] },
      ],
    };
    expect(chunkDoc(headed, { isPurged: purged })).toEqual([
      { headingPath: PURGED_ITEM_LABEL, text: `${PURGED_ITEM_LABEL}\nbody` },
    ]);
    // CONTROL — the same documents without a resolver, and with one that purges nothing.
    expect(docToPlainText(body)).toBe('see PG-1 Invoice and Minutes');
    expect(docToPlainText(body, { isPurged: () => false })).toBe('see PG-1 Invoice and Minutes');
  });
});

describe('19.129 collectDocReferences finds every chip once', () => {
  it('collects ticket and note ids at any depth, once each, ignoring mentions and empty ids', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            ref(T),
            ref(T),
            link(N),
            { type: 'mention', attrs: { userId: 'u1' } },
            { type: 'ticketRef', attrs: { ticketId: '' } },
          ],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [ref(T2)] }] },
      ],
    };
    expect(collectDocReferences(doc)).toEqual({ ticketIds: [T, T2], noteIds: [N] });
    expect(collectDocReferences(null)).toEqual({ ticketIds: [], noteIds: [] }); // CONTROL — total
    expect(collectDocReferences('not a doc')).toEqual({ ticketIds: [], noteIds: [] });
  });
});
