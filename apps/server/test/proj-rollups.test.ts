import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { newUlid, type EntityKind, type LedgerEvent } from '@gisik-nokma/domain';
import { insertEvent, readLedger } from '../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { getRollup, rollupsProjection } from '../src/projections/rollups.js';
import { ticketTypesProjection } from '../src/projections/ticket-types.js';
import { getTicketStateFromDb, ticketsProjection } from '../src/projections/tickets.js';
import { workflowsProjection } from '../src/projections/workflows.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

// Fixed ULIDs, not newUlid(), because ORDER MATTERS twice over: canonical
// replay is (entity_kind, entity_id, seq), and the rollup rows are compared in
// `parent_ticket_id` order. Every one satisfies ULID_REGEX
// (`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`) — no I, L, O or U.
//
// Sorted: CHILD_A < CHILD_B < CHILD_C < GRANDCHILD < PARENT < SECOND_PARENT.
const WS = '01J9GWS0000000000000000000';
const FOREIGN_WS = '01J9GWSF000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const SECOND_PARENT = '01J9GSND000000000000000000';
const CHILD_A = '01J9GCHA000000000000000000';
const CHILD_B = '01J9GCHB000000000000000000';
const CHILD_C = '01J9GCHC000000000000000000';
const GRANDCHILD = '01J9GGRC000000000000000000';
const ACTOR = '01J9GACT000000000000000000';

// A workflow id is an entity ULID and the payload's `id` is the same value —
// `checkWorkflowDefined` refuses a `workflow.defined` whose two ids disagree
// (`packages/rule-engine/src/workflow-defined.ts`, pinned end to end by
// `packages/rule-engine/fixtures/workflow-defined-refuses-entity-id-mismatch.json`),
// so no ledger the door wrote can hold a mismatched pair. That identity is why
// nothing in this file can distinguish keying the refresh on `payload.id` from
// keying it on `event.entity.id`; `rollups.ts` says which it chose and why, and
// the mutation is reported as a KNOWN SURVIVOR with that reason rather than
// left to look like coverage.
const WF_BASIC = '01J9GWFA000000000000000000';
const WF_OTHER = '01J9GWFB000000000000000000';

const V1_STATES = [
  { id: 'todo', name: 'To do', category: 'open' },
  { id: 'doing', name: 'Doing', category: 'active' },
  { id: 'done', name: 'Done', category: 'terminal' },
];
const ALL_TRANSITIONS = [
  { from: '*', to: 'todo', rules: [] },
  { from: '*', to: 'doing', rules: [] },
  { from: '*', to: 'done', rules: [] },
];

type Draft = {
  workspaceId: string;
  entity: { kind: EntityKind; id: string };
  type: string;
  payload: unknown;
};

function workflowDefined(workspaceId: string, workflowId: string, payload: object): Draft {
  return {
    workspaceId,
    entity: { kind: 'workflow', id: workflowId },
    type: 'workflow.defined',
    payload: { id: workflowId, ...payload },
  };
}

const WF_BASIC_V1 = workflowDefined(WS, WF_BASIC, {
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: V1_STATES,
  transitions: ALL_TRANSITIONS,
});

/**
 * v2 keeps every state and moves Doing from `active` to `terminal`. Nobody
 * moves a ticket; the workflow changes what standing in Doing MEANS, which is
 * the only way this table's numbers move with no ticket event at all.
 */
const WF_BASIC_V2_RECATEGORISED = workflowDefined(WS, WF_BASIC, {
  version: 2,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'terminal' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: ALL_TRANSITIONS,
});

/** The destination a rebind moves a ticket to. Its state ids do not overlap WF_BASIC's. */
const WF_OTHER_V1 = workflowDefined(WS, WF_OTHER, {
  version: 1,
  name: 'Intake',
  initialStateId: 'intake',
  states: [
    { id: 'intake', name: 'Intake', category: 'open' },
    { id: 'closed', name: 'Closed', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'intake', rules: [] },
    { from: '*', to: 'closed', rules: [] },
  ],
});

/** A ticket type's entity id is a FRESH ULID; its stable key is the payload's `id`. */
function typeDefined(key: string, rank: number, workflowId: string): Draft {
  return {
    workspaceId: WS,
    entity: { kind: 'ticket-type', id: newUlid() },
    type: 'ticket-type.defined',
    payload: {
      id: key,
      name: key[0]!.toUpperCase() + key.slice(1),
      icon: 'check',
      rank,
      workflowId,
      fields: [],
    },
  };
}

function created(ticketId: string, typeId: string, parentId: string | null, title: string): Draft {
  return {
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId, projectId: PROJECT, parentId, title },
  };
}

function ticketEvent(ticketId: string, type: string, payload: object): Draft {
  return { workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type, payload };
}

const moved = (ticketId: string, to: string): Draft =>
  ticketEvent(ticketId, 'ticket.transitioned', { to });
const reparented = (ticketId: string, newParentId: string | null): Draft =>
  ticketEvent(ticketId, 'ticket.reparented', { newParentId });
const rebound = (ticketId: string, toWorkflowId: string, toStateId: string): Draft =>
  ticketEvent(ticketId, 'ticket.workflow_rebound', { toWorkflowId, toStateId });

/**
 * Stamps both counters the way ingest does — `workspaceSeq` is the workspace
 * stream cursor (coordination §18), `seq` restarts at 1 per ENTITY. Neither is
 * decoration: proj_tickets, which this table reads, resolves workflow
 * definitions AS OF `workspaceSeq`, and canonical replay sorts on the
 * per-entity `seq`.
 */
function asLedger(drafts: Draft[]): LedgerEvent[] {
  const perEntity = new Map<string, number>();
  return drafts.map((draft, index) => {
    const key = `${draft.entity.kind}:${draft.entity.id}`;
    const seq = (perEntity.get(key) ?? 0) + 1;
    perEntity.set(key, seq);
    return {
      id: newUlid(),
      workspaceId: draft.workspaceId,
      entity: draft.entity,
      type: draft.type,
      version: 1,
      payload: draft.payload,
      actorId: ACTOR,
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:01.000Z',
      seq,
      workspaceSeq: index + 1,
    } as LedgerEvent;
  });
}

/**
 * PARENT has three direct children; CHILD_A has one of its own. The GRANDCHILD
 * is the whole point of the shape: a suite that seeds one level cannot tell
 * "direct children" from "the subtree", and every count below would pass under
 * either reading.
 */
const SEED: Draft[] = [
  WF_BASIC_V1,
  typeDefined('story', 2, WF_BASIC),
  typeDefined('task', 3, WF_BASIC),
  created(PARENT, 'story', null, 'Quarterly filings'),
  created(SECOND_PARENT, 'story', null, 'Counter opening'),
  created(CHILD_A, 'task', PARENT, 'File GST'),
  created(CHILD_B, 'task', PARENT, 'File TDS'),
  created(CHILD_C, 'task', PARENT, 'File PT'),
  created(GRANDCHILD, 'task', CHILD_A, 'Collect challans'),
];

async function withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

/**
 * Applies events LIVE, in arrival order, through the four projections in
 * registration order (§8 positions 2, 3, 5 and 6). None of the first three is
 * scenery: proj_rollups counts `state_category` out of proj_tickets, which
 * resolves a ticket's type and its workflow definition from the two above it,
 * all inside the one transaction ingest uses.
 */
async function applyAll(events: LedgerEvent[]): Promise<void> {
  await withClient(async (client) => {
    for (const event of events) {
      await workflowsProjection.apply(event, client);
      await ticketTypesProjection.apply(event, client);
      await ticketsProjection.apply(event, client);
      await rollupsProjection.apply(event, client);
    }
  });
}

async function rollupRows(): Promise<Record<string, unknown>[]> {
  const { rows } = await db.pool.query('SELECT * FROM proj_rollups ORDER BY parent_ticket_id');
  return rows;
}

/** `[parent, total, open, active, terminal]` — the shape the literal expectations use. */
async function rollupTuples(): Promise<unknown[][]> {
  return (await rollupRows()).map((row) => [
    row['parent_ticket_id'],
    row['total_children'],
    row['open_children'],
    row['active_children'],
    row['terminal_children'],
  ]);
}

describe('proj_rollups', () => {
  beforeEach(async () => {
    await withClient(async (client) => {
      await rollupsProjection.reset(client);
      await ticketsProjection.reset(client);
      await ticketTypesProjection.reset(client);
      await workflowsProjection.reset(client);
    });
  });

  /**
   * ## DIRECT children, and the grandchild that says so
   *
   * PARENT has three children and one grandchild. A transitive rollup would
   * count four, and — once the grandchild is terminal and the children are not
   * — would report a different BREAKDOWN as well, so neither the total nor the
   * per-category numbers can be satisfied by the wrong reading.
   *
   * ## `open_children` is NOT the invariant's "open children"
   *
   * The parent-terminal invariant asks for the NON-TERMINAL children — `open`
   * plus `active` — which is `total - terminal`. The column is the `open`
   * category alone. This case is deliberately arranged so the two DISAGREE
   * (0 versus 1): a fixture where nothing is `active` cannot tell them apart,
   * and a reader who takes the column for the invariant's number would then
   * ship a parent that refuses closes it should allow.
   */
  it('counts DIRECT children per category — a grandchild belongs to the parent above it, never to this one', async () => {
    // ONE ledger applied in prefixes, never two overlapping ones: a second
    // `ticket.created` for a ticket that exists rebuilds it from scratch
    // (`applyTicketEvent`), silently discarding the transitions this case is
    // about.
    const ledger = asLedger([
      ...SEED,
      moved(GRANDCHILD, 'done'),
      moved(CHILD_A, 'doing'),
      moved(CHILD_B, 'done'),
    ]);
    await applyAll(ledger.slice(0, SEED.length + 1));

    expect(await getRollup(db.pool, WS, PARENT)).toEqual({
      parentTicketId: PARENT,
      workspaceId: WS,
      projectId: PROJECT,
      totalChildren: 3,
      openChildren: 3,
      activeChildren: 0,
      terminalChildren: 0,
    });
    // The grandchild EXISTS, is a descendant of PARENT, and is TERMINAL — so
    // the row above is "direct children only" and not "this projection found
    // nothing deeper because nothing deeper is there". A transitive count would
    // read 4 total with 1 terminal.
    expect(await getRollup(db.pool, WS, CHILD_A)).toMatchObject({
      totalChildren: 1,
      openChildren: 0,
      terminalChildren: 1,
    });

    await applyAll(ledger.slice(SEED.length + 1));

    const rollup = await getRollup(db.pool, WS, PARENT);
    expect(rollup).toMatchObject({
      totalChildren: 3,
      openChildren: 1,
      activeChildren: 1,
      terminalChildren: 1,
    });
    // The two numbers that are easy to confuse, asserted off the SAME row at
    // the one arrangement where they differ. `open_children` is 1; the
    // invariant's "open children" is 2.
    expect(rollup?.openChildren).toBe(1);
    expect((rollup?.totalChildren ?? 0) - (rollup?.terminalChildren ?? 0)).toBe(2);
  });

  /**
   * Absence, not zeros. `{0,0,0,0}` would assert that a parent with no children
   * exists, which nothing derived — and the table's own CHECK
   * (`total_children > 0`) refuses to store it, so this is enforced twice.
   */
  it('a childless ticket has NO row — absence, not zeros, because nothing is invented', async () => {
    await applyAll(asLedger(SEED));

    expect(await getRollup(db.pool, WS, GRANDCHILD)).toBeNull();
    // The positive control: this reader demonstrably finds a row when there is
    // one, so the null above is the missing row and not a reader that always
    // says null.
    expect(await getRollup(db.pool, WS, PARENT)).not.toBeNull();
    // ...and it is genuinely absent from the TABLE, not merely filtered out by
    // `getRollup`'s workspace predicate.
    const { rows } = await db.pool.query('SELECT parent_ticket_id FROM proj_rollups');
    expect(rows.map((row) => row.parent_ticket_id).sort()).toEqual([CHILD_A, PARENT].sort());
    // And the workspace predicate DOES bite, which is what makes the reader's
    // null above meaningful rather than accidental: the same id under another
    // tenancy is not found, though the row exists.
    expect(await getRollup(db.pool, FOREIGN_WS, PARENT)).toBeNull();
  });

  /**
   * A reparent is the one event with TWO affected parents, and the old one is
   * already overwritten in proj_tickets by the time this projection looks —
   * hence the project-wide recompute. The last move is a DETACH to project
   * root (`newParentId` is nullable), which no plan text exercises: the ticket
   * becomes a child of nobody, and nobody is not a key.
   */
  it('a reparent moves the counts between parents, empties the row it left, and detaching to root keys nothing on null', async () => {
    const ledger = asLedger([
      ...SEED,
      reparented(CHILD_B, SECOND_PARENT),
      reparented(CHILD_C, SECOND_PARENT),
      // The third one empties PARENT: it is the LAST of its three children.
      reparented(CHILD_A, SECOND_PARENT),
      reparented(CHILD_A, null),
    ]);

    await applyAll(ledger.slice(0, SEED.length + 1));
    expect(await getRollup(db.pool, WS, PARENT)).toMatchObject({ totalChildren: 2 });
    expect(await getRollup(db.pool, WS, SECOND_PARENT)).toMatchObject({ totalChildren: 1 });

    await applyAll(ledger.slice(SEED.length + 1, SEED.length + 3));
    // PARENT's last child left, so its row is GONE rather than zeroed — the
    // emptied-parent DELETE, which no per-parent recompute would have reached
    // because `recomputeParent` only ever visits parents that still have
    // children.
    expect(await getRollup(db.pool, WS, PARENT)).toBeNull();
    expect(await getRollup(db.pool, WS, SECOND_PARENT)).toMatchObject({ totalChildren: 3 });
    // CHILD_A moved; the GRANDCHILD went with it, so CHILD_A is still a parent.
    expect(await getRollup(db.pool, WS, CHILD_A)).toMatchObject({ totalChildren: 1 });

    await applyAll(ledger.slice(SEED.length + 3));
    // CHILD_A is now at project root: SECOND_PARENT loses it, PARENT is still
    // gone, and nothing is keyed on "no parent".
    expect(await getRollup(db.pool, WS, SECOND_PARENT)).toMatchObject({ totalChildren: 2 });
    expect(await getRollup(db.pool, WS, PARENT)).toBeNull();
    // Exactly two parents are left, and neither of them is "root": a detach
    // writes no row keyed on nothing.
    expect(await rollupTuples()).toEqual([
      [CHILD_A, 1, 1, 0, 0],
      [SECOND_PARENT, 2, 2, 0, 0],
    ]);
  });

  /**
   * Refresh on publish (owner decision 2026-08-26, design decision 10), and the
   * only way these numbers move with nobody touching a ticket. Every count here
   * is a FILTER on `state_category`; v2 says Doing is finished work, so a
   * refresh that stopped at proj_tickets would leave the parent's progress
   * stating a distribution that no longer exists — and would keep the
   * parent-terminal invariant refusing a close the new version has just made
   * legitimate.
   */
  it('a re-categorising v2 moves the parent counts in the SAME transaction as the ticket fold, with nobody moving a ticket', async () => {
    const ledger = asLedger([...SEED, moved(CHILD_A, 'doing'), WF_BASIC_V2_RECATEGORISED]);

    await applyAll(ledger.slice(0, SEED.length + 1));
    const before = await getRollup(db.pool, WS, PARENT);
    expect(before).toMatchObject({
      totalChildren: 3,
      openChildren: 2,
      activeChildren: 1,
      terminalChildren: 0,
    });
    // The number the invariant reads, before: three children, none finished.
    expect((before?.totalChildren ?? 0) - (before?.terminalChildren ?? 0)).toBe(3);

    await applyAll(ledger.slice(SEED.length + 1));

    const after = await getRollup(db.pool, WS, PARENT);
    expect(after).toMatchObject({
      totalChildren: 3,
      openChildren: 2,
      activeChildren: 0,
      terminalChildren: 1,
    });
    // ...and after. This is the number that decides whether closing PARENT is
    // refused, and it moved without a single ticket event.
    expect((after?.totalChildren ?? 0) - (after?.terminalChildren ?? 0)).toBe(2);
    // Nobody moved CHILD_A. It is standing exactly where it stood; the workflow
    // changed what standing there means.
    expect(await getTicketStateFromDb(db.pool, WS, CHILD_A)).toMatchObject({
      stateId: 'doing',
      stateCategory: 'terminal',
      workflowVersion: 2,
    });
    // A parent whose children are on no workflow at all is untouched, which is
    // right: SECOND_PARENT has no children, so it has no row to refresh.
    expect(await getRollup(db.pool, WS, SECOND_PARENT)).toBeNull();
  });

  /**
   * ## THE TRIGGER THE PLAN'S OWN TASK 11 LISTING OMITS
   *
   * `ticket.workflow_rebound` moves a ticket onto another workflow's state, so
   * its `state_category` changes with no transition and no reparent
   * (`applyTicketEvent`, `packages/domain/src/ticket-state.ts`). A trigger set
   * without it leaves the parent's counts at their pre-rebind values on the
   * LIVE path while a rebuild — which reads the ticket table at its final state
   * — produces the post-rebind ones. That is live-versus-rebuild divergence,
   * the class that has bitten three projections in this series, and it is why
   * the trigger set in `rollups.ts` is enumerated against the events that can
   * move `parent_id` / `state_category` / `project_id` rather than against the
   * events the plan happened to list.
   *
   * The rebind case in the rebuild-and-diff below is the second killer for the
   * same omission; this one is the direct statement of it.
   */
  it('a child rebound onto another workflow moves the counts of the parent above it, though nothing transitioned and nothing reparented', async () => {
    const ledger = asLedger([...SEED, WF_OTHER_V1, rebound(CHILD_A, WF_OTHER, 'closed')]);

    await applyAll(ledger.slice(0, SEED.length + 1));
    expect(await getRollup(db.pool, WS, PARENT)).toMatchObject({
      totalChildren: 3,
      openChildren: 3,
      terminalChildren: 0,
    });

    await applyAll(ledger.slice(SEED.length + 1));

    // CHILD_A now stands in another workflow's terminal state.
    expect(await getTicketStateFromDb(db.pool, WS, CHILD_A)).toMatchObject({
      workflowId: WF_OTHER,
      stateId: 'closed',
      stateCategory: 'terminal',
    });
    expect(await getRollup(db.pool, WS, PARENT)).toMatchObject({
      totalChildren: 3,
      openChildren: 2,
      activeChildren: 0,
      terminalChildren: 1,
    });
    // CHILD_A's own rollup is about ITS children and did not move — the rebind
    // changed the ticket, not the grandchild under it.
    expect(await getRollup(db.pool, WS, CHILD_A)).toMatchObject({
      totalChildren: 1,
      openChildren: 1,
      terminalChildren: 0,
    });
  });

  /**
   * ## Never authored: the numbers are always a function of proj_tickets, and a
   * ## STALE row breaks that as badly as an invented one
   *
   * No event carries these counts. This case says so two ways rather than
   * describing it:
   *
   *   - every stored row is compared, whole, against an INDEPENDENT recount
   *     written here — a GROUP BY over proj_tickets that shares no code with
   *     the projection's own upsert. A row that drifted, an extra row, and a
   *     missing row all fail it.
   *   - a `ticket.field_set` whose payload literally spells rollup numbers puts
   *     none of them anywhere. That control is weak on its own — nothing reads
   *     payloads here — and it is the point: it is the assertion that stays red
   *     if a later change ever starts.
   */
  it('every row equals an independent recount of proj_tickets, and a payload that spells rollup numbers puts none of them here', async () => {
    // One ledger, applied in two prefixes: the field claim is the LAST event,
    // so the comparison below has already been made against a table this
    // projection derived, and the claim is measured against that.
    const ledger = asLedger([
      ...SEED,
      WF_OTHER_V1,
      moved(CHILD_A, 'doing'),
      moved(CHILD_B, 'done'),
      moved(GRANDCHILD, 'done'),
      rebound(CHILD_C, WF_OTHER, 'closed'),
      reparented(CHILD_B, SECOND_PARENT),
      WF_BASIC_V2_RECATEGORISED,
      ticketEvent(CHILD_A, 'ticket.field_set', {
        fieldId: 'totalChildren',
        value: { total_children: 99, open_children: 99, terminal_children: 99 },
      }),
    ]);
    await applyAll(ledger.slice(0, ledger.length - 1));

    const recount = await db.pool.query(
      `SELECT parent_id AS parent_ticket_id, workspace_id, min(project_id) AS project_id,
              count(*)::int AS total_children,
              count(*) FILTER (WHERE state_category = 'open')::int AS open_children,
              count(*) FILTER (WHERE state_category = 'active')::int AS active_children,
              count(*) FILTER (WHERE state_category = 'terminal')::int AS terminal_children
         FROM proj_tickets
        WHERE parent_id IS NOT NULL
        GROUP BY parent_id, workspace_id
        ORDER BY parent_id`,
    );
    const stored = await rollupRows();
    // The seed is real before the comparison is believed: an empty table equals
    // an empty recount, and this series has iterated an empty one twice.
    expect(stored.length).toBeGreaterThan(0);
    expect(stored).toEqual(recount.rows);

    // Exactly one registered projection may write this table. The order pin
    // asserts the whole `[name, tables]` array; this names the property on its
    // own, in the file that is about it.
    const writers = buildProjectionRegistry()
      .all()
      .filter((projection) => projection.tables.includes('proj_rollups'));
    expect(writers.map((projection) => projection.name)).toEqual(['proj_rollups']);

    // A claim spelling this table's own column names, filed as a field on a
    // ticket. Nothing here reads a payload for a number, so the table does not
    // move AT ALL — asserted whole rather than by checking for the number 99,
    // which a partially-written row could dodge.
    await applyAll(ledger.slice(ledger.length - 1));
    expect(await rollupRows()).toEqual(stored);
  });

  /**
   * ## The rebuild-and-diff, and why it needs the literal rows beside it
   *
   * A PROJECTION-OUTER rebuild: reset proj_rollups alone and replay the whole
   * ledger through it, with proj_tickets left standing at its final state —
   * what `rebuildProjection` does and what `tools/verify-projections.ts` does
   * (there against the shadow copy of proj_tickets, complete because
   * registration order replays it first).
   *
   * That makes the diff a sharp instrument for a MISSING TRIGGER: live carries
   * whatever the last trigger wrote, the rebuild always reads the final ticket
   * table, so a parent nobody recomputed after its last child moved shows up as
   * drift. The ledger below is ordered so the REBIND is the last event
   * affecting PARENT — with the rebound trigger removed, live keeps
   * `{3,1,0,2}`'s predecessor and the rebuild does not, and this goes red.
   *
   * What the diff CANNOT see is a parent that neither path ever triggers: no
   * row on either side, and the comparison is green over an agreement about
   * nothing. So the literal rows are asserted beside it — the answer has to be
   * the honest one, not merely a stable one.
   *
   * The two replay orders are asserted to DIFFER, observed out of `readLedger`
   * rather than assumed from what this file believes canonical order to be, and
   * to be the SAME events, so the inequality cannot be satisfied by a filter
   * that dropped one.
   *
   * THE ONLY CASE IN THIS FILE THAT WRITES TO `events`. `readLedger` has no
   * workspace filter and `events` is append-only, so rows left by any other
   * case would replay through this projection after `beforeEach` truncated the
   * proj_tickets rows it counts. The length assertion is what says so out loud
   * if that ever changes.
   */
  it('projection-outer rebuild reproduces the rollups exactly — republish, rebind and reparent included', async () => {
    const drafts = [
      ...SEED,
      WF_OTHER_V1,
      moved(CHILD_A, 'doing'),
      moved(GRANDCHILD, 'done'),
      // The grandchild leaves CHILD_A childless — the emptied-parent DELETE,
      // reached inside a replay rather than in isolation.
      reparented(GRANDCHILD, SECOND_PARENT),
      // Doing becomes terminal: CHILD_A's category moves with no ticket event.
      WF_BASIC_V2_RECATEGORISED,
      // ...and the LAST event to touch PARENT is a rebind, so the trigger the
      // plan omits is the only thing that keeps live and rebuild agreeing here.
      rebound(CHILD_B, WF_OTHER, 'closed'),
    ];
    const ledger = asLedger(drafts);

    await withClient(async (client) => {
      for (const event of ledger) {
        await insertEvent(client, event);
        await workflowsProjection.apply(event, client);
        await ticketTypesProjection.apply(event, client);
        await ticketsProjection.apply(event, client);
        await rollupsProjection.apply(event, client);
      }
    });
    const live = await rollupRows();
    expect(live.length).toBeGreaterThan(0);

    const replayed = await readLedger(db.pool);
    expect(replayed).toHaveLength(ledger.length);
    const key = (event: LedgerEvent) => `${event.entity.kind}:${event.entity.id}:${event.seq}`;
    const canonical = replayed.map(key);
    const arrival = ledger.map(key);
    // Canonical sorts every `ticket` event ahead of every `ticket-type` and
    // `workflow` event, so the two publishes this ledger depends on arrive LAST
    // — as unlike arrival order as it gets. Observed, not assumed.
    expect(canonical).not.toEqual(arrival);
    // ...and they are the same events in a different order.
    expect([...canonical].sort()).toEqual([...arrival].sort());

    await rebuildProjection('proj_rollups', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
    expect(await rollupRows()).toEqual(live);

    // The honest answer, named. PARENT keeps CHILD_A (Doing, terminal under v2)
    // and CHILD_B (rebound to Closed, terminal) and CHILD_C (still To do,
    // open); SECOND_PARENT has the grandchild that moved to it; CHILD_A has no
    // row at all, because its only child left.
    expect(await rollupTuples()).toEqual([
      [PARENT, 3, 1, 0, 2],
      [SECOND_PARENT, 1, 0, 0, 1],
    ]);
  });
});
