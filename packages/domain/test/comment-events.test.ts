import { describe, expect, it } from 'vitest';
import {
  applyNoteEvent,
  COMMENT_EVENT_TYPES,
  commentDeletedPayload,
  commentEditedPayload,
  domainRegistry,
  isCommentEvent,
  newUlid,
  NOTE_EVENT_TYPES,
  parseEvent,
} from '../src/index.js';
import { makeEnvelope } from '../src/testing.js';

const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] };

describe('26.040–26.041 comment.edited / comment.deleted', () => {
  it('26.040 registered for ticket and note, strict, ULID commentId', () => {
    const id = newUlid();
    expect(commentEditedPayload.safeParse({ commentId: id, body }).success).toBe(true); // control
    expect(commentDeletedPayload.safeParse({ commentId: id }).success).toBe(true);
    expect(commentEditedPayload.safeParse({ commentId: 'c1', body }).success).toBe(false);
    expect(commentEditedPayload.safeParse({ commentId: id, body, extra: 1 }).success).toBe(false);
    expect(commentDeletedPayload.safeParse({ commentId: id, body }).success).toBe(false);
    for (const type of ['comment.edited', 'comment.deleted']) {
      expect(domainRegistry.get(type, 1)?.entityKind).toEqual(['ticket', 'note']);
      // control: a ticket and a note parse; a project does not
      const payload = type === 'comment.edited' ? { commentId: id, body } : { commentId: id };
      for (const kind of ['ticket', 'note'] as const) {
        const env = makeEnvelope({ type, payload, entity: { kind, id: newUlid() } });
        const { serverTime: _s, seq: _q, ...submitted } = env;
        expect(parseEvent(submitted).ok, `${type} on ${kind}`).toBe(true);
      }
      const onProject = makeEnvelope({ type, payload, entity: { kind: 'project', id: newUlid() } });
      const { serverTime: _s, seq: _q, ...submitted } = onProject;
      expect(parseEvent(submitted).ok).toBe(false);
    }
    expect(COMMENT_EVENT_TYPES).toEqual(['comment.added', 'comment.edited', 'comment.deleted']);
    expect(isCommentEvent('comment.deleted')).toBe(true);
    expect(isCommentEvent('note.body_set')).toBe(false);
  });

  it('26.041 fold to no change on a live note; refused on a deleted one', () => {
    expect(NOTE_EVENT_TYPES).toContain('comment.edited');
    expect(NOTE_EVENT_TYPES).toContain('comment.deleted');
    const noteId = newUlid();
    const env = (type: string, payload: unknown, seq: number) =>
      makeEnvelope({
        type, payload, seq, entity: { kind: 'note', id: noteId },
        serverTime: `2026-10-02T10:00:0${seq}.000Z`,
      });
    const live = applyNoteEvent(null, env('note.created', { title: 'N', homeProjectId: '', scope: { mode: 'private' } }, 1));
    const unchanged = (s: typeof live) => ({ ...s, updatedAt: live.updatedAt, seq: live.seq });
    const added = applyNoteEvent(live, env('comment.added', { body }, 2)); // control
    expect(unchanged(added)).toEqual(live);
    expect(unchanged(applyNoteEvent(live, env('comment.edited', { commentId: newUlid(), body }, 2)))).toEqual(live);
    expect(unchanged(applyNoteEvent(live, env('comment.deleted', { commentId: newUlid() }, 2)))).toEqual(live);
    const gone = applyNoteEvent(live, env('note.deleted', {}, 3));
    expect(() => applyNoteEvent(gone, env('comment.added', { body }, 4))).toThrow(/the note is deleted/); // control
    expect(() => applyNoteEvent(gone, env('comment.edited', { commentId: newUlid(), body }, 4))).toThrow(/the note is deleted/);
    expect(() => applyNoteEvent(gone, env('comment.deleted', { commentId: newUlid() }, 4))).toThrow(/the note is deleted/);
  });
});
