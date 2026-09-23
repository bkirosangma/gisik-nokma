import { describe, expect, it } from 'vitest';
import { mapNoteDetail, mapNoteSummaries, mapNoteVersions, MappingError } from '../../src/online/mappers.js';

/**
 * The note mappers (notes series, Plan 1 of 6).
 *
 * ## What these cases are FOR, given the server has its own
 *
 * `apps/server/test/routes/notes.test.ts` proves the ROUTES answer correctly.
 * These prove the CLIENT reads the answers — a different failure with a
 * different shape, and the one this series has been bitten by before: a wire
 * field the server sends and the mapper drops, where every server case is green
 * and every view renders a hole. The mapper is the only place a field can go
 * missing without an error anywhere.
 *
 * ## Why `{}` and not a hand-built row in every case
 *
 * The fixture is one complete row, and each case changes ONE field of it. A case
 * that built its own minimal row would pass whichever fields it happened to
 * omit, and the mapper's refusals would go untested.
 */

const summary = {
  noteId: 'n1',
  workspaceId: 'w',
  homeProjectId: 'p',
  authorId: 'u',
  title: 'T',
  scope: { mode: 'explicit', userIds: ['u2'] },
  attachedTickets: [{ ticketId: 't', key: 'SHOP-1', title: 'Tk' }],
  deleted: false,
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:01.000Z',
};

describe('18.036 mapNoteSummaries', () => {
  it('18.036 maps a valid row and refuses a row without noteId', () => {
    expect(mapNoteSummaries({ notes: [summary] })).toEqual([summary]);
    const { noteId: _drop, ...bad } = summary;
    expect(() => mapNoteSummaries({ notes: [bad] })).toThrow(MappingError);
    expect(() => mapNoteSummaries({ notes: [bad] })).toThrow(/notes\[0\]\.noteId/);
    // A row that is not an object at all is refused at the same path rather
    // than dereferenced into a TypeError naming nothing.
    expect(() => mapNoteSummaries({ notes: ['nope'] })).toThrow(/notes\[0\]/);
    // The ENVELOPE is checked too: the route sends `{ notes }`, and a mapper
    // that accepted the array bare would hide a route change.
    expect(() => mapNoteSummaries([summary])).toThrow(/notes: expected an object/);
  });
});

describe('18.037 mapNoteDetail', () => {
  it('18.037 keeps body as-is and schemaVersion numeric', () => {
    const body = { type: 'doc', content: [{ type: 'paragraph' }] };
    const d = mapNoteDetail({ note: { ...summary, body, schemaVersion: 2 } });
    // IDENTITY, not equality: a mapper that stringified and re-parsed the body
    // would pass `toEqual` and hand the editor a different object graph.
    expect(d.body).toBe(body);
    expect(d.schemaVersion).toBe(2);
    // The summary half rides through unchanged.
    expect(d.noteId).toBe('n1');
    expect(d.attachedTickets).toEqual(summary.attachedTickets);
    // A string version is REFUSED rather than coerced: `Number('2')` would hide
    // a wire change behind a conversion.
    expect(() => mapNoteDetail({ note: { ...summary, body, schemaVersion: '2' } })).toThrow(
      /note\.note\.schemaVersion/,
    );
  });
});

describe('18.037b the scope union', () => {
  it('reads userIds only for explicit, and refuses an unknown mode', () => {
    // Every non-explicit mode is a member of the union on its own. A mapper that
    // attached `userIds: []` to them would be producing a value the union does
    // not contain — and it would typecheck, because the field is read from
    // `unknown`.
    for (const mode of ['private', 'workspace', 'project', 'inherit'] as const) {
      expect(mapNoteSummaries({ notes: [{ ...summary, scope: { mode } }] })[0]!.scope).toEqual({ mode });
    }
    expect(mapNoteSummaries({ notes: [{ ...summary, scope: { mode: 'explicit', userIds: ['a'] } }] })[0]!.scope).toEqual(
      { mode: 'explicit', userIds: ['a'] },
    );
    expect(() => mapNoteSummaries({ notes: [{ ...summary, scope: { mode: 'shared' } }] })).toThrow(
      /notes\[0\]\.scope\.mode/,
    );
  });
});

describe('18.037c mapNoteVersions', () => {
  it('maps pointers, and refuses a version without a seq', () => {
    const version = { eventId: 'e1', authorId: 'u', recordedAt: '2026-09-23T00:00:00.000Z', seq: 3 };
    expect(mapNoteVersions({ versions: [version] })).toEqual([version]);
    const { seq: _drop, ...bad } = version;
    expect(() => mapNoteVersions({ versions: [bad] })).toThrow(/versions\.versions\[0\]\.seq/);
  });
});
