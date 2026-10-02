import { describe, expect, it } from 'vitest';
import { MappingError, mapNoteComments, mapTicketComments } from '../../src/online/mappers.js';

/**
 * `mapTicketComments` — the wire shape to the view shape.
 *
 * ## Case 16.73 — MINTED 2026-09-21, after the block was reallocated
 *
 * The controller ruled on 2026-09-20 (mid-task) that executor 2 had no free
 * ids, so this file shipped with a header saying the id was OWED rather than
 * omitted. **That is now discharged:** the block was reallocated on 2026-09-21
 * (`16.72`–`16.80`) and the owed id is minted as **`16.73`** in
 * `test-cases/16-remaining-doors.md` — see THE BLOCKS there.
 *
 * ⚠ **The id names the FILE, and the cases below are its ARMS.** §16's blocks
 * mint one id per decisive property and name the arms inside the entry, so the
 * `it` blocks below do not each carry their own number.
 *
 * ## The one thing this mapper must NOT do
 *
 * `files[].mime` is `string | null` ON THE WIRE because `null` is the server
 * saying an embedded attachment id resolved to no row — and the server renders
 * the ID in place of a name rather than dropping the entry. A mapper that
 * demanded a string would turn that honest fallback into a thrown
 * `MappingError`, i.e. **one unresolvable id would cost the reader the whole
 * thread.** That is the assertion below worth the most.
 *
 * `body` is deliberately NOT checked, and the reason is a contract rather than
 * an omission: a comment body is a ProseMirror document, amendment 12 keeps it
 * opaque outside `packages/editor`, and `docToPlainText` is total — so a
 * malformed body renders as empty text rather than failing the read. The last
 * case pins that too, because it is the shape of decision a later reader will
 * want to "fix".
 */

const COMMENT = {
  commentId: '01COMMENTONE',
  authorId: 'user_anselma',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hey' }] }] },
  recordedAt: '2026-09-20T16:23:57.306Z',
  files: [{ attachmentId: '01PROOF', filename: 'gst-receipt.png', mime: 'image/png' }],
};

describe('mapTicketComments', () => {
  it('maps a served thread, keeping every field it read', () => {
    expect(mapTicketComments({ comments: [COMMENT] })).toEqual([COMMENT]);
  });

  it('maps an ANSWERED empty thread to an empty list', () => {
    // The route answers a ticket with no comments with an empty array, and that
    // is the one thing `[]` means here — the read THROWS on a refusal instead.
    expect(mapTicketComments({ comments: [] })).toEqual([]);
  });

  it('keeps an unresolved file entry with a null mime rather than failing the read', () => {
    const unresolved = {
      ...COMMENT,
      files: [{ attachmentId: '01NOATTACHMENTROW', filename: '01NOATTACHMENTROW', mime: null }],
    };
    expect(mapTicketComments({ comments: [unresolved] })).toEqual([unresolved]);
  });

  it('refuses a file entry whose mime is neither a string nor null', () => {
    // The other side of the same rule: `null` is a claim the server can make,
    // and a NUMBER is not one any writer produces — so it is refused loudly
    // rather than coerced into a shape the renderer would draw as resolved.
    const nonsense = { ...COMMENT, files: [{ attachmentId: '01X', filename: 'x', mime: 7 }] };
    expect(() => mapTicketComments({ comments: [nonsense] })).toThrow(MappingError);
  });

  it('refuses a row missing a field it cannot invent', () => {
    const { commentId: _dropped, ...withoutId } = COMMENT;
    expect(() => mapTicketComments({ comments: [withoutId] })).toThrow(/comments\.comments\[0\]\.commentId/);
  });

  it('passes a body it cannot parse straight through, because the renderer is total', () => {
    // `docToPlainText` answers '' for a body that is not a document rather than
    // throwing, so a mapper that validated here would convert ONE malformed
    // document into a failed READ — losing a thread the renderer would have
    // drawn, minus one comment's text.
    const odd = { ...COMMENT, body: 'not a document at all' };
    expect(mapTicketComments({ comments: [odd] })[0]?.body).toBe('not a document at all');
    // The control: the same row with a well-formed body maps identically, so
    // the assertion above is about the pass-through and not about the fixture.
    expect(mapTicketComments({ comments: [COMMENT] })[0]?.body).toEqual(COMMENT.body);
  });
});

describe('26.116 the mappers carry editedAt and deletedAt', () => {
  const FULL = { ...COMMENT, editedAt: '2026-10-02T09:30:00.000Z', deletedAt: null };
  const NOTE_ROW = { commentId: '01NC', authorId: 'u1', body: COMMENT.body, recordedAt: COMMENT.recordedAt };

  it('ticket comments: a full row maps; absent fields read as null; a wrong type is refused with its path', () => {
    expect(mapTicketComments({ comments: [FULL] })[0]).toMatchObject({ editedAt: '2026-10-02T09:30:00.000Z', deletedAt: null }); // control
    expect(mapTicketComments({ comments: [{ ...COMMENT, deletedAt: '2026-10-02T10:00:00.000Z', body: null }] })[0]).toMatchObject({ deletedAt: '2026-10-02T10:00:00.000Z', body: null });
    const older = mapTicketComments({ comments: [COMMENT] })[0];
    expect(older?.editedAt).toBeNull();
    expect(older?.deletedAt).toBeNull();
    expect(() => mapTicketComments({ comments: [{ ...COMMENT, editedAt: 5 }] })).toThrow(/comments\.comments\[0\]\.editedAt/);
    expect(() => mapTicketComments({ comments: [{ ...COMMENT, deletedAt: 5 }] })).toThrow(MappingError);
  });

  it('note comments: the same three', () => {
    expect(mapNoteComments({ comments: [{ ...NOTE_ROW, editedAt: '2026-10-02T09:30:00.000Z', deletedAt: null }] })[0]).toMatchObject({ editedAt: '2026-10-02T09:30:00.000Z', deletedAt: null }); // control
    const older = mapNoteComments({ comments: [NOTE_ROW] })[0];
    expect(older?.editedAt).toBeNull();
    expect(older?.deletedAt).toBeNull();
    expect(() => mapNoteComments({ comments: [{ ...NOTE_ROW, editedAt: 5 }] })).toThrow(/comments\.comments\[0\]\.editedAt/);
  });
});
