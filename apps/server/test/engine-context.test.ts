import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createEngineContext } from '../src/engine-context.js';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

/**
 * The seam the coordination doc's Plan 1 consequences §9 names, and the window
 * this PR opens: registering `ticket.transitioned` makes transitions ingestible
 * on `main`, ten tasks before Plan 3 Task 12 gives the server real entity
 * state. Until it does, `getEntityState` must answer honestly about what it
 * can and cannot serve — these tests are what makes "honestly" falsifiable.
 *
 * Against the body this PR replaces (`readEntityHead(...) as unknown as
 * EntityState | null`), every assertion below fails: the head POINTER comes
 * back for every kind, so a ticket looks like a TicketState with no
 * `workflowId` and a membership looks like a MembershipState with no `role`.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const WORKSPACE = newUlid();
const WORKFLOW = newUlid();
const TICKET = newUlid();
const PROJECT = newUlid();
const ACTOR = newUlid();

function service() {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
}

function submitted(partial: Pick<SubmittedEvent, 'entity' | 'type' | 'payload'>): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WORKSPACE,
    version: 1,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    ...partial,
  };
}

/** A workflow whose only move is guarded by a role — §9's exact scenario. */
const roleGatedWorkflow = submitted({
  entity: { kind: 'workflow', id: WORKFLOW },
  type: 'workflow.defined',
  payload: {
    id: WORKFLOW,
    version: 1,
    name: 'Approvals',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [{ from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', roles: ['admin'] }] }],
  },
});

const ticketCreated = submitted({
  entity: { kind: 'ticket', id: TICKET },
  type: 'ticket.created',
  payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'File the GST return' },
});

beforeAll(async () => {
  const results = await service().ingestBatch([roleGatedWorkflow, ticketCreated]);
  // The create is REFUSED from Plan 3 Task 5, and this is the seam working
  // rather than breaking. `checkTicketCreated` reads the ticket type's rank and
  // name through `getTicketTypeDef`, and this server context answers null for
  // every type until Task 12 backs that method with `proj_ticket_types` — so
  // the server refuses to create a ticket whose type it cannot see, which is
  // exactly what `createEngineContext`'s own comment on that method says it
  // will do. Before Task 5 the event fell through the engine's `default` arm
  // and committed unjudged; nothing consumed it, because proj_tickets does not
  // exist yet either.
  //
  // TASK 12'S REVERT, in full, so it is mechanical rather than inferential.
  // Once getTicketTypeDef reads proj_ticket_types, all FOUR of these move
  // together and none may land without the others:
  //
  //   1. ADD a `ticket-type.defined` event for `task` to this batch, ahead of
  //      the create. Without one, proj_ticket_types has no row to serve and the
  //      create is still refused for the same reason — a context that can read
  //      the table is not the same thing as a table with the type in it.
  //   2. This expectation becomes ['committed', 'committed', 'committed'].
  //   3. DELETE the refusal-object assertion immediately below.
  //   4. DELETE the planted ticket head row further down; the create writes it.
  //
  // Those four join the two assertions A12/BA-3 already assigns that task.
  expect(results.map((result) => result.status)).toEqual(['committed', 'refused']);
  expect(results[1]).toEqual({
    status: 'refused',
    eventId: expect.any(String),
    rule: 'ticket.unknown-type',
    reason: "This ticket's type is not defined in this workspace.",
  });

  // Deleted by Task 12, step 4 above. The ticket head row the create would have
  // written, planted for the same
  // reason the membership row below is: the assertion it serves is about what
  // `getEntityState` does with a head row that EXISTS. Against the
  // `as unknown as EntityState` body this file was written to kill, a ticket
  // WITH a head comes back looking like a TicketState whose `workflowId` is
  // undefined — and with no head row at all that body returns null too, so the
  // test would pass against the very defect it exists to catch.
  await db.pool.query(
    `INSERT INTO proj_entity_heads
       (entity_kind, entity_id, workspace_id, head_seq, head_event_id, head_event_type, head_server_time)
     VALUES ('ticket', $1, $2, 1, $3, 'ticket.created', '2026-08-20T09:00:01.000Z')`,
    [TICKET, WORKSPACE, newUlid()],
  );

  // The membership row Plan 4 will write for real. Planted directly because no
  // event type is bound to the `membership` kind yet, and §9's hazard needs a
  // membership entity that HAS a head — "if the membership entity has any
  // committed event the guard passes `!== null`" is the whole sentence.
  await db.pool.query(
    `INSERT INTO proj_entity_heads
       (entity_kind, entity_id, workspace_id, head_seq, head_event_id, head_event_type, head_server_time)
     VALUES ('membership', $1, $2, 1, $3, 'membership.granted', '2026-08-20T09:00:01.000Z')`,
    [membershipId(WORKSPACE, ACTOR), WORKSPACE, newUlid()],
  );
});

describe('createEngineContext.getEntityState — what the server can honestly serve', () => {
  it('answers null for a ticket that HAS a head row, because ticket state does not exist until Plan 3 Task 12', async () => {
    const client = await db.pool.connect();
    try {
      expect(await createEngineContext(client).getEntityState('ticket', TICKET)).toBeNull();
    } finally {
      client.release();
    }
  });

  it('answers null for a membership that HAS a head row — the §9 hazard, planted', async () => {
    // The head pointer carries `kind: 'membership'`, so the cast this replaces
    // satisfied restrict-to's `membership.kind === 'membership'` narrowing and
    // then read `undefined` off `.role`. Null is the honest answer: the server
    // has no membership state to serve, and Plan 4's proj_memberships is what
    // will change that.
    const client = await db.pool.connect();
    try {
      const membership = await createEngineContext(client).getEntityState(
        'membership',
        membershipId(WORKSPACE, ACTOR),
      );
      expect(membership).toBeNull();
    } finally {
      client.release();
    }
  });

  it('answers the whole state for kinds whose state IS {kind, id} — existence, and nothing invented', async () => {
    // workspace/project/workflow/ticket-type states are exactly `{kind, id}`
    // today (`OtherEntityState`), so a head row is enough to serve them in
    // full. No cast is involved: the object structurally IS the type, which is
    // what makes the compiler an ally here again.
    const client = await db.pool.connect();
    try {
      const ctx = createEngineContext(client);
      // WORKFLOW has a head row; PROJECT has none. Both answers are about
      // existence and say nothing more, which is the whole of what these
      // states claim — so the pair pins that this is existence and not a
      // constant.
      expect(await ctx.getEntityState('workflow', WORKFLOW)).toEqual({ kind: 'workflow', id: WORKFLOW });
      expect(await ctx.getEntityState('project', PROJECT)).toBeNull();
    } finally {
      client.release();
    }
  });
});

/**
 * `getContest` (Plan 10 Task 4). Asserted through the ENGINE rather than by
 * calling the method: the evaluator is the only consumer, and the three
 * refusals below are the whole reason the method exists. A direct call would
 * prove the SQL runs and nothing about the wiring — and the wiring is what was
 * missing, loudly, until this task (`evaluateClaimContestedResolved` threw
 * "EngineContext.getContest is required" against a context that had none).
 */
describe('createEngineContext.getContest — the contest lookup the engine cannot work without', () => {
  const CONTEST_TICKET = newUlid();
  const OTHER_TICKET = newUlid();

  function contestOn(ticketId: string): SubmittedEvent {
    return submitted({
      entity: { kind: 'ticket', id: ticketId },
      type: 'claim.contested',
      payload: {
        originalEvent: submitted({
          entity: { kind: 'ticket', id: ticketId },
          type: 'ticket.transitioned',
          payload: { toStateId: 'done' },
        }),
        rule: 'restrict-to',
        reason: 'Only the assignee may do this.',
      },
    });
  }

  function resolutionOf(ticketId: string, contestedEventId: string): SubmittedEvent {
    return submitted({
      entity: { kind: 'ticket', id: ticketId },
      type: 'claim.contested_resolved',
      payload: { contestedEventId, resolution: 'discarded', note: 'stale' },
    });
  }

  it('a resolution commits only because the context can READ the contest it names', async () => {
    // Mutation that reddens it, naming its own site: make getContest return
    // null unconditionally in src/engine-context.ts — the evaluator then
    // refuses `contest.unknown` and this commit becomes a refusal.
    const contest = { ...contestOn(CONTEST_TICKET), origin: 'server' as const };
    const [opened] = await service().ingestBatch([contest]);
    expect(opened).toMatchObject({ status: 'committed' });

    const [resolved] = await service().ingestBatch([resolutionOf(CONTEST_TICKET, contest.id)]);
    expect(resolved).toMatchObject({ status: 'committed' });
  });

  it('a resolution naming no recorded contest is refused contest.unknown — null means "never recorded"', async () => {
    const [result] = await service().ingestBatch([resolutionOf(CONTEST_TICKET, newUlid())]);
    expect(result).toMatchObject({ status: 'refused', rule: 'contest.unknown' });
  });

  it('a resolution aimed at a contest on ANOTHER ticket is refused contest.wrong-ticket', async () => {
    // This is what makes the returned `ticketId` load-bearing rather than
    // decorative. Mutation that reddens it: return `env.entity.id` from
    // getContest instead of the projection's `ticket_id`.
    const contest = { ...contestOn(OTHER_TICKET), origin: 'server' as const };
    const [opened] = await service().ingestBatch([contest]);
    expect(opened).toMatchObject({ status: 'committed' });

    const [result] = await service().ingestBatch([resolutionOf(CONTEST_TICKET, contest.id)]);
    expect(result).toMatchObject({ status: 'refused', rule: 'contest.wrong-ticket' });
  });

  it('a second resolution of the same contest is refused contest.already-resolved — the `resolved` column read back', async () => {
    // Mutation that reddens it: return a hard-coded `resolved: false` from
    // getContest. The first resolution still commits; the second one stops
    // being refused, and history gets rewritten.
    const ticket = newUlid();
    const contest = { ...contestOn(ticket), origin: 'server' as const };
    await service().ingestBatch([contest]);
    const [first] = await service().ingestBatch([resolutionOf(ticket, contest.id)]);
    expect(first).toMatchObject({ status: 'committed' });
    const [second] = await service().ingestBatch([resolutionOf(ticket, contest.id)]);
    expect(second).toMatchObject({ status: 'refused', rule: 'contest.already-resolved' });
  });
});

describe('a role-gated transition through the shipped server context', () => {
  it('is refused for the true reason — the server has no ticket state — and never for an invented one', async () => {
    const results = await service().ingestBatch([
      submitted({ entity: { kind: 'ticket', id: TICKET }, type: 'ticket.transitioned', payload: { to: 'done' } }),
    ]);

    // Against the cast this PR removes, the same batch is refused as
    // `unknown-workflow`, reasoning "Ticket <id> uses workflow undefined, but
    // no published definition of that workflow is known." — a sentence that
    // names a workflow called `undefined`, blames the workflow for a defect in
    // the context, and reads entirely legitimate to whoever receives it. That
    // is the silent failure §9 describes, observed one step earlier than §9
    // predicted: the ticket lookup lies before the role gate is ever reached.
    expect(results[0]).toEqual({
      status: 'refused',
      eventId: expect.any(String),
      rule: 'unknown-ticket',
      reason: `This event moves ticket ${TICKET}, but no such ticket is known.`,
    });
  });
});
