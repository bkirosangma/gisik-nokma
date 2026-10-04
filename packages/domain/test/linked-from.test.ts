import { describe, expect, it } from 'vitest';
import { linkedFromSourceTitle, parseLinkedFromTarget, splitSnippet, type LinkedFromRow } from '../src/index.js';

const T = '01J9ZZZZZZ0000000000000000'; // 26 Crockford chars: `ULID_REGEX` (`ids.ts:9`) refuses I, L, O, U and any other length
const row = (over: Partial<LinkedFromRow>): LinkedFromRow => ({
  sourceKind: 'ticket', sourceId: T, authorId: 'u1', snippet: 'a [[GN-1 One]] b', updatedAt: '2026-10-03T10:00:00.000Z',
  parent: { kind: 'ticket', ticketId: T, projectId: 'P', key: 'GN-118', title: 'Phone pass', stateCategory: 'open' }, ...over,
});

describe('27.125 the wire helpers', () => {
  it('27.125 a source title per kind; a ticket with no key falls back to its title', () => {
    expect(linkedFromSourceTitle(row({}))).toBe('GN-118 Phone pass');
    expect(linkedFromSourceTitle(row({ parent: { kind: 'note', noteId: 'N', title: 'Phone pass rulings' }, sourceKind: 'note' }))).toBe('Note: Phone pass rulings');
    expect(linkedFromSourceTitle(row({ sourceKind: 'comment', sourceId: 'C' }))).toBe('Comment on GN-118');
    expect(linkedFromSourceTitle(row({ sourceKind: 'comment', parent: { kind: 'note', noteId: 'N', title: 'Rulings' } }))).toBe('Comment on note Rulings');
    expect(linkedFromSourceTitle(row({ parent: { kind: 'ticket', ticketId: T, projectId: 'P', key: '', title: 'Phone pass', stateCategory: 'open' } }))).toBe('Phone pass');
    expect(linkedFromSourceTitle(row({ sourceKind: 'comment', sourceId: 'C', parent: { kind: 'ticket', ticketId: T, projectId: 'P', key: '', title: 'Phone pass', stateCategory: 'open' } }))).toBe('Comment on Phone pass');
  });

  it('27.125 splitSnippet finds the one marker; a snippet without one is null (control)', () => {
    expect(splitSnippet('a [[GN-1 One]] b')).toEqual({ before: 'a ', marked: 'GN-1 One', after: ' b' });
    expect(splitSnippet('no marker here')).toBeNull();
    expect(splitSnippet('a [[ never closed')).toBeNull(); // an open with no close
    expect(splitSnippet('a close ]] with no open')).toBeNull(); // a close with no open (the `open < 0` clause alone)
    expect(splitSnippet(']] a [[GN-1 One]] b')).toEqual({ before: ']] a ', marked: 'GN-1 One', after: ' b' }); // the close is searched AFTER the open
    expect(splitSnippet('[[]]')).toEqual({ before: '', marked: '', after: '' }); // the close may start right after the open
  });

  it('27.125 parseLinkedFromTarget takes ticket:/note: and a ULID; anything else is null', () => {
    expect(parseLinkedFromTarget(`ticket:${T}`)).toEqual({ kind: 'ticket', id: T });
    expect(parseLinkedFromTarget(`note:${T}`)).toEqual({ kind: 'note', id: T });
    for (const bad of [undefined, '', `person:${T}`, 'ticket:', `ticket:${T}x`, ['ticket', T]]) expect(parseLinkedFromTarget(bad)).toBeNull();
  });
});
