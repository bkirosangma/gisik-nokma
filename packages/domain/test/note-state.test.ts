import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../src/envelope.js';
import { makeEnvelope } from '../src/testing.js';
import { applyNoteEvent, EMPTY_NOTE_DOC, type NoteState } from '../src/note-state.js';

// Valid Crockford base32 (`ULID_REGEX`, `../src/ids.ts`) — 'O' and 'U' are
// excluded from the alphabet, so the plan text's `01J9GNOT…` / `01J9GUSA…`
// literals are not ULIDs. `makeEnvelope` does not validate, so an invalid one
// would sit here silently and break the first later reader that DOES validate.
const NOTE = '01J9GNT0000000000000000000';
const T1 = '01J9GTKA000000000000000001';
const T2 = '01J9GTKA000000000000000002';
const A = '01J9GRSA000000000000000000';
const B = '01J9GRSB000000000000000000';

let seq = 0;
function ev(type: string, payload: unknown, extra: Partial<EventEnvelope> = {}): EventEnvelope {
  seq += 1;
  return makeEnvelope({
    type,
    payload,
    seq,
    entity: { kind: 'note', id: NOTE },
    serverTime: `2026-09-23T10:00:${String(seq).padStart(2, '0')}.000Z`,
    ...extra,
  });
}
function fold(events: EventEnvelope[]): NoteState {
  let state: NoteState | null = null;
  for (const e of events) state = applyNoteEvent(state, e);
  if (state === null) throw new Error('no events');
  return state;
}
const created = (scope: unknown, extra: Record<string, unknown> = {}) =>
  ev('note.created', { title: 'Cold room', homeProjectId: 'P1', scope, ...extra });

describe('18.004 note.created', () => {
  it('18.004 builds the state from the payload and the envelope', () => {
    const e = created({ mode: 'inherit' }, { attachTicketId: T1, body: { type: 'doc', content: [] } });
    const s = fold([e]);
    expect(s.authorId).toBe(e.actorId);
    expect(s.body).toEqual({ type: 'doc', content: [] });
    expect(s.attachedTicketIds).toEqual([T1]);
    expect(s.scopeBeforeInherit).toBeNull();
    expect(s.deleted).toBe(false);
    expect(s.lastBodyEventId).toBe(e.id);
    expect(fold([created({ mode: 'private' })]).body).toEqual(EMPTY_NOTE_DOC); // control: no body → empty doc
  });
});

describe('18.005-18.009 the detach rule', () => {
  it('18.005 reverts to the remembered scope on the last detach', () => {
    const s = fold([
      created({ mode: 'project' }),
      ev('note.attached', { ticketId: T1 }),
      ev('note.scope_set', { mode: 'inherit' }),
      ev('note.attached', { ticketId: T2 }),
      ev('note.detached', { ticketId: T1 }),
      ev('note.detached', { ticketId: T2 }),
    ]);
    expect(s.scope).toEqual({ mode: 'project' });
    expect(s.scopeBeforeInherit).toBeNull();
  });
  it('18.006 born in inherit → private on the last detach', () => {
    const s = fold([created({ mode: 'inherit' }, { attachTicketId: T1 }), ev('note.detached', { ticketId: T1 })]);
    expect(s.scope).toEqual({ mode: 'private' });
  });
  it('18.007 explicit is remembered with its userIds', () => {
    const s = fold([
      created({ mode: 'explicit', userIds: [A, B] }),
      ev('note.attached', { ticketId: T1 }),
      ev('note.scope_set', { mode: 'inherit' }),
      ev('note.detached', { ticketId: T1 }),
    ]);
    expect(s.scope).toEqual({ mode: 'explicit', userIds: [A, B] });
  });
  it('18.008 a detach that is not the last keeps inherit', () => {
    const s = fold([
      created({ mode: 'inherit' }, { attachTicketId: T1 }),
      ev('note.attached', { ticketId: T2 }),
      ev('note.detached', { ticketId: T1 }),
    ]);
    expect(s.scope).toEqual({ mode: 'inherit' });
    expect(s.attachedTicketIds).toEqual([T2]);
  });
  it('18.009 scope_set to a non-inherit mode clears the memory', () => {
    const s = fold([
      created({ mode: 'project' }),
      ev('note.attached', { ticketId: T1 }),
      ev('note.scope_set', { mode: 'inherit' }),
      ev('note.scope_set', { mode: 'workspace' }),
    ]);
    expect(s.scopeBeforeInherit).toBeNull();
    expect(s.scope).toEqual({ mode: 'workspace' });
  });
});

describe('18.010-18.012 refusals and idempotence', () => {
  it('18.010 each precondition throws; a valid event does not (control)', () => {
    expect(() => fold([created({ mode: 'private' }), created({ mode: 'private' })])).toThrow(/note\.created/);
    expect(() => fold([created({ mode: 'private' }), ev('note.scope_set', { mode: 'inherit' })])).toThrow(/inherit/);
    expect(() => fold([ev('note.renamed', { title: 'x' })])).toThrow(/note\.renamed/);
    expect(() =>
      fold([created({ mode: 'private' }), ev('note.deleted', {}), ev('note.renamed', { title: 'x' })]),
    ).toThrow(/deleted/);
    expect(() => fold([created({ mode: 'private' }), ev('note.restored', {})])).toThrow(/not deleted/);
    expect(fold([created({ mode: 'private' }), ev('note.renamed', { title: 'Freezer' })]).title).toBe('Freezer');
  });
  it('18.011 attach is idempotent', () => {
    const s = fold([
      created({ mode: 'private' }),
      ev('note.attached', { ticketId: T1 }),
      ev('note.attached', { ticketId: T1 }),
    ]);
    expect(s.attachedTicketIds).toEqual([T1]);
  });
  it('18.012 moved to workspace level under project scope throws', () => {
    expect(() => fold([created({ mode: 'project' }), ev('note.moved', { homeProjectId: '' })])).toThrow(/project/);
    expect(fold([created({ mode: 'private' }), ev('note.moved', { homeProjectId: '' })]).homeProjectId).toBe(''); // control
  });
});

describe('18.014 envelope fields', () => {
  it('18.014 updatedAt and seq follow the latest event', () => {
    const e2 = ev('note.renamed', { title: 'x' });
    const s = fold([created({ mode: 'private' }), e2]);
    expect(s.updatedAt).toBe(e2.serverTime);
    expect(s.seq).toBe(e2.seq);
  });
});
