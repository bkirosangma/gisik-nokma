import { afterEach, describe, expect, it } from 'vitest';
import {
  newSubmittedEvent,
  newUlid,
  plainTextToDoc,
  type EventEnvelope,
  type LedgerEvent,
} from '@gisik-nokma/domain';
import {
  createOutbox,
  createReplica,
  createSyncEngine,
  type Replica,
  type StreamHandlers,
  type SyncEngine,
  type SyncItem,
  type SyncTransport,
} from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createReplicaDataSource } from '../../src/replica/replica-data-source.js';
import type { ClientStreamFrame, DataSource } from '../../src/data-source.js';

/**
 * The seven note reads, answered LOCALLY (notes series, Plan 2 of 6, spec
 * §5.3; cases 18.088–18.091).
 *
 * ## Why this file exists rather than a route case
 *
 * `ReplicaDataSource` is what the web app reads when it is offline, and until
 * this change all seven note reads were `ReplicaGapError`s — a screen showing
 * "no notes here" over a set it never read, which is ruling P24's failure with
 * notes as its subject. The reads below are what replaced those gaps.
 *
 * ## The oracle is the DOMAIN, not a literal
 *
 * The shapes compared here are `NoteSummary` / `NoteDetail` / `NoteVersion` —
 * the same types the online mapper fills — so a local read that drifted from
 * the server's answer stops compiling rather than quietly disagreeing.
 */

const WS = newUlid();
const P = newUlid();
const USER_A = newUlid();
const USER_B = newUlid();
const TICKET = newUlid();
const NOTE = newUlid();
const WF = newUlid();
const TYPE = newUlid();

const CLIENT_TIME = '2026-08-20T09:00:00.000Z';

let seqCounter = 0;
let streamCounter = 0;

function envelope(
  entity: EventEnvelope['entity'],
  type: string,
  payload: unknown,
  opts: { seq?: number; workspaceSeq?: number; actorId?: string; serverTime?: string } = {},
): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: opts.actorId ?? USER_A,
      origin: 'server',
      now: () => new Date(CLIENT_TIME),
    }),
    serverTime: opts.serverTime ?? CLIENT_TIME,
    seq: opts.seq ?? seqCounter,
    workspaceSeq: opts.workspaceSeq ?? streamCounter,
  };
}

const noteCreated = (
  noteId: string,
  scope: unknown,
  opts: { seq?: number; workspaceSeq?: number; attachTicketId?: string } = {},
): LedgerEvent =>
  envelope(
    { kind: 'note', id: noteId },
    'note.created',
    {
      title: 'A note',
      homeProjectId: P,
      scope,
      ...(opts.attachTicketId === undefined ? {} : { attachTicketId: opts.attachTicketId }),
    },
    opts,
  );

type Script = { handlers: StreamHandlers | null };

function fakeTransport(script: Script, notePayload: LedgerEvent[]): SyncTransport {
  return {
    async bootstrap() {
      return {
        workspaceId: WS,
        me: { userId: USER_A, workspaceRole: 'member', projectIds: [P] },
        streamSeq: 7,
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
          }, { seq: 1 }),
          envelope({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', {
            id: TYPE,
            name: 'Task',
            icon: 'check',
            rank: 3,
            workflowId: WF,
            fields: [],
          }, { seq: 1 }),
        ],
        tickets: [],
      };
    },
    async sync(): Promise<never[]> {
      return [];
    },
    openStream(_ws, _afterSeq, handlers) {
      script.handlers = handlers;
      return { close: () => handlers.onClose() };
    },
    async reconcile(workspaceId) {
      return { workspaceId, restricted: [], restrictedNotes: [] };
    },
    async bootstrapTicket(_ws, ticketId) {
      throw new Error(`unexpected ticket pull ${ticketId}`);
    },
    async bootstrapNote() {
      return { events: notePayload };
    },
  };
}

type Fixture = {
  ds: DataSource;
  replica: Replica;
  engine: SyncEngine;
  script: Script;
  storage: ReturnType<typeof createBetterSqliteStorage>;
};

/**
 * Every engine this file started, stopped after each case.
 *
 * NOT tidiness. An engine left running keeps its reconnect timer
 * (`reconnectDelayMs: 5`) and keeps draining, and these cases share a module —
 * so a retired engine re-enters the chain while a later case is measuring. That
 * was measured in `packages/sync-client/test/sync-engine-notes.test.ts`, where
 * two cases failed when the file ran whole and passed in isolation.
 */
const started: SyncEngine[] = [];
afterEach(() => {
  for (const e of started.splice(0)) e.stop();
});

async function fixture(notePayload: LedgerEvent[] = []): Promise<Fixture> {
  seqCounter = 0;
  streamCounter = 0;
  const buildTicket = (ticketId: string, title: string, seq: number): LedgerEvent =>
    envelope({ kind: 'ticket', id: ticketId }, 'ticket.created', {
      typeId: TYPE,
      projectId: P,
      parentId: null,
      title,
    }, { seq });

  const script: Script = { handlers: null };
  const storage = createBetterSqliteStorage(':memory:');
  const replica = await createReplica({ storage });
  const engine = createSyncEngine({
    replica,
    outbox: createOutbox({ storage, replica }),
    transport: fakeTransport(script, notePayload),
    reconnectDelayMs: 5,
  });

  // The ticket vocabulary, so a `ticket.created` folds.
  await replica.loadBootstrap({
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [P] },
    streamSeq: 7,
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
      }, { seq: 1 }),
      envelope({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', {
        id: TYPE,
        name: 'Task',
        icon: 'check',
        rank: 3,
        workflowId: WF,
        fields: [],
      }, { seq: 1 }),
    ],
    tickets: [],
  });
  await replica.applyServerItem(buildTicket(TICKET, 'Share the July invoices', 1));

  const ds = createReplicaDataSource({
    workspaceId: WS,
    replica,
    outbox: createOutbox({ storage, replica }),
    engine,
    storage,
  });
  started.push(engine);
  return { ds, replica, engine, script, storage };
}

/** The events a note's whole life is folded from, shared by the cases below. */
function noteLife(): LedgerEvent[] {
  return [
    noteCreated(NOTE, { mode: 'project' }, { seq: 1, workspaceSeq: 40, attachTicketId: TICKET }),
    envelope({ kind: 'note', id: NOTE }, 'note.body_set', { body: plainTextToDoc('first body') }, { seq: 2, workspaceSeq: 41 }),
    envelope({ kind: 'note', id: NOTE }, 'note.renamed', { title: 'Renamed' }, { seq: 3, workspaceSeq: 42 }),
    envelope({ kind: 'note', id: NOTE }, 'note.body_set', { body: plainTextToDoc('second body') }, { seq: 4, workspaceSeq: 43 }),
  ];
}

describe('the replica data source answers the note reads (Plan 2 of 6)', () => {
  it('18.088 the seven note reads answer from the replica', async () => {
    const { ds, replica } = await fixture();
    const events = noteLife();
    await replica.loadNoteEvents(events);
    await replica.applyServerItem({
      ...envelope({ kind: 'note', id: NOTE }, 'comment.added', { body: plainTextToDoc('a comment') }, { seq: 5, workspaceSeq: 44 }),
    });

    const summaries = await ds.query.getNotes(WS);
    expect(summaries.map((n) => n.noteId)).toEqual([NOTE]);
    const summary = summaries[0]!;
    // The SHAPE is the domain's `NoteSummary` — every key, nothing extra — so a
    // local read that drifted from the server's answer is a compile error or a
    // red here rather than a silently narrower object.
    expect(Object.keys(summary).sort()).toEqual(
      ['attachedTickets', 'authorId', 'createdAt', 'deleted', 'homeProjectId', 'noteId', 'scope', 'title', 'updatedAt', 'workspaceId'].sort(),
    );
    expect(summary.title).toBe('Renamed');
    expect(summary.scope).toEqual({ mode: 'project' });
    expect(summary.authorId).toBe(USER_A);
    expect(summary.deleted).toBe(false);
    expect(summary.attachedTickets).toEqual([{ ticketId: TICKET, key: '', title: 'Share the July invoices' }]);

    const detail = await ds.query.getNote(WS, NOTE);
    expect(detail?.body).toEqual(plainTextToDoc('second body'));
    expect(detail?.schemaVersion).toBe(1);
    expect(detail?.noteId).toBe(NOTE);

    expect(await ds.query.getNotesForTicket(WS, TICKET)).toHaveLength(1);
    expect((await ds.query.getNoteComments(WS, NOTE)).map((c) => c.authorId)).toEqual([USER_A]);

    // Control: the same four events through `applyNoteEvent` — the reducer the
    // SERVER's projection uses — must give the same note facts. Without it,
    // "the local read answered" would also hold for a read that answered wrong.
    const history = await ds.query.getNoteHistory(WS, NOTE);
    // `history[0]` is the `note.created`, which carries NO body — a note born
    // from a picker starts empty — so its version is `null`, exactly as the
    // server's `getNoteVersionBody` answers. The two bodies are at seq 2 and 4.
    expect(history.map((v) => v.seq)).toEqual([1, 2, 4]);
    expect(await ds.query.getNoteVersion(WS, NOTE, history[0]!.eventId)).toBeNull();
    expect(await ds.query.getNoteVersion(WS, NOTE, history[1]!.eventId)).toEqual(plainTextToDoc('first body'));

    // And the deleted list is separate: nothing is deleted here.
    expect(await ds.query.getDeletedNotes(WS)).toEqual([]);
  });

  it('18.089 attachedTickets omits a ticket the replica does not hold', async () => {
    const { ds, replica } = await fixture();
    const absent = newUlid();
    await replica.loadNoteEvents([
      // Attached to the ticket this device HAS and to one it does not — the
      // `inherit` union means the note is readable through either, so the note
      // still exists here; what the case measures is the BADGE.
      noteCreated(NOTE, { mode: 'inherit' }, { seq: 1, workspaceSeq: 40, attachTicketId: TICKET }),
      envelope({ kind: 'note', id: NOTE }, 'note.attached', { ticketId: absent }, { seq: 2, workspaceSeq: 41 }),
    ]);

    const summary = (await ds.query.getNotes(WS))[0]!;
    // `attachedTickets` is resolved from LOCAL rows, so a ticket this device has
    // never pulled contributes nothing. Emitting its id with an empty key would
    // put a title-less row on a screen and claim this device holds something it
    // does not.
    expect(summary.attachedTickets.map((t) => t.ticketId)).toEqual([TICKET]);
    // Control: the note itself still knows both attachments — the omission is
    // the BADGE's, not the row's.
    expect((await replica.getNote(NOTE))?.attachedTicketIds).toEqual([TICKET, absent].sort());
  });

  it('18.090 history is note.created and every note.body_set, in order', async () => {
    const { ds, replica } = await fixture();
    await replica.loadNoteEvents(noteLife());

    const history = await ds.query.getNoteHistory(WS, NOTE);
    // Two bodies, in `seq` order — and NOT the rename between them. The
    // versions screen exists to show and restore what the note SAID; a rename
    // moves only the title, and a version that changed nothing a reader can
    // restore would appear as a duplicate body.
    expect(history.map((v) => v.seq)).toEqual([1, 2, 4]);
    expect(history.map((v) => v.authorId)).toEqual([USER_A, USER_A, USER_A]);
    expect(await ds.query.getNoteVersion(WS, NOTE, history[2]!.eventId)).toEqual(plainTextToDoc('second body'));
    // The rename is in the ledger and is NOT a version: named explicitly, so a
    // history that included it would be caught rather than merely counted.
    expect(history).toHaveLength(3);
  });

  it('18.091 subscribe forwards a landed pull as a refresh frame', async () => {
    const pulled = [noteCreated(NOTE, { mode: 'workspace' }, { seq: 1, workspaceSeq: 40 })];
    const { ds, engine, script } = await fixture(pulled);
    await engine.start(WS);

    const frames: ClientStreamFrame[] = [];
    const unsubscribe = ds.subscribe(WS, 0, (item) => frames.push(item));

    // A notice names the note; the drain pulls it; the pull lands. Nothing on
    // the ordinary stream announces this — the pull happens after the stream
    // went quiet — which is the hole this frame exists for.
    const notice: SyncItem = {
      kind: 'reach-granted',
      workspaceId: WS,
      tickets: [],
      notes: [{ id: NOTE, headSeq: 40 }],
    };
    script.handlers!.onItem(notice);
    await engine.settled();

    const refreshes = frames.filter((f) => f.type === 'refresh');
    expect(refreshes).toEqual([{ type: 'refresh', workspaceId: WS }]);
    // Control: the NOTICE itself still reaches a subscriber unchanged, so the
    // refresh above is an addition rather than a replacement for the door that
    // already worked.
    expect(frames.some((f) => f.type === 'reach-granted')).toBe(true);
    unsubscribe();
  });

  it('18.091 an EVENT frame still passes, which is the control the refresh must not have replaced', async () => {
    const { ds, engine, script } = await fixture();
    await engine.start(WS);
    const frames: ClientStreamFrame[] = [];
    const unsubscribe = ds.subscribe(WS, 0, (item) => frames.push(item));

    const committed = envelope({ kind: 'note', id: NOTE }, 'note.created', {
      title: 'A note',
      homeProjectId: P,
      scope: { mode: 'workspace' },
    }, { seq: 1, workspaceSeq: 40 });
    script.handlers!.onItem(committed);
    await engine.settled();

    expect(frames.filter((f) => f.type === 'event')).toHaveLength(1);
    expect(frames.filter((f) => f.type === 'refresh')).toHaveLength(0);
    unsubscribe();
  });
});
