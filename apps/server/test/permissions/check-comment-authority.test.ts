import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEnvelope, newUlid } from '@gisik-nokma/domain';
import { checkPermission, PERMISSION_VISIBILITY_RULE } from '../../src/permissions/check-permission.js';
import {
  COMMENT_ALREADY_DELETED_REASON,
  COMMENT_DELETE_AUTHORITY_REASON,
  COMMENT_EDIT_AUTHOR_REASON,
  COMMENT_NOTE_DELETED_REASON,
  COMMENT_PERMISSION_RULE,
  COMMENT_UNKNOWN_REASON,
} from '../../src/permissions/check-comment-authority.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';

let db: TestDatabase;
let fx: NotesFixture;
const BODY = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] };

/** A comment through the projections, by `who`, on a ticket or a note; answers its id. */
async function comment(kind: 'ticket' | 'note', parent: string, who: NotesUser): Promise<string> {
  const env = makeCommitted({ workspaceId: fx.WS, actorId: fx.ids[who], entity: { kind, id: parent }, type: 'comment.added', payload: { body: BODY } });
  await applyCommitted(db.pool, [env]);
  return env.id;
}

async function gate(type: 'comment.edited' | 'comment.deleted', kind: 'ticket' | 'note', parent: string, commentId: string, who: NotesUser) {
  const env = makeEnvelope({
    type, workspaceId: fx.WS, entity: { kind, id: parent }, actorId: fx.ids[who], origin: 'web',
    payload: type === 'comment.edited' ? { commentId, body: BODY } : { commentId },
  });
  return checkPermission(env, { db: db.pool, sessionUserId: fx.ids[who] });
}

const refusal = (reason: string) => ({ refused: true, rule: COMMENT_PERMISSION_RULE, reason });

beforeAll(async () => {
  db = await createTestDatabase();
  fx = await seedNotesFixture(db.pool);
});
afterAll(async () => {
  await db.drop();
});

describe('26.042–26.046 who may edit or delete a comment', () => {
  it('26.042 ticket edit: author only; visibility first', async () => {
    const c = await comment('ticket', fx.TP, 'memberIn');
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'memberIn')).toBeNull(); // control
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'admin')).toEqual(refusal(COMMENT_EDIT_AUTHOR_REASON));
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'owner')).toEqual(refusal(COMMENT_EDIT_AUTHOR_REASON));
    expect((await gate('comment.edited', 'ticket', fx.TP, c, 'guestUnlisted'))?.rule).toBe(PERMISSION_VISIBILITY_RULE);
  });

  it('26.043 ticket delete: author, admin, owner; not another member', async () => {
    const byMember = await comment('ticket', fx.TP, 'memberIn');
    for (const who of ['memberIn', 'admin', 'owner'] as const) {
      expect(await gate('comment.deleted', 'ticket', fx.TP, byMember, who), who).toBeNull();
    }
    const byAdmin = await comment('ticket', fx.TP, 'admin');
    expect(await gate('comment.deleted', 'ticket', fx.TP, byAdmin, 'memberIn')).toEqual(refusal(COMMENT_DELETE_AUTHORITY_REASON));
  });

  it('26.044 note comments: the note read rule first, then the same two rules', async () => {
    const c = await comment('note', fx.NOTES.nWorkspace, 'memberIn');
    expect(await gate('comment.edited', 'note', fx.NOTES.nWorkspace, c, 'memberIn')).toBeNull(); // control
    expect(await gate('comment.edited', 'note', fx.NOTES.nWorkspace, c, 'admin')).toEqual(refusal(COMMENT_EDIT_AUTHOR_REASON));
    expect(await gate('comment.deleted', 'note', fx.NOTES.nWorkspace, c, 'owner')).toBeNull();
    expect(await gate('comment.deleted', 'note', fx.NOTES.nWorkspace, c, 'memberOut')).toEqual(refusal(COMMENT_DELETE_AUTHORITY_REASON));
    const onPrivate = await comment('note', fx.NOTES.nPrivate, 'author');
    expect(await gate('comment.edited', 'note', fx.NOTES.nPrivate, onPrivate, 'memberIn')).toMatchObject({ rule: 'permission.note' });
  });

  it('26.045 a deleted comment can be neither edited nor deleted again', async () => {
    const c = await comment('ticket', fx.TP, 'memberIn');
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'memberIn')).toBeNull(); // control
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: fx.WS, actorId: fx.ids.memberIn, entity: { kind: 'ticket', id: fx.TP }, type: 'comment.deleted', payload: { commentId: c } }),
    ]);
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'memberIn')).toEqual(refusal(COMMENT_ALREADY_DELETED_REASON));
    expect(await gate('comment.deleted', 'ticket', fx.TP, c, 'owner')).toEqual(refusal(COMMENT_ALREADY_DELETED_REASON));
  });

  it("26.046 an unknown id and another parent's comment are one answer", async () => {
    const onTE = await comment('ticket', fx.TE, 'owner');
    expect(await gate('comment.edited', 'ticket', fx.TP, newUlid(), 'memberIn')).toEqual(refusal(COMMENT_UNKNOWN_REASON));
    expect(await gate('comment.deleted', 'ticket', fx.TP, onTE, 'owner')).toEqual(refusal(COMMENT_UNKNOWN_REASON));
    expect(await gate('comment.deleted', 'ticket', fx.TE, onTE, 'owner')).toBeNull(); // control: the right parent
  });

  it('26.052 (note arm) a deleted note refuses an edit; restoring it lets the same edit through', async () => {
    const c = await comment('note', fx.NOTES.nProject, 'author');
    const noteEv = (type: string) =>
      makeCommitted({ workspaceId: fx.WS, actorId: fx.ids.author, entity: { kind: 'note', id: fx.NOTES.nProject }, type, payload: {} });
    expect(await gate('comment.edited', 'note', fx.NOTES.nProject, c, 'author')).toBeNull(); // control: live note
    await applyCommitted(db.pool, [noteEv('note.deleted')]);
    expect(await gate('comment.edited', 'note', fx.NOTES.nProject, c, 'author')).toEqual(refusal(COMMENT_NOTE_DELETED_REASON));
    await applyCommitted(db.pool, [noteEv('note.restored')]);
    expect(await gate('comment.edited', 'note', fx.NOTES.nProject, c, 'author')).toBeNull();
  });
});
