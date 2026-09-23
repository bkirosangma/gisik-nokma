import { describe, expect, it } from 'vitest';
import { mapNoteSearchHits, MappingError } from '../../src/online/mappers.js';

/**
 * The note-search client surface (case 18.154, notes series Plan 3 of 6).
 *
 * ## `source` is made HERE, and that is the case's whole subject
 *
 * The server's `NoteSearchHit` has no `source`: the mode is the request's own
 * parameter, so a per-row copy on the wire would be the caller's word echoed
 * back. The mapper is HANDED the mode it asked for and stamps it on every row.
 * The mutation this case names — "default `source` to `'lexical'` in meaning
 * mode" — is exactly the failure that looks harmless: every row would still
 * carry a valid `source`, the list would still render, and every meaning result
 * would be labelled a spelling match.
 *
 * ## A row missing `noteId` refuses
 *
 * `noteId` is the hit's identity AND the key the merge rule (spec §7.8)
 * de-duplicates on, so a defaulted `''` would merge every malformed row into
 * one — the same reasoning `mapNoteSummaries`' own case gives.
 */
const ROW = {
  noteId: '01J9GNOTE0000000000000001',
  title: 'Compressor log',
  snippet: 'the **compressor** stopped',
  homeProjectId: '01J9GPROJ0000000000000001',
  scopeMode: 'project',
  attachedTicketKeys: ['CCSO-7'],
  authorId: '01J9GUSER0000000000000001',
  updatedAt: '2026-09-23T09:00:00.000Z',
};

describe('18.154 — mapNoteSearchHits', () => {
  it('maps the wire row and stamps `source` from the mode it was asked for', () => {
    const lexical = mapNoteSearchHits({ notes: [ROW] }, 'lexical');
    expect(lexical.notes).toEqual([{ ...ROW, source: 'lexical' }]);
    expect(lexical.corrected, 'absent rather than [] when nothing was corrected').toBeUndefined();

    // The load-bearing half: the SAME body under the other mode.
    const meaning = mapNoteSearchHits({ notes: [ROW] }, 'meaning');
    expect(meaning.notes).toEqual([{ ...ROW, source: 'meaning' }]);
    expect(meaning.notes[0]?.source, 'not defaulted to lexical').toBe('meaning');

    const corrected = mapNoteSearchHits({ notes: [], corrected: ['compressor'] }, 'lexical');
    expect(corrected.notes).toEqual([]);
    expect(corrected.corrected).toEqual(['compressor']);
  });

  it('refuses a row without noteId, an unknown scopeMode, and a non-list notes', () => {
    const { noteId: _omitted, ...withoutId } = ROW;
    expect(() => mapNoteSearchHits({ notes: [withoutId] }, 'lexical')).toThrowError(MappingError);
    expect(() => mapNoteSearchHits({ notes: [withoutId] }, 'lexical')).toThrowError(/notes\[0\]\.noteId/);

    expect(() => mapNoteSearchHits({ notes: [{ ...ROW, scopeMode: 'everyone' }] }, 'lexical')).toThrowError(
      /notes\[0\]\.scopeMode/,
    );

    expect(() => mapNoteSearchHits({ notes: 'none' }, 'lexical')).toThrowError(/search\.notes/);
    expect(() => mapNoteSearchHits({}, 'lexical'), 'an absent notes key is not an empty list').toThrowError(
      MappingError,
    );
  });
});
