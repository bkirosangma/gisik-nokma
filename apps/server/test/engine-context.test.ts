import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createEngineContext } from '../src/engine-context.js';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

/**
 * The seam the coordination doc's Plan 1 consequences §9 named, and the commit
 * that closes it. Registering `ticket.transitioned` made transitions ingestible
 * ten tasks before the server had entity state to judge them against; until
 * Plan 3 Chain B Task 12 the honest answer was null, and the assertions here
 * were what made "honestly" falsifiable.
 *
 * Task 12 gives `getEntityState('ticket')`, `getChildrenStates` and
 * `getTicketTypeDef` real bodies over proj_tickets and proj_ticket_types — in
 * ONE change set, because a context that resolves a parent and then reports it
 * childless refuses nothing while looking like it has checked. The assertions
 * that pinned the nulls are INVERTED here rather than deleted, so the file still
 * reads as the history of what this server could answer and when.
 *
 * Against the body two commits ago (`readEntityHead(...) as unknown as
 * EntityState | null`), every assertion below still fails: the head POINTER
 * comes back for every kind, so a ticket looks like a TicketState with no
 * `workflowId` and a membership looks like a MembershipState with no `role`.
 *
 * `'membership'` stays null — Plan 4's proj_memberships owns it — which is why
 * the role-gated transition at the foot of this file is refused by `restrict-to`
 * naming a role the actor cannot be shown to hold.
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

/**
 * Revert step 1 of the four this file's previous version listed for Task 12.
 * **Rank 3**, the built-in `task` rank: at `DEEPEST_RANK` (4) or below it the
 * create below is refused `hierarchy.deepest-rank-parent-required` for having no
 * parent, and the debugging would be of a type lookup that was working.
 */
const taskTypeDefined = submitted({
  // A FRESH ENTITY ULID, not the type key: the envelope schema requires a ULID
  // entity id, and a ticket type's projection key is its PAYLOAD's `id`. The two
  // are deliberately different things — `test/proj-ticket-types.test.ts` turns
  // that decoupling into its own case — which is also what lets two workspaces
  // define the same type key, the scenario the tenancy tests below rest on.
  entity: { kind: 'ticket-type', id: newUlid() },
  type: 'ticket-type.defined',
  payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: WORKFLOW, fields: [] },
});

const ticketCreated = submitted({
  entity: { kind: 'ticket', id: TICKET },
  type: 'ticket.created',
  payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'File the GST return' },
});

beforeAll(async () => {
  const results = await service().ingestBatch([roleGatedWorkflow, taskTypeDefined, ticketCreated]);
  // ALL THREE COMMIT, and that is Task 12's four-step revert carried out in
  // full — the previous version of this file listed the steps so they would be
  // mechanical rather than inferential, and here they are:
  //
  //   1. a `ticket-type.defined` for `task` was ADDED ahead of the create.
  //      Without one, proj_ticket_types has no row to serve and the create is
  //      still refused `ticket.unknown-type` for a reason that has nothing to do
  //      with the wiring — a context that can read the table is not the same
  //      thing as a table with the type in it.
  //   2. this expectation became three commits.
  //   3. the refusal-object assertion that stood here was DELETED.
  //   4. the ticket head row planted below it was DELETED; the create writes it,
  //      and it writes the proj_tickets row the head used to stand in for.
  //
  // The create committing is itself the discriminator: it resolves `task`
  // through `getTicketTypeDef`, and that method answered null unconditionally
  // until this task.
  expect(results.map((result) => result.status)).toEqual(['committed', 'committed', 'committed']);

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
  it('serves the WHOLE TicketState for a ticket the projections hold — inverted by Task 12', async () => {
    // THE FIRST OF THE TWO ASSERTIONS THIS TASK INVERTS. It read
    // `.toBeNull()`, under a name saying ticket state "does not exist until
    // Plan 3 Task 12". It exists now.
    //
    // Asserted field by field rather than `not.toBeNull()`: the defect this
    // file was written against returned a head POINTER that is not null either,
    // and `workflowId`/`stateCategory` are exactly the fields it lacked. The
    // pair `kind` and `workspaceId` is the total-outage trap `rowToTicketState`
    // documents — `undefined !== env.workspaceId` is always true, so a mapper
    // dropping either refuses every parented create while sounding like a
    // tenancy refusal.
    const client = await db.pool.connect();
    try {
      const ticket = await createEngineContext(client).getEntityState('ticket', TICKET);
      expect(ticket).toMatchObject({
        kind: 'ticket',
        id: TICKET,
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        typeId: 'task',
        parentId: null,
        workflowId: WORKFLOW,
        stateId: 'todo',
        stateCategory: 'open',
      });
    } finally {
      client.release();
    }
  });

  it('answers null for a ticket id nothing ever created — the control that keeps the answer above about THIS ticket', async () => {
    const client = await db.pool.connect();
    try {
      expect(await createEngineContext(client).getEntityState('ticket', newUlid())).toBeNull();
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
  it('now reaches the role gate and is refused BY IT — §9 observed where §9 predicted', async () => {
    const results = await service().ingestBatch([
      submitted({ entity: { kind: 'ticket', id: TICKET }, type: 'ticket.transitioned', payload: { to: 'done' } }),
    ]);

    // THE SECOND OF THE TWO ASSERTIONS THIS TASK INVERTS, and the refusal moved
    // one layer DOWN rather than away.
    //
    // It used to expect `unknown-ticket` — "no such ticket is known" — which was
    // true of a server whose `getEntityState('ticket')` answered null, and which
    // meant the role gate at the end of this transition was never reached. The
    // ticket resolves now, its workflow resolves, the `todo -> done` edge is
    // found, and `restrict-to` asks the question §9 was always about: is the
    // actor an admin here? The server cannot say they are — `'membership'` is
    // Plan 4's proj_memberships and still answers null — so the move is refused
    // naming the role it wanted. The refusal is honest about its own subject,
    // which is the whole property this file exists to hold.
    //
    // Against the `as unknown as EntityState` cast two commits ago, the same
    // batch was refused `unknown-workflow`, reasoning "Ticket <id> uses workflow
    // undefined, but no published definition of that workflow is known." — a
    // sentence naming a workflow called `undefined` and blaming it for a defect
    // in the context.
    expect(results[0]).toEqual({
      status: 'refused',
      eventId: expect.any(String),
      rule: 'restrict-to',
      reason: `Only anyone with the role admin may make this move, and ${ACTOR} is not among them.`,
    });
  });
});
