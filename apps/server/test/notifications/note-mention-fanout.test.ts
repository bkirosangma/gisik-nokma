import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { createNotificationFanout } from '../../src/notifications/fanout.js';
import { createInAppTransport } from '../../src/notifications/transport.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * 18.404–18.410 — NOTE MENTIONS NOTIFY (owner ruling 2026-09-29: "yes, notify on
 * note mentions").
 *
 * The world is the notes series' own fixture (`helpers/notes-fixture.ts`), not a
 * stub, because the gate under test is `canReadNoteById` — the note's OWN read
 * rule — and a stub `canRead` would test the test:
 *
 * - `nWorkspace` is readable by owner / admin / memberIn / memberOut / author and
 *   NOT by either guest;
 * - `nPrivate` is readable by its author and the owner and by nobody else.
 *
 * Every event is applied through the ledger and the projections FIRST
 * (`applyCommitted`), then handed to the fan-out, which is the order production
 * has: `onCommitted` runs AFTER the commit, so the ledger already holds the event
 * whose body it is comparing against the one before it.
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
function fanout(deps: { canReadNote?: (db: unknown, userId: string, noteId: string) => Promise<boolean> } = {}) {
  return createNotificationFanout({
    pool: db.pool,
    transports: [createInAppTransport(db.pool)],
    now: () => new Date('2026-09-29T05:00:00.000Z'),
    log: (message) => {
      logged.push(message);
    },
    ...(deps.canReadNote === undefined ? {} : { canReadNote: deps.canReadNote as never }),
  });
}

/** A doc that says `text` and mentions each of `userIds`, in order. */
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

async function rowsFor(userId: string, noteId?: string) {
  const { rows } = await db.pool.query(
    'SELECT kind, workspace_id, dedupe_key, payload FROM notifications WHERE user_id = $1 ORDER BY id',
    [userId],
  );
  return (rows as Array<{ kind: string; workspace_id: string; dedupe_key: string; payload: Record<string, unknown> }>).filter(
    (row) => noteId === undefined || row.payload['noteId'] === noteId,
  );
}

function bodySet(noteId: string, body: unknown, actorId = fx.ids.author): LedgerEvent {
  return makeCommitted({
    workspaceId: fx.WS,
    actorId,
    entity: { kind: 'note', id: noteId },
    type: 'note.body_set',
    payload: { body },
  });
}

async function commit(envelope: LedgerEvent, fan = fanout()): Promise<LedgerEvent> {
  await applyCommitted(db.pool, [envelope]);
  await fan.onCommitted(envelope);
  return envelope;
}

/** A fresh workspace-scoped note, so a case's rows never mix with another's. */
async function freshNote(scope: { mode: 'workspace' } | { mode: 'private' }, body?: unknown): Promise<string> {
  const noteId = newUlid();
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: fx.WS,
      actorId: fx.ids.author,
      entity: { kind: 'note', id: noteId },
      type: 'note.created',
      payload: { title: 'Fresh note', homeProjectId: fx.P, scope, ...(body === undefined ? {} : { body }) },
    }),
  ]);
  return noteId;
}

describe('18.404 a mention in a note body notifies a reader', () => {
  it('note.body_set: the mentioned reader gets ONE `mention` row shaped for a note; the author of the edit gets none', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    const env = await commit(bodySet(noteId, docMentioning([fx.ids.memberIn, fx.ids.author])));

    const rows = await rowsFor(fx.ids.memberIn, noteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      kind: 'mention',
      workspace_id: fx.WS,
      dedupe_key: `mention:${env.id}:${fx.ids.memberIn}`,
      payload: {
        noteId,
        noteTitle: 'Fresh note',
        mentionedBy: fx.ids.author,
        eventId: env.id,
        source: 'note',
        excerpt: `please look at this @label-${fx.ids.memberIn.slice(-4)}@label-${fx.ids.author.slice(-4)}`,
        clientTime: env.clientTime,
        serverTime: env.serverTime,
      },
    });
    expect(await rowsFor(fx.ids.author, noteId)).toHaveLength(0);
  });

  it('note.created carrying a body with a mention notifies too (every mention in a first body is new)', async () => {
    const noteId = newUlid();
    const env = makeCommitted({
      workspaceId: fx.WS,
      actorId: fx.ids.author,
      entity: { kind: 'note', id: noteId },
      type: 'note.created',
      payload: {
        title: 'Born with a mention',
        homeProjectId: fx.P,
        scope: { mode: 'workspace' },
        body: docMentioning([fx.ids.memberOut]),
      },
    });
    await commit(env);
    const rows = await rowsFor(fx.ids.memberOut, noteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload['noteTitle']).toBe('Born with a mention');
    expect(rows[0]!.dedupe_key).toBe(`mention:${env.id}:${fx.ids.memberOut}`);
  });

  it('delivering the same committed event twice yields one row (at-least-once safe)', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    const env = await commit(bodySet(noteId, docMentioning([fx.ids.memberIn])));
    await fanout().onCommitted(env);
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(1);
  });
});

describe('18.405 only NEWLY added mentions notify — an edit that keeps a mention does not re-notify', () => {
  it('the second save carrying the same mention adds no row; a third adding someone notifies ONLY them', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    await commit(bodySet(noteId, docMentioning([fx.ids.memberIn])));
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(1); // CONTROL, same it(): the first save did notify

    // An autosave with more prose and the SAME mention.
    await commit(bodySet(noteId, docMentioning([fx.ids.memberIn], 'please look at this, and this too')));
    expect(await rowsFor(fx.ids.memberIn, noteId), 'an edit that keeps the mention must not re-notify').toHaveLength(1);

    // A later save that keeps memberIn and adds memberOut.
    await commit(bodySet(noteId, docMentioning([fx.ids.memberIn, fx.ids.memberOut], 'now with a second person')));
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(1);
    expect(await rowsFor(fx.ids.memberOut, noteId)).toHaveLength(1);
  });

  it('a mention removed and later put back is newly added again (the diff is against the PREVIOUS body, not the history)', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    await commit(bodySet(noteId, docMentioning([fx.ids.memberIn])));
    await commit(bodySet(noteId, docMentioning([], 'taken out')));
    await commit(bodySet(noteId, docMentioning([fx.ids.memberIn], 'put back')));
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(2);
  });

  it('replacing one person with another notifies the new person only', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    await commit(bodySet(noteId, docMentioning([fx.ids.memberIn])));
    await commit(bodySet(noteId, docMentioning([fx.ids.memberOut])));
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(1);
    expect(await rowsFor(fx.ids.memberOut, noteId)).toHaveLength(1);
  });
});

describe('18.406 the note read rule gates delivery — silently', () => {
  it('a mentioned person who cannot read the note gets nothing; a reader mentioned beside them still does', async () => {
    const noteId = await freshNote({ mode: 'private' });
    // memberIn cannot read a PRIVATE note; the owner can (the owner reads everything).
    await commit(bodySet(noteId, docMentioning([fx.ids.memberIn, fx.ids.owner])));
    expect(await rowsFor(fx.ids.owner, noteId)).toHaveLength(1); // CONTROL: the gate lets a reader through
    expect(await rowsFor(fx.ids.memberIn, noteId), 'a private note must not out-leak through a mention').toHaveLength(0);
  });

  it('a guest is refused on a workspace-scoped note (the note rule, not the ticket rule)', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    await commit(bodySet(noteId, docMentioning([fx.ids.guestUnlisted, fx.ids.memberOut])));
    expect(await rowsFor(fx.ids.guestUnlisted, noteId)).toHaveLength(0);
    expect(await rowsFor(fx.ids.memberOut, noteId)).toHaveLength(1);
  });

  it('the refusal is silent: nothing is logged for it, and the reachable recipient’s row is identical either way', async () => {
    logged.length = 0;
    const noteId = await freshNote({ mode: 'workspace' });
    await commit(bodySet(noteId, docMentioning([fx.ids.guestUnlisted, fx.ids.memberOut])));
    expect(logged).toEqual([]);
  });

  it('a lookup that throws for one person does not silence the others, whichever order they were named in', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    const throwing = fanout({
      canReadNote: async (_db, userId) => {
        if (userId === fx.ids.memberIn) throw new Error('lookup failed');
        return true;
      },
    });
    await commit(bodySet(noteId, docMentioning([fx.ids.memberIn, fx.ids.memberOut])), throwing);
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(0);
    expect(await rowsFor(fx.ids.memberOut, noteId)).toHaveLength(1);
  });
});

describe('18.407 a mention in a note comment notifies, and names the comment', () => {
  it('comment.added on a note: source `note-comment`, the comment id is the event id, the gate is the note rule', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    const env = await commit(
      makeCommitted({
        workspaceId: fx.WS,
        actorId: fx.ids.owner,
        entity: { kind: 'note', id: noteId },
        type: 'comment.added',
        payload: { body: docMentioning([fx.ids.memberIn, fx.ids.guestUnlisted]) },
      }),
    );
    const rows = await rowsFor(fx.ids.memberIn, noteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      kind: 'mention',
      workspace_id: fx.WS,
      dedupe_key: `mention:${env.id}:${fx.ids.memberIn}`,
      payload: {
        noteId,
        noteTitle: 'Fresh note',
        mentionedBy: fx.ids.owner,
        eventId: env.id,
        source: 'note-comment',
        excerpt: `please look at this @label-${fx.ids.memberIn.slice(-4)}@label-${fx.ids.guestUnlisted.slice(-4)}`,
        clientTime: env.clientTime,
        serverTime: env.serverTime,
      },
    });
    expect(await rowsFor(fx.ids.guestUnlisted, noteId)).toHaveLength(0);
  });

  it('two comments each naming the same person notify twice — a comment is never an edit of an earlier one', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    for (let i = 0; i < 2; i += 1) {
      await commit(
        makeCommitted({
          workspaceId: fx.WS,
          actorId: fx.ids.owner,
          entity: { kind: 'note', id: noteId },
          type: 'comment.added',
          payload: { body: docMentioning([fx.ids.memberIn]) },
        }),
      );
    }
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(2);
  });
});

describe('18.408 a self-mention creates no notification', () => {
  it('the author naming themselves and someone else notifies only the someone else — in a body AND in a comment', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    await commit(bodySet(noteId, docMentioning([fx.ids.author, fx.ids.memberIn])));
    await commit(
      makeCommitted({
        workspaceId: fx.WS,
        actorId: fx.ids.memberOut,
        entity: { kind: 'note', id: noteId },
        type: 'comment.added',
        payload: { body: docMentioning([fx.ids.memberOut, fx.ids.memberIn]) },
      }),
    );
    expect(await rowsFor(fx.ids.author, noteId)).toHaveLength(0);
    expect(await rowsFor(fx.ids.memberOut, noteId)).toHaveLength(0);
    expect(await rowsFor(fx.ids.memberIn, noteId)).toHaveLength(2); // CONTROL: one per event
  });
});

describe('18.409 nothing else about a note becomes a mention', () => {
  it('a rename, a scope change or a body with no mention delivers nothing', async () => {
    const noteId = await freshNote({ mode: 'workspace' });
    await commit(bodySet(noteId, docMentioning([])));
    await commit(
      makeCommitted({
        workspaceId: fx.WS,
        actorId: fx.ids.author,
        entity: { kind: 'note', id: noteId },
        type: 'note.renamed',
        payload: { title: 'Renamed' },
      }),
    );
    const { rows } = await db.pool.query(`SELECT 1 FROM notifications WHERE payload->>'noteId' = $1`, [noteId]);
    expect(rows).toHaveLength(0);
  });
});
