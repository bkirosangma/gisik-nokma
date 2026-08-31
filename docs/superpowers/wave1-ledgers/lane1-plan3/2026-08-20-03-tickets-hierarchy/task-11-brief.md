### Task 11: proj_rollups — derived child progress, direct children only, never authored

**Files:**
- Create: `apps/server/migrations/1755672200000_proj-rollups.js`
- Create: `apps/server/src/projections/rollups.ts`
- Test: `apps/server/test/proj-rollups.test.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `proj_tickets` — order is load-bearing)

**Interfaces:**
- Consumes: `proj_tickets` rows (Task 10 — this projection reads them, so it MUST be registered after `ticketsProjection`; on rebuild the registry replays in the same order, keeping it deterministic).
- Produces:
  - Table `proj_rollups`
  - `rollupsProjection` (the registered `{name, apply, reset}`)
  - `type RollupRow = { parentTicketId: string; workspaceId: string; projectId: string; totalChildren: number; openChildren: number; activeChildren: number; terminalChildren: number }`
  - `getRollup(db, workspaceId, parentTicketId): Promise<RollupRow | null>`

**Semantics:** DIRECT children only. Per-category counts plus total; the invariant's "open children" (spec §4: non-terminal) is `totalChildren - terminalChildren`. Direct-only suffices by induction — the parent-terminal refusal holds at every level, so a terminal child's own subtree was already settled when it went terminal. On `ticket.reparented` the projection recomputes every parent in the ticket's project (old and new parent are always in the same project — cross-project reparents are refused) and deletes rows for parents left childless; on `ticket.created`/`ticket.transitioned` it recomputes just the one affected parent. Nothing else ever writes this table: derived progress is never authored.

**And it consumes `workflow.defined`, in the same transaction as the fold** (owner decision 2026-08-26, design decision 10). Every count here is a `FILTER (WHERE state_category = …)`, so a refresh that stopped at `proj_tickets` would leave each parent's progress bar stating a distribution that no longer exists — and would make the parent-terminal invariant refuse closes that are legitimate, because `open_children` would still count a child whose state the new version has just declared terminal. Derived numbers are the last place this product can afford to lag.

**Recomputation scope, chosen and argued:** the distinct parents of tickets whose `workflow_id` is the published workflow. That is a superset of the strictly-affected set (parents of tickets whose *category* actually changed) and it is deliberately the superset, because the smaller set is not computable here. This projection runs **after** `proj_tickets` for the same event — that ordering is what makes its reads of the ticket table correct — so by the time it looks, the pre-fold categories are gone. Recovering them would mean a side channel from one projection to the next, and two projections that talk to each other are no longer independently rebuildable, which is the property Plan 1's verifier rests on. The superset costs a scan and some idempotent rewrites; it never costs correctness, because `recomputeParent` writes the same numbers when nothing changed. A parent whose children are all on other workflows is untouched, which is correct: a rollup is a function of its children's categories, and those did not move.

- [ ] **Step 1: Write the migration**

```js
// apps/server/migrations/1755672200000_proj-rollups.js
exports.up = (pgm) => {
  pgm.createTable('proj_rollups', {
    parent_ticket_id: { type: 'text', primaryKey: true },
    workspace_id: { type: 'text', notNull: true },
    project_id: { type: 'text', notNull: true },
    total_children: { type: 'integer', notNull: true },
    open_children: { type: 'integer', notNull: true },
    active_children: { type: 'integer', notNull: true },
    terminal_children: { type: 'integer', notNull: true },
  });
  pgm.createIndex('proj_rollups', ['workspace_id', 'project_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('proj_rollups');
};
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/server/test/proj-rollups.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { EventEnvelope } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../src/ledger/event-store';
import { applyEvent, resetProjections } from '../src/projections/index';
import { getRollup } from '../src/projections/rollups';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const OTHER = '01J9GTKB000000000000000000';
const C1 = '01J9GCHA000000000000000000';
const C2 = '01J9GCHB000000000000000000';

const ALL_TRANSITIONS = [
  { from: '*', to: 'todo', rules: [] },
  { from: '*', to: 'doing', rules: [] },
  { from: '*', to: 'done', rules: [] },
];

const WF_DEFINED = makeEnvelope({
  type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, workspaceId: WS,
  payload: {
    id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: ALL_TRANSITIONS,
  },
});

/** v2 says Doing is finished work. Every ticket standing in it changes category without moving. */
const WF_V2_RECATEGORISED = makeEnvelope({
  type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, workspaceId: WS,
  payload: {
    id: 'wf-basic', version: 2, name: 'Basic', initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'terminal' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: ALL_TRANSITIONS,
  },
});

/** Stamp both counters the way ingest does — workspace stream cursor (coordination §18) plus per-entity seq. */
function asLedger(events: EventEnvelope[]): LedgerEvent[] {
  const perEntity = new Map<string, number>();
  return events.map((env, index) => {
    const key = `${env.entity.kind}:${env.entity.id}`;
    const seq = (perEntity.get(key) ?? 0) + 1;
    perEntity.set(key, seq);
    return { ...env, seq, workspaceSeq: index + 1 };
  });
}

function typeDefined(id: string, rank: number) {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id }, workspaceId: WS,
    payload: { id, name: id[0].toUpperCase() + id.slice(1), icon: 'check', rank, workflowId: 'wf-basic', fields: [] } });
}
function created(id: string, typeId: string, parentId: string | null, title: string) {
  return makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId, projectId: PROJECT, parentId, title } });
}
function ticketEvent(id: string, type: string, payload: object) {
  return makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, payload });
}

const SEED_EVENTS = [
  WF_DEFINED, typeDefined('story', 2), typeDefined('task', 3),
  created(PARENT, 'story', null, 'Quarterly filings'),
  created(OTHER, 'story', null, 'Counter opening'),
  created(C1, 'task', PARENT, 'File GST'),
  created(C2, 'task', PARENT, 'File TDS'),
];

const db: Pool = await testPool();
beforeEach(async () => wipe(db));
afterAll(async () => db.end());

async function applyAll(ledger: LedgerEvent[]): Promise<void> {
  for (const env of ledger) await applyEvent(db, env);
}

/**
 * One ledger, stamped once, applied in prefixes — so an assertion made half
 * way through sees the same cursors the whole run will.
 */
const SEED_LENGTH = SEED_EVENTS.length;
function ledgerOf(...extra: EventEnvelope[]): LedgerEvent[] {
  return asLedger([...SEED_EVENTS, ...extra]);
}

describe('proj_rollups', () => {
  it('counts direct children per category as they are created and transition', async () => {
    const ledger = ledgerOf(
      ticketEvent(C1, 'ticket.transitioned', { toStateId: 'doing' }),
      ticketEvent(C2, 'ticket.transitioned', { toStateId: 'done' }),
    );
    await applyAll(ledger.slice(0, SEED_LENGTH));
    expect(await getRollup(db, WS, PARENT)).toEqual({
      parentTicketId: PARENT, workspaceId: WS, projectId: PROJECT,
      totalChildren: 2, openChildren: 2, activeChildren: 0, terminalChildren: 0,
    });
    await applyAll(ledger.slice(SEED_LENGTH));
    expect(await getRollup(db, WS, PARENT)).toMatchObject({
      totalChildren: 2, openChildren: 0, activeChildren: 1, terminalChildren: 1,
    });
  });

  it('a childless ticket has no rollup row — absence, not zeros, because nothing is invented', async () => {
    await applyAll(asLedger(SEED_EVENTS));
    expect(await getRollup(db, WS, C1)).toBeNull();
  });

  it('reparent moves the counts between parents and removes an emptied parent row', async () => {
    const ledger = ledgerOf(
      ticketEvent(C1, 'ticket.reparented', { newParentId: OTHER }),
      ticketEvent(C2, 'ticket.reparented', { newParentId: OTHER }),
    );
    await applyAll(ledger.slice(0, SEED_LENGTH + 1));
    expect(await getRollup(db, WS, PARENT)).toMatchObject({ totalChildren: 1 });
    expect(await getRollup(db, WS, OTHER)).toMatchObject({ totalChildren: 1 });
    await applyAll(ledger.slice(SEED_LENGTH + 1));
    expect(await getRollup(db, WS, PARENT)).toBeNull();
    expect(await getRollup(db, WS, OTHER)).toMatchObject({ totalChildren: 2 });
  });

  it('a re-categorising v2 moves the parent counts in the SAME transaction as the ticket fold', async () => {
    const ledger = ledgerOf(
      ticketEvent(C1, 'ticket.transitioned', { toStateId: 'doing' }),
      WF_V2_RECATEGORISED,
    );
    await applyAll(ledger.slice(0, SEED_LENGTH + 1));
    expect(await getRollup(db, WS, PARENT)).toMatchObject({
      totalChildren: 2, openChildren: 1, activeChildren: 1, terminalChildren: 0,
    });

    // Nobody moves a ticket. The workflow changes what "Doing" means.
    await applyAll(ledger.slice(SEED_LENGTH + 1));

    expect(await getRollup(db, WS, PARENT)).toMatchObject({
      totalChildren: 2, openChildren: 1, activeChildren: 0, terminalChildren: 1,
    });
    // And the parent-terminal invariant now sees one open child, not two —
    // this is the number that decides whether closing PARENT is refused.
    const rollup = await getRollup(db, WS, PARENT);
    expect((rollup?.totalChildren ?? 0) - (rollup?.terminalChildren ?? 0)).toBe(1);
  });

  it('rebuild-and-diff: reset and replay reproduces the rollups exactly, republish included', async () => {
    const ledger = ledgerOf(
      ticketEvent(C1, 'ticket.transitioned', { toStateId: 'doing' }),
      WF_V2_RECATEGORISED,
      ticketEvent(C2, 'ticket.reparented', { newParentId: OTHER }),
    );
    await applyAll(ledger);
    const first = (await db.query('SELECT * FROM proj_rollups ORDER BY parent_ticket_id')).rows;
    await resetProjections(db);
    await applyAll(ledger);
    const second = (await db.query('SELECT * FROM proj_rollups ORDER BY parent_ticket_id')).rows;
    expect(second).toEqual(first);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/proj-rollups.test.ts`
Expected: FAIL — cannot find module `../src/projections/rollups`.

- [ ] **Step 4: Implement the projection**

```ts
// apps/server/src/projections/rollups.ts
import type { Pool, PoolClient } from 'pg';
import { ticketCreatedPayload } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../ledger/event-store';

export type RollupRow = {
  parentTicketId: string;
  workspaceId: string;
  projectId: string;
  totalChildren: number;
  openChildren: number;
  activeChildren: number;
  terminalChildren: number;
};

export async function getRollup(
  db: Pool | PoolClient,
  workspaceId: string,
  parentTicketId: string,
): Promise<RollupRow | null> {
  const res = await db.query(
    'SELECT * FROM proj_rollups WHERE workspace_id = $1 AND parent_ticket_id = $2',
    [workspaceId, parentTicketId],
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return {
    parentTicketId: row.parent_ticket_id, workspaceId: row.workspace_id, projectId: row.project_id,
    totalChildren: row.total_children, openChildren: row.open_children,
    activeChildren: row.active_children, terminalChildren: row.terminal_children,
  };
}

/** Recompute one parent's direct-children counts from proj_tickets; drop the row when childless. */
async function recomputeParent(db: PoolClient, workspaceId: string, parentId: string): Promise<void> {
  await db.query(
    `INSERT INTO proj_rollups
       (parent_ticket_id, workspace_id, project_id, total_children, open_children, active_children, terminal_children)
     SELECT $2, $1, min(project_id), count(*),
            count(*) FILTER (WHERE state_category = 'open'),
            count(*) FILTER (WHERE state_category = 'active'),
            count(*) FILTER (WHERE state_category = 'terminal')
     FROM proj_tickets WHERE workspace_id = $1 AND parent_id = $2
     HAVING count(*) > 0
     ON CONFLICT (parent_ticket_id) DO UPDATE SET
       total_children = EXCLUDED.total_children, open_children = EXCLUDED.open_children,
       active_children = EXCLUDED.active_children, terminal_children = EXCLUDED.terminal_children`,
    [workspaceId, parentId],
  );
  await db.query(
    `DELETE FROM proj_rollups WHERE workspace_id = $1 AND parent_ticket_id = $2
       AND NOT EXISTS (SELECT 1 FROM proj_tickets WHERE workspace_id = $1 AND parent_id = $2)`,
    [workspaceId, parentId],
  );
}

/** Reparent: old and new parent share a project (cross-project is refused), so recompute the whole project's parents. */
async function recomputeProject(db: PoolClient, workspaceId: string, projectId: string): Promise<void> {
  const parents = await db.query(
    `SELECT DISTINCT parent_id FROM proj_tickets
     WHERE workspace_id = $1 AND project_id = $2 AND parent_id IS NOT NULL`,
    [workspaceId, projectId],
  );
  for (const row of parents.rows) {
    await recomputeParent(db, workspaceId, row.parent_id);
  }
  await db.query(
    `DELETE FROM proj_rollups WHERE workspace_id = $1 AND project_id = $2
       AND parent_ticket_id NOT IN (
         SELECT parent_id FROM proj_tickets
         WHERE workspace_id = $1 AND project_id = $2 AND parent_id IS NOT NULL)`,
    [workspaceId, projectId],
  );
}

/**
 * Refresh on publish (design decision 10). `proj_tickets` has already folded
 * every row on this workflow by the time this runs, so the pre-fold categories
 * are unrecoverable here — which is exactly why the scope is "every parent of
 * a ticket on this workflow" rather than "every parent whose child's category
 * moved". Narrowing it would need a channel from one projection into the next,
 * and projections that talk to each other stop being independently
 * rebuildable. `recomputeParent` is idempotent, so the extra parents cost work
 * and nothing else.
 */
async function recomputeParentsOnWorkflow(db: PoolClient, workspaceId: string, workflowId: string): Promise<void> {
  const parents = await db.query(
    `SELECT DISTINCT parent_id FROM proj_tickets
     WHERE workspace_id = $1 AND workflow_id = $2 AND parent_id IS NOT NULL
     ORDER BY parent_id`,
    [workspaceId, workflowId],
  );
  for (const row of parents.rows) {
    await recomputeParent(db, workspaceId, row.parent_id);
  }
}

export const rollupsProjection = {
  name: 'proj_rollups',

  /** Runs AFTER ticketsProjection for the same event — registration order is apply order. */
  async apply(env: LedgerEvent, db: PoolClient): Promise<void> {
    if (env.type === 'workflow.defined') {
      // Not a ticket event, but every count in this table is a FILTER on
      // state_category, and a published version has just redefined what some
      // of those categories mean. Letting the fold stop at proj_tickets would
      // leave each parent's progress stating a distribution that no longer
      // exists — and would make the parent-terminal invariant refuse closes
      // that are now legitimate.
      await recomputeParentsOnWorkflow(db, env.workspaceId, env.entity.id);
      return;
    }
    if (env.type === 'ticket.created') {
      const p = ticketCreatedPayload.parse(env.payload);
      if (p.parentId !== null) await recomputeParent(db, env.workspaceId, p.parentId);
      return;
    }
    if (env.type === 'ticket.transitioned') {
      const res = await db.query(
        'SELECT parent_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
        [env.workspaceId, env.entity.id],
      );
      const parentId = res.rows[0]?.parent_id ?? null; // unchanged by a transition
      if (parentId !== null) await recomputeParent(db, env.workspaceId, parentId);
      return;
    }
    if (env.type === 'ticket.reparented') {
      const res = await db.query(
        'SELECT project_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
        [env.workspaceId, env.entity.id],
      );
      if (res.rowCount > 0) await recomputeProject(db, env.workspaceId, res.rows[0].project_id);
    }
  },

  async reset(db: PoolClient): Promise<void> {
    await db.query('DELETE FROM proj_rollups');
  },
};
```

Register it in `apps/server/src/projections/index.ts`, directly AFTER `ticketsProjection` (this order is load-bearing — the rollup reads the ticket table the same event just updated):

```ts
import { rollupsProjection } from './rollups';

registerProjection(rollupsProjection);
```

- [ ] **Step 5: Run the test to verify it passes, then the verify-projections CLI once**

Run: `pnpm --filter server exec vitest run test/proj-rollups.test.ts`
Expected: PASS (5 tests).
Run: `pnpm --filter server verify-projections` (Plan 1's rebuild-and-diff CLI, name per Coordination) with `DATABASE_URL=$TEST_DATABASE_URL`
Expected: reports zero drift for `proj_ticket_types`, `proj_tickets`, and `proj_rollups` — **including after a workflow republish**, which is the case that drifted before design decision 10.

- [ ] **Step 6: Commit**

```bash
git add apps/server/migrations/1755672200000_proj-rollups.js apps/server/src/projections/rollups.ts apps/server/src/projections/index.ts apps/server/test/proj-rollups.test.ts
git commit -m "Derived child progress as a projection nothing else may write: direct children counted per category, childless parents absent rather than zeroed, reparents recomputed project-wide because the refusals guarantee both parents share one

A published workflow version recomputes them too. Every count here is a FILTER on state_category, so when a version moves Doing from active to terminal the parents' progress is wrong the instant proj_tickets folds — and the parent-terminal invariant would go on refusing closes that the new workflow has made legitimate. The scope is every parent of a ticket on that workflow, not only the parents whose counts actually moved: this projection runs after the fold and can no longer see what the categories were, and buying that back would mean one projection reading another's intermediate state, which is the property the rebuild verifier rests on."
```

