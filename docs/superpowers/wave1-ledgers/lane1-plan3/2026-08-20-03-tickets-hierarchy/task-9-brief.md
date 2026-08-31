### Task 9: proj_ticket_types — custom types become readable server state

**Files:**
- Create: `apps/server/migrations/1755672000000_proj-ticket-types.js`
- Create: `apps/server/src/projections/ticket-types.ts`
- Create: `apps/server/test/helpers/db.ts` (skip this file only if Plan 1 already ships an equivalent helper; everything else in this task still happens)
- Test: `apps/server/test/proj-ticket-types.test.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `proj_workflows`)

**Interfaces:**
- Consumes: `registerProjection`, `applyEvent`, `resetProjections` (Plan 1); `ticketTypeDefSchema`, `TicketTypeDef`, `makeEnvelope` (`@gisik-nokma/domain`).
- Produces:
  - Table `proj_ticket_types` (snake_case, per workspace, last definition wins)
  - `getTicketTypeFromDb(db: Pool | PoolClient, workspaceId: string, typeId: string): Promise<TicketTypeDef | null>`
  - `ticketTypesProjection` (the registered `{name, apply, reset}`)

- [ ] **Step 1: Write the migration**

```js
// apps/server/migrations/1755672000000_proj-ticket-types.js
exports.up = (pgm) => {
  pgm.createTable('proj_ticket_types', {
    workspace_id: { type: 'text', notNull: true },
    type_id: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    icon: { type: 'text', notNull: true },
    rank: { type: 'integer', notNull: true },
    workflow_id: { type: 'text', notNull: true },
    fields: { type: 'jsonb', notNull: true, default: '[]' },
    defined_by: { type: 'text', notNull: true },
    defined_at: { type: 'timestamptz', notNull: true },
  });
  pgm.addConstraint('proj_ticket_types', 'proj_ticket_types_pk', {
    primaryKey: ['workspace_id', 'type_id'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('proj_ticket_types');
};
```

- [ ] **Step 2: Write the test DB helper** (skip if Plan 1 ships one — then use Plan 1's in every server test below)

```ts
// apps/server/test/helpers/db.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import migrationRunner from 'node-pg-migrate';
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/gisik_nokma_test';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

/** Migrated pool for integration tests. Callers own pool.end(). */
export async function testPool(): Promise<Pool> {
  await migrationRunner({
    databaseUrl: DATABASE_URL,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => undefined,
  });
  return new Pool({ connectionString: DATABASE_URL });
}

/** Empty ledger + all projections between tests. */
export async function wipe(db: Pool): Promise<void> {
  const { resetProjections } = await import('../../src/projections/index');
  await db.query('DELETE FROM events');
  await resetProjections(db);
}
```

- [ ] **Step 3: Write the failing test**

```ts
// apps/server/test/proj-ticket-types.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { makeEnvelope } from '@gisik-nokma/domain';
import { applyEvent } from '../src/projections/index';
import { getTicketTypeFromDb } from '../src/projections/ticket-types';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';

const db: Pool = await testPool();
beforeEach(async () => wipe(db));
afterAll(async () => db.end());

function typeDefined(payload: object) {
  return makeEnvelope({
    type: 'ticket-type.defined',
    entity: { kind: 'ticket-type', id: (payload as { id: string }).id },
    workspaceId: WS,
    payload,
  });
}

describe('proj_ticket_types', () => {
  it('a defined type becomes readable, scoped to its workspace', async () => {
    await applyEvent(db, typeDefined({
      id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic',
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    }));
    expect(await getTicketTypeFromDb(db, WS, 'invoice')).toEqual({
      id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic',
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    });
    expect(await getTicketTypeFromDb(db, '01J9GWSB000000000000000000', 'invoice')).toBeNull();
  });

  it('last definition wins — types are events', async () => {
    await applyEvent(db, typeDefined({ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] }));
    await applyEvent(db, typeDefined({ id: 'task', name: 'Task', icon: 'check', rank: 5, workflowId: 'wf-basic', fields: [] }));
    expect((await getTicketTypeFromDb(db, WS, 'task'))?.rank).toBe(5);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/proj-ticket-types.test.ts`
Expected: FAIL — cannot find module `../src/projections/ticket-types` (run `pnpm --filter server exec node-pg-migrate up` first if the failure is a missing table instead).

- [ ] **Step 5: Implement the projection**

```ts
// apps/server/src/projections/ticket-types.ts
import type { Pool, PoolClient } from 'pg';
import type { EventEnvelope, TicketTypeDef } from '@gisik-nokma/domain';
import { ticketTypeDefSchema } from '@gisik-nokma/domain';

export const ticketTypesProjection = {
  name: 'proj_ticket_types',

  async apply(env: EventEnvelope, db: PoolClient): Promise<void> {
    if (env.type !== 'ticket-type.defined') return;
    const def = ticketTypeDefSchema.parse(env.payload);
    await db.query(
      `INSERT INTO proj_ticket_types
         (workspace_id, type_id, name, icon, rank, workflow_id, fields, defined_by, defined_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (workspace_id, type_id) DO UPDATE SET
         name = EXCLUDED.name, icon = EXCLUDED.icon, rank = EXCLUDED.rank,
         workflow_id = EXCLUDED.workflow_id, fields = EXCLUDED.fields,
         defined_by = EXCLUDED.defined_by, defined_at = EXCLUDED.defined_at`,
      [env.workspaceId, def.id, def.name, def.icon, def.rank, def.workflowId,
       JSON.stringify(def.fields), env.actorId, env.serverTime],
    );
  },

  async reset(db: PoolClient): Promise<void> {
    await db.query('DELETE FROM proj_ticket_types');
  },
};

export async function getTicketTypeFromDb(
  db: Pool | PoolClient,
  workspaceId: string,
  typeId: string,
): Promise<TicketTypeDef | null> {
  const res = await db.query(
    'SELECT type_id, name, icon, rank, workflow_id, fields FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2',
    [workspaceId, typeId],
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return {
    id: row.type_id, name: row.name, icon: row.icon, rank: row.rank,
    workflowId: row.workflow_id, fields: row.fields,
  };
}
```

Register it in `apps/server/src/projections/index.ts`, directly AFTER `proj_workflows` (order is apply order):

```ts
import { ticketTypesProjection } from './ticket-types';

registerProjection(ticketTypesProjection);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter server exec vitest run test/proj-ticket-types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/server/migrations/1755672000000_proj-ticket-types.js apps/server/src/projections/ticket-types.ts apps/server/src/projections/index.ts apps/server/test/helpers/db.ts apps/server/test/proj-ticket-types.test.ts
git commit -m "Custom ticket types projected per workspace, last definition winning, with who defined them and when kept alongside — the first table the hierarchy checks will read"
```

