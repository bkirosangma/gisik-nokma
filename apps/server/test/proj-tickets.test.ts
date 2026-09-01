import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { newUlid, type EntityKind, type LedgerEvent, type TicketState } from '@gisik-nokma/domain';
import { evaluateEvent, type EngineContext } from '@gisik-nokma/rule-engine';
import { insertEvent, readLedger } from '../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { getTicketTypeFromDb, ticketTypesProjection } from '../src/projections/ticket-types.js';
import {
  getChildrenStatesFromDb,
  getTicketStateFromDb,
  rowToTicketState,
  ticketsProjection,
} from '../src/projections/tickets.js';
import { getWorkflowDefFromProjection, workflowsProjection } from '../src/projections/workflows.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

// Fixed ULIDs rather than newUlid(), because THE ORDER MATTERS: canonical
// replay is (entity_kind, entity_id, seq), so the rebuild case below depends on
// knowing that CHILD sorts before GRANDCHILD sorts before PARENT. Every one
// satisfies ULID_REGEX (`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`) — no I, L, O or U.
const WS = '01J9GWS0000000000000000000';
const FOREIGN_WS = '01J9GWSF000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PROJECT_B = '01J9GPRK000000000000000000';
const FOREIGN_PROJECT = '01J9GPRM000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const CHILD = '01J9GCHA000000000000000000';
const GRANDCHILD = '01J9GCHB000000000000000000';
const SIBLING_PARENT = '01J9GSBP000000000000000000';
const FOREIGN_PARENT = '01J9GFPA000000000000000000';
const NEWBORN = '01J9GNEW000000000000000000';
// A ticket id nothing ever creates. The door cases below apply events AGAINST
// it, so it must never appear in proj_tickets.
const GHOST = '01J9GGHO000000000000000000';
const ACTOR = '01J9GACT000000000000000000';

// Workflow ids are ENTITY ULIDs, and the payload's `id` is the same value — the
// shape `submittedWorkflowDefined` uses and the one the engine requires. That
// identity is not decoration here: proj_workflows keys `workflow_id` on the
// PAYLOAD's id, so a fixture that spelled the two differently would let this
// projection's refresh path key on the wrong one and still pass.
const WF_BASIC = '01J9GWFA000000000000000000';
const WF_OTHER = '01J9GWFB000000000000000000';
const FOREIGN_WF = '01J9GWFC000000000000000000';

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

/** v2 keeps every state but moves Doing from active to terminal. */
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

/** v2 drops Doing altogether and maps everyone standing in it back to To do. */
const WF_BASIC_V2_DROPS_DOING = workflowDefined(WS, WF_BASIC, {
  version: 2,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
  stateMapping: { doing: 'todo' },
});

/**
 * v3 drops To do in turn and maps everyone standing in it to Triage — the
 * SECOND link of a version chain, so a ticket still sitting at v1 has to be
 * walked doing → todo → triage rather than mapped once.
 */
const WF_BASIC_V3_DROPS_TODO = workflowDefined(WS, WF_BASIC, {
  version: 3,
  name: 'Basic',
  initialStateId: 'triage',
  states: [
    { id: 'triage', name: 'Triage', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'triage', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
  stateMapping: { todo: 'triage' },
});

/**
 * A second, unrelated workflow — the destination a migration moves a ticket to.
 * Its state ids deliberately do NOT overlap WF_BASIC's: two unrelated graphs
 * that happen to spell a state the same way is the trap the transition log's
 * per-entry workflowId exists to catch.
 */
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

/**
 * A ticket type's entity id is a FRESH ULID and its stable key is the payload's
 * `id` — `foundingSequence`'s shape, and the only one the envelope schema
 * permits (a non-membership entity id must be a ULID, and `story` never will
 * be). `proj_ticket_types` folds on the payload key.
 */
function typeDefined(workspaceId: string, key: string, rank: number, workflowId: string): Draft {
  return {
    workspaceId,
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

function created(
  workspaceId: string,
  ticketId: string,
  typeId: string,
  parentId: string | null,
  title: string,
  projectId: string = PROJECT,
): Draft {
  return {
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId, projectId, parentId, title },
  };
}

function ticketEvent(ticketId: string, type: string, payload: object, workspaceId = WS): Draft {
  return { workspaceId, entity: { kind: 'ticket', id: ticketId }, type, payload };
}

/**
 * Stamps both counters the way ingest does. `workspaceSeq` is the workspace
 * stream cursor (coordination §18) and `seq` restarts at 1 per ENTITY.
 *
 * Neither is decoration. This projection resolves workflow definitions AS OF
 * `workspaceSeq`, so a fixture that left it off would not be testing the
 * projection the server runs; and canonical replay order sorts by the
 * per-entity `seq`, so leaving that off would make the replay order depend on
 * sort stability rather than on the ledger.
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

const SEED: Draft[] = [
  WF_BASIC_V1,
  typeDefined(WS, 'story', 2, WF_BASIC),
  typeDefined(WS, 'task', 3, WF_BASIC),
  created(WS, PARENT, 'story', null, 'Quarterly filings'),
  created(WS, CHILD, 'task', PARENT, 'File GST'),
  created(WS, GRANDCHILD, 'task', CHILD, 'Collect challans'),
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
 * Applies events LIVE, in arrival order, through the three projections this
 * table depends on, in their registration order (§8 positions 2, 3 and 5).
 * proj_workflows and proj_ticket_types are not scenery: proj_tickets resolves a
 * ticket's type and the workflow definition in force from them, inside the same
 * transaction, exactly as ingest does.
 */
async function applyAll(events: LedgerEvent[]): Promise<void> {
  await withClient(async (client) => {
    for (const event of events) {
      await workflowsProjection.apply(event, client);
      await ticketTypesProjection.apply(event, client);
      await ticketsProjection.apply(event, client);
    }
  });
}

async function ticketRows(): Promise<Record<string, unknown>[]> {
  const { rows } = await db.pool.query('SELECT * FROM proj_tickets ORDER BY ticket_id');
  return rows;
}

/**
 * SEED plus the two parents the outage case needs beside it: one in the SAME
 * workspace but another project, and one in ANOTHER workspace entirely.
 *
 * The foreign workspace gets its OWN workflow id rather than reusing WF_BASIC.
 * proj_workflows' primary key is (workflow_id, version) with no workspace
 * column, so a second workspace publishing the same id would be swallowed by
 * `ON CONFLICT DO NOTHING` and this fixture would be testing a workflow that is
 * not there.
 */
function outageFixture(): Draft[] {
  return [
    ...SEED,
    created(WS, SIBLING_PARENT, 'story', null, 'Other project epic', PROJECT_B),
    workflowDefined(FOREIGN_WS, FOREIGN_WF, {
      version: 1,
      name: 'Basic',
      initialStateId: 'todo',
      states: V1_STATES,
      transitions: ALL_TRANSITIONS,
    }),
    typeDefined(FOREIGN_WS, 'story', 2, FOREIGN_WF),
    created(FOREIGN_WS, FOREIGN_PARENT, 'story', null, 'Foreign epic', FOREIGN_PROJECT),
  ];
}

describe('proj_tickets', () => {
  beforeEach(async () => {
    await withClient(async (client) => {
      await ticketsProjection.reset(client);
      await ticketTypesProjection.reset(client);
      await workflowsProjection.reset(client);
    });
  });

  it('creation lands in the workflow initial state with the title as an attributed claim', async () => {
    await applyAll(asLedger(SEED));

    const state = await getTicketStateFromDb(db.pool, WS, PARENT);
    expect(state).toMatchObject({
      kind: 'ticket',
      id: PARENT,
      workspaceId: WS,
      projectId: PROJECT,
      typeId: 'story',
      parentId: null,
      workflowId: WF_BASIC,
      workflowVersion: 1,
      stateId: 'todo',
      stateCategory: 'open',
      assigneeId: null,
      collaboratorIds: [],
      transitions: [],
    });
    // The title is a CLAIM from the first moment — who said it, and both clocks
    // — not a bare string the row happens to carry.
    expect(state?.fields['title']).toEqual({
      value: 'Quarterly filings',
      actorId: ACTOR,
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:01.000Z',
    });
  });

  it('transition, assignment, collaborators and field claims update head state with provenance', async () => {
    await applyAll(
      asLedger([
        ...SEED,
        ticketEvent(CHILD, 'ticket.transitioned', { to: 'done' }),
        ticketEvent(CHILD, 'ticket.assigned', { assigneeId: 'user-anselma' }),
        ticketEvent(CHILD, 'ticket.collaborator_added', { userId: 'user-kiro' }),
        ticketEvent(CHILD, 'ticket.field_set', {
          fieldId: 'dueDate',
          value: { date: '2026-08-30', note: 'GST' },
        }),
      ]),
    );

    const state = await getTicketStateFromDb(db.pool, WS, CHILD);
    expect(state).toMatchObject({
      stateId: 'done',
      stateCategory: 'terminal',
      assigneeId: 'user-anselma',
      collaboratorIds: ['user-kiro'],
    });
    expect(state?.fields['dueDate']).toEqual({
      value: { date: '2026-08-30', note: 'GST' },
      actorId: ACTOR,
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:01.000Z',
    });
    // The transition log entry names the vocabulary its toStateId is written in
    // — five fields, not four: `workflowId` joined `workflowVersion` when
    // require-different-user learned to skip entries from another workflow.
    expect(state?.transitions).toEqual([
      { toStateId: 'done', actorId: ACTOR, seq: 2, workflowId: WF_BASIC, workflowVersion: 1 },
    ]);
  });

  it('getChildrenStates returns DIRECT children only', async () => {
    await applyAll(asLedger(SEED));

    const children = await getChildrenStatesFromDb(db.pool, WS, PARENT);
    expect(children.map((child) => child.id)).toEqual([CHILD]);
    // The grandchild EXISTS and is a descendant — so the answer above is
    // "direct children only" and not "this reader found nothing deeper because
    // nothing deeper is there".
    expect((await getChildrenStatesFromDb(db.pool, WS, CHILD)).map((c) => c.id)).toEqual([
      GRANDCHILD,
    ]);
    expect(await getChildrenStatesFromDb(db.pool, WS, GRANDCHILD)).toEqual([]);
  });

  /**
   * ## THE TOTAL-OUTAGE TRAP
   *
   * `rowToTicketState` must repopulate two `TicketState` fields that no column
   * hands back: `workspaceId` (there IS a column, but it is not in the primary
   * key, so a mapper can silently skip it) and `kind: 'ticket'` (no column
   * carries it, and none should).
   *
   * Drop `workspaceId` and `checkTicketCreated`'s parent guard —
   * `parent.workspaceId !== env.workspaceId`, controller ruling P12 — is
   * `undefined !== WS`, which is ALWAYS TRUE: every parented `ticket.created`
   * in the product is refused `hierarchy.unknown-parent`, a sentence about
   * tenancy said about two tickets in the same workspace. Drop `kind` and
   * `getTicketState` (`checks/context-helpers.ts`) NARROWS on
   * `state.kind === 'ticket'`, answers null, and lands at the same refusal by a
   * different road. Either way it presents as a data problem and it is a
   * mapping bug.
   *
   * The refusal that would fire is a refusal this product genuinely needs, so
   * the accept alone would be mistakable for a guard that never ran. Three
   * evaluations of the SAME shape against the SAME context separate them:
   *
   *   same workspace, same project  → ACCEPT       (the mapping is whole)
   *   same workspace, other project → cross-project (execution ran PAST the
   *                                                  workspace guard, and
   *                                                  `projectId` survived too)
   *   another workspace             → unknown-parent (the guard fires when it
   *                                                   should — the control)
   */
  it('rowToTicketState repopulates the two TicketState fields no column carries', async () => {
    await applyAll(asLedger(SEED));

    const parent = await getTicketStateFromDb(db.pool, WS, PARENT);
    // `kind` has no column at all; `workspaceId` has one that is not in the
    // primary key. Asserted here on their own so that the case below, which is
    // what they are FOR, fails at ITS OWN assertion rather than behind these.
    expect(parent?.kind).toBe('ticket');
    expect(parent?.workspaceId).toBe(WS);
  });

  it('a parented creation in one workspace is not refused as cross-workspace', async () => {
    await applyAll(asLedger(outageFixture()));

    const underSameProject = asLedger([created(WS, NEWBORN, 'task', PARENT, 'File TDS')])[0]!;
    const underOtherProject = asLedger([
      created(WS, NEWBORN, 'task', SIBLING_PARENT, 'File TDS'),
    ])[0]!;
    const underForeignParent = asLedger([
      created(WS, NEWBORN, 'task', FOREIGN_PARENT, 'File TDS'),
    ])[0]!;

    await withClient(async (client) => {
      const ctx = testLocalContext(client, WS);

      // If `workspaceId` or `kind` is dropped from rowToTicketState, THIS is
      // the assertion that goes red — with `hierarchy.unknown-parent`, on two
      // tickets that share a workspace.
      expect(await evaluateEvent(underSameProject, ctx)).toEqual({ refused: false });

      // Execution reached the guard AFTER the workspace one, so the accept
      // above is not a guard that never ran — and `projectId` came out of the
      // row too.
      expect(await evaluateEvent(underOtherProject, ctx)).toMatchObject({
        refused: true,
        rule: 'hierarchy.cross-project',
      });

      // The control: the tenancy guard DOES fire when the parent really is
      // another workspace's, which is what makes the accept above meaningful.
      expect(await evaluateEvent(underForeignParent, ctx)).toMatchObject({
        refused: true,
        rule: 'hierarchy.unknown-parent',
      });
    });
  });

  /**
   * ## THE REFUSAL REGISTERING THIS TABLE MADE REACHABLE, and why the skip is
   * BY NAME
   *
   * `evaluateEvent` has no case for `ticket.assigned`, either collaborator
   * event, `comment.added` or `attachment.added`, so all five fall through to
   * `{ refused: false }` with **no existence check** and the server commits
   * them against a ticket that was never created —
   * `test/permissions/check-role-permission.test.ts` ingests two such
   * `ticket.assigned` events today and both are COMMITTED. The reducer throws
   * on any non-`ticket.created` event for a ticket it has not seen, and is
   * right to; but with this projection registered that throw happens inside the
   * ingest transaction, which turns a submission the product accepts into a 500
   * and leaves the table unrebuildable from a ledger the product itself wrote.
   *
   * So the skip is by NAME, against what the door actually covers — and that is
   * a claim about the SET, not about the symptom. This case constrains the set
   * in both directions, which is what makes it a fact rather than a
   * description:
   *
   *   the five the door leaves open → SKIPPED, and skipped means no row written
   *   the four the door guards      → the reducer's throw survives
   *   any of the five on a ticket that EXISTS → still folded (the control that
   *                                            says the skip is the missing
   *                                            ticket, not the projection
   *                                            ignoring assignments)
   *
   * Measured: replacing the set with the shorter-reading
   * `event.type !== 'ticket.created'` — which covers the same types today, and
   * which the whole server suite tolerated before this case existed — turns the
   * four guarded assertions red. Removing the skip entirely reddens
   * `check-role-permission.test.ts` instead. Neither mutation is visible
   * without both halves.
   */
  it('an event the door leaves unguarded is skipped for a ticket that never existed, while a door-guarded one still throws', async () => {
    await applyAll(asLedger(SEED));
    // One ledger, numbered past SEED, so every event below carries a
    // workspaceSeq at which the definitions this projection resolves are in
    // force. A bare `asLedger([draft])` would restart at 1 and resolve nothing.
    const after = (draft: Draft): LedgerEvent => asLedger([...SEED, draft]).at(-1)!;

    // The door leaves these five with no existence check at all.
    const unguarded: Draft[] = [
      ticketEvent(GHOST, 'ticket.assigned', { assigneeId: 'user-anselma' }),
      ticketEvent(GHOST, 'ticket.collaborator_added', { userId: 'user-kiro' }),
      ticketEvent(GHOST, 'ticket.collaborator_removed', { userId: 'user-kiro' }),
      ticketEvent(GHOST, 'comment.added', { body: { text: 'nothing to say' } }),
      ticketEvent(GHOST, 'attachment.added', {
        kind: 'upload',
        attachmentId: newUlid(),
        filename: 'challan.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12,
        sha256: 'a'.repeat(64),
      }),
    ];
    // ...and refuses each of these with `ticket.unknown` before it can reach a
    // ledger, which is exactly why the reducer's throw stays for them.
    const guarded: Draft[] = [
      ticketEvent(GHOST, 'ticket.transitioned', { to: 'done' }),
      ticketEvent(GHOST, 'ticket.reparented', { newParentId: PARENT }),
      ticketEvent(GHOST, 'ticket.field_set', { fieldId: 'dueDate', value: { date: '2026-09-30' } }),
      ticketEvent(GHOST, 'ticket.workflow_rebound', {
        toWorkflowId: WF_BASIC,
        toStateId: 'todo',
      }),
    ];

    await withClient(async (client) => {
      for (const draft of unguarded) {
        await ticketsProjection.apply(after(draft), client);
        // "Did not throw" is not "wrote nothing" — a skip that inserted a
        // half-built row would satisfy the first and be the outage.
        expect(await getTicketStateFromDb(client, WS, GHOST)).toBeNull();
      }

      for (const draft of guarded) {
        await expect(ticketsProjection.apply(after(draft), client)).rejects.toThrow(
          `applyTicketEvent: ${draft.type} for ticket ${GHOST} that was never created`,
        );
      }

      // The control. Every one of the five is still FOLDED against a ticket
      // that exists, so the skip above is the missing ticket and not this
      // projection quietly ignoring assignments and collaborators.
      await ticketsProjection.apply(
        after(ticketEvent(CHILD, 'ticket.assigned', { assigneeId: 'user-anselma' })),
        client,
      );
      await ticketsProjection.apply(
        after(ticketEvent(CHILD, 'ticket.collaborator_added', { userId: 'user-kiro' })),
        client,
      );
      expect(await getTicketStateFromDb(client, WS, CHILD)).toMatchObject({
        assigneeId: 'user-anselma',
        collaboratorIds: ['user-kiro'],
      });
      await ticketsProjection.apply(
        after(ticketEvent(CHILD, 'ticket.collaborator_removed', { userId: 'user-kiro' })),
        client,
      );
      expect((await getTicketStateFromDb(client, WS, CHILD))?.collaboratorIds).toEqual([]);
      // `comment.added` and `attachment.added` return the state UNCHANGED, so
      // "folded" for them means the row is still there and still says what it
      // said — asserted rather than skipped, because the branch that returns
      // before the row is read has to be identical for a ticket that exists.
      await ticketsProjection.apply(
        after(ticketEvent(CHILD, 'comment.added', { body: { text: 'filed' } })),
        client,
      );
      expect(await getTicketStateFromDb(client, WS, CHILD)).toMatchObject({
        assigneeId: 'user-anselma',
        stateId: 'todo',
      });
    });
  });

  // A ticket pins the workflow it was created under — owner decision 2026-08-26.

  it('re-pointing a type at a different workflow leaves existing tickets on the old one, while new tickets of that type get the new one', async () => {
    // ONE ledger, not two: asLedger numbers workspaceSeq from 1 each call, and
    // this projection resolves definitions AS OF that number.
    await applyAll(
      asLedger([
        ...SEED,
        WF_OTHER_V1,
        typeDefined(WS, 'task', 3, WF_OTHER),
        // Created AFTER the re-point, on the same ledger, so the only thing
        // that differs between it and CHILD is where in the stream it sits.
        created(WS, NEWBORN, 'task', null, 'File TDS'),
      ]),
    );

    const state = await getTicketStateFromDb(db.pool, WS, CHILD);
    expect(state).toMatchObject({ workflowId: WF_BASIC, stateId: 'todo', workflowVersion: 1 });
    // The other half of the owner's decision, and it was previously asserted by
    // nothing: a re-binding changes what NEW tickets get. Without this, the case
    // passed equally well against a projection that ignored the binding
    // entirely, which is the opposite defect from the one above.
    expect(await getTicketStateFromDb(db.pool, WS, NEWBORN)).toMatchObject({
      workflowId: WF_OTHER,
      workflowVersion: 1,
      stateId: 'intake',
      stateCategory: 'open',
    });
    // And the type really did move, or this passes for the wrong reason.
    expect((await getTicketTypeFromDb(db.pool, WS, 'task'))?.workflowId).toBe(WF_OTHER);
  });

  /**
   * The event ruling P1 exists for. `ticket.workflow_rebound` asks the reducer
   * for the PAYLOAD's `toWorkflowId` — a workflow the ticket is not on yet, and
   * one no loader inspecting the ticket's own row would think to fetch. A
   * `loadDeps` that pre-selects "the ticket's workflow" resolves null here and
   * the reducer throws `workflow "…" is not defined — the engine must refuse
   * ticket.workflow_rebound before it reaches a projection`, blaming the door
   * for the loader's omission.
   */
  it('a rebound moves the one ticket it names onto the target workflow, and leaves its sibling behind', async () => {
    await applyAll(
      asLedger([
        ...SEED,
        WF_OTHER_V1,
        ticketEvent(CHILD, 'ticket.workflow_rebound', {
          toWorkflowId: WF_OTHER,
          toStateId: 'intake',
        }),
      ]),
    );

    expect(await getTicketStateFromDb(db.pool, WS, CHILD)).toMatchObject({
      workflowId: WF_OTHER,
      workflowVersion: 1,
      stateId: 'intake',
      stateCategory: 'open',
    });
    expect((await getTicketStateFromDb(db.pool, WS, GRANDCHILD))?.workflowId).toBe(WF_BASIC);
  });

  // NOTE, so neither case above is read as proving more than it does: both
  // assert the LIVE path. On a RE-DERIVATION a re-bound type still resolves its
  // NEW workflow for a ticket the live path bound to the old one — `loadDeps`
  // reads `proj_ticket_types`, which is last-definition-wins with no history to
  // ask as-of. That is the plan's Open question 11, scoped out deliberately,
  // and it is the one place the "pure function of the ledger prefix" claim does
  // not hold. It is NOT asserted here: the only rebuild case in this file is
  // also the only one that writes to `events` (see its docstring below), and a
  // second writer would replay through the first. Recorded UNASSIGNED in
  // `docs/plan-3-chain-b-handoff.md`; `tickets.ts`' header carries the reasoning.

  // Refresh on publish — owner decision 2026-08-26, design decision 10.

  it('a v2 that re-categorises a state refreshes every ticket standing in it, in the publishing transaction', async () => {
    await applyAll(
      asLedger([
        ...SEED,
        ticketEvent(CHILD, 'ticket.transitioned', { to: 'doing' }),
        WF_BASIC_V2_RECATEGORISED,
      ]),
    );

    // The claim did not change; what "Doing" MEANS did.
    expect(await getTicketStateFromDb(db.pool, WS, CHILD)).toMatchObject({
      stateId: 'doing',
      stateCategory: 'terminal',
      workflowVersion: 2,
    });
    // Untouched tickets are folded too — they were sitting in the initial state.
    expect(await getTicketStateFromDb(db.pool, WS, PARENT)).toMatchObject({
      stateId: 'todo',
      stateCategory: 'open',
      workflowVersion: 2,
    });
  });

  it('a v2 that drops a state folds state_id through the stateMapping rather than throwing, and leaves the transition log alone', async () => {
    await applyAll(
      asLedger([
        ...SEED,
        ticketEvent(CHILD, 'ticket.transitioned', { to: 'doing' }),
        WF_BASIC_V2_DROPS_DOING,
      ]),
    );

    const state = await getTicketStateFromDb(db.pool, WS, CHILD);
    expect(state).toMatchObject({ stateId: 'todo', stateCategory: 'open', workflowVersion: 2 });
    // Head state says 'todo' under v2; history still says this actor moved the
    // ticket to 'doing' under v1, because that is what they did. A fold moves
    // the ticket's current state, never the evidence four-eyes reads.
    expect(state?.transitions).toEqual([
      { toStateId: 'doing', actorId: ACTOR, seq: 2, workflowId: WF_BASIC, workflowVersion: 1 },
    ]);
  });

  /**
   * ## A THIRD VERSION, and the measurement that says what the intermediate
   * cache is for
   *
   * `refreshTicketsForWorkflow` fetches every version strictly between the
   * OLDEST row's and the target's, once for the whole batch, and hands them to
   * `foldTicketToWorkflowVersion` — which throws "the version chain has a hole"
   * for any version that supplier cannot produce.
   *
   * The reviewer's premise was that a v3 fold is that cache's first exercise.
   * It is not, and this case is what says so: publishing refuses any version
   * that is not exactly `latest + 1` (`workflow-defined.ts`), and refresh-on-
   * publish folds EVERY row on the workflow in the publishing transaction — so
   * a row is at most one version behind whenever a `workflow.defined` arrives,
   * `oldest + 1 < target.version` is false, and the loop body never runs. The
   * assertion after v2's publish is that claim stated as a fact about the rows
   * rather than as an argument. Measured: neutering the cache to supply nothing
   * leaves this case green.
   *
   * The chain is still real work — `doing` is mapped to `todo` by v2 and `todo`
   * to `triage` by v3, so the ticket that transitioned under v1 arrives at
   * `triage` by two mappings applied in order, not by one.
   */
  it('a third published version folds every ticket one publish at a time, so no row is ever two versions behind', async () => {
    const drafts = [
      ...SEED,
      ticketEvent(CHILD, 'ticket.transitioned', { to: 'doing' }),
      WF_BASIC_V2_DROPS_DOING,
      WF_BASIC_V3_DROPS_TODO,
    ];
    const ledger = asLedger(drafts);
    const v2Publish = ledger[drafts.indexOf(WF_BASIC_V2_DROPS_DOING)]!;

    await withClient(async (client) => {
      for (const event of ledger) {
        await workflowsProjection.apply(event, client);
        await ticketTypesProjection.apply(event, client);
        await ticketsProjection.apply(event, client);
        if (event === v2Publish) {
          // THE REACHABILITY ASSERTION. Every row is already at v2 before v3 is
          // published, so v3 finds nothing lagging by two. If refresh-on-publish
          // ever stops folding the whole workflow, this is what goes red — and
          // the planted case below is what the code does when it does.
          const versions = (await ticketRows()).map((row) => row['workflow_version']);
          expect(versions).toEqual([2, 2, 2]);
        }
      }
    });

    // Two mappings applied in order: doing → todo (v2) → triage (v3).
    expect(await getTicketStateFromDb(db.pool, WS, CHILD)).toMatchObject({
      stateId: 'triage',
      stateCategory: 'open',
      workflowVersion: 3,
    });
    // And the two that never moved walked todo → triage through v3 alone.
    expect(await getTicketStateFromDb(db.pool, WS, PARENT)).toMatchObject({
      stateId: 'triage',
      workflowVersion: 3,
    });
    // The transition log still says what the actor did, in the vocabulary they
    // did it in — a fold moves the ticket, never the evidence.
    expect((await getTicketStateFromDb(db.pool, WS, CHILD))?.transitions).toEqual([
      { toStateId: 'doing', actorId: ACTOR, seq: 2, workflowId: WF_BASIC, workflowVersion: 1 },
    ]);
  });

  /**
   * ## PLANTED: a row two versions behind, which is the only thing the cache is
   * for
   *
   * The case above proves the door cannot produce a two-version lag, so this
   * one plants it, in the same idiom as the planted-defect rebuild below:
   * proj_workflows receives all three publishes and proj_tickets is not handed
   * v2's. The rows therefore meet v3 still at v1, `oldest + 1 < target.version`
   * is true for the first time, and the walk needs a definition NEITHER the row
   * nor the target carries.
   *
   * What it pins is the supply, not the arithmetic: making the cache produce
   * nothing turns this red with `foldTicketToWorkflowVersion: workflow "…"
   * version 2 is missing — the version chain has a hole`, which is the fold's
   * own sentence for a gap in the ledger rather than a silently unmapped drop.
   * Everything else in the file stays green under that mutation, which is
   * exactly why this case had to exist.
   */
  it('planted: a row two versions behind is walked through the intermediate version the cache supplies', async () => {
    const drafts = [
      ...SEED,
      ticketEvent(CHILD, 'ticket.transitioned', { to: 'doing' }),
      WF_BASIC_V2_DROPS_DOING,
      WF_BASIC_V3_DROPS_TODO,
    ];
    const ledger = asLedger(drafts);
    const withheld = ledger[drafts.indexOf(WF_BASIC_V2_DROPS_DOING)]!;

    await withClient(async (client) => {
      for (const event of ledger) {
        // proj_workflows still stores v2 — the intermediate EXISTS to be
        // fetched. Only this table is denied the refresh it would have run.
        await workflowsProjection.apply(event, client);
        await ticketTypesProjection.apply(event, client);
        if (event !== withheld) {
          await ticketsProjection.apply(event, client);
        }
      }
    });

    // doing → todo through the WITHHELD v2, then todo → triage through v3. A
    // fold that consulted only the target would have nothing to map `doing`
    // with and would report an unmapped drop instead.
    expect(await getTicketStateFromDb(db.pool, WS, CHILD)).toMatchObject({
      stateId: 'triage',
      stateCategory: 'open',
      workflowVersion: 3,
    });
    expect((await ticketRows()).map((row) => row['workflow_version'])).toEqual([3, 3, 3]);
  });

  /**
   * ## The freshness gate, and the only case that fails on "latest"
   *
   * A PROJECTION-OUTER rebuild: reset proj_tickets alone and replay the whole
   * ledger in canonical order, leaving proj_workflows and proj_ticket_types
   * standing at their newest state. That is what `rebuildProjection` does and
   * what `tools/verify-projections.ts` does; it is NOT an alternative spelling
   * of "reset everything and replay", under which proj_workflows would be
   * rebuilt alongside and would happen to hold the right version at every
   * point, and the defect could not appear.
   *
   * With definitions resolved as "latest", this fails two ways: the replay of
   * the v1 transition into `doing` looks that id up in v2, which dropped it,
   * and the reducer THROWS — proj_tickets can never be re-derived — and even
   * with nothing dropped it would stamp version 2 on rows the live path left at
   * 1, which the verifier reports as drift after every republish.
   *
   * The two orders are asserted to DIFFER, observed out of `readLedger` rather
   * than asserted from what this test believes canonical order to be: a
   * determinism check that replays the arrival order it applied is vacuous.
   * They are also asserted to be the SAME events, so the inequality cannot be
   * satisfied by a filter that dropped one.
   *
   * This is the ONLY case in this file that writes to `events`. That is
   * deliberate and it is load-bearing: `readLedger` has no workspace filter and
   * `events` is append-only, so rows left by any other case would be replayed
   * through proj_tickets after `beforeEach` has truncated the proj_workflows
   * and proj_ticket_types rows they need. The assertion on the ledger's length
   * below is what says so out loud if that ever changes.
   */
  it('planted defect: a v2 dropping a state is unrebuildable unless definitions resolve AS OF the event — projection-outer replay reproduces the table exactly', async () => {
    const ledger = asLedger([
      ...SEED,
      ticketEvent(CHILD, 'ticket.transitioned', { to: 'doing' }),
      ticketEvent(GRANDCHILD, 'ticket.transitioned', { to: 'done' }),
      WF_BASIC_V2_DROPS_DOING,
      // A move made AFTER the publish, so its `to` is v2 vocabulary while the
      // two above are v1 vocabulary. Canonical replay hands the projection all
      // three before it ever sees a workflow event.
      ticketEvent(CHILD, 'ticket.transitioned', { to: 'done' }),
    ]);

    await withClient(async (client) => {
      for (const event of ledger) {
        await insertEvent(client, event);
        await workflowsProjection.apply(event, client);
        await ticketTypesProjection.apply(event, client);
        await ticketsProjection.apply(event, client);
      }
    });
    const live = await ticketRows();

    const replayed = await readLedger(db.pool);
    expect(replayed).toHaveLength(ledger.length);
    const key = (event: LedgerEvent) => `${event.entity.kind}:${event.entity.id}:${event.seq}`;
    const canonical = replayed.map(key);
    const arrival = ledger.map(key);
    // The orders differ — observed, not assumed. Canonical sorts every `ticket`
    // event ahead of every `ticket-type` and `workflow` event, so the workflow
    // this projection needs arrives LAST.
    expect(canonical).not.toEqual(arrival);
    // ...and they are the same events in a different order.
    expect([...canonical].sort()).toEqual([...arrival].sort());

    await rebuildProjection('proj_tickets', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
    expect(await ticketRows()).toEqual(live);

    // And the answer is the honest one, not merely a stable one: two tables
    // agreeing on the WRONG state would satisfy the comparison above. CHILD
    // sorts before GRANDCHILD, which sorts before PARENT.
    expect(
      live.map((row) => [row['ticket_id'], row['state_id'], row['workflow_version']]),
    ).toEqual([
      [CHILD, 'done', 2],
      [GRANDCHILD, 'done', 2],
      [PARENT, 'todo', 2],
    ]);
  });
});

/**
 * A TEST-LOCAL `EngineContext` over proj_tickets, proj_ticket_types and
 * proj_workflows. It is NOT Task 12 landing early: nothing under
 * `src/engine-context.ts` moves in this change set, and `createEngineContext`
 * goes on answering null for `getEntityState('ticket')` and `getTicketTypeDef`
 * until T12 aligns all three `EngineContext` implementations in one change set
 * (controller ruling P9).
 *
 * `getEntityState` is deliberately UNSCOPED by workspace, because that is the
 * lookup the shipped interface forces — `getEntityState(kind, id)` has no
 * workspace parameter — and it is precisely the lookup ruling P12's guard
 * exists to compensate for. Scoping it here would make the guard untestable:
 * the reader would refuse the foreign parent on its own, and the assertion
 * would then pass with `workspaceId` missing from `rowToTicketState`, which is
 * the exact defect this file is here to catch.
 *
 * `getChildrenStates` answers empty rather than reading the table: the
 * parent-terminal invariant that consumes it is T12's to wire, and a half-wired
 * context here would be a second opinion about a contract T12 owns.
 */
function testLocalContext(client: PoolClient, workspaceId: string): EngineContext {
  return {
    async getEntityState(kind, id) {
      if (kind !== 'ticket') {
        return null;
      }
      const { rows } = await client.query('SELECT * FROM proj_tickets WHERE ticket_id = $1', [id]);
      const row = rows[0];
      return row === undefined ? null : (rowToTicketState(row) as TicketState);
    },
    async getChildrenStates() {
      return [];
    },
    // SCOPED from the caller's `scope`, not from this helper's closed-over
    // `workspaceId` (controller ruling P14, Task 12). The two coincide in this
    // file; taking the closure would make that coincidence the reason the
    // assertions pass and would answer a different question than the shipped
    // server context does.
    async getWorkflowDef(scope, workflowId, version) {
      return await getWorkflowDefFromProjection(client, scope.workspaceId, workflowId, version);
    },
    async getTicketTypeDef(scope, typeId) {
      return await getTicketTypeFromDb(client, scope.workspaceId, typeId);
    },
  };
}
