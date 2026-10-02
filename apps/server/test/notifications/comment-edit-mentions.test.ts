import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { createNotificationFanout } from '../../src/notifications/fanout.js';
import { createInAppTransport } from '../../src/notifications/transport.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * 26.054–26.058 — an EDIT of a comment notifies only the mentions it ADDS (MCP-everything T2, M-E9).
 * Same world and harness as `note-mention-fanout.test.ts` (18.404–18.410): the notes fixture, events applied
 * through the ledger and projections FIRST, then handed to the fan-out.
 */
let db: TestDatabase;
let fx: NotesFixture;

beforeAll(async () => {
  db = await createTestDatabase();
  fx = await seedNotesFixture(db.pool);
});
afterAll(async () => {
  await db.drop();
});

const logged: string[] = [];
function fanout() {
  return createNotificationFanout({
    pool: db.pool,
    transports: [createInAppTransport(db.pool)],
    now: () => new Date('2026-10-02T05:00:00.000Z'),
    log: (message) => {
      logged.push(message);
    },
  });
}

function docMentioning(userIds: string[], text = 'please look at this'): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: `${text} ` },
          ...userIds.map((userId) => ({ type: 'mention', attrs: { userId, label: `label-${userId.slice(-4)}` } })),
        ],
      },
    ],
  };
}

async function rowsFor(userId: string, noteId: string) {
  const { rows } = await db.pool.query(
    'SELECT kind, dedupe_key, payload FROM notifications WHERE user_id = $1 ORDER BY id',
    [userId],
  );
  return (rows as Array<{ kind: string; dedupe_key: string; payload: Record<string, unknown> }>).filter(
    (row) => row.payload['noteId'] === noteId,
  );
}

async function commit(envelope: LedgerEvent, fan = fanout()): Promise<LedgerEvent> {
  await applyCommitted(db.pool, [envelope]);
  await fan.onCommitted(envelope);
  return envelope;
}

async function freshNote(scope: { mode: 'workspace' } | { mode: 'private' }): Promise<string> {
  const noteId = newUlid();
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: fx.WS,
      actorId: fx.ids.author,
      entity: { kind: 'note', id: noteId },
      type: 'note.created',
      payload: { title: 'Fresh note', homeProjectId: fx.P, scope },
    }),
  ]);
  return noteId;
}

describe('26.054–26.058 an edit notifies only the mentions it adds', () => {
  const addComment = (kind: 'ticket' | 'note', parent: string, body: unknown, actor = fx.ids.author) =>
    makeCommitted({ workspaceId: fx.WS, actorId: actor, entity: { kind, id: parent }, type: 'comment.added', payload: { body } });
  const editComment = (kind: 'ticket' | 'note', parent: string, commentId: string, body: unknown, actor = fx.ids.author) =>
    makeCommitted({ workspaceId: fx.WS, actorId: actor, entity: { kind, id: parent }, type: 'comment.edited', payload: { commentId, body } });
  const forTicket = async (userId: string, ticketId: string) =>
    (await db.pool.query(`SELECT payload FROM notifications WHERE user_id = $1 AND payload->>'ticketId' = $2 ORDER BY id`, [userId, ticketId])).rows as Array<{ payload: Record<string, unknown> }>;

  it('26.054 ticket comment: only the added mention, anchored on the comment, once', async () => {
    const added = await commit(addComment('ticket', fx.TP, docMentioning([fx.ids.memberIn]), fx.ids.owner));
    expect(await forTicket(fx.ids.memberIn, fx.TP)).toHaveLength(1); // control: the add notified
    const edit = editComment('ticket', fx.TP, added.id, docMentioning([fx.ids.memberIn, fx.ids.author], 'now both'), fx.ids.owner);
    await commit(edit);
    await fanout().onCommitted(edit); // redelivery
    expect(await forTicket(fx.ids.memberIn, fx.TP)).toHaveLength(1);
    const addedRows = await forTicket(fx.ids.author, fx.TP);
    expect(addedRows).toHaveLength(1);
    expect(addedRows[0]?.payload).toMatchObject({ eventId: added.id, source: 'comment' });
  });

  it('26.055 / 26.058 note comment: only added mentions; a non-reader gets nothing, a reader beside them does', async () => {
    const noteId = await freshNote({ mode: 'private' });
    const added = await commit(addComment('note', noteId, docMentioning([])));
    await commit(editComment('note', noteId, added.id, docMentioning([fx.ids.memberIn, fx.ids.owner], 'both now')));
    const ownerRows = await rowsFor(fx.ids.owner, noteId);
    expect(ownerRows).toHaveLength(1); // control: a reader is notified
    expect(ownerRows[0]?.payload).toMatchObject({ eventId: added.id, source: 'note-comment' });
    expect(await rowsFor(fx.ids.memberIn, noteId), 'a private note must not leak through an edit').toHaveLength(0);
    expect(logged.join('\n')).not.toContain(fx.ids.memberIn);
  });

  it('26.055 a kept mention on a note comment is not notified again by the edit', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    const added = await commit(addComment('note', noteId, docMentioning([fx.ids.memberIn])));
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(1); // control: the add notified
    await commit(editComment('note', noteId, added.id, docMentioning([fx.ids.memberIn, fx.ids.owner], 'plus one')));
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(1);
    expect(await rowsFor(fx.ids.owner, noteId)).toHaveLength(1);
  });

  it('26.056 a description still notifies every mention it carries', async () => {
    const fieldSet = (body: unknown) =>
      makeCommitted({ workspaceId: fx.WS, actorId: fx.ids.owner, entity: { kind: 'ticket', id: fx.TE }, type: 'ticket.field_set', payload: { fieldId: 'description', value: body } });
    const before = (await forTicket(fx.ids.memberIn, fx.TE)).length;
    await commit(fieldSet(docMentioning([fx.ids.memberIn], 'desc one')));
    await commit(fieldSet(docMentioning([fx.ids.memberIn], 'desc two')));
    expect((await forTicket(fx.ids.memberIn, fx.TE)).length).toBe(before + 2);
  });
});
