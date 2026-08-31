### Task 6: proj_visibility — every ticket's resolved audience

**Files:**
- Create: `apps/server/migrations/<ts>_proj-visibility.cjs`
- Create: `apps/server/src/projections/proj-visibility.ts`
- Modify: `apps/server/src/projections/index.ts` (register `projVisibility`)
- Test: `apps/server/test/projections/proj-visibility.test.ts`

**Interfaces:**
- Consumes: `VisibilitySetPayload` (Task 3); Plan 3's `ticket.created` (payload carries `projectId` and optional `parentId` — proj_tickets tracks parentId, so the event must carry it; adapt field names to Plan 3's actual payload) and `ticket.reparented` (payload `{parentId: string | null}`); Plan 1's `registerProjection`.
- Produces: table `proj_visibility`; projection object `projVisibility = { name: 'proj_visibility', apply(env, db), reset(db) }`; `reResolveSubtree(db: Queryable, ticketId: string): Promise<void>` (exported for tests). Columns later tasks read: `ticket_id, workspace_id, project_id, parent_id, own_mode, own_user_ids, resolved_mode, resolved_user_ids, resolved_from`.

**The resolution algorithm (exact — this is the heart of visibility):**

A ticket has an *authored* mode (`own_mode`: what `visibility.set` last claimed, `'inherit'` if never set) and a *resolved* mode (`resolved_mode`: the audience that actually applies — never `'inherit'`).

```
resolve(t):
  if own_mode(t) ≠ 'inherit':
      resolved(t) = (own_mode(t), own_user_ids(t)), resolved_from(t) = t
  else if t has a parent:
      resolved(t) = resolved(parent), resolved_from(t) = resolved_from(parent)
  else:  # a root with no authored mode
      resolved(t) = ('project', []), resolved_from(t) = ''      # workspace default for roots
```

**Re-resolution** happens on exactly three events, and always as `resolve(t)` followed by recursion into children whose `own_mode = 'inherit'`, pruning at any child with an authored mode (an authored subtree cannot be affected by anything above it):

- `ticket.created` — insert the row (`own_mode 'inherit'`), then `resolve(t)`. A new ticket has no children, so no recursion.
- `ticket.reparented` — update `parent_id`, then re-resolve t's inherit-subtree: the ticket now inherits from a different chain, and everything inheriting *from it* follows.
- `visibility.set` — update `own_mode`/`own_user_ids`, then re-resolve t's inherit-subtree: an ancestor's visibility change reaches every descendant that inherits, and stops dead at the first authored descendant.

Events arrive in ledger order, so a parent's row always exists (and is resolved) before any child references it; a missing parent is treated defensively as a root.

- [ ] **Step 1: Create the migration**

Run (from `apps/server/`): `pnpm exec node-pg-migrate create proj-visibility`, then:

```js
// apps/server/migrations/<ts>_proj-visibility.cjs
/**
 * Projection: each ticket's authored visibility mode and its RESOLVED
 * audience (inherit chains walked, never 'inherit'). resolved_from is
 * the ticket whose authored mode won ('' = project default for roots).
 * The audience is stored as a mode + optional user list, NOT a flattened
 * per-user table — membership changes then never force re-materialization;
 * canSee joins mode against proj_memberships at read time.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE proj_visibility (
      ticket_id         text PRIMARY KEY,
      workspace_id      text NOT NULL,
      project_id        text NOT NULL,
      parent_id         text,
      own_mode          text NOT NULL DEFAULT 'inherit'
                        CHECK (own_mode IN ('workspace', 'project', 'explicit', 'inherit')),
      own_user_ids      text[] NOT NULL DEFAULT '{}',
      resolved_mode     text NOT NULL
                        CHECK (resolved_mode IN ('workspace', 'project', 'explicit')),
      resolved_user_ids text[] NOT NULL DEFAULT '{}',
      resolved_from     text NOT NULL DEFAULT '',
      seq               bigint NOT NULL
    );
    CREATE INDEX proj_visibility_children ON proj_visibility (parent_id);
    CREATE INDEX proj_visibility_by_workspace ON proj_visibility (workspace_id);
    CREATE INDEX proj_visibility_by_project ON proj_visibility (workspace_id, project_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE proj_visibility;');
};
```

- [ ] **Step 2: Write the failing resolution tests**

```ts
// apps/server/test/projections/proj-visibility.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { projVisibility } from '../../src/projections/proj-visibility';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';

let pool: Pool;
const WS = 'wks_01';
const PRJ = 'prj_01';

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

function created(ticketId: string, parentId?: string) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { projectId: PRJ, ...(parentId ? { parentId } : {}) },
    actorId: 'usr_1',
  });
}

function setVis(ticketId: string, mode: string, userIds?: string[]) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'visibility.set',
    payload: { ticketId, mode, ...(userIds ? { userIds } : {}) },
    actorId: 'usr_1',
  });
}

function reparented(ticketId: string, parentId: string | null) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.reparented',
    payload: { parentId },
    actorId: 'usr_1',
  });
}

async function resolved(ticketId: string) {
  const { rows } = await pool.query(
    'SELECT own_mode, resolved_mode, resolved_user_ids, resolved_from FROM proj_visibility WHERE ticket_id = $1',
    [ticketId],
  );
  return rows[0];
}

async function apply(...envs: ReturnType<typeof testEnvelope>[]) {
  for (const env of envs) await projVisibility.apply(env, pool);
}

describe('proj_visibility resolution', () => {
  it("a root with no authored mode resolves to the workspace default: 'project'", async () => {
    await apply(created('tkt_root'));
    expect(await resolved('tkt_root')).toEqual({
      own_mode: 'inherit',
      resolved_mode: 'project',
      resolved_user_ids: [],
      resolved_from: '',
    });
  });

  it('a child inherits its parent’s resolved audience through the chain', async () => {
    await apply(created('tkt_p'), setVis('tkt_p', 'explicit', ['usr_a']), created('tkt_c', 'tkt_p'), created('tkt_g', 'tkt_c'));
    expect(await resolved('tkt_g')).toEqual({
      own_mode: 'inherit',
      resolved_mode: 'explicit',
      resolved_user_ids: ['usr_a'],
      resolved_from: 'tkt_p',
    });
  });

  it('an ancestor visibility change re-resolves every inheriting descendant', async () => {
    await apply(created('tkt_p'), created('tkt_c', 'tkt_p'), created('tkt_g', 'tkt_c'));
    await apply(setVis('tkt_p', 'workspace'));
    expect((await resolved('tkt_c')).resolved_mode).toBe('workspace');
    expect((await resolved('tkt_g')).resolved_mode).toBe('workspace');
  });

  it('re-resolution prunes at an authored descendant — an authored subtree cannot be reached from above', async () => {
    await apply(created('tkt_p'), created('tkt_c', 'tkt_p'), created('tkt_g', 'tkt_c'));
    await apply(setVis('tkt_c', 'explicit', ['usr_b']));
    await apply(setVis('tkt_p', 'workspace'));
    expect(await resolved('tkt_c')).toMatchObject({ resolved_mode: 'explicit', resolved_user_ids: ['usr_b'], resolved_from: 'tkt_c' });
    expect(await resolved('tkt_g')).toMatchObject({ resolved_mode: 'explicit', resolved_user_ids: ['usr_b'], resolved_from: 'tkt_c' });
  });

  it('reparenting re-resolves the moved subtree against its new chain', async () => {
    await apply(
      created('tkt_a'), setVis('tkt_a', 'workspace'),
      created('tkt_b'), setVis('tkt_b', 'explicit', ['usr_c']),
      created('tkt_child', 'tkt_a'),
    );
    expect((await resolved('tkt_child')).resolved_mode).toBe('workspace');
    await apply(reparented('tkt_child', 'tkt_b'));
    expect(await resolved('tkt_child')).toMatchObject({
      resolved_mode: 'explicit',
      resolved_user_ids: ['usr_c'],
      resolved_from: 'tkt_b',
    });
  });

  it('reparenting to root falls back to the project default', async () => {
    await apply(created('tkt_a'), setVis('tkt_a', 'workspace'), created('tkt_child', 'tkt_a'));
    await apply(reparented('tkt_child', null));
    expect(await resolved('tkt_child')).toMatchObject({ resolved_mode: 'project', resolved_from: '' });
  });

  it("setting a ticket back to 'inherit' re-attaches it to its chain", async () => {
    await apply(created('tkt_p'), setVis('tkt_p', 'workspace'), created('tkt_c', 'tkt_p'));
    await apply(setVis('tkt_c', 'explicit', ['usr_d']));
    expect((await resolved('tkt_c')).resolved_mode).toBe('explicit');
    await apply(setVis('tkt_c', 'inherit'));
    expect(await resolved('tkt_c')).toMatchObject({ resolved_mode: 'workspace', resolved_from: 'tkt_p' });
  });

  it('rebuilds deterministically: reset + replay reproduces every row', async () => {
    const events = [
      created('tkt_p'),
      created('tkt_c', 'tkt_p'),
      setVis('tkt_p', 'explicit', ['usr_a']),
      created('tkt_g', 'tkt_c'),
      setVis('tkt_c', 'project'),
      reparented('tkt_g', 'tkt_p'),
      setVis('tkt_p', 'workspace'),
    ];
    for (const env of events) await projVisibility.apply(env, pool);
    const snapshot = await pool.query('SELECT * FROM proj_visibility ORDER BY ticket_id');
    await projVisibility.reset(pool);
    for (const env of events) await projVisibility.apply(env, pool);
    const rebuilt = await pool.query('SELECT * FROM proj_visibility ORDER BY ticket_id');
    expect(rebuilt.rows).toEqual(snapshot.rows);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run (from `apps/server/`):
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gisik_nokma_test pnpm exec node-pg-migrate up
pnpm vitest run test/projections/proj-visibility.test.ts
```
Expected: FAIL — cannot resolve `../../src/projections/proj-visibility`.

- [ ] **Step 4: Implement the projection**

```ts
// apps/server/src/projections/proj-visibility.ts
import type { EventEnvelope, VisibilitySetPayload } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable';

interface VisibilityRow {
  ticket_id: string;
  parent_id: string | null;
  own_mode: 'workspace' | 'project' | 'explicit' | 'inherit';
  own_user_ids: string[];
  resolved_mode: 'workspace' | 'project' | 'explicit';
  resolved_user_ids: string[];
  resolved_from: string;
}

async function getRow(db: Queryable, ticketId: string): Promise<VisibilityRow | null> {
  const { rows } = await db.query(
    `SELECT ticket_id, parent_id, own_mode, own_user_ids, resolved_mode, resolved_user_ids, resolved_from
     FROM proj_visibility WHERE ticket_id = $1`,
    [ticketId],
  );
  return (rows[0] as VisibilityRow | undefined) ?? null;
}

/** resolve(t) from the plan: own mode wins; else parent's resolution; else project default. */
async function resolveOne(db: Queryable, ticketId: string): Promise<void> {
  const row = await getRow(db, ticketId);
  if (!row) return;
  let resolvedMode: string;
  let resolvedUserIds: string[];
  let resolvedFrom: string;
  if (row.own_mode !== 'inherit') {
    resolvedMode = row.own_mode;
    resolvedUserIds = row.own_mode === 'explicit' ? row.own_user_ids : [];
    resolvedFrom = row.ticket_id;
  } else {
    const parent = row.parent_id ? await getRow(db, row.parent_id) : null;
    if (parent) {
      resolvedMode = parent.resolved_mode;
      resolvedUserIds = parent.resolved_user_ids;
      resolvedFrom = parent.resolved_from;
    } else {
      resolvedMode = 'project'; // the workspace default for roots
      resolvedUserIds = [];
      resolvedFrom = '';
    }
  }
  await db.query(
    `UPDATE proj_visibility
     SET resolved_mode = $2, resolved_user_ids = $3, resolved_from = $4
     WHERE ticket_id = $1`,
    [ticketId, resolvedMode, resolvedUserIds, resolvedFrom],
  );
}

/**
 * Re-resolve ticketId and every descendant that inherits, pruning at any
 * child with an authored mode: nothing above an authored node can change
 * what that node's subtree resolves to.
 */
export async function reResolveSubtree(db: Queryable, ticketId: string): Promise<void> {
  await resolveOne(db, ticketId);
  const { rows } = await db.query(
    'SELECT ticket_id, own_mode FROM proj_visibility WHERE parent_id = $1 ORDER BY ticket_id',
    [ticketId],
  );
  for (const child of rows as Array<{ ticket_id: string; own_mode: string }>) {
    if (child.own_mode === 'inherit') await reResolveSubtree(db, child.ticket_id);
  }
}

export const projVisibility = {
  name: 'proj_visibility',

  async apply(env: EventEnvelope, db: Queryable): Promise<void> {
    switch (env.type) {
      case 'ticket.created': {
        const p = env.payload as { projectId: string; parentId?: string };
        await db.query(
          `INSERT INTO proj_visibility
             (ticket_id, workspace_id, project_id, parent_id, own_mode, own_user_ids,
              resolved_mode, resolved_user_ids, resolved_from, seq)
           VALUES ($1, $2, $3, $4, 'inherit', '{}', 'project', '{}', '', $5)
           ON CONFLICT (ticket_id) DO NOTHING`,
          [env.entity.id, env.workspaceId, p.projectId, p.parentId ?? null, env.seq],
        );
        await resolveOne(db, env.entity.id); // a fresh ticket has no children yet
        return;
      }
      case 'ticket.reparented': {
        const p = env.payload as { parentId: string | null };
        await db.query('UPDATE proj_visibility SET parent_id = $2, seq = $3 WHERE ticket_id = $1', [
          env.entity.id, p.parentId, env.seq,
        ]);
        await reResolveSubtree(db, env.entity.id);
        return;
      }
      case 'visibility.set': {
        const p = env.payload as VisibilitySetPayload;
        await db.query(
          'UPDATE proj_visibility SET own_mode = $2, own_user_ids = $3, seq = $4 WHERE ticket_id = $1',
          [p.ticketId, p.mode, p.userIds ?? [], env.seq],
        );
        await reResolveSubtree(db, p.ticketId);
        return;
      }
      default:
        return;
    }
  },

  async reset(db: Queryable): Promise<void> {
    await db.query('TRUNCATE proj_visibility');
  },
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/projections/proj-visibility.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Register the projection and run everything**

In `apps/server/src/projections/index.ts`:

```ts
import { projVisibility } from './proj-visibility';

registerProjection(projVisibility);
```

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS — full suite, verify-projections aware of proj_visibility.

- [ ] **Step 7: Commit**

```bash
git add apps/server/migrations apps/server/src/projections apps/server/test/projections/proj-visibility.test.ts
git commit -m "proj_visibility resolves every ticket's audience: authored modes win, inherit chains walk to the nearest authored ancestor, roots default to project, and re-resolution on reparent or ancestor change stops dead at the first authored descendant."
```

---

