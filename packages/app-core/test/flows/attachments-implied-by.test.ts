import { describe, expect, it } from 'vitest';
import { attachmentsImpliedBy, noteReferencesIn } from '../../src/flows/attachments-implied-by.js';
import { makeSubmittedFactory } from '../../src/submit.js';
import { TICKET, WS } from '../helpers/seed.js';

/**
 * Cases 18.275, 18.279 — Plan 7 Task 5 (spec §14.3, D27–D28): the pure half of
 * "tagging a note in a ticket comment attaches it". The ingest, the toast and
 * the reload are `ticket-sheet.tsx`'s (`ticket-sheet-comments.test.tsx`,
 * 18.276–18.278, 18.280); this file is the document walk alone.
 */

const make = makeSubmittedFactory({ actorId: 'user_kiro', origin: 'web' });

function doc(...content: unknown[]): unknown {
  return { type: 'doc', content: [{ type: 'paragraph', content }] };
}

function wikiLink(noteId: string, title: string): unknown {
  return { type: 'wikiLink', attrs: { noteId, title } };
}

function ticketRef(refTicketId: string, projectId: string, key: string, title: string): unknown {
  return { type: 'ticketRef', attrs: { ticketId: refTicketId, projectId, key, title } };
}

describe('18.275 attachmentsImpliedBy', () => {
  it('18.275 returns one note.attached per distinct referenced note, skipping already-attached ones; [] for a body with none (control)', () => {
    const body = doc(
      wikiLink('n1', 'Cold room'),
      { type: 'text', text: ' and ' },
      wikiLink('n2', 'Compressor log'),
      // The SAME note referenced twice — DISTINCT, not one event per occurrence
      // (the mutation this case names).
      wikiLink('n1', 'Cold room'),
    );
    const events = attachmentsImpliedBy(body, WS, TICKET, [], make);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.entity)).toEqual([
      { kind: 'note', id: 'n1' },
      { kind: 'note', id: 'n2' },
    ]);
    for (const event of events) {
      expect(event.type).toBe('note.attached');
      expect(event.payload).toEqual({ ticketId: TICKET });
      expect(event.workspaceId).toBe(WS);
    }

    // Already-attached notes are skipped.
    const skipped = attachmentsImpliedBy(body, WS, TICKET, ['n1'], make);
    expect(skipped.map((e) => e.entity.id)).toEqual(['n2']);

    // CONTROL, in the same `it`: a body with no references implies nothing.
    expect(attachmentsImpliedBy(doc({ type: 'text', text: 'no links here' }), WS, TICKET, [], make)).toEqual([]);
  });
});

describe('18.279 ticketRef implies no attachment', () => {
  it('18.279 a ticketRef in the body produces no note.attached — only wikiLink does', () => {
    const body = doc(ticketRef('t9', 'p1', 'SHOP-9', 'Fix the freezer'), wikiLink('n1', 'Cold room'));
    const events = attachmentsImpliedBy(body, WS, TICKET, [], make);
    // The wikiLink still implies one attachment; the ticketRef beside it implies none.
    expect(events).toHaveLength(1);
    expect(events[0]?.entity).toEqual({ kind: 'note', id: 'n1' });
  });
});

describe('noteReferencesIn — the title lookup ticket-sheet.tsx uses for its toast', () => {
  it('carries each distinct reference\'s title alongside its noteId, in first-seen order', () => {
    const body = doc(
      wikiLink('n2', 'Compressor log'),
      wikiLink('n1', 'Cold room'),
      wikiLink('n2', 'Compressor log'),
    );
    expect(noteReferencesIn(body)).toEqual([
      { noteId: 'n2', title: 'Compressor log' },
      { noteId: 'n1', title: 'Cold room' },
    ]);
  });

  it('is total: malformed input yields [] rather than throwing', () => {
    for (const input of [null, undefined, 42, 'x', [], {}, { type: 7 }]) {
      expect(() => noteReferencesIn(input)).not.toThrow();
    }
    expect(noteReferencesIn(null)).toEqual([]);
  });
});
