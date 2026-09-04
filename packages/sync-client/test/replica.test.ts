import { afterEach, describe, expect, it } from 'vitest';
import {
  istDayOf,
  newSubmittedEvent,
  newUlid,
  plainTextToDoc,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
  type TicketState,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';
import { workflowVersionsOf } from '../src/replica/local-deps.js';

/**
 * Plan 10 Task 9 — the replica. Cases 12.119–12.137.
 *
 * This line said `12.119–12.132` from the task's first commit through the round
 * that added 12.133–12.135 and the one that added 12.136–12.137: a range in a
 * docblock is a fact about a moment, and nothing recomputes it. Enumerated, not
 * counted — `grep -nE "^[[:space:]]*it\(" test/replica.test.ts` prints NINETEEN
 * declarations, one per id 12.119–12.137, and the runner's own line reads
 * `Tests 20 passed (20)` because 12.132's `it` sits inside a two-zone loop and
 * executes twice.
 *
 * ## `to` versus `toStateId`, and please do not "reconcile" them
 *
 * BOTH spellings below are correct and they are deliberately not unified
 * (`packages/domain/src/ticket-state.ts` says so in its own header):
 *
 * - a `ticket.transitioned` PAYLOAD spells its destination `to`
 *   (`ticketTransitionedPayloadSchema`);
 * - a `TicketState.transitions` LOG ENTRY spells it `toStateId`.
 *
 * The plan's own snippet for this task builds the payload as
 * `{ toStateId: 'doing' }`, which zod refuses. The payloads here say `to`; the
 * assertions on `transitions` say `toStateId`. Changing either to match the
 * other is a regression, not a tidy-up.
 *
 * ## ULIDs, not readable ids
 *
 * The plan's snippet uses `'ws_r'`, `'user_a'`, `'wf_basic'`. Those survive
 * `newSubmittedEvent` (which validates nothing) but NOT
 * `claimContestedPayloadSchema`, which embeds the refused claim through
 * `submittedEventSchema` and requires real ULIDs for `workspaceId`, `actorId`
 * and a ticket `entity.id`. So every id here is a ULID, and a workflow's
 * definition id equals its entity id exactly as the server's own tests build
 * them.
 */

const WS = newUlid();
const PROJECT = newUlid();
const OTHER_PROJECT = newUlid();
const TICKET = newUlid();
const OTHER_TICKET = newUlid();
const USER_A = newUlid();
const USER_B = newUlid();
const WF = newUlid();
const TYPE = newUlid();

const SERVER_TIME = '2026-08-20T00:00:00.000Z';
const CLIENT_TIME = '2026-08-19T23:59:00.000Z';

const stateOf = (id: string, name: string, category: string) => ({ id, name, category });

const wfV1 = {
  id: WF,
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [stateOf('todo', 'To do', 'open'), stateOf('doing', 'Doing', 'active'), stateOf('done', 'Done', 'terminal')],
  transitions: [
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

/** v2 keeps every state but re-categorises one: 'doing' stops counting as active. */
const wfV2Recategorised = {
  ...wfV1,
  version: 2,
  states: [stateOf('todo', 'To do', 'open'), stateOf('doing', 'Doing', 'open'), stateOf('done', 'Done', 'terminal')],
};

/** v2 drops 'doing' entirely; the mandatory stateMapping says where its tickets go. */
const wfV2Dropped = {
  ...wfV1,
  version: 2,
  states: [stateOf('todo', 'To do', 'open'), stateOf('done', 'Done', 'terminal')],
  transitions: [
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
  stateMapping: { doing: 'todo' },
};

const wfV3 = { ...wfV1, version: 3 };

const ticketTypeDef = { id: TYPE, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };

let seqCounter = 0;
let streamCounter = 0;

/**
 * A server-shaped `LedgerEvent` (coordination §18): the per-entity `seq` AND
 * the workspace stream position. `seq` is caller-controllable because reducer
 * order depends on it; `workspaceSeq` just keeps climbing, exactly as arrivals
 * do, and is never reset between phases of a test because a stream position
 * that went backwards would be a lie about ordering.
 */
function envelope(
  entity: EventEnvelope['entity'],
  type: string,
  payload: unknown,
  opts: { seq?: number; actorId?: string; serverTime?: string; clientTime?: string } = {},
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
      now: () => new Date(opts.clientTime ?? CLIENT_TIME),
    }),
    serverTime: opts.serverTime ?? SERVER_TIME,
    seq: opts.seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

const workflowDefined = (def: unknown, seq: number): LedgerEvent =>
  envelope({ kind: 'workflow', id: WF }, 'workflow.defined', def, { seq });

const typeDefined = (seq = 1): LedgerEvent =>
  envelope({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', ticketTypeDef, { seq });

const created = (ticketId: string, title: string, projectId = PROJECT, seq?: number): LedgerEvent =>
  envelope({ kind: 'ticket', id: ticketId }, 'ticket.created', { typeId: TYPE, projectId, parentId: null, title }, { seq });

const transitioned = (ticketId: string, to: string, seq?: number): LedgerEvent =>
  envelope({ kind: 'ticket', id: ticketId }, 'ticket.transitioned', { to }, { seq });

function bootstrapOf(overrides: Partial<BootstrapResponse> = {}): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [workflowDefined(wfV1, 1), typeDefined(1)],
    tickets: [],
    ...overrides,
  };
}

async function seededReplica(storage: SyncStorage = createBetterSqliteStorage()): Promise<Replica> {
  seqCounter = 0;
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrapOf());
  seqCounter = 0;
  return replica;
}

/** A refused claim, as a contest embeds it. Must pass `submittedEventSchema`. */
function refusedClaim(actorId: string, to: string): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    payload: { to },
    actorId,
    origin: 'mobile',
  });
}

const contestOf = (original: SubmittedEvent, opts: { serverTime?: string } = {}): LedgerEvent =>
  envelope(
    { kind: 'ticket', id: TICKET },
    'claim.contested',
    { originalEvent: original, rule: 'restrict-to', reason: 'planted' },
    opts,
  );

describe('12.119–12.122 the read model is folded by the domain reducer, never downloaded', () => {
  it('12.119 folds created + transitioned + field_set into TicketState, log entries keeping their own vocabulary', async () => {
    const replica = await seededReplica();
    await replica.applyServerItem(created(TICKET, 'Fold me'));
    // PAYLOAD spells it `to`; the LOG ENTRY below spells it `toStateId`.
    await replica.applyServerItem(transitioned(TICKET, 'doing'));
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: TICKET }, 'ticket.field_set', { fieldId: 'notes', value: 'hi' }),
    );

    const ticket = await replica.getTicket(TICKET);
    expect(ticket?.confirmed).toMatchObject({ stateId: 'doing', stateCategory: 'active', workflowVersion: 1 });
    expect(ticket?.confirmed?.fields['notes']?.value).toBe('hi');
    expect(ticket?.confirmed?.transitions).toEqual([
      { toStateId: 'doing', actorId: USER_A, seq: 2, workflowId: WF, workflowVersion: 1 },
    ]);
  });

  it('12.120 ignores a duplicate event id — at-least-once delivery is expected', async () => {
    const replica = await seededReplica();
    const create = created(TICKET, 'Once');
    expect(await replica.applyServerItem(create)).toEqual({ applied: true });
    expect(await replica.applyServerItem(create)).toEqual({ applied: false });
    expect(await replica.listEntityEvents(TICKET)).toHaveLength(1);
  });

  it('12.121 folds a claim.contested into contests, not into ticket state', async () => {
    const replica = await seededReplica();
    await replica.applyServerItem(created(TICKET, 'Contested'));
    const original = refusedClaim(USER_B, 'done');
    const contest = contestOf(original);
    await replica.applyServerItem(contest);

    const before = await replica.getTicket(TICKET);
    // The contested claim did NOT move the ticket: a refused claim did not happen.
    expect(before?.confirmed?.stateId).toBe('todo');
    expect(before?.contests).toHaveLength(1);
    expect(before?.contests[0]).toMatchObject({
      contestedEventId: contest.id,
      originalEventId: original.id,
      // the actor of the REFUSED CLAIM, never of the contest the server filed
      claimantId: USER_B,
      rule: 'restrict-to',
      resolved: false,
      resolution: null,
    });

    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: TICKET }, 'claim.contested_resolved', {
        contestedEventId: contest.id,
        resolution: 'discarded',
      }),
    );
    const after = await replica.getTicket(TICKET);
    expect(after?.contests[0]).toMatchObject({ resolved: true, resolution: 'discarded' });
    expect(await replica.listContests(WS, { open: true })).toEqual([]);
    // Positive control for that empty: the contest is still there unfiltered,
    // so the [] above is "none open", not "the query found nothing at all".
    expect(await replica.listContests(WS)).toHaveLength(1);
  });

  it('12.122 bootstrap: only events past the snapshot seq fold, cursor lands, comment text is searchable', async () => {
    const storage = createBetterSqliteStorage();
    seqCounter = 0;
    const replica = await createReplica({ storage });
    const snapshotState: TicketState = {
      kind: 'ticket',
      id: TICKET,
      workspaceId: WS,
      projectId: PROJECT,
      typeId: TYPE,
      parentId: null,
      workflowId: WF,
      workflowVersion: 1,
      stateId: 'todo',
      stateCategory: 'open',
      assigneeId: null,
      collaboratorIds: [],
      fields: { title: { value: 'Bootstrapped', actorId: USER_A, clientTime: CLIENT_TIME, serverTime: SERVER_TIME } },
      transitions: [],
    };
    await replica.loadBootstrap(
      bootstrapOf({
        streamSeq: 41,
        tickets: [
          {
            ticketId: TICKET,
            snapshot: { seq: 3, state: snapshotState },
            events: [
              // seq 2 is BELOW the snapshot: a backfilled comment, already
              // reflected in the baseline. It must not fold again — and it must
              // still be searchable, which is why bootstrap ships it at all.
              envelope({ kind: 'ticket', id: TICKET }, 'comment.added', { body: plainTextToDoc('the dlt registration is stuck') }, { seq: 2 }),
              transitioned(TICKET, 'doing', 4),
            ],
          },
        ],
      }),
    );

    const ticket = await replica.getTicket(TICKET);
    expect(ticket?.confirmed?.stateId).toBe('doing');
    // Only seq > 3 folded: the log holds ONE entry, the seq-4 move. A replica
    // that replayed the whole tail would still land in 'doing' — the log length
    // is what tells the two apart.
    expect(ticket?.confirmed?.transitions).toEqual([
      { toStateId: 'doing', actorId: USER_A, seq: 4, workflowId: WF, workflowVersion: 1 },
    ]);
    expect(await replica.getCursor(WS)).toBe(41);
    expect(await replica.searchLocal(WS, 'dlt registration')).toEqual([{ ticketId: TICKET, title: 'Bootstrapped' }]);
    // Positive control on the search: a phrase that is in no comment and no
    // title comes back empty from the same call against the same store.
    expect(await replica.searchLocal(WS, 'gst filing')).toEqual([]);
    await storage.close();
  });
});

describe('12.123–12.125 refresh on publish — an arriving workflow.defined folds the replica forward', () => {
  async function replicaWithTicketInDoing(storage?: SyncStorage): Promise<Replica> {
    const replica = await seededReplica(storage);
    await replica.applyServerItem(created(TICKET, 'In flight', PROJECT, 1));
    await replica.applyServerItem(transitioned(TICKET, 'doing', 2));
    return replica;
  }

  it('12.123 a re-categorised state changes category locally, without the ticket moving or the log being rewritten', async () => {
    const replica = await replicaWithTicketInDoing();
    expect((await replica.getTicket(TICKET))?.confirmed).toMatchObject({
      stateId: 'doing',
      stateCategory: 'active',
      workflowVersion: 1,
    });

    await replica.applyServerItem(workflowDefined(wfV2Recategorised, 2));

    const ticket = await replica.getTicket(TICKET);
    expect(ticket?.confirmed).toMatchObject({ stateId: 'doing', stateCategory: 'open', workflowVersion: 2 });
    // The log is history, not a view of the present: every entry keeps the
    // workflow and version whose vocabulary its toStateId is written in, which
    // is the only thing that lets require-different-user walk it forward later.
    expect(ticket?.confirmed?.transitions).toEqual([
      { toStateId: 'doing', actorId: USER_A, seq: 2, workflowId: WF, workflowVersion: 1 },
    ]);
  });

  it('12.124 a dropped state is moved by stateMapping, and later events fold onto the new baseline', async () => {
    const storage = createBetterSqliteStorage();
    const replica = await replicaWithTicketInDoing(storage);

    await replica.applyServerItem(workflowDefined(wfV2Dropped, 2));

    const folded = await replica.getTicket(TICKET);
    expect(folded?.confirmed).toMatchObject({ stateId: 'todo', stateCategory: 'open', workflowVersion: 2 });

    // The fold wrote the folded state as the ticket's REPLAY BASELINE. That is
    // the load-bearing half, and this is where it is proved:
    const snap = await storage.all("SELECT seq, state FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [TICKET]);
    expect(snap).toHaveLength(1);
    expect(Number(snap[0]!.seq)).toBe(2);
    expect((JSON.parse(snap[0]!.state as string) as TicketState).stateId).toBe('todo');

    // PLANTED DEFECT: delete the `writeSnapshot` call in `foldTicketsOntoVersion`
    // and this next line stops being a transition and becomes a throw —
    // `refoldTicket` replays the seq-2 move into 'doing', a state v2 no longer
    // has, and `applyTicketEvent` refuses with
    // `applyTicketEvent: workflow "<id>" has no state "doing"`. The fold is only
    // durable because history in the old vocabulary is never replayed against
    // the new one.
    await replica.applyServerItem(transitioned(TICKET, 'done', 3));

    const after = await replica.getTicket(TICKET);
    expect(after?.confirmed).toMatchObject({ stateId: 'done', stateCategory: 'terminal', workflowVersion: 2 });
    expect(after?.confirmed?.transitions).toEqual([
      { toStateId: 'doing', actorId: USER_A, seq: 2, workflowId: WF, workflowVersion: 1 },
      { toStateId: 'done', actorId: USER_A, seq: 3, workflowId: WF, workflowVersion: 2 },
    ]);
    await storage.close();
  });

  it('12.125 a HOLE in the version chain is named as a hole, not as an unmapped drop, and the arrival rolls back', async () => {
    const storage = createBetterSqliteStorage();
    const replica = await replicaWithTicketInDoing(storage);
    const publishV3 = workflowDefined(wfV3, 3);

    // v1 is held, v3 arrives, v2 was never delivered. The walk needs v2 to know
    // what 'doing' became there, and refusing loudly is the only honest answer.
    await expect(replica.applyServerItem(publishV3)).rejects.toThrow(/version chain has a hole/);

    // The whole arrival rolled back: no half-applied publish, no moved ticket.
    expect((await replica.getTicket(TICKET))?.confirmed).toMatchObject({ stateId: 'doing', workflowVersion: 1 });
    expect(await storage.all('SELECT 1 FROM events WHERE id = ?', [publishV3.id])).toEqual([]);
    expect(await storage.all('SELECT 1 FROM workflows WHERE workflow_id = ? AND version = 3', [WF])).toEqual([]);

    // POSITIVE CONTROL — the same v3 publish against the same code succeeds
    // once v2 is delivered first, so the refusal above is about the hole and
    // not about v3.
    const control = createBetterSqliteStorage();
    const healthy = await replicaWithTicketInDoing(control);
    await healthy.applyServerItem(workflowDefined(wfV2Recategorised, 2));
    await healthy.applyServerItem(workflowDefined(wfV3, 3));
    expect((await healthy.getTicket(TICKET))?.confirmed).toMatchObject({
      stateId: 'doing',
      stateCategory: 'active',
      workflowVersion: 3,
    });
    await storage.close();
    await control.close();
  });
});

describe('12.126–12.127 purge — revocation removes every local trace, except what this user authored', () => {
  it('12.126 after purge the ticket is unreadable, unsearchable, and gone from raw storage', async () => {
    const storage = createBetterSqliteStorage();
    const replica = await seededReplica(storage);
    await replica.applyServerItem(created(TICKET, 'Secret errand'));
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: TICKET }, 'comment.added', { body: plainTextToDoc('supplier pricing inside') }),
    );

    expect(await replica.applyServerItem({ kind: 'purge', entityId: TICKET })).toEqual({ applied: true });

    expect(await replica.getTicket(TICKET)).toBeNull();
    expect(await replica.listEntityEvents(TICKET)).toEqual([]);
    // NOTE on the next line: it is DECORATION, not the proof. `searchLocal`
    // looks a comment's ticket row up and skips it when the row is gone, so
    // this would be [] even if every event row had survived. The raw-storage
    // loop below is the load-bearing assertion.
    expect(await replica.searchLocal(WS, 'supplier')).toEqual([]);

    for (const [table, col] of [
      ['events', 'entity_id'],
      ['tickets', 'ticket_id'],
      ['snapshots', 'entity_id'],
      ['contests', 'ticket_id'],
    ] as const) {
      const rows = await storage.all(`SELECT * FROM ${table} WHERE ${col} = ?`, [TICKET]);
      // The ROWS, not a count: a count that came back wrong reads the same as a
      // count that came back right.
      expect(rows).toEqual([]);
    }
    // and no leftover text anywhere the eye could reach
    expect(await storage.all("SELECT * FROM events WHERE payload LIKE '%supplier pricing%'")).toEqual([]);
    // Positive control for those four empties: another ticket in the same store
    // is untouched, so they are deletions and not an empty database.
    await replica.applyServerItem(created(OTHER_TICKET, 'Still here'));
    expect(await storage.all('SELECT * FROM tickets WHERE ticket_id = ?', [OTHER_TICKET])).toHaveLength(1);
    await storage.close();
  });

  it("12.127 purge keeps THIS user's own contested-claim stub and drops everyone else's", async () => {
    const storage = createBetterSqliteStorage();
    const replica = await seededReplica(storage);
    await replica.applyServerItem(created(TICKET, 'Contested twice'));
    const mine = contestOf(refusedClaim(USER_A, 'done'));
    const theirs = contestOf(refusedClaim(USER_B, 'doing'));
    await replica.applyServerItem(mine);
    await replica.applyServerItem(theirs);
    expect(await replica.listContests(WS, { ticketId: TICKET })).toHaveLength(2);

    await replica.purgeEntity(TICKET);

    // Honesty invariant 5: the `originalEvent` in my own stub is what I typed on
    // this device, and silently vanishing it would vanish my claim. Someone
    // else's contest is content I was shown, and it goes with the ticket.
    const left = await replica.listContests(WS);
    expect(left.map((c) => c.contestedEventId)).toEqual([mine.id]);
    expect(left[0]?.claimantId).toBe(USER_A);
    expect(left[0]?.originalEvent.actorId).toBe(USER_A);
    await storage.close();
  });
});

describe('12.128–12.129 scope-revoked — the guest form of losing access', () => {
  // A guest gets ONE instruction, not one purge per ticket: per-id purges
  // reveal how many tickets existed in the scope, including ids this replica
  // never held. The handler is a local delete by scope; re-delivery is a no-op.
  it('12.128 a workspace scope-revoked empties the replica of the workspace, definitions included, and is idempotent', async () => {
    const storage = createBetterSqliteStorage();
    seqCounter = 0;
    const replica = await createReplica({ storage });
    await replica.loadBootstrap(
      bootstrapOf({ streamSeq: 41, me: { userId: USER_A, workspaceRole: 'guest', projectIds: [] } }),
    );
    expect(await replica.getCursor(WS)).toBe(41);
    seqCounter = 0;
    await replica.applyServerItem(created(TICKET, 'Shared errand'));
    expect((await replica.listTickets(WS)).map((t) => t.ticketId)).toEqual([TICKET]);

    expect(await replica.applyServerItem({ kind: 'scope-revoked', workspaceId: WS })).toEqual({ applied: true });

    expect(await replica.getTicket(TICKET)).toBeNull();
    expect(await replica.listTickets(WS)).toEqual([]);
    // The definitions went with the workspace: a replica for a workspace you
    // are not in should hold nothing of it.
    expect(await storage.all('SELECT * FROM workflows', [])).toEqual([]);
    expect(await storage.all('SELECT * FROM ticket_types', [])).toEqual([]);
    expect(await replica.getCursor(WS)).toBe(0);

    // Idempotent like a purge — a re-delivered instruction changes nothing and
    // does not throw.
    expect(await replica.applyServerItem({ kind: 'scope-revoked', workspaceId: WS })).toEqual({ applied: true });
    expect(await replica.listTickets(WS)).toEqual([]);
    await storage.close();
  });

  it('12.129 a project scope-revoked removes that project alone and leaves the rest standing', async () => {
    const storage = createBetterSqliteStorage();
    seqCounter = 0;
    const replica = await createReplica({ storage });
    await replica.loadBootstrap(
      bootstrapOf({ streamSeq: 41, me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT, OTHER_PROJECT] } }),
    );
    seqCounter = 0;
    await replica.applyServerItem(created(TICKET, 'Going', PROJECT, 1));
    await replica.applyServerItem(created(OTHER_TICKET, 'Staying', OTHER_PROJECT, 1));

    await replica.applyServerItem({ kind: 'scope-revoked', workspaceId: WS, projectId: PROJECT });

    expect(await replica.getTicket(TICKET)).toBeNull();
    expect((await replica.getTicket(OTHER_TICKET))?.confirmed?.stateId).toBe('todo');
    // Definitions survive a project-scope loss — the member is still in the workspace.
    expect(await storage.all('SELECT * FROM workflows', [])).toHaveLength(1);
    // The cursor survives a project-scope loss too: the device is still resuming
    // this workspace's stream.
    expect(await replica.getCursor(WS)).toBe(41);
    await storage.close();
  });
});

describe('12.130–12.131 what the reducer does not fold, and what the fold must not forget', () => {
  it('12.130 a ticket-entity event the reducer refuses to fold is stored, not folded, and does not throw', async () => {
    // THIRTEEN event types bind to entityKind 'ticket'; `applyTicketEvent`
    // folds TEN and throws on the rest. `visibility.set` is one of the three,
    // and bootstrap backfills it — so filtering before folding is the common
    // path, not an edge case. Mutation: drop the TICKET_EVENT_TYPES membership
    // test in `refoldTicket` and this reddens with
    // `applyTicketEvent: not a ticket event: visibility.set` — measured, it
    // reddens 12.137 alongside it and nothing else. `visibility.set` is the
    // only type THIS case puts in front of the guard; 12.137 puts the
    // `claim.contested` there, which is the type every sentence around the
    // guard calls the common path.
    const storage = createBetterSqliteStorage();
    const replica = await seededReplica(storage);
    await replica.applyServerItem(created(TICKET, 'Audience changes'));
    const visibility = envelope({ kind: 'ticket', id: TICKET }, 'visibility.set', { ticketId: TICKET, mode: 'project' });

    expect(await replica.applyServerItem(visibility)).toEqual({ applied: true });
    expect((await replica.getTicket(TICKET))?.confirmed?.stateId).toBe('todo');
    expect((await replica.listEntityEvents(TICKET)).map((e) => e.type)).toEqual(['ticket.created', 'visibility.set']);

    // And on the bootstrap path, where it actually arrives: the same event in a
    // ticket tail must not throw either.
    const second = createBetterSqliteStorage();
    seqCounter = 0;
    const fresh = await createReplica({ storage: second });
    await fresh.loadBootstrap(
      bootstrapOf({
        tickets: [
          {
            ticketId: TICKET,
            snapshot: null,
            events: [
              created(TICKET, 'Audience changes', PROJECT, 1),
              envelope({ kind: 'ticket', id: TICKET }, 'visibility.set', { ticketId: TICKET, mode: 'project' }, { seq: 2 }),
            ],
          },
        ],
      }),
    );
    expect((await fresh.getTicket(TICKET))?.confirmed?.stateId).toBe('todo');
    await storage.close();
    await second.close();
  });

  it('12.131 the fold never moves a ticket’s replay baseline backwards', async () => {
    // Bootstrap can leave backfilled ticket-entity events BELOW the snapshot's
    // seq. A fold that set the new baseline to MAX(events.seq) alone would drop
    // it from 5 to 2 — putting pre-fold history back in front of the reducer in
    // a vocabulary that no longer contains it. Today every backfilled type below
    // a snapshot is a reducer no-op, so the damage is not yet observable through
    // the public surface; the row is asserted directly because that is where the
    // guard can be seen to hold.
    const storage = createBetterSqliteStorage();
    seqCounter = 0;
    const replica = await createReplica({ storage });
    await replica.loadBootstrap(
      bootstrapOf({
        tickets: [
          {
            ticketId: TICKET,
            snapshot: {
              seq: 5,
              state: {
                kind: 'ticket',
                id: TICKET,
                workspaceId: WS,
                projectId: PROJECT,
                typeId: TYPE,
                parentId: null,
                workflowId: WF,
                workflowVersion: 1,
                stateId: 'doing',
                stateCategory: 'active',
                assigneeId: null,
                collaboratorIds: [],
                fields: { title: { value: 'Deep', actorId: USER_A, clientTime: CLIENT_TIME, serverTime: SERVER_TIME } },
                transitions: [],
              },
            },
            events: [
              envelope({ kind: 'ticket', id: TICKET }, 'comment.added', { body: plainTextToDoc('backfilled below the snapshot') }, { seq: 2 }),
            ],
          },
        ],
      }),
    );
    expect(Number((await storage.all("SELECT seq FROM snapshots WHERE entity_id = ?", [TICKET]))[0]!.seq)).toBe(5);

    await replica.applyServerItem(workflowDefined(wfV2Dropped, 2));

    const snap = await storage.all("SELECT seq, state FROM snapshots WHERE entity_id = ?", [TICKET]);
    expect((JSON.parse(snap[0]!.state as string) as TicketState).stateId).toBe('todo');
    // 5, not 2. Without the Math.max against the standing baseline this is 2.
    expect(Number(snap[0]!.seq)).toBe(5);
    await storage.close();
  });
});

/**
 * 12.132 — the one clock-sensitive property this task actually owns.
 *
 * Task 9's produced surface has no day-shaped method and its implementation
 * calls no ist-day symbol; the plan's day-math contract binds the LATER layers
 * that read this store (Tasks 12 and 13). What Task 9 owes them is that the
 * instants it hands back are the server's own strings, unparsed and
 * unre-rendered — because every day question in the product is `istDayOf`
 * applied to one of those strings, and a device-offset render here would move
 * claims across midnight on every non-IST machine.
 *
 * So the assertions run under a NON-IST `TZ` as well as under IST, with a
 * positive control proving the timezone switch actually took effect. Both clocks
 * on this project are Asia/Kolkata, which is exactly why an IST-only run is
 * evidence about the machine rather than about the code.
 *
 * ## This is sync-client's first TZ-varying test, and it is the repo's fifteenth
 *
 * The brief commissioning this task said `TZ` is varied by no test file. That
 * was true of the tree it was measured against and is false of this one, and
 * the lane's own correction commit says so. Measured, both property-access
 * spellings, because the first attempt here used only the dotted one:
 *
 *     grep -rlE "process\.env(\.TZ|\['TZ'\]) *=" --include='*.ts' --include='*.tsx' packages apps
 *
 * → 15 files, this one included. **A regex matching `process.env.TZ` alone
 * finds 4 of the 14 others** — the bracket form is what this repo's strict
 * `noPropertyAccessFromIndexSignature` settings force in most of them, and a
 * grep that sees one spelling of two returns a well-formed wrong answer with no
 * error. That is why the number here is stated with the command that produced it.
 *
 * So the control below follows an established convention rather than inventing
 * one; several of those files open with a case named
 * `CONTROL — setting process.env.TZ really does change what this process thinks
 * local time is`. The convention exists because they also record the limit this
 * one inherits: `process.env.TZ` is live for V8's `Date` getters under vitest's
 * `forks` pool (this package sets no `pool`, so it gets the v3 default) and
 * INERT under `threads`, where the reassignment silently does nothing and every
 * zone claim is a no-op.
 *
 * ## And the honest ceiling on what varying TZ buys HERE
 *
 * The lane's correction also says, rightly, that varying `TZ` is evidence only
 * where the value under test moves with it, and ceremony that reads as rigour
 * everywhere else. Measured for this case: the device-offset mutation on
 * `rowToEnvelope` reddens under BOTH zones, so the non-IST run catches no bug
 * the IST run misses. What it does establish is the negative — that no value on
 * this path moves with the machine's zone — which is not knowable from an
 * IST-only run on a machine that is already in IST, and which is exactly the
 * property Tasks 12 and 13 will build their day math on.
 */
describe('12.132 instants survive the replica byte-for-byte, under any TZ', () => {
  const ORIGINAL_TZ = process.env.TZ;
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  // 18:29:59.999Z and 18:30:00.000Z straddle IST midnight: one is 2026-08-20 in
  // India, the next is 2026-08-21.
  const BEFORE_MIDNIGHT = '2026-08-20T18:29:59.999Z';
  const AFTER_MIDNIGHT = '2026-08-20T18:30:00.000Z';

  for (const [tz, localHourOfAfterMidnight] of [
    ['America/Los_Angeles', 11],
    ['Asia/Kolkata', 0],
  ] as const) {
    it(`holds under TZ=${tz}`, async () => {
      process.env.TZ = tz;
      // POSITIVE CONTROL: without this the case could pass while the process
      // never left the machine's own zone, which is the failure mode this whole
      // section exists to close.
      expect(new Date(AFTER_MIDNIGHT).getHours()).toBe(localHourOfAfterMidnight);

      const storage = createBetterSqliteStorage();
      const replica = await seededReplica(storage);
      const create = created(TICKET, 'Straddles midnight');
      await replica.applyServerItem(create);

      // Deliberately delivered late-first, so the ordering assertion below is
      // about the stored instants and not about arrival order.
      const late = contestOf(refusedClaim(USER_B, 'done'), { serverTime: AFTER_MIDNIGHT });
      const early = contestOf(refusedClaim(USER_A, 'doing'), { serverTime: BEFORE_MIDNIGHT });
      await replica.applyServerItem(late);
      await replica.applyServerItem(early);

      // 1. Both clocks come back exactly as they went in — no parse, no
      //    re-format, no local-offset step.
      const stored = await replica.listEntityEvents(TICKET);
      expect(stored.map((e) => e.serverTime)).toEqual([create.serverTime, late.serverTime, early.serverTime]);
      expect(stored.map((e) => e.clientTime)).toEqual([create.clientTime, late.clientTime, early.clientTime]);
      expect(stored[0]!.clientTime).toBe(CLIENT_TIME);

      // 2. `contested_at` likewise, and ordering by it as TEXT is chronological
      //    order — the property `schema.ts` stakes on these columns.
      const contests = await replica.listContests(WS);
      expect(contests.map((c) => c.contestedAt)).toEqual([BEFORE_MIDNIGHT, AFTER_MIDNIGHT]);

      // 3. The day answer a later layer derives from those strings is the IST
      //    day, and it is the SAME under both timezones. This is the assertion
      //    that would redden if anything above rendered an instant with the
      //    device's offset.
      expect(contests.map((c) => istDayOf(c.contestedAt))).toEqual(['2026-08-20', '2026-08-21']);
      await storage.close();
    });
  }
});

describe('12.133–12.134 the rest of the produced surface, so Tasks 10–13 do not inherit it untested', () => {
  it('12.133 onChange fires on an applied item, not on a duplicate, and the unsubscribe is honoured', async () => {
    const replica = await seededReplica();
    let beats = 0;
    const unsubscribe = replica.onChange(() => {
      beats += 1;
    });

    const create = created(TICKET, 'Watch me');
    await replica.applyServerItem(create);
    expect(beats).toBe(1);
    // A duplicate changed nothing, so it must not invalidate any view: a view
    // that re-rendered on every at-least-once redelivery would flicker for the
    // whole of a catch-up.
    await replica.applyServerItem(create);
    expect(beats).toBe(1);

    await replica.applyServerItem(transitioned(TICKET, 'doing'));
    expect(beats).toBe(2);

    unsubscribe();
    await replica.applyServerItem(transitioned(TICKET, 'done'));
    expect(beats).toBe(2);
  });

  it('12.134 cursor, me, and local deps that answer for ANY workflow id, at the latest version', async () => {
    const storage = createBetterSqliteStorage();
    const replica = await seededReplica(storage);
    expect(await replica.getCursor(WS)).toBe(0);
    await replica.setCursor(WS, 907);
    expect(await replica.getCursor(WS)).toBe(907);
    // A cursor for a workspace this replica holds nothing of is 0, not the one
    // above: resuming somebody else's stream from our position would skip
    // history.
    expect(await replica.getCursor(newUlid())).toBe(0);

    expect(await replica.getMe()).toEqual({ userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] });

    // `getWorkflow` is a PURE BY-ID LOOKUP by contract: `ticket.workflow_rebound`
    // names a workflow the ticket is not on yet, so a deps object that served
    // only "the ticket's workflow" would throw on the very event the migration
    // exists for. And the version it serves is the LATEST, which is what makes
    // it the reducer's lookup and not the fold's.
    const before = await replica.buildDeps();
    expect(before.getWorkflow(WF)?.version).toBe(1);
    expect(before.getTicketType(TYPE)?.workflowId).toBe(WF);
    expect(before.getWorkflow(newUlid())).toBeUndefined();

    await replica.applyServerItem(workflowDefined(wfV2Recategorised, 2));
    const after = await replica.buildDeps();
    expect(after.getWorkflow(WF)?.version).toBe(2);
    // …while the fold's lookup still answers for the OLD version. Two lookups
    // over one table, and unifying them is how a multi-hop fold silently picks
    // the wrong destination state.
    const versions = await workflowVersionsOf(storage, WF);
    expect(versions(1)?.version).toBe(1);
    expect(versions(2)?.version).toBe(2);
    expect(versions(3)).toBeNull();
    await storage.close();
  });
});

describe('12.135 a contest below the snapshot seq lands in the contests table and is never folded', () => {
  it('12.135 bootstrap applies contest events regardless of seq, while the reducer replay skips them', async () => {
    // Two independent guards stand between a `claim.contested` and the reducer
    // that would throw on it — the `seq > snapshot.seq` window and the
    // `TICKET_EVENT_TYPES` membership test — and the contests table is filled
    // from a THIRD path that respects neither, because a contest below the
    // baseline is still a contest this user must be shown. Nothing else in this
    // file exercises a contest below a snapshot, which is exactly the shape
    // bootstrap produces: `claim.contested` is backfilled unconditionally, so
    // it arrives at whatever seq it was recorded at, snapshot or no snapshot.
    const storage = createBetterSqliteStorage();
    seqCounter = 0;
    const replica = await createReplica({ storage });
    const original = refusedClaim(USER_B, 'done');
    const contest = contestOf(original, { serverTime: SERVER_TIME });
    contest.seq = 3;
    await replica.loadBootstrap(
      bootstrapOf({
        tickets: [
          {
            ticketId: TICKET,
            snapshot: {
              seq: 5,
              state: {
                kind: 'ticket',
                id: TICKET,
                workspaceId: WS,
                projectId: PROJECT,
                typeId: TYPE,
                parentId: null,
                workflowId: WF,
                workflowVersion: 1,
                stateId: 'doing',
                stateCategory: 'active',
                assigneeId: null,
                collaboratorIds: [],
                fields: { title: { value: 'Contested below', actorId: USER_A, clientTime: CLIENT_TIME, serverTime: SERVER_TIME } },
                transitions: [],
              },
            },
            events: [contest],
          },
        ],
      }),
    );

    // Folded from the snapshot alone: the contest neither moved the ticket nor
    // reached `applyTicketEvent`, which would have thrown on it.
    const ticket = await replica.getTicket(TICKET);
    expect(ticket?.confirmed).toMatchObject({ stateId: 'doing', stateCategory: 'active' });
    // …and it is nonetheless there to be shown.
    expect(ticket?.contests).toHaveLength(1);
    expect(ticket?.contests[0]).toMatchObject({
      contestedEventId: contest.id,
      originalEventId: original.id,
      claimantId: USER_B,
      resolved: false,
    });
    await storage.close();
  });
});

describe('12.136–12.137 the bootstrap door carries the same two rules the stream door does', () => {
  /**
   * A bootstrap that ships v1 AND v2 alongside a snapshot still recorded at
   * `workflowVersion: 1` — the shape the server actually produces, because
   * nothing on the server invalidates a snapshot when a workflow is published
   * (`snapshot-writer.ts` has no `workflowVersion` handling and
   * `snapshot-store.ts` has no DELETE), so every device that bootstraps after a
   * publish receives a pre-publish snapshot.
   */
  function bootstrapWithSnapshotAtV1(latest: unknown, stateId: string, category: string): BootstrapResponse {
    return bootstrapOf({
      definitions: [workflowDefined(wfV1, 1), workflowDefined(latest, 2), typeDefined(1)],
      tickets: [
        {
          ticketId: TICKET,
          snapshot: {
            seq: 5,
            state: {
              kind: 'ticket',
              id: TICKET,
              workspaceId: WS,
              projectId: PROJECT,
              typeId: TYPE,
              parentId: null,
              workflowId: WF,
              workflowVersion: 1,
              stateId,
              stateCategory: category as TicketState['stateCategory'],
              assigneeId: null,
              collaboratorIds: [],
              fields: { title: { value: 'Bootstrapped after a publish', actorId: USER_A, clientTime: CLIENT_TIME, serverTime: SERVER_TIME } },
              transitions: [{ toStateId: stateId, actorId: USER_A, seq: 5, workflowId: WF, workflowVersion: 1 }],
            },
          },
          events: [],
        },
      ],
    });
  }

  it('12.136 a bootstrap snapshot recorded before a publish is folded forward, re-categorised AND dropped', async () => {
    // The absence this case exists for: `foldTicketsOntoVersion` had exactly one
    // call site — `applyServerItem`'s definition branch — so `loadBootstrap`
    // stored the very same `workflow.defined` events through `applyDefinition`
    // and never folded. Measured before the fix, the two doors DISAGREED on
    // identical input: stream `{v:2, cat:'open'}`, bootstrap `{v:1,
    // cat:'active'}`. Nothing healed it either — the two backfilled types the
    // reducer folds (`comment.added`, `attachment.added`) both return state
    // unchanged.
    const recat = createBetterSqliteStorage();
    seqCounter = 0;
    const replica = await createReplica({ storage: recat });
    await replica.loadBootstrap(bootstrapWithSnapshotAtV1(wfV2Recategorised, 'doing', 'active'));

    // Byte-identical to what 12.123 asserts on the stream door.
    const ticket = await replica.getTicket(TICKET);
    expect(ticket?.confirmed).toMatchObject({ stateId: 'doing', stateCategory: 'open', workflowVersion: 2 });
    // The log is carried across unchanged here too — v1 vocabulary, kept.
    expect(ticket?.confirmed?.transitions).toEqual([
      { toStateId: 'doing', actorId: USER_A, seq: 5, workflowId: WF, workflowVersion: 1 },
    ]);

    // The folded state IS the new replay baseline, and the baseline `seq` is
    // carried across UNCHANGED rather than recomputed: the tail above seq 5 has
    // not been applied yet, and raising the baseline would skip it. (That is
    // the deliberate difference from `foldTicketsOntoVersion`, which raises it
    // because the whole local history is already behind the fold.)
    const snap = await recat.all("SELECT seq, state FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [TICKET]);
    expect(snap).toHaveLength(1);
    expect(Number(snap[0]!.seq)).toBe(5);
    expect(JSON.parse(snap[0]!.state as string) as TicketState).toMatchObject({ stateCategory: 'open', workflowVersion: 2 });

    // THE HALF A RE-CATEGORISATION CANNOT SHOW. When v2 DROPS the snapshot's
    // state, an unfolded bootstrap leaves the ticket standing in a state the
    // workflow no longer has — not merely a stale category. Same door, same
    // fold, `stateMapping` deciding where it goes.
    const dropped = createBetterSqliteStorage();
    seqCounter = 0;
    const second = await createReplica({ storage: dropped });
    await second.loadBootstrap(bootstrapWithSnapshotAtV1(wfV2Dropped, 'doing', 'active'));
    expect((await second.getTicket(TICKET))?.confirmed).toMatchObject({
      stateId: 'todo',
      stateCategory: 'open',
      workflowVersion: 2,
    });

    // POSITIVE CONTROL from the same helper against the same code: a bootstrap
    // whose newest definition is the one the snapshot already sits on leaves the
    // ticket exactly where it was, so the two assertions above are the fold and
    // not this case rewriting every ticket it sees.
    const inert = createBetterSqliteStorage();
    seqCounter = 0;
    const third = await createReplica({ storage: inert });
    await third.loadBootstrap(
      bootstrapOf({
        definitions: [workflowDefined(wfV1, 1), typeDefined(1)],
        tickets: bootstrapWithSnapshotAtV1(wfV2Recategorised, 'doing', 'active').tickets,
      }),
    );
    expect((await third.getTicket(TICKET))?.confirmed).toMatchObject({
      stateId: 'doing',
      stateCategory: 'active',
      workflowVersion: 1,
    });

    await recat.close();
    await dropped.close();
    await inert.close();
  });

  it('12.137 a stored claim.contested is skipped by a LATER refold — the filter on the type the docs call the common path', async () => {
    // 12.130 proves filter-before-folding with a `visibility.set`. This case
    // proves it with `claim.contested`, which is the type every sentence around
    // the guard rests on ("backfilled unconditionally, so an unfiltered replay
    // throws on an ordinary first sync") and which no case reached: a contest
    // arriving over sync is answered by `applyServerItem`'s CONTEST_TYPES branch
    // before the ticket branch, so it triggers no refold of its own, and 12.135
    // puts its contest BELOW the snapshot seq, where the seq window keeps it
    // away from the reducer whatever the filter does.
    //
    // What forces the contest past the window is a foldable ticket event
    // ARRIVING AFTER it: `refoldTicket` then replays every ticket-entity row
    // above the baseline, the stored `claim.contested` among them.
    const storage = createBetterSqliteStorage();
    const replica = await seededReplica(storage);
    await replica.applyServerItem(created(TICKET, 'Contested then moved', PROJECT, 1));
    const original = refusedClaim(USER_B, 'done');
    const contest = contestOf(original);
    contest.seq = 2;
    await replica.applyServerItem(contest);

    // The row is in the ledger, above the replay baseline (there is no snapshot
    // yet, so the baseline is 0) — printed rather than assumed, because the
    // whole case rests on the contest being inside the replay window.
    expect((await replica.listEntityEvents(TICKET)).map((e) => ({ type: e.type, seq: e.seq }))).toEqual([
      { type: 'ticket.created', seq: 1 },
      { type: 'claim.contested', seq: 2 },
    ]);
    expect(await storage.all("SELECT seq FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [TICKET])).toEqual([]);

    // Mutation: replace the TICKET_EVENT_TYPES membership test in `refoldTicket`
    // with an unconditional fold and this line throws
    // `applyTicketEvent: not a ticket event: claim.contested`.
    await replica.applyServerItem(transitioned(TICKET, 'doing', 3));

    const ticket = await replica.getTicket(TICKET);
    expect(ticket?.confirmed).toMatchObject({ stateId: 'doing', stateCategory: 'active' });
    // The contest was skipped by the reducer and is nonetheless still there to
    // be shown — skipped is not dropped.
    expect(ticket?.contests).toHaveLength(1);
    expect(ticket?.contests[0]).toMatchObject({ contestedEventId: contest.id, claimantId: USER_B, resolved: false });
    // The log holds the seq-3 move alone: nothing about the contest reached the
    // ticket's state.
    expect(ticket?.confirmed?.transitions).toEqual([
      { toStateId: 'doing', actorId: USER_A, seq: 3, workflowId: WF, workflowVersion: 1 },
    ]);
    await storage.close();
  });
});
