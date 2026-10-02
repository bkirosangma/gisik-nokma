import { afterEach, describe, expect, it } from 'vitest';
import {
  applyNoteEvent,
  newSubmittedEvent,
  newUlid,
  plainTextToDoc,
  type EventEnvelope,
  type LedgerEvent,
  type NoteState,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { LOCAL_SCHEMA_VERSION, migrateLocal } from '../src/storage/schema.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type Replica } from '../src/replica/replica.js';

/**
 * The replica's note tables, fold and removals (notes series, Plan 2 of 6,
 * spec §5.3; cases 18.076–18.082).
 *
 * ## The fold is the SHARED reducer, and that is the whole design
 *
 * `applyNoteEvent` is what the server's `proj_notes` folds with. This file
 * asserts the local row equals what that function produces over the same
 * events — NOT that the row equals a hand-written literal. A literal would
 * agree with today's reducer and disagree silently the day the reducer moves,
 * which is the drift this series' signature failure names.
 *
 * ## A fresh in-memory storage per case
 *
 * `createBetterSqliteStorage(':memory:')` gives each `it` its own database, so
 * cases that remove rows cannot affect each other, and no `beforeEach`
 * truncation is needed — SQLite in memory has no other tenant.
 */

const WS = newUlid();
const WS_OTHER = newUlid();
const P = newUlid();
const USER_A = newUlid();
const USER_B = newUlid();
const TICKET = newUlid();
const TICKET_2 = newUlid();
const WF = newUlid();
const TYPE = newUlid();
const NOTE = newUlid();
const NOTE_2 = newUlid();

const CLIENT_TIME = '2026-08-20T09:00:00.000Z';

let seqCounter = 0;
let streamCounter = 0;

/** A server-shaped `LedgerEvent`; `seq` is caller-controllable, `workspaceSeq` only climbs. */
function envelope(
  entity: EventEnvelope['entity'],
  type: string,
  payload: unknown,
  opts: { seq?: number; workspaceId?: string; actorId?: string } = {},
): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: opts.workspaceId ?? WS,
      entity,
      type,
      payload,
      actorId: opts.actorId ?? USER_A,
      origin: 'server',
      now: () => new Date(CLIENT_TIME),
    }),
    serverTime: CLIENT_TIME,
    seq: opts.seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

const noteCreated = (noteId: string, scope: unknown, opts: { workspaceId?: string; seq?: number } = {}) =>
  envelope(
    { kind: 'note', id: noteId },
    'note.created',
    { title: 'A note', homeProjectId: P, scope },
    opts,
  );

const noteEvent = (noteId: string, type: string, payload: unknown, seq?: number) =>
  envelope({ kind: 'note', id: noteId }, type, payload, { seq });

const commentOn = (noteId: string, text: string, seq?: number) =>
  envelope({ kind: 'note', id: noteId }, 'comment.added', { body: plainTextToDoc(text) }, { seq });

/** The reducer's answer for the same events — the oracle, not a literal. */
function folded(events: readonly LedgerEvent[]): NoteState {
  let state: NoteState | null = null;
  for (const env of events) state = applyNoteEvent(state, env);
  if (state === null) throw new Error('folded: no events');
  return state;
}

const storages: SyncStorage[] = [];
afterEach(async () => {
  for (const s of storages.splice(0)) await s.close();
});

async function freshReplica(): Promise<{ storage: SyncStorage; replica: Replica }> {
  const storage = createBetterSqliteStorage(':memory:');
  storages.push(storage);
  const replica = await createReplica({ storage });
  return { storage, replica };
}

async function apply(replica: Replica, events: readonly LedgerEvent[]): Promise<void> {
  for (const env of events) await replica.applyServerItem(env);
}

async function columnNames(storage: SyncStorage, table: string): Promise<string[]> {
  const rows = await storage.all(`PRAGMA table_info(${table})`);
  return rows.map((r) => r['name'] as string);
}

async function tableNames(storage: SyncStorage): Promise<string[]> {
  const rows = await storage.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  return rows.map((r) => r['name'] as string);
}

/** The `tickets` columns as they stood at local schema version 1. */
const V1_TICKET_COLUMNS = ['ticket_id', 'workspace_id', 'parent_id', 'state'];

/** A version-1 database, as a device in the field has one. */
async function versionOneDatabase(): Promise<SyncStorage> {
  const storage = createBetterSqliteStorage(':memory:');
  storages.push(storage);
  await storage.run(
    `CREATE TABLE IF NOT EXISTS tickets (
       ticket_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, parent_id TEXT, state TEXT NOT NULL
     )`,
  );
  await storage.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  await storage.run("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");
  return storage;
}

describe('the replica holds notes (Plan 2 of 6)', () => {
  it('18.076 migrateLocal adds the note tables and leaves every existing table alone', async () => {
    const v1 = await versionOneDatabase();
    const before = await columnNames(v1, 'tickets');
    expect(before).toEqual(V1_TICKET_COLUMNS);

    await migrateLocal(v1);

    // The two new tables arrive, and the existing one is untouched — the
    // property an ALTER would break and that `CREATE TABLE IF NOT EXISTS`
    // cannot supply for a column.
    const tables = await tableNames(v1);
    expect(tables).toContain('notes');
    expect(tables).toContain('note_comments');
    expect(await columnNames(v1, 'tickets')).toEqual(before);
    const version = await v1.all("SELECT value FROM meta WHERE key = 'schema_version'");
    expect(version[0]?.['value']).toBe(String(LOCAL_SCHEMA_VERSION));
    expect(LOCAL_SCHEMA_VERSION).toBe(4);

    // And the DDL's OWN idea of `tickets` is still the version-1 one. On an
    // existing device `IF NOT EXISTS` hides a widened column, so the check above
    // passes whatever the DDL says; this is the arm that a column added to
    // `tickets` reddens, and it has to run on a database migrateLocal builds.
    const fresh = createBetterSqliteStorage(':memory:');
    storages.push(fresh);
    await migrateLocal(fresh);
    expect(await columnNames(fresh, 'tickets')).toEqual(V1_TICKET_COLUMNS);
  });

  it('18.077 applying a note’s events folds a row equal to applyNoteEvent’s state', async () => {
    const { replica } = await freshReplica();
    // Spec §3.4 example 1: born `project`, attached, then detached — the last
    // detach reverts to the REMEMBERED scope, which is the rule a fold that
    // looked only at the last event could not produce.
    const events = [
      noteCreated(NOTE, { mode: 'project' }),
      noteEvent(NOTE, 'note.attached', { ticketId: TICKET }),
      noteEvent(NOTE, 'note.detached', { ticketId: TICKET }),
    ];
    await apply(replica, events);

    const local = await replica.getNote(NOTE);
    expect(local).not.toBeNull();
    expect(local).toEqual(folded(events));
    // Named explicitly as well, so a fold that made the same mistake as the
    // oracle would still be visible: the attachment list is empty and the scope
    // is the remembered one.
    expect(local?.scope).toEqual({ mode: 'project' });
    expect(local?.attachedTicketIds).toEqual([]);
  });

  it('18.078 a note comment lands in its own table and does not move the note row', async () => {
    const { storage, replica } = await freshReplica();
    // The ticket vocabulary, through the door a device actually gets it: the
    // ticket arm's fold refuses a `ticket.created` for a type this store cannot
    // resolve, so the control below needs it and getting it any other way would
    // be seeding the table the fold reads.
    await replica.loadBootstrap({
      workspaceId: WS,
      me: { userId: USER_A, workspaceRole: 'member', projectIds: [P] },
      streamSeq: 0,
      definitions: [
        envelope({ kind: 'workflow', id: WF }, 'workflow.defined', {
          id: WF,
          version: 1,
          name: 'Errands',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [{ from: '*', to: 'done', rules: [] }],
        }),
        envelope({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', {
          id: TYPE,
          name: 'Task',
          icon: 'check',
          rank: 3,
          workflowId: WF,
          fields: [],
        }),
      ],
      tickets: [],
    });
    await apply(replica, [noteCreated(NOTE, { mode: 'workspace' })]);
    const beforeComment = await replica.getNote(NOTE);
    expect(beforeComment).not.toBeNull();

    await apply(replica, [
      commentOn(NOTE, 'on a note'),
      // The ticket exists first, or the ticket arm's fold refuses the comment
      // (`comment.added for ticket … that was never created`) and the control
      // reddens for the wrong reason.
      envelope({ kind: 'ticket', id: TICKET }, 'ticket.created', {
        typeId: TYPE,
        projectId: P,
        parentId: null,
        title: 'A ticket',
      }),
      envelope({ kind: 'ticket', id: TICKET }, 'comment.added', { body: plainTextToDoc('on a ticket') }),
    ]);

    const comments = await replica.listNoteComments(NOTE);
    expect(comments).toHaveLength(1);
    expect(comments[0]?.authorId).toBe(USER_A);
    // A comment moves no note state: the row's `seq` is the last note event's.
    const afterComment = await replica.getNote(NOTE);
    expect(afterComment?.seq).toBe(beforeComment?.seq);

    // Control, read off the TABLE rather than through the read: exactly one row
    // arrived, and it is the note's. The ticket's comment is filed against a
    // ticket and must have taken the other branch — a `length === 1` over the
    // note's own read could not tell that from a table that held both.
    const rows = await storage.all('SELECT note_id FROM note_comments');
    expect(rows.map((r) => r['note_id'])).toEqual([NOTE]);
  });

  it('18.079 purgeEntity removes the note’s events, row and comments, and leaves the outbox', async () => {
    const { storage, replica } = await freshReplica();
    const events = [noteCreated(NOTE, { mode: 'workspace' }), commentOn(NOTE, 'a comment')];
    await apply(replica, events);
    await replica.applyServerItem(noteCreated(NOTE_2, { mode: 'workspace' }));
    // An outbox row for this note, written directly: the outbox surface is
    // Plan 10's and the property here is only that a purge does not touch it.
    await storage.run(
      `INSERT INTO outbox (event_id, workspace_id, entity_kind, entity_id, envelope)
       VALUES (?, ?, 'note', ?, '{}')`,
      [newUlid(), WS, NOTE],
    );

    await replica.purgeEntity(NOTE);

    expect(await replica.getNote(NOTE)).toBeNull();
    expect(await replica.listNoteComments(NOTE)).toEqual([]);
    expect(await replica.listEntityEvents(NOTE)).toEqual([]);
    const outbox = await storage.all('SELECT entity_id FROM outbox');
    expect(outbox.map((r) => r['entity_id'])).toEqual([NOTE]);
    // Control: the OTHER note is untouched, so the purge is by id and not a
    // wipe of the table.
    expect(await replica.getNote(NOTE_2)).not.toBeNull();
  });

  it('18.080 revokeScope removes only that workspace’s notes', async () => {
    const { replica } = await freshReplica();
    await apply(replica, [
      noteCreated(NOTE, { mode: 'workspace' }),
      noteCreated(NOTE_2, { mode: 'workspace' }, { workspaceId: WS_OTHER }),
    ]);
    expect(await replica.getNote(NOTE_2)).not.toBeNull();

    await replica.revokeScope({ kind: 'scope-revoked', workspaceId: WS });

    expect(await replica.getNote(NOTE)).toBeNull();
    // The other workspace's note survives. An unscoped delete takes it too,
    // which is the shape this case exists to forbid.
    const survived = await replica.getNote(NOTE_2);
    expect(survived).not.toBeNull();
    expect(survived?.workspaceId).toBe(WS_OTHER);
  });

  it('18.081 loadNoteEvents is idempotent', async () => {
    const { replica } = await freshReplica();
    const events = [noteCreated(NOTE, { mode: 'workspace' }), noteEvent(NOTE, 'note.renamed', { title: 'Renamed' })];
    await replica.loadNoteEvents(events);
    const once = await replica.listEntityEvents(NOTE);
    const onceRow = await replica.getNote(NOTE);

    await replica.loadNoteEvents(events);

    expect(await replica.listEntityEvents(NOTE)).toHaveLength(once.length);
    expect(await replica.getNote(NOTE)).toEqual(onceRow);
  });

  it('18.082 listNotesForTicket returns the notes attached to the ticket', async () => {
    const { replica } = await freshReplica();
    await apply(replica, [
      envelope({ kind: 'note', id: NOTE }, 'note.created', {
        title: 'On the ticket',
        homeProjectId: P,
        scope: { mode: 'inherit' },
        attachTicketId: TICKET,
      }),
      noteEvent(NOTE, 'note.attached', { ticketId: TICKET_2 }),
      // A note in the same PROJECT and attached to nothing: a matcher keyed on
      // `home_project_id` names it, and this is the arm that catches that.
      noteCreated(NOTE_2, { mode: 'project' }),
    ]);

    const forTicket = await replica.listNotesForTicket(WS, TICKET);
    expect(forTicket.map((n) => n.noteId)).toEqual([NOTE]);
    expect((await replica.listNotesForTicket(WS, TICKET_2)).map((n) => n.noteId)).toEqual([NOTE]);
    expect(await replica.listNotesForTicket(WS, newUlid())).toEqual([]);
  });
});
