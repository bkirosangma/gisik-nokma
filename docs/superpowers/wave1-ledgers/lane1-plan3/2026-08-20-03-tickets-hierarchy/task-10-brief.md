### Task 10: proj_tickets — head state per ticket, driven by the shared reducer

**Files:**
- Create: `apps/server/migrations/1755672100000_proj-tickets.js`
- Create: `apps/server/src/projections/tickets.ts`
- Test: `apps/server/test/proj-tickets.test.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `proj_ticket_types`)

**Interfaces:**
- Consumes: `applyTicketEvent`, `TICKET_EVENT_TYPES`, and this exact shape (defined in Plan 2's domain per the coordination doc §4, produced by Task 3's reducer, echoed for the implementer):

```ts
type FieldClaim = { value: unknown; actorId: string; clientTime: string; serverTime: string };
type TicketState = {
  kind: 'ticket';
  id: string; workspaceId: string; projectId: string; typeId: string;
  parentId: string | null; workflowId: string; workflowVersion: number;
  stateId: string; stateCategory: StateCategory;
  assigneeId: string | null; collaboratorIds: string[];
  fields: Record<string, FieldClaim>;
  transitions: { toStateId: string; actorId: string; seq: number; workflowVersion: number }[];
};
```

- Also consumes: `getTicketTypeFromDb` (Task 9); `foldTicketToWorkflowVersion` (Task 3, `@gisik-nokma/domain`); `getWorkflowDef(db, workspaceId, workflowId, version)` and **`getWorkflowDefAsOf(db, workspaceId, workflowId, asOfWorkspaceSeq)`** (Plan 2 — see the assumed-identifiers table); `LedgerEvent`, `applyEvent`/`resetProjections` (Plan 1).
- Produces:
  - Table `proj_tickets`
  - `ticketsProjection` (the registered `{name, apply, reset}`)
  - `getTicketStateFromDb(db, workspaceId, ticketId): Promise<TicketState | null>`
  - `getChildrenStatesFromDb(db, workspaceId, parentId): Promise<TicketState[]>` — DIRECT children only

**Semantics this projection owes the rest of the series (design decision 10, owner decision 2026-08-26):**

1. **It resolves every definition AS OF the event it is applying**, never as of now — `getWorkflowDefAsOf(db, workspaceId, workflowId, env.workspaceSeq)`. Resolving "latest" is a rebuild hazard, not a style preference: Plan 1's verifier rebuilds projection-outer, so `proj_workflows` is complete before this projection replays its first event, and a `ticket.transitioned` into a state a later version dropped would then **throw** (the reducer looks the id up in the definition directly; the mandatory `stateMapping` is consulted by the engine's `resolveCurrentStateId`, not here). Even with nothing dropped, re-derivation would stamp the newest `workflow_version` where the live row holds the version in force at the time, and the verifier would report drift after any republish.
2. **It consumes `workflow.defined`**, folding every row on that workflow forward through `foldTicketToWorkflowVersion`. That is refresh-on-publish; `proj_rollups` completes it in the same transaction (Task 11).

Together these make `proj_tickets` a pure function of the ledger prefix: whatever order the ledger is replayed in, the last `workflow.defined` puts every row at the same version, and every ticket event resolved the definition that was actually in force when it happened.

- [ ] **Step 1: Write the migration**

```js
// apps/server/migrations/1755672100000_proj-tickets.js
exports.up = (pgm) => {
  pgm.createTable('proj_tickets', {
    ticket_id: { type: 'text', primaryKey: true },
    workspace_id: { type: 'text', notNull: true },
    project_id: { type: 'text', notNull: true },
    type_id: { type: 'text', notNull: true },
    parent_id: { type: 'text', notNull: false },
    workflow_id: { type: 'text', notNull: true },
    workflow_version: { type: 'integer', notNull: true },
    state_id: { type: 'text', notNull: true },
    state_category: { type: 'text', notNull: true },
    assignee_id: { type: 'text', notNull: false },
    collaborator_ids: { type: 'jsonb', notNull: true, default: '[]' },
    fields: { type: 'jsonb', notNull: true, default: '{}' },
    transitions: { type: 'jsonb', notNull: true, default: '[]' },
  });
  pgm.addConstraint('proj_tickets', 'proj_tickets_state_category_check', {
    check: "state_category IN ('open', 'active', 'terminal')",
  });
  pgm.createIndex('proj_tickets', ['workspace_id', 'parent_id']);
  pgm.createIndex('proj_tickets', ['workspace_id', 'project_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('proj_tickets');
};
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/server/test/proj-tickets.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import type { EventEnvelope } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../src/ledger/event-store';
import { applyEvent, resetProjections } from '../src/projections/index';
import { getChildrenStatesFromDb, getTicketStateFromDb, ticketsProjection } from '../src/projections/tickets';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const CHILD = '01J9GCHA000000000000000000';
const GRANDCHILD = '01J9GCHB000000000000000000';

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

function workflowDefined(payload: object) {
  return makeEnvelope({
    type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, workspaceId: WS, payload,
  });
}

const WF_DEFINED = workflowDefined({
  id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
  states: V1_STATES, transitions: ALL_TRANSITIONS,
});

/** v2 keeps every state but moves Doing from active to terminal. */
const WF_V2_RECATEGORISED = workflowDefined({
  id: 'wf-basic', version: 2, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'terminal' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: ALL_TRANSITIONS,
});

/**
 * A second, unrelated workflow — the destination a migration moves a ticket
 * to. Its state ids deliberately do NOT overlap wf-basic's: two unrelated
 * graphs that happen to spell a state the same way is the trap the transition
 * log's per-entry `workflowId` exists to catch, and it is proven in the rule
 * engine's own fixtures rather than here.
 */
const WF_OTHER = makeEnvelope({
  type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-other' }, workspaceId: WS,
  payload: {
    id: 'wf-other', version: 1, name: 'Intake', initialStateId: 'intake',
    states: [
      { id: 'intake', name: 'Intake', category: 'open' },
      { id: 'closed', name: 'Closed', category: 'terminal' },
    ],
    transitions: [
      { from: '*', to: 'intake', rules: [] },
      { from: '*', to: 'closed', rules: [] },
    ],
  },
});

/** v2 drops Doing altogether and maps everyone standing in it back to To do. */
const WF_V2_DROPS_DOING = workflowDefined({
  id: 'wf-basic', version: 2, name: 'Basic', initialStateId: 'todo',
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

function typeDefined(id: string, rank: number, workflowId = 'wf-basic') {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id }, workspaceId: WS,
    payload: { id, name: id[0].toUpperCase() + id.slice(1), icon: 'check', rank, workflowId, fields: [] } });
}
function created(id: string, typeId: string, parentId: string | null, title: string) {
  return makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId, projectId: PROJECT, parentId, title } });
}
function ticketEvent(id: string, type: string, payload: object) {
  return makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, payload });
}

/**
 * Stamp both counters the way ingest does: `workspaceSeq` is the workspace
 * stream cursor (coordination §18), `seq` restarts at 1 per entity.
 * Projections resolve workflow definitions AS OF `workspaceSeq`, so a test
 * that leaves it off is not testing the projection the server runs; and the
 * canonical replay order below sorts by the per-entity `seq`, so leaving that
 * off would make the replay order depend on sort stability rather than on the
 * ledger.
 */
function asLedger(events: EventEnvelope[]): LedgerEvent[] {
  const perEntity = new Map<string, number>();
  return events.map((env, index) => {
    const key = `${env.entity.kind}:${env.entity.id}`;
    const seq = (perEntity.get(key) ?? 0) + 1;
    perEntity.set(key, seq);
    return { ...env, seq, workspaceSeq: index + 1 };
  });
}

const SEED_EVENTS = [
  WF_DEFINED, typeDefined('story', 2), typeDefined('task', 3),
  created(PARENT, 'story', null, 'Quarterly filings'),
  created(CHILD, 'task', PARENT, 'File GST'),
  created(GRANDCHILD, 'task', CHILD, 'Collect challans'),
];

/** Plan 1's CANONICAL replay order: (entity_kind, entity_id, seq) — deliberately NOT chronological. */
function canonicalOrder(ledger: LedgerEvent[]): LedgerEvent[] {
  return [...ledger].sort((a, b) =>
    a.entity.kind.localeCompare(b.entity.kind) ||
    a.entity.id.localeCompare(b.entity.id) ||
    a.seq - b.seq);
}

/**
 * Re-derive ONE projection the way Plan 1's verifier does — projection-outer,
 * over the whole ledger in canonical order — leaving the other projections
 * (proj_workflows, proj_ticket_types) standing. This is not an alternative
 * spelling of `resetProjections` + replay: under event-outer replay
 * proj_workflows is rebuilt alongside proj_tickets and happens to hold the
 * right version at every point, so the defect this guards cannot appear. The
 * verifier does not replay that way, and neither does this.
 */
async function rebuildTicketsProjectionOuter(pool: Pool, ledger: LedgerEvent[]): Promise<void> {
  const tx: PoolClient = await pool.connect();
  try {
    await tx.query('BEGIN');
    await ticketsProjection.reset(tx);
    for (const env of canonicalOrder(ledger)) await ticketsProjection.apply(env, tx);
    await tx.query('COMMIT');
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}

const db: Pool = await testPool();
beforeEach(async () => wipe(db));
afterAll(async () => db.end());

async function applyAll(ledger: LedgerEvent[]): Promise<void> {
  for (const env of ledger) await applyEvent(db, env);
}

describe('proj_tickets', () => {
  it('creation lands in the workflow initial state with the title as an attributed claim', async () => {
    await applyAll(asLedger(SEED_EVENTS));
    const state = await getTicketStateFromDb(db, WS, PARENT);
    expect(state).toMatchObject({
      id: PARENT, workspaceId: WS, projectId: PROJECT, typeId: 'story', parentId: null,
      workflowId: 'wf-basic', stateId: 'todo', stateCategory: 'open',
      assigneeId: null, collaboratorIds: [],
    });
    expect(state?.fields.title).toMatchObject({ value: 'Quarterly filings', actorId: 'user-kiro' });
  });

  it('transition, assignment, collaborators, and field claims update head state with provenance', async () => {
    await applyAll(asLedger([...SEED_EVENTS,
      ticketEvent(CHILD, 'ticket.transitioned', { toStateId: 'done' }),
      ticketEvent(CHILD, 'ticket.assigned', { assigneeId: 'user-anselma' }),
      ticketEvent(CHILD, 'ticket.collaborator_added', { userId: 'user-kiro' }),
      ticketEvent(CHILD, 'ticket.field_set', { fieldId: 'dueDate', value: { date: '2026-08-30', note: 'GST' } }),
    ]));
    const state = await getTicketStateFromDb(db, WS, CHILD);
    expect(state).toMatchObject({ stateId: 'done', stateCategory: 'terminal', assigneeId: 'user-anselma', collaboratorIds: ['user-kiro'] });
    expect(state?.fields.dueDate).toMatchObject({ value: { date: '2026-08-30', note: 'GST' }, actorId: 'user-kiro' });
    expect(typeof state?.fields.dueDate.clientTime).toBe('string');
    expect(typeof state?.fields.dueDate.serverTime).toBe('string');
  });

  it('getChildrenStates returns DIRECT children only', async () => {
    await applyAll(asLedger(SEED_EVENTS));
    const children = await getChildrenStatesFromDb(db, WS, PARENT);
    expect(children.map((c) => c.id)).toEqual([CHILD]);
  });

  it('rebuild-and-diff: reset and replay produces the identical table', async () => {
    const ledger = asLedger([...SEED_EVENTS,
      ticketEvent(CHILD, 'ticket.transitioned', { toStateId: 'doing' }),
      ticketEvent(GRANDCHILD, 'ticket.reparented', { newParentId: PARENT }),
    ]);
    await applyAll(ledger);
    const first = (await db.query('SELECT * FROM proj_tickets ORDER BY ticket_id')).rows;
    await resetProjections(db);
    await applyAll(ledger);
    const second = (await db.query('SELECT * FROM proj_tickets ORDER BY ticket_id')).rows;
    expect(second).toEqual(first);
  });

  // A ticket pins its workflow — owner decision 2026-08-26.

  it('re-pointing a type at a different workflow leaves existing tickets on the old one', async () => {
    // One ledger, not two: asLedger numbers workspaceSeq from 1 each call, and
    // the projection resolves definitions AS OF that number.
    await applyAll(asLedger([...SEED_EVENTS, WF_OTHER, typeDefined('task', 3, 'wf-other')]));

    const row = (await db.query('SELECT workflow_id, state_id FROM proj_tickets WHERE ticket_id = $1', [CHILD])).rows[0];
    expect(row.workflow_id).toBe('wf-basic');
    expect(row.state_id).toBe('todo');
    // And the type really did move, or this passes for the wrong reason.
    expect((await getTicketTypeFromDb(db, WS, 'task'))?.workflowId).toBe('wf-other');
  });

  it('a rebound moves the one ticket it names, and leaves its sibling behind', async () => {
    await applyAll(asLedger([...SEED_EVENTS, WF_OTHER,
      ticketEvent(CHILD, 'ticket.workflow_rebound', { toWorkflowId: 'wf-other', toStateId: 'intake' }),
    ]));

    const moved = (await db.query(
      'SELECT workflow_id, workflow_version, state_id, state_category FROM proj_tickets WHERE ticket_id = $1', [CHILD],
    )).rows[0];
    expect(moved).toMatchObject({
      workflow_id: 'wf-other', workflow_version: 1, state_id: 'intake', state_category: 'open',
    });

    const untouched = (await db.query('SELECT workflow_id FROM proj_tickets WHERE ticket_id = $1', [GRANDCHILD])).rows[0];
    expect(untouched.workflow_id).toBe('wf-basic');
  });

  // NOTE, so neither test is read as proving more than it does: both assert the
  // LIVE path. On a re-derivation a re-bound type still resolves its NEW
  // workflow for a ticket the live path bound to the old one — `loadDeps` reads
  // `proj_ticket_types`, which is last-definition-wins with no history to ask
  // as-of. That is Open question 11, scoped out deliberately, and it is the one
  // place the "pure function of the ledger prefix" claim does not yet hold.

  // Refresh on publish — owner decision 2026-08-26, design decision 10.

  it('a v2 that re-categorises a state refreshes every ticket standing in it, in the publishing transaction', async () => {
    await applyAll(asLedger([...SEED_EVENTS,
      ticketEvent(CHILD, 'ticket.transitioned', { toStateId: 'doing' }),
      WF_V2_RECATEGORISED,
    ]));
    // The claim did not change; what "Doing" MEANS did.
    expect(await getTicketStateFromDb(db, WS, CHILD)).toMatchObject({
      stateId: 'doing', stateCategory: 'terminal', workflowVersion: 2,
    });
    // Untouched tickets are folded too — they were sitting in the initial state.
    expect(await getTicketStateFromDb(db, WS, PARENT)).toMatchObject({
      stateId: 'todo', stateCategory: 'open', workflowVersion: 2,
    });
  });

  it('a v2 that drops a state folds state_id through the stateMapping rather than throwing', async () => {
    await applyAll(asLedger([...SEED_EVENTS,
      ticketEvent(CHILD, 'ticket.transitioned', { toStateId: 'doing' }),
      WF_V2_DROPS_DOING,
    ]));
    expect(await getTicketStateFromDb(db, WS, CHILD)).toMatchObject({
      stateId: 'todo', stateCategory: 'open', workflowVersion: 2,
    });
  });

  it('the fold leaves the transition log alone — entries keep the version their state ids are written in', async () => {
    await applyAll(asLedger([...SEED_EVENTS,
      ticketEvent(CHILD, 'ticket.transitioned', { toStateId: 'doing' }),
      WF_V2_DROPS_DOING,
    ]));
    const state = await getTicketStateFromDb(db, WS, CHILD);
    // Head state says 'todo' under v2; history still says this actor moved the
    // ticket to 'doing' under v1, because that is what they did.
    expect(state?.transitions).toEqual([
      { toStateId: 'doing', actorId: 'user-kiro', seq: expect.any(Number), workflowVersion: 1 },
    ]);
  });

  it('planted defect: a v2 dropping a state is unrebuildable unless definitions resolve AS OF the event — projection-outer replay reproduces the table byte for byte', async () => {
    // The defect: with `getWorkflowDef(db, ws, id)` ("latest"), a
    // projection-outer rebuild sees v2 while replaying the v1 transition, and
    // `stateCategoryOf(v2, 'doing')` is undefined — the reducer throws and
    // proj_tickets can never be re-derived. Even without a drop it would stamp
    // version 2 on a row the live path left at 1, and the verifier would
    // report drift after every republish.
    const ledger = asLedger([...SEED_EVENTS,
      ticketEvent(CHILD, 'ticket.transitioned', { toStateId: 'doing' }),
      ticketEvent(GRANDCHILD, 'ticket.transitioned', { toStateId: 'done' }),
      WF_V2_DROPS_DOING,
      // A move made AFTER the publish, so its toStateId is v2 vocabulary while
      // the two above are v1 vocabulary. Canonical replay order hands the
      // projection all three before it ever sees a workflow event.
      ticketEvent(CHILD, 'ticket.transitioned', { toStateId: 'done' }),
    ]);
    await applyAll(ledger);
    const live = (await db.query('SELECT * FROM proj_tickets ORDER BY ticket_id')).rows;

    await rebuildTicketsProjectionOuter(db, ledger);
    const rederived = (await db.query('SELECT * FROM proj_tickets ORDER BY ticket_id')).rows;

    expect(rederived).toEqual(live);
    // And the answer is the honest one, not merely a stable one. CHILD sorts
    // before GRANDCHILD, which sorts before PARENT.
    expect(live.map((row) => [row.ticket_id, row.state_id, row.workflow_version])).toEqual([
      [CHILD, 'done', 2], [GRANDCHILD, 'done', 2], [PARENT, 'todo', 2],
    ]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/proj-tickets.test.ts`
Expected: FAIL — cannot find module `../src/projections/tickets`.

- [ ] **Step 4: Implement the projection**

```ts
// apps/server/src/projections/tickets.ts
import type { Pool, PoolClient } from 'pg';
import type { TicketState, TicketStateDeps, WorkflowDef } from '@gisik-nokma/domain';
import {
  TICKET_EVENT_TYPES, applyTicketEvent, foldTicketToWorkflowVersion, ticketCreatedPayload,
} from '@gisik-nokma/domain';
import type { LedgerEvent } from '../ledger/event-store';
import { getTicketTypeFromDb } from './ticket-types';
import { getWorkflowDef, getWorkflowDefAsOf } from './workflows';

function rowToTicketState(row: Record<string, unknown>): TicketState {
  return {
    kind: 'ticket',
    id: row.ticket_id as string,
    workspaceId: row.workspace_id as string,
    projectId: row.project_id as string,
    typeId: row.type_id as string,
    parentId: row.parent_id as string | null,
    workflowId: row.workflow_id as string,
    workflowVersion: row.workflow_version as number,
    stateId: row.state_id as string,
    stateCategory: row.state_category as TicketState['stateCategory'],
    assigneeId: row.assignee_id as string | null,
    collaboratorIds: row.collaborator_ids as string[],
    fields: row.fields as TicketState['fields'],
    transitions: row.transitions as TicketState['transitions'],
  };
}

export async function getTicketStateFromDb(
  db: Pool | PoolClient,
  workspaceId: string,
  ticketId: string,
): Promise<TicketState | null> {
  const res = await db.query(
    'SELECT * FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
    [workspaceId, ticketId],
  );
  return res.rowCount === 0 ? null : rowToTicketState(res.rows[0]);
}

/** DIRECT children only — the invariant's "open children" are direct non-terminal children. */
export async function getChildrenStatesFromDb(
  db: Pool | PoolClient,
  workspaceId: string,
  parentId: string,
): Promise<TicketState[]> {
  const res = await db.query(
    'SELECT * FROM proj_tickets WHERE workspace_id = $1 AND parent_id = $2 ORDER BY ticket_id',
    [workspaceId, parentId],
  );
  return res.rows.map(rowToTicketState);
}

async function upsertTicket(db: PoolClient, next: TicketState): Promise<void> {
  await db.query(
    `INSERT INTO proj_tickets
       (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, workflow_version,
        state_id, state_category, assignee_id, collaborator_ids, fields, transitions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (ticket_id) DO UPDATE SET
       project_id = EXCLUDED.project_id, type_id = EXCLUDED.type_id,
       parent_id = EXCLUDED.parent_id, workflow_id = EXCLUDED.workflow_id,
       workflow_version = EXCLUDED.workflow_version,
       state_id = EXCLUDED.state_id, state_category = EXCLUDED.state_category,
       assignee_id = EXCLUDED.assignee_id, collaborator_ids = EXCLUDED.collaborator_ids,
       fields = EXCLUDED.fields, transitions = EXCLUDED.transitions`,
    [next.id, next.workspaceId, next.projectId, next.typeId, next.parentId, next.workflowId, next.workflowVersion,
     next.stateId, next.stateCategory, next.assigneeId,
     JSON.stringify(next.collaboratorIds), JSON.stringify(next.fields), JSON.stringify(next.transitions)],
  );
}

/**
 * Pre-fetches the defs the pure reducer may need, then hands it synchronous
 * lookups. The reducer is the same function the fixture suite uses — the
 * projection adds only persistence.
 *
 * The workflow is resolved AS OF this event's position in the workspace
 * stream, never "latest". Design decision 10 argues why at length; the short
 * version is that "latest" makes this projection unrebuildable the first time
 * a workflow version drops a state, and makes the verifier report drift after
 * every republish. `env.workspaceSeq` is the position; `getWorkflowDefAsOf`
 * answers with the definition in force there.
 */
async function loadDeps(db: PoolClient, env: LedgerEvent, current: TicketState | undefined): Promise<TicketStateDeps> {
  let typeId: string | undefined;
  let workflowId: string | undefined;
  if (env.type === 'ticket.created') {
    typeId = ticketCreatedPayload.parse(env.payload).typeId;
  } else if (env.type === 'ticket.transitioned') {
    workflowId = current?.workflowId;
  }
  const type = typeId ? await getTicketTypeFromDb(db, env.workspaceId, typeId) : null;
  const wfId = workflowId ?? type?.workflowId;
  const workflow = wfId ? await getWorkflowDefAsOf(db, env.workspaceId, wfId, env.workspaceSeq) : null;
  return {
    getTicketType: (id) => (type !== null && id === type.id ? type : undefined),
    getWorkflow: (id) => (workflow !== null && id === workflow.id ? workflow : undefined),
  };
}

/**
 * Refresh on publish (owner decision 2026-08-26, design decision 10). A new
 * version of workflow W re-categorises, renames or drops states that existing
 * tickets are standing in; every row on W is folded forward so nothing keeps
 * claiming a category the workflow no longer assigns it.
 *
 * The target definition is read through the same as-of lookup rather than
 * parsed out of the payload — `proj_workflows` is registered before this
 * projection, so by the time this runs the version being published is already
 * stored, and `<= env.workspaceSeq` therefore includes it. One code path for
 * "which definition is in force here", used everywhere.
 */
async function refreshTicketsForWorkflow(db: PoolClient, env: LedgerEvent): Promise<void> {
  const workflowId = env.entity.id;
  const target = await getWorkflowDefAsOf(db, env.workspaceId, workflowId, env.workspaceSeq);
  if (!target) {
    throw new Error(`proj_tickets: workflow.defined for "${workflowId}" but proj_workflows has no version at workspace_seq ${env.workspaceSeq} — projection registration order is broken`);
  }

  // `workflow_version < target.version` is the monotone guard expressed in SQL
  // so the rows never leave Postgres. `foldTicketToWorkflowVersion` holds the
  // same guard because the replica has no SQL — neither copy is redundant, and
  // deleting either one breaks a different caller.
  const rows = await db.query(
    'SELECT * FROM proj_tickets WHERE workspace_id = $1 AND workflow_id = $2 AND workflow_version < $3 ORDER BY ticket_id',
    [env.workspaceId, workflowId, target.version],
  );
  if (rows.rowCount === 0) return;

  // Intermediates are fetched once, not once per row: a workspace with ten
  // thousand tickets on one workflow must not issue ten thousand lookups.
  const cache = new Map<number, WorkflowDef>();
  const getVersion = (version: number): WorkflowDef | undefined => cache.get(version);
  // reduce, not Math.min(...spread): the row count is a workspace's whole
  // ticket table, and spreading it is an argument-limit crash waiting for the
  // first workspace big enough to matter.
  const oldest = rows.rows.reduce(
    (lowest, row) => Math.min(lowest, row.workflow_version as number),
    target.version,
  );
  for (let version = oldest + 1; version < target.version; version += 1) {
    const def = await getWorkflowDef(db, env.workspaceId, workflowId, version);
    if (def) cache.set(version, def);
  }

  for (const row of rows.rows) {
    const folded = foldTicketToWorkflowVersion(rowToTicketState(row), target, getVersion);
    await upsertTicket(db, folded);
  }
}

export const ticketsProjection = {
  name: 'proj_tickets',

  async apply(env: LedgerEvent, db: PoolClient): Promise<void> {
    // A workflow event is not a ticket event, but it changes what every ticket
    // on that workflow means — so it is handled BEFORE the ticket-vocabulary
    // filter below, which would otherwise discard it.
    if (env.type === 'workflow.defined') {
      await refreshTicketsForWorkflow(db, env);
      return;
    }
    if (!(TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) return;
    const current = (await getTicketStateFromDb(db, env.workspaceId, env.entity.id)) ?? undefined;
    const deps = await loadDeps(db, env, current);
    await upsertTicket(db, applyTicketEvent(current, env, deps));
  },

  async reset(db: PoolClient): Promise<void> {
    await db.query('DELETE FROM proj_tickets');
  },
};
```

Register it in `apps/server/src/projections/index.ts`, directly AFTER `ticketTypesProjection`:

```ts
import { ticketsProjection } from './tickets';

registerProjection(ticketsProjection);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter server exec vitest run test/proj-tickets.test.ts`
Expected: PASS (8 tests) — including both rebuild tests, which are the freshness gate for this table. The projection-outer one is the stricter of the two: it is the only one that fails if definitions are resolved as "latest" instead of as-of.

- [ ] **Step 6: Commit**

```bash
git add apps/server/migrations/1755672100000_proj-tickets.js apps/server/src/projections/tickets.ts apps/server/src/projections/index.ts apps/server/test/proj-tickets.test.ts
git commit -m "Ticket head state is now a real table fed by the same reducer the fixtures run — field claims keep their claimant and both clocks, and reset-plus-replay reproduces it byte for byte

Two things had to be true for that last clause to survive a workflow republish. The projection resolves a workflow definition as of the position of the event it is applying, not as of now: the verifier rebuilds one projection at a time over the whole ledger, so proj_workflows is already at the newest version when this table replays its first event, and a transition into a state that a later version dropped would look up an id that no longer exists and throw. And publishing a version now folds every ticket on that workflow forward — through the mapping chain for its state id, recomputing its category — because a stored category that a new version has redefined is a lie that rollups, board columns and the overdue sweep all repeat."
```

