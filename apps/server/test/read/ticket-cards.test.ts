import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import {
  assembleTicketCards,
  fetchTicketRows,
  type ProjTicketRow,
} from '../../src/read/ticket-cards.js';
import { stateProvenanceFor } from '../../src/read/state-provenance.js';
import { blockedStateKeys, latestWorkflowDefs } from '../../src/read/workflow-defs.js';
import { getRollup } from '../../src/projections/rollups.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  SCENARIO_DUE_DAY,
  scenarioUsers,
  seedReadScenario,
  type ReadScenario,
} from '../helpers/read-scenario.js';

/**
 * Plan 5 Task 7 — the three read-model readers and the TicketCard assembler.
 *
 * ## What this file is defending
 *
 * A view model that cannot tell "there are none" apart from "I could not see
 * any" is the defect class this task exists against, so every case below either
 * asserts a THREE-WAY distinction directly (the due date's claimed / cleared /
 * never-claimed) or carries its own positive control in the same `it` (a
 * `null`, `0` or empty expectation cannot, on its own, tell "correctly empty"
 * from "broken and empty").
 *
 * ## ONE database, ONE seed, and mutating cases mint their own world
 *
 * `seedReadScenario` REFUSES a second seed into the same database — its fixed
 * `wf-errands` / `epic` / `task` entity ids collide on `events_entity_seq_unique`
 * — so this file takes one `createTestDatabase` and seeds once in `beforeAll`.
 *
 * The consequence the plan text missed: with one seed, any case that adds a
 * child under `world.epicId` or a transition onto `world.taskInEpicId` changes
 * what an EARLIER case asserted, and the suite then passes because of
 * declaration order. So every mutating case here mints its OWN parent and
 * children (in the seeded workspace, reusing its workflow and types) and
 * touches nothing `world` names. The read-only cases are the only ones that
 * read `world`, and they can run in any order.
 *
 * ## The clocks are passed, never inherited
 *
 * `makeCommitted` ticks BOTH clocks one minute per CALL from the fixture epoch,
 * so the instant on any seeded event is a function of its index in
 * `seedReadScenario`'s array. Every case that asserts an exact instant passes
 * `clientTime` AND `serverTime` explicitly on the event it asserts about;
 * nothing here pastes an observed value back as an expectation, which would
 * turn the assertion into a restatement of whatever the code did.
 *
 * Nothing here is clock-SENSITIVE in the `TZ` sense: every time asserted is an
 * absolute instant compared as an ISO-8601 `Z` string, and the one derivation
 * (`Date.prototype.toISOString` over a `timestamptz` column) is zone-free by
 * construction. The IST day arithmetic that does move with a zone belongs to
 * Task 12's attention windows, not here.
 */

let db: TestDatabase;
let world: ReadScenario;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedReadScenario(db.pool, scenarioUsers());
});

afterAll(async () => {
  await db.drop();
});

/** A `ticket.created` in the seeded workspace, on its `task` type. */
function created(args: {
  id: string;
  actorId: string;
  parentId?: string | null;
  title?: string;
  clientTime?: string;
  serverTime?: string;
}): LedgerEvent {
  return makeCommitted({
    workspaceId: world.workspaceId,
    actorId: args.actorId,
    entity: { kind: 'ticket', id: args.id },
    type: 'ticket.created',
    payload: {
      typeId: 'task',
      projectId: world.projectId,
      parentId: args.parentId ?? null,
      title: args.title ?? 'Minted ticket',
    },
    ...(args.clientTime === undefined ? {} : { clientTime: args.clientTime }),
    ...(args.serverTime === undefined ? {} : { serverTime: args.serverTime }),
  });
}

/**
 * A `ticket.transitioned`. The payload key is `to`, NOT the plan text's
 * `toStateId`: `ticketTransitionedPayloadSchema` requires `to`, so the plan's
 * fixture would not merely assert the wrong thing — it would throw inside
 * `applyCommitted`'s transaction and never reach an assertion at all.
 */
function transitioned(args: {
  id: string;
  actorId: string;
  to: string;
  cause?: { kind: 'reopened-for-child'; childTicketId: string };
  clientTime?: string;
  serverTime?: string;
}): LedgerEvent {
  return makeCommitted({
    workspaceId: world.workspaceId,
    actorId: args.actorId,
    entity: { kind: 'ticket', id: args.id },
    type: 'ticket.transitioned',
    payload: { to: args.to, ...(args.cause === undefined ? {} : { cause: args.cause }) },
    ...(args.clientTime === undefined ? {} : { clientTime: args.clientTime }),
    ...(args.serverTime === undefined ? {} : { serverTime: args.serverTime }),
  });
}

function visibleToOnly(ticketId: string, userIds: string[]): LedgerEvent {
  return makeCommitted({
    workspaceId: world.workspaceId,
    actorId: world.owner,
    entity: { kind: 'ticket', id: ticketId },
    type: 'visibility.set',
    payload: { ticketId, mode: 'explicit', userIds },
  });
}

describe('stateProvenanceFor', () => {
  it('answers the creation claim for a never-transitioned ticket — actor, both clocks, no cause', async () => {
    const virgin = newUlid();
    const other = newUlid();
    await applyCommitted(db.pool, [
      created({
        id: virgin,
        actorId: world.owner,
        clientTime: '2026-08-10T04:00:00.000Z',
        serverTime: '2026-08-10T04:00:03.000Z',
      }),
      created({
        id: other,
        actorId: world.member,
        clientTime: '2026-08-11T05:00:00.000Z',
        serverTime: '2026-08-11T05:00:07.000Z',
      }),
    ]);

    const map = await stateProvenanceFor(db.pool, [virgin, other]);
    expect(map.get(virgin)).toEqual({
      actorId: world.owner,
      clientTime: '2026-08-10T04:00:00.000Z',
      serverTime: '2026-08-10T04:00:03.000Z',
      cause: null,
    });
    // The positive control for `cause: null` and for every other field: a
    // SECOND ticket in the same call, differing in the actor and in both
    // clocks. Without it, a reader that answered one constant for every id
    // would satisfy the assertion above.
    expect(map.get(other)).toEqual({
      actorId: world.member,
      clientTime: '2026-08-11T05:00:00.000Z',
      serverTime: '2026-08-11T05:00:07.000Z',
      cause: null,
    });
  });

  /**
   * 7.15 — planted defect: after two transitions by different actors the card carries the LAST claim — the actor is the later one and both clocks are that claim’s.
   */
  it('PLANTED DEFECT: after two transitions by different actors the card carries the LAST claim — actor and both clocks', async () => {
    const ticketId = newUlid();
    await applyCommitted(db.pool, [
      created({
        id: ticketId,
        actorId: world.owner,
        clientTime: '2026-08-12T04:00:00.000Z',
        serverTime: '2026-08-12T04:00:01.000Z',
      }),
      transitioned({
        id: ticketId,
        actorId: world.member,
        to: 'doing',
        clientTime: '2026-08-13T04:00:00.000Z',
        serverTime: '2026-08-13T04:00:01.000Z',
      }),
      transitioned({
        id: ticketId,
        actorId: world.owner,
        to: 'waiting',
        clientTime: '2026-08-14T04:00:00.000Z',
        serverTime: '2026-08-14T04:00:09.000Z',
      }),
    ]);

    // The LAST claim, whole. Every field discriminates: the actor is not the
    // middle transition's, neither clock is the creation's, and the two clocks
    // are nine seconds apart so one cannot stand in for the other.
    expect((await stateProvenanceFor(db.pool, [ticketId])).get(ticketId)).toEqual({
      actorId: world.owner,
      clientTime: '2026-08-14T04:00:00.000Z',
      serverTime: '2026-08-14T04:00:09.000Z',
      cause: null,
    });
  });

  it('carries the reopen cause, and a transition that named none answers null in the same breath', async () => {
    const reopened = newUlid();
    const plain = newUlid();
    const childId = newUlid();
    await applyCommitted(db.pool, [
      created({ id: reopened, actorId: world.owner }),
      created({ id: plain, actorId: world.owner }),
      created({ id: childId, actorId: world.member, parentId: reopened }),
      transitioned({
        id: reopened,
        actorId: world.member,
        to: 'doing',
        cause: { kind: 'reopened-for-child', childTicketId: childId },
      }),
      transitioned({ id: plain, actorId: world.member, to: 'doing' }),
    ]);

    const map = await stateProvenanceFor(db.pool, [reopened, plain]);
    expect(map.get(reopened)?.cause).toEqual({
      kind: 'reopened-for-child',
      childTicketId: childId,
    });
    // `cause: null` and its positive control are the SAME call: two tickets,
    // same event type, same actor, differing only in whether the claim carried
    // a cause. A reader that always answered null passes the second and fails
    // the first; one that always answered the cause fails the second.
    expect(map.get(plain)?.cause).toBeNull();
  });

  /**
   * 7.74 — `stateProvenanceFor` is TOTAL over its input: an unknown id is absent from the map rather than mapped to an invented anonymous claim, asserted beside a real id that is present.
   */
  it('is total over its input: an unknown id is simply absent, beside a known one that is present', async () => {
    const ghost = newUlid();
    const map = await stateProvenanceFor(db.pool, [ghost, world.epicId]);
    expect(map.has(ghost)).toBe(false);
    // The positive control for the absence: the same call, a real id, present.
    expect(map.get(world.epicId)?.actorId).toBe(world.owner);
    expect(map.size).toBe(1);

    // Empty in, empty out — the CONTRACT, and it is stated as the contract
    // rather than as a claim about the early return that implements it.
    // Measured: deleting `if (ticketIds.length === 0) return provenance` kills
    // nothing, because `entity_id = ANY('{}'::text[])` answers no rows either
    // way. That early return is a saved round trip, not a semantic guard, and
    // saying otherwise here would defend a branch with an assertion that cannot
    // see it. What the line above DOES do is stop this zero being "a reader
    // that answers nothing", by putting a real id's answer in the same test.
    expect((await stateProvenanceFor(db.pool, [])).size).toBe(0);
  });
});

/**
 * 7.75 — both clauses of the row live in this block: `latestWorkflowDefs` is workspace-scoped (another workspace holding the same workflow id is answered nothing) and `blockedStateKeys` derives the blocked set from amendment 9’s flag alone.
 */
describe('latestWorkflowDefs / blockedStateKeys', () => {
  it('answers the latest def per id and derives the blocked set from the flag alone', async () => {
    const unknown = newUlid();
    const defs = await latestWorkflowDefs(db.pool, world.workspaceId, [world.workflowId, unknown]);

    expect(defs.get(world.workflowId)?.name).toBe('Errands');
    // The positive control for the absence sits beside it: same call, same map.
    expect(defs.has(unknown)).toBe(false);

    // Exactly the one state carrying `blocked: true`. `waiting` is category
    // 'active', so a derivation that read the CATEGORY rather than the flag
    // would also claim `doing`, and one that keyed on the state id alone would
    // drop the workflow prefix.
    expect(blockedStateKeys(defs)).toEqual(new Set([`${world.workflowId}:waiting`]));
  });

  it('is tenant-scoped: another workspace holding the same id is answered nothing', async () => {
    const stranger = newUlid();
    const foreign = await latestWorkflowDefs(db.pool, stranger, [world.workflowId]);
    expect(foreign.size).toBe(0);
    // The positive control: the SAME workflow id, asked under the workspace
    // that owns it, answers. Without this line, `size === 0` would also pass
    // for a reader that never answers anything.
    expect(
      (await latestWorkflowDefs(db.pool, world.workspaceId, [world.workflowId])).size,
    ).toBe(1);
  });
});

describe('assembleTicketCards', () => {
  it('assembles title, the due-date claim, provenance and the viewer-honest rollup from the seeded world', async () => {
    const rows = await fetchTicketRows(db.pool, [world.epicId, world.taskInEpicId]);
    const cards = await assembleTicketCards(db.pool, world.member, rows);
    const epic = cards.find((c) => c.ticketId === world.epicId);
    const task = cards.find((c) => c.ticketId === world.taskInEpicId);

    expect(epic?.title).toBe('Registrations drive');
    expect(epic?.rollup).toEqual({
      totalChildren: 1,
      terminalChildren: 0,
      uncategorizedChildren: 0,
      restrictedCount: 0,
    });
    // `terminalChildren: 0` is a zero, so it gets its control: the epic's one
    // child is in 'doing', which is 'active' — the same row that makes the
    // total 1 is the row that must NOT be counted terminal.
    expect(task?.stateCategory).toBe('active');

    expect(task?.title).toBe('File the GST return');
    expect(task?.stateId).toBe('doing');
    expect(task?.assigneeId).toBe(world.member);
    expect(task?.stateProvenance.actorId).toBe(world.member);

    // The due-date claim's date, actor and CLIENT clock are literals of the
    // fixture. Its SERVER clock is not — `makeCommitted` ticks it per call — so
    // it is read from the ledger rather than pasted from a run, which is what
    // keeps this an assertion about where the assembler sourced the field.
    const { rows: claimRows } = await db.pool.query<{ server_time: Date }>(
      `SELECT server_time FROM events
        WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.field_set'
          AND payload ->> 'fieldId' = 'dueDate'
        ORDER BY seq DESC LIMIT 1`,
      [world.taskInEpicId],
    );
    const claimServerTime = claimRows[0]?.server_time.toISOString();
    expect(claimServerTime).toBeTypeOf('string');
    expect(task?.dueDate).toEqual({
      state: 'claimed',
      claim: {
        date: SCENARIO_DUE_DAY,
        actorId: world.member,
        clientTime: '2026-08-19T18:30:00.000Z',
        serverTime: claimServerTime,
      },
    });

    // A leaf's rollup is ABSENT, not zeroed — and the epic's non-null rollup
    // above is the control that says this null is a fact about the ticket
    // rather than a reader that never answers.
    expect(task?.rollup).toBeNull();
  });

  /**
   * 7.76 — `TicketCard.dueDate` has three states that do not collapse into one another: claimed, cleared by somebody, and never claimed.
   */
  it('the due date has three states and none of them is the others: claimed, cleared by somebody, never claimed', async () => {
    const claimedId = newUlid();
    const clearedId = newUlid();
    const virginId = newUlid();
    await applyCommitted(db.pool, [
      created({ id: claimedId, actorId: world.owner }),
      created({ id: clearedId, actorId: world.owner }),
      created({ id: virginId, actorId: world.owner }),
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.member,
        clientTime: '2026-08-15T04:00:00.000Z',
        serverTime: '2026-08-15T04:00:02.000Z',
        entity: { kind: 'ticket', id: claimedId },
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: { date: '2026-09-01', note: 'before the audit' } },
      }),
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: clearedId },
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: { date: '2026-09-02' } },
      }),
      // The clearing. `value: null` is a CLAIM — the reducer keeps the
      // clearer's id and both clocks precisely so this is not a blank.
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.guest,
        clientTime: '2026-08-16T04:00:00.000Z',
        serverTime: '2026-08-16T04:00:05.000Z',
        entity: { kind: 'ticket', id: clearedId },
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: null },
      }),
    ]);

    const rows = await fetchTicketRows(db.pool, [claimedId, clearedId, virginId]);
    const cards = await assembleTicketCards(db.pool, world.owner, rows);
    const byId = new Map(cards.map((c) => [c.ticketId, c]));

    expect(byId.get(claimedId)?.dueDate).toEqual({
      state: 'claimed',
      claim: {
        date: '2026-09-01',
        note: 'before the audit',
        actorId: world.member,
        clientTime: '2026-08-15T04:00:00.000Z',
        serverTime: '2026-08-15T04:00:02.000Z',
      },
    });
    // THE POINT OF THE CASE. The plan text typed this field `DueDateClaim |
    // null`, which makes the next two expectations the SAME value — and the
    // clearer's identity, which the ledger fought to keep, disappears at the
    // view model. Here they are three different answers, and the third names
    // the person who emptied it.
    expect(byId.get(clearedId)?.dueDate).toEqual({
      state: 'cleared',
      actorId: world.guest,
      clientTime: '2026-08-16T04:00:00.000Z',
      serverTime: '2026-08-16T04:00:05.000Z',
    });
    expect(byId.get(virginId)?.dueDate).toEqual({ state: 'never-claimed' });
  });

  /**
   * 7.77 — the rollup counts terminal children the viewer CANNOT see and names the restriction beside them, rather than silently narrowing the denominator.
   */
  it('the rollup counts terminal children the viewer CANNOT see and names the restriction beside them', async () => {
    const parent = newUlid();
    const doneVisible = newUlid();
    const doneHidden = newUlid();
    const openVisible = newUlid();
    await applyCommitted(db.pool, [
      created({ id: parent, actorId: world.owner, title: 'Quarter close' }),
      created({ id: doneVisible, actorId: world.owner, parentId: parent }),
      created({ id: doneHidden, actorId: world.owner, parentId: parent }),
      created({ id: openVisible, actorId: world.owner, parentId: parent }),
      transitioned({ id: doneVisible, actorId: world.owner, to: 'done' }),
      transitioned({ id: doneHidden, actorId: world.owner, to: 'done' }),
      visibleToOnly(doneHidden, [world.owner]),
    ]);

    const rows = await fetchTicketRows(db.pool, [parent]);
    const [forMember] = await assembleTicketCards(db.pool, world.member, rows);
    const [forOwner] = await assembleTicketCards(db.pool, world.owner, rows);

    // Spec §6 ("5 of 8 done · 2 restricted"): the total AND the done-count are
    // over ALL children and are identical for both viewers; only the
    // restriction differs. Three distinct numbers for the member — 3, 2, 1 —
    // so no two can be swapped without this dying.
    expect(forMember?.rollup).toEqual({
      totalChildren: 3,
      terminalChildren: 2,
      uncategorizedChildren: 0,
      restrictedCount: 1,
    });
    expect(forOwner?.rollup).toEqual({
      totalChildren: 3,
      terminalChildren: 2,
      uncategorizedChildren: 0,
      restrictedCount: 0,
    });

    // A viewer-filtered terminal count would answer 1 here, which is the
    // understatement the spec's "nothing pretended absent" forbids. Stated as
    // its own assertion so the reason this file cares is not buried in a tuple.
    expect(forMember?.rollup?.terminalChildren).toBe(forOwner?.rollup?.terminalChildren);
    expect(forMember?.rollup?.restrictedCount).not.toBe(forOwner?.rollup?.restrictedCount);
  });

  it('a child proj_tickets has no row for is counted UNCATEGORIZED, never quietly as not-done (case 6.83)', async () => {
    const parent = newUlid();
    const doneChild = newUlid();
    const orphanChild = newUlid();
    await applyCommitted(db.pool, [
      created({ id: parent, actorId: world.owner }),
      created({ id: doneChild, actorId: world.owner, parentId: parent }),
      transitioned({ id: doneChild, actorId: world.owner, to: 'done' }),
    ]);

    const rows = await fetchTicketRows(db.pool, [parent]);
    const before = (await assembleTicketCards(db.pool, world.owner, rows))[0]?.rollup;
    expect(before).toEqual({
      totalChildren: 1,
      terminalChildren: 1,
      uncategorizedChildren: 0,
      restrictedCount: 0,
    });

    // The disagreement, written directly: a row proj_visibility knows about and
    // proj_tickets has never heard of. One ingest transaction writes both, so
    // the product cannot reach this — which is exactly why it must be COUNTED
    // rather than assumed away. Without `uncategorizedChildren` this child
    // would silently join the not-done side and the parent would read "1 of 2
    // done" on evidence for only one of them.
    await db.pool.query(
      `INSERT INTO proj_visibility
         (ticket_id, workspace_id, project_id, parent_id, own_mode, own_user_ids,
          resolved_mode, resolved_user_ids, resolved_from, seq)
       VALUES ($1, $2, $3, $4, 'inherit', '{}', 'workspace', '{}', '', 1)`,
      [orphanChild, world.workspaceId, world.projectId, parent],
    );

    const after = (await assembleTicketCards(db.pool, world.owner, rows))[0]?.rollup;
    expect(after).toEqual({
      totalChildren: 2,
      terminalChildren: 1,
      uncategorizedChildren: 1,
      restrictedCount: 0,
    });
  });

  /**
   * 7.78 — case 6.83 MEASURED rather than argued: `proj_visibility` and `proj_rollups` do not enumerate the same children, so the counts must come from ONE of them.
   */
  it('MEASURES case 6.83: proj_visibility and proj_rollups do not enumerate the same children, so the counts come from ONE of them', async () => {
    // Workspace B, with its own workflow and type, so a `ticket.created` there
    // is one proj_tickets accepts.
    const wsB = newUlid();
    const prjB = newUlid();
    const wfB = newUlid();
    const typeB = newUlid();
    const parent = newUlid();
    const childA = newUlid();
    const childB = newUlid();

    await applyCommitted(db.pool, [
      created({ id: parent, actorId: world.owner }),
      created({ id: childA, actorId: world.owner, parentId: parent }),
      makeCommitted({
        workspaceId: wsB,
        actorId: world.owner,
        entity: { kind: 'workspace', id: wsB },
        type: 'workspace.created',
        payload: { name: 'Neighbour' },
      }),
      makeCommitted({
        workspaceId: wsB,
        actorId: world.owner,
        entity: { kind: 'project', id: prjB },
        type: 'project.created',
        payload: { name: 'Neighbour work' },
      }),
      makeCommitted({
        workspaceId: wsB,
        actorId: world.owner,
        entity: { kind: 'workflow', id: wfB },
        type: 'workflow.defined',
        payload: {
          id: wfB,
          version: 1,
          name: 'Neighbour flow',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [{ from: '*', to: 'done', rules: [] }],
        },
      }),
      makeCommitted({
        workspaceId: wsB,
        actorId: world.owner,
        entity: { kind: 'ticket-type', id: typeB },
        type: 'ticket-type.defined',
        payload: { id: typeB, name: 'Task', icon: 'check', rank: 3, workflowId: wfB, fields: [] },
      }),
      // A ticket in workspace B naming a parent in workspace A. Nothing on this
      // branch refuses that (case 6.84, owner Plan 3).
      makeCommitted({
        workspaceId: wsB,
        actorId: world.owner,
        entity: { kind: 'ticket', id: childB },
        type: 'ticket.created',
        payload: { typeId: typeB, projectId: prjB, parentId: parent, title: 'Foreign child' },
      }),
    ]);

    const rows = await fetchTicketRows(db.pool, [parent]);
    const [card] = await assembleTicketCards(db.pool, world.owner, rows);

    // The card counts BOTH children: `rollupFor` reads proj_visibility with no
    // workspace clause, deliberately, because dropping a child would understate
    // a total this whole design exists to keep honest.
    expect(card?.rollup?.totalChildren).toBe(2);

    // proj_rollups counts ONE: `recomputeParent` and `getRollup` are both
    // `workspace_id = $1`-scoped. So the two enumerations genuinely differ, and
    // sourcing `totalChildren` from one table and `restrictedCount` from the
    // other could emit `restrictedCount > totalChildren`. Measured here rather
    // than argued from two SQL strings — which is what case 6.83 asked for.
    expect((await getRollup(db.pool, world.workspaceId, parent))?.totalChildren).toBe(1);
  });

  /**
   * 7.79 — the assembler refuses to invent: a row with no creating event and a row with no title claim both throw rather than emitting a blank.
   */
  it('refuses to invent: a row with no creating event and a row with no title claim both throw rather than emitting a blank', async () => {
    const [real] = await fetchTicketRows(db.pool, [world.epicId]);
    expect(real).toBeDefined();
    const row = real as ProjTicketRow;

    // The positive control FIRST: this exact row assembles, so the two
    // rejections below are about what was changed and not about the row.
    const [ok] = await assembleTicketCards(db.pool, world.member, [row]);
    expect(ok?.title).toBe('Registrations drive');

    await expect(
      assembleTicketCards(db.pool, world.member, [{ ...row, ticket_id: newUlid() }]),
    ).rejects.toThrow(/no provenance/);

    // An empty string here would be a title nobody typed, sitting exactly where
    // a real one goes — indistinguishable, on a board, from a title that is
    // genuinely blank (which the door refuses outright, ruling P15).
    await expect(
      assembleTicketCards(db.pool, world.member, [{ ...row, fields: {} }]),
    ).rejects.toThrow(/no title claim/);
  });
});
