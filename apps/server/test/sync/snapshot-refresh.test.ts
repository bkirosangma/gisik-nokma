import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  newUlid,
  TICKET_EVENT_TYPES,
  type IngestResult,
  type LedgerEvent,
  type SubmittedEvent,
  type TicketState,
} from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { readEntityEvents } from '../../src/ledger/event-store.js';
import { readLatestSnapshot } from '../../src/ledger/snapshot-store.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { BOOTSTRAP_BACKFILL_TYPES } from '../../src/sync/sync-routes.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Cases 12.189–12.191. Publishing a workflow version invalidates the snapshots
 * standing on the version it supersedes.
 *
 * ## The sequence, and why every step of it is needed
 *
 * A snapshot's `state` is folded under whatever workflow version was current
 * when the pass ran. Until `src/sync/snapshot-refresh.ts` nothing invalidated
 * it on a publish, and the damage was NOT mainly the stale snapshot — it was
 * the TAIL. `GET /v1/sync/bootstrap` serves the snapshot plus every event above
 * its seq; one of those can be a `ticket.transitioned` INTO a state the new
 * version dropped, which was legal history when it was written. So the fixture
 * needs, in this order: a snapshot, THEN the offending transition (above it),
 * THEN the publish. Move the transition below the snapshot and every assertion
 * here passes with the fix reverted — the fold is then already inside the
 * snapshot and the client's own `foldSnapshotForward` repairs it.
 *
 * ## Measured at `18b749c`, before the fix existed
 *
 * The route itself does NOT throw — `bootstrapTicket` reads a snapshot, filters
 * events and returns; it replays nothing. What threw, on that tree, with this
 * fixture:
 *
 *  - `runSnapshotPass` after the publish: `applyTicketEvent: workflow "…" has
 *    no state "doing"` (the server's own door, 12.190)
 *  - replaying the served payload the way a replica does: the same error
 *    (12.189)
 *
 * That is why 12.189 asserts on the REPLAY of the response rather than on the
 * route returning 500. A test asserting the route throws would have been green
 * before and after, and would have distinguished nothing.
 *
 * ## The publish goes through the REAL ingest door, the fixture does not
 *
 * The world below is seeded with `applyCommitted` — ledger plus projections,
 * no permission gate and no rule engine, exactly as `./snapshot-writer.test.ts`
 * seeds its own. The `workflow.defined` under test is submitted through
 * `createIngestService(...).ingestBatch`, which is `commitOne`, which is where
 * the refresh is wired. Seeding the publish instead would have tested the
 * module and not the wiring; a call site nothing reaches is the defect this
 * task exists to close, one layer up.
 */

let db: TestDatabase;
const WS = newUlid();
/**
 * TWO tickets on the workflow, not one, and that is the point of the second.
 *
 * The refresh walks a candidate list in a loop, folding each ticket inside a
 * SAVEPOINT of the same name. A one-ticket fixture cannot tell "refreshes every
 * affected ticket" from "refreshes the first one" — the shared `deps` and
 * `ladder` are hoisted out of the loop, the savepoint name is reused each
 * iteration, and every one of those is a way for iteration two to differ from
 * iteration one. Both are asserted everywhere below, so ULID ordering (which
 * decides which is `ORDER BY ticket_id` first) does not change what is proven.
 */
const TICKET = newUlid();
const TICKET2 = newUlid();
const ACTOR = newUlid();
const PROJECT = newUlid();
/** The workflow's key IS its entity ULID — `evaluateWorkflowDefined` refuses `payload.id !== env.entity.id`. */
const WF = newUlid();
const TYPE_KEY = 'refresh-task';

const wfV1 = {
  id: WF,
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

/** v2 drops `doing`. The mapping is not optional — publishing refuses an unmapped drop. */
const wfV2 = {
  id: WF,
  version: 2,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
  stateMapping: { doing: 'todo' },
};

function ticketEvent(
  type: string,
  payload: unknown,
  ticketId = TICKET,
  workspaceSeq?: number,
): LedgerEvent {
  return makeCommitted({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
    actorId: ACTOR,
    ...(workspaceSeq === undefined ? {} : { workspaceSeq }),
  });
}

/**
 * `makeCommitted` mints `workspace_seq` from a PROCESS-LOCAL map, and the real
 * ingest door mints it from `max(workspace_seq) + 1` over the ledger. Once a
 * test in this file has published through `ingestBatch`, the two disagree and
 * the next seeded event collides on `events_workspace_seq_unique` — the exact
 * absence `test/helpers/apply.ts` enumerates for itself. Every seed AFTER a
 * publish reads the number back out of the database instead.
 */
async function nextWorkspaceSeq(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    'SELECT coalesce(max(workspace_seq), 0)::int + 1 AS n FROM events WHERE workspace_id = $1',
    [WS],
  );
  return Number(rows[0]?.n ?? 1);
}

function submittedPublish(payload: unknown): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'workflow', id: WF },
    type: 'workflow.defined',
    version: 1,
    payload,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T10:00:00.000Z',
  };
}

async function publish(payload: unknown): Promise<IngestResult> {
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  const [result] = await ingest.ingestBatch([submittedPublish(payload)]);
  if (result === undefined) throw new Error('ingestBatch answered nothing');
  return result;
}

/**
 * What `GET /v1/sync/bootstrap` would serve for this ticket — `bootstrapTicket`'s
 * body, reproduced against the same store. Reproduced rather than called because
 * the route's own function is not exported and the route needs a session, a
 * membership and a visibility row; what this case is about is the PAYLOAD SHAPE,
 * and the shape is the snapshot plus `seq > snapSeq || BOOTSTRAP_BACKFILL_TYPES`.
 */
async function servedBootstrap(
  ticketId = TICKET,
): Promise<{ snapshot: TicketState | null; seq: number; tail: LedgerEvent[] }> {
  const client = await db.pool.connect();
  try {
    const snapshot = await readLatestSnapshot(client, 'ticket', ticketId);
    const all = await readEntityEvents(client, 'ticket', ticketId);
    const seq = snapshot?.seq ?? 0;
    const backfill: readonly string[] = BOOTSTRAP_BACKFILL_TYPES;
    return {
      snapshot: (snapshot?.state as TicketState | undefined) ?? null,
      seq,
      tail: all.filter((e) => e.seq > seq || backfill.includes(e.type)),
    };
  } finally {
    client.release();
  }
}

/**
 * The replica's side of the contract: fold the served tail onto the served
 * snapshot with the definitions the response also carried — which are the
 * NEWEST ones, because bootstrap ships every `workflow.defined` in the
 * workspace and the replica's `buildLocalDeps` answers at the latest version.
 * `buildLedgerDeps` with no bound resolves exactly the same way, which is why
 * it stands in for the replica here without importing `sync-client`.
 */
async function replayServed(ticketId = TICKET): Promise<TicketState> {
  const served = await servedBootstrap(ticketId);
  const deps = await buildLedgerDeps(db.pool, WS);
  let state = served.snapshot ?? undefined;
  for (const env of served.tail) {
    if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) {
      state = applyTicketEvent(state, env, deps);
    }
  }
  if (state === undefined) throw new Error('nothing folded');
  return state;
}

async function snapshotRows(
  ticketId = TICKET,
): Promise<Array<{ seq: number; stateId: string; version: number }>> {
  const { rows } = await db.pool.query<{ seq: number; state: TicketState }>(
    "SELECT seq, state FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = $1 ORDER BY seq",
    [ticketId],
  );
  return rows.map((row) => ({
    seq: Number(row.seq),
    stateId: row.state.stateId,
    version: row.state.workflowVersion,
  }));
}

/**
 * EVERY row in the whole `snapshots` table, labelled `A`/`B` rather than by
 * ULID so the order is a fact about the fixture and not about which ULID the
 * clock happened to mint first.
 *
 * A per-ticket reader cannot support a claim that a publish "writes nothing":
 * rows for a ticket the publish never touched are unchanged whatever it did to
 * anything else. That is the shape this file's own header calls a check that
 * cannot fail, so the empty case reads the table.
 */
async function allSnapshotRows(): Promise<string[]> {
  const { rows } = await db.pool.query<{ entity_kind: string; entity_id: string; seq: number; state: TicketState }>(
    'SELECT entity_kind, entity_id, seq, state FROM snapshots ORDER BY entity_kind, entity_id, seq',
  );
  const label = (id: string): string => (id === TICKET ? 'A' : id === TICKET2 ? 'B' : id);
  return rows
    .map((row) => `${row.entity_kind}:${label(row.entity_id)}:${row.seq}:${row.state.stateId}:v${row.state.workflowVersion}`)
    .sort();
}

beforeAll(async () => {
  db = await createTestDatabase();
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: wfV1,
      actorId: ACTOR,
    }),
    makeCommitted({
      workspaceId: WS,
      entity: { kind: 'ticket-type', id: newUlid() },
      type: 'ticket-type.defined',
      payload: { id: TYPE_KEY, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
      actorId: ACTOR,
    }),
    ticketEvent('ticket.created', {
      typeId: TYPE_KEY,
      projectId: PROJECT,
      parentId: null,
      title: 'Refresh me',
    }),
    ticketEvent(
      'ticket.created',
      { typeId: TYPE_KEY, projectId: PROJECT, parentId: null, title: 'Refresh me too' },
      TICKET2,
    ),
  ]);
  const filler: LedgerEvent[] = [];
  for (let i = 0; i < 20; i += 1) {
    filler.push(ticketEvent('ticket.field_set', { fieldId: 'notes', value: `n${i}` }));
    filler.push(ticketEvent('ticket.field_set', { fieldId: 'notes', value: `m${i}` }, TICKET2));
  }
  await applyCommitted(db.pool, filler);

  // 21 events on EACH ticket; the pass writes a snapshot at 21 for both, state
  // `todo`, workflowVersion 1. Sorted, because the pass orders by entity id and
  // which ULID sorts first is not a fact this fixture controls.
  const first = await runSnapshotPass(db.pool, { minEvents: 20 });
  expect([...first.written].sort((a, b) => (a.entityId < b.entityId ? -1 : 1))).toEqual(
    [
      { entityId: TICKET, seq: 21 },
      { entityId: TICKET2, seq: 21 },
    ].sort((a, b) => (a.entityId < b.entityId ? -1 : 1)),
  );

  // THE OFFENDING EVENT, on both — above the snapshot, into a state v2 will
  // drop, written while v1 was the vocabulary and legal then.
  await applyCommitted(db.pool, [
    ticketEvent('ticket.transitioned', { to: 'doing' }),
    ticketEvent('ticket.transitioned', { to: 'doing' }, TICKET2),
  ]);
});

afterAll(async () => {
  await db.drop();
});

describe('refresh on publish, snapshot door', () => {
  it('12.189 a publish that drops a state re-snapshots the ticket at its head, and the bootstrap payload it then serves replays clean', async () => {
    // The pre-state, printed rather than counted: a snapshot at 21 under
    // version 1, and a tail carrying the transition into the state about to be
    // dropped. Without this, a fix that produced an EMPTY tail by losing events
    // would satisfy the assertions below just as well.
    expect(await snapshotRows()).toEqual([{ seq: 21, stateId: 'todo', version: 1 }]);
    expect(await snapshotRows(TICKET2)).toEqual([{ seq: 21, stateId: 'todo', version: 1 }]);
    const before = await servedBootstrap();
    expect(before.tail.map((e) => `${e.seq}:${e.type}`)).toEqual(['22:ticket.transitioned']);
    expect(before.tail[0]?.payload).toEqual({ to: 'doing' });
    const before2 = await servedBootstrap(TICKET2);
    expect(before2.tail.map((e) => `${e.seq}:${e.type}`)).toEqual(['22:ticket.transitioned']);

    const result = await publish(wfV2);

    // The publish COMMITTED. This is the half that fails if the refresh lets a
    // fold error escape: an unhandled throw inside `commitOne` rolls the append
    // back and the workspace can no longer publish at all.
    expect(result).toMatchObject({ status: 'committed' });

    // THE SYMPTOM, asserted first so that this case's red IS the defect and not
    // a downstream consequence of it: replaying the bootstrap payload the way a
    // replica does lands on a state instead of throwing. On `18b749c` this line
    // is where the case fails, with `applyTicketEvent: workflow "…" has no
    // state "doing"`.
    expect(await replayServed()).toMatchObject({
      stateId: 'todo',
      stateCategory: 'open',
      workflowVersion: 2,
      workflowId: WF,
    });
    // THE SECOND TICKET, and it is not a duplicate assertion: everything the
    // refresh hoisted out of its loop — the as-of deps, the version ladder, the
    // re-used SAVEPOINT name — is a way for iteration two to behave unlike
    // iteration one, and a one-ticket fixture proves nothing about any of them.
    expect(await replayServed(TICKET2)).toMatchObject({
      stateId: 'todo',
      stateCategory: 'open',
      workflowVersion: 2,
      workflowId: WF,
    });

    // The mechanism that made it land: a new snapshot at the ticket's HEAD —
    // seq 22, above the offending event — holding the state folded onto v2.
    // Both older rows survive; a higher seq supersedes for every reader
    // (`readLatestSnapshot` is ORDER BY seq DESC LIMIT 1), so nothing is
    // deleted.
    expect(await snapshotRows()).toEqual([
      { seq: 21, stateId: 'todo', version: 1 },
      { seq: 22, stateId: 'todo', version: 2 },
    ]);
    expect(await snapshotRows(TICKET2)).toEqual([
      { seq: 21, stateId: 'todo', version: 1 },
      { seq: 22, stateId: 'todo', version: 2 },
    ]);

    // And the tail bootstrap now serves above that snapshot carries no folding
    // event at all — which is WHY the replay above had nothing to throw on.
    const after = await servedBootstrap();
    expect(after.seq).toBe(22);
    expect(after.tail.map((e) => `${e.seq}:${e.type}`)).toEqual([]);
    const after2 = await servedBootstrap(TICKET2);
    expect(after2.seq).toBe(22);
    expect(after2.tail.map((e) => `${e.seq}:${e.type}`)).toEqual([]);

    // The transition is still IN THE LEDGER — the repair is a snapshot above
    // it, never a rewrite of history. Asserted directly so a "fix" that
    // swallowed the event would fail here.
    const all = await readEntityEvents(db.pool, 'ticket', TICKET);
    expect(all.map((e) => `${e.seq}:${e.type}`)).toContain('22:ticket.transitioned');
  });

  it("12.190 the background pass resumes over the refreshed snapshot instead of throwing on the old vocabulary", async () => {
    // At `18b749c` this threw `applyTicketEvent: workflow "…" has no state
    // "doing"`: the pass resumed from the seq-21 snapshot and re-folded event
    // 22 against v2, which no longer has the state that event names. It is a
    // SECOND door on the same defect and the task's brief did not name it.
    const pass = await runSnapshotPass(db.pool, { minEvents: 1 });

    // It wrote nothing because the head has not moved past the snapshot the
    // publish just wrote — which is the point: `foldTicketHead` resumed from
    // seq 22 and read an empty tail. The positive control that this is a real
    // "nothing to do" and not a pass that found no entity is the seq below.
    expect(pass.written).toEqual([]);
    expect(await snapshotRows()).toEqual([
      { seq: 21, stateId: 'todo', version: 1 },
      { seq: 22, stateId: 'todo', version: 2 },
    ]);
    expect(await snapshotRows(TICKET2)).toEqual([
      { seq: 21, stateId: 'todo', version: 1 },
      { seq: 22, stateId: 'todo', version: 2 },
    ]);

    // And it keeps working on new events written in the new vocabulary. Only
    // TICKET moves, so TICKET2 stays at head 22 — which is what makes 12.191's
    // in-place update and its added row two distinguishable outcomes rather
    // than one.
    await applyCommitted(db.pool, [
      ticketEvent('ticket.transitioned', { to: 'done' }, TICKET, await nextWorkspaceSeq()),
    ]);
    const second = await runSnapshotPass(db.pool, { minEvents: 1 });
    expect(second.written).toEqual([{ entityId: TICKET, seq: 23 }]);
    expect(await replayServed()).toMatchObject({ stateId: 'done', workflowVersion: 2 });
  });

  it('12.191 a publish that moves no state still re-stamps the head snapshot IN PLACE, and a first publish with no tickets writes nothing', async () => {
    const wfV3 = {
      id: WF,
      version: 3,
      name: 'Basic',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: '*', to: 'done', rules: [] },
        { from: '*', to: 'todo', rules: [] },
      ],
    };
    // 12.190 left the ticket snapshotted at seq 23 under v2, and the ticket's
    // head has NOT moved since — no publish appends to a ticket's stream. So
    // this refresh lands on a seq that already has a row, which is the ordinary
    // case for the publish door and the one `writeSnapshot`'s bare INSERT dies
    // on with `snapshots_pkey`. `overwriteSnapshot` exists for exactly this.
    const rowsBefore = await allSnapshotRows();
    expect(rowsBefore).toEqual([
      'ticket:A:21:todo:v1',
      'ticket:A:22:todo:v2',
      'ticket:A:23:done:v2',
      'ticket:B:21:todo:v1',
      'ticket:B:22:todo:v2',
    ]);

    const result = await publish(wfV3);
    expect(result).toMatchObject({ status: 'committed' });

    // v3 drops nothing, so each fold is a pure version bump onto the ticket's
    // OWN head seq — A's 23 and B's 22, each rewritten in place. Five rows
    // before and five after: no row is added and none is deleted.
    expect(await allSnapshotRows()).toEqual([
      'ticket:A:21:todo:v1',
      'ticket:A:22:todo:v2',
      'ticket:A:23:done:v3',
      'ticket:B:21:todo:v1',
      'ticket:B:22:todo:v3',
    ]);

    // The other shape, and the first one this code path ever meets in
    // production: `bootstrap-workspace.ts` files a `workflow.defined` at
    // version 1 for a workflow that has no tickets. It must commit and write
    // nothing — asserted against the WHOLE table, because a per-ticket read
    // cannot support "writes nothing": rows for a ticket the publish never
    // touched are unchanged whatever it did to anything else.
    const otherWorkflow = newUlid();
    const founding = await (async (): Promise<IngestResult> => {
      const ingest = createIngestService({
        pool: db.pool,
        evaluate: evaluateEvent,
        projections: buildProjectionRegistry(),
      });
      const [answer] = await ingest.ingestBatch([
        {
          id: newUlid(),
          workspaceId: WS,
          entity: { kind: 'workflow', id: otherWorkflow },
          type: 'workflow.defined',
          version: 1,
          payload: { ...wfV3, id: otherWorkflow, version: 1 },
          actorId: ACTOR,
          origin: 'web',
          clientTime: '2026-08-20T11:00:00.000Z',
        } satisfies SubmittedEvent,
      ]);
      if (answer === undefined) throw new Error('ingestBatch answered nothing');
      return answer;
    })();
    expect(founding).toMatchObject({ status: 'committed' });
    expect(await allSnapshotRows()).toEqual([
      'ticket:A:21:todo:v1',
      'ticket:A:22:todo:v2',
      'ticket:A:23:done:v3',
      'ticket:B:21:todo:v1',
      'ticket:B:22:todo:v3',
    ]);
  });

  /**
   * 12.245 — RULING P36's EXCLUDING FIXTURE, second half, and the one without
   * which the loss is LATENT UNTIL A WORKFLOW PUBLISH.
   *
   * `foldTicketHead` reads only the tail PAST the previous snapshot's seq, and
   * this pass's ordinary case is `seq === previousSeq` — a re-state with an
   * EMPTY tail, re-folding head state onto a new vocabulary. So there is no
   * state-claiming event to capture from, and `overwriteSnapshot` sets
   * `provenance = excluded.provenance`: a writer that captured only from folded
   * events would write NULL over a good block on every publish, and the read
   * door would start refusing tickets the previous pass had just fixed.
   *
   * That is the P14 shape — correct until the day something unrelated changes —
   * which is why this is a case and not a comment.
   */
  it('12.245 a publish with an EMPTY tail carries the provenance block forward instead of erasing it', async () => {
    const wfV4 = {
      id: WF,
      version: 4,
      name: 'Basic',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: '*', to: 'done', rules: [] },
        { from: '*', to: 'todo', rules: [] },
      ],
    };

    const client = await db.pool.connect();
    try {
      // THE PRE-STATE, printed rather than assumed. A block must already be
      // there, or "it survived" is satisfied by a world where nothing was ever
      // written — the null that looks like success.
      const before = await readLatestSnapshot(client, 'ticket', TICKET);
      expect(before?.provenance, 'a block exists before the publish').not.toBeNull();
      const beforeSeq = before?.seq;

      // And the tail really is EMPTY at this point: the ticket's head has not
      // moved, because a publish appends to the WORKFLOW's stream and never to
      // a ticket's. Without this the case could pass through the capture branch
      // and never exercise the carry at all.
      const tail = await readEntityEvents(client, 'ticket', TICKET, beforeSeq ?? 0);
      expect(tail, 'the tail past the snapshot is empty — this is the carry path').toEqual([]);

      const result = await publish(wfV4);
      expect(result).toMatchObject({ status: 'committed' });

      const after = await readLatestSnapshot(client, 'ticket', TICKET);
      // The state was re-folded onto v4 — the pass did its job — AND the block
      // came through untouched. Both halves, because a pass that did nothing at
      // all would also preserve the block.
      expect(after?.state).toBeDefined();
      expect(after?.provenance).toEqual(before?.provenance);
      expect(after?.provenance?.state.serverTime).toBe(before?.provenance?.state.serverTime);
    } finally {
      client.release();
    }
  });
});
