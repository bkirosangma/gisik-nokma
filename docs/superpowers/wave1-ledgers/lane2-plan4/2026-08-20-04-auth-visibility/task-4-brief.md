### Task 4: proj_memberships — membership history becomes effective roles

**Files:**
- Create: `apps/server/migrations/<ts>_proj-memberships.cjs`
- Create: `apps/server/src/projections/proj-memberships.ts`
- Create: `apps/server/src/permissions/effective-role.ts`
- Create: `apps/server/test/helpers/envelope.ts`
- Modify: `apps/server/src/projections/index.ts` (Plan 1's projection registration point — add `registerProjection(projMemberships)`)
- Test: `apps/server/test/projections/proj-memberships.test.ts`
- Test: `apps/server/test/permissions/effective-role.test.ts`

**Interfaces:**
- Consumes: `EventEnvelope`, `MembershipGrantedPayload` etc. (Task 3); Plan 1's `registerProjection({name, apply, reset})`; `Queryable` (Task 1).
- Produces: table `proj_memberships`; projection object `projMemberships = { name: 'proj_memberships', apply(env, db), reset(db) }`; `EffectiveRole { workspaceRole: WorkspaceRole | null; projects: Map<string, { projectAdmin: boolean }> }`; `resolveEffectiveRole(db: Queryable, userId: string, workspaceId: string): Promise<EffectiveRole>`; `hasProjectAdminRights(eff: EffectiveRole, projectId: string): boolean`; test helper `testEnvelope(overrides)`.

**Role-resolution rules (exact, encoded in `resolveEffectiveRole`):** a user's workspace role is their workspace-scope row's role, or — if they hold only project-scope rows and any of them carries role `'guest'` — `'guest'` (a guest invited to one project is a guest of the workspace); otherwise `null` (not a member). Their project set is every project-scope row; `projectAdmin` is that row's flag. `hasProjectAdminRights` is true for workspace `owner`/`admin` (spec: admins manage projects and people) or a project row with `projectAdmin: true`. This is management rights only — Task 7's `canSee` grants owners/admins NO read bypass (Open questions).

- [ ] **Step 1: Write the envelope test factory**

```ts
// apps/server/test/helpers/envelope.ts
import { ulid } from 'ulidx';
import type { EventEnvelope } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../../src/ledger/event-store';

let seqCounter = 0;

/** Monotonic per-process seq for test ledgers. Reset between suites if exact numbers matter. */
export function nextSeq(): number {
  return ++seqCounter;
}

export function resetSeq(): void {
  seqCounter = 0;
}

/**
 * `clientTime`/`serverTime` are ISO 8601 `Z` strings at the domain boundary
 * and land in `timestamptz` columns (owner decision 2026-08-20). A test that
 * overrides them may state any offset it likes — `appendTestEvent` converts to
 * an instant on the way in — but must expect the equivalent `…Z` on the way
 * back out, because the column stores the moment, not the label.
 */
export function testEnvelope(
  overrides: Partial<LedgerEvent> &
    Pick<EventEnvelope, 'workspaceId' | 'entity' | 'type' | 'payload' | 'actorId'>,
): LedgerEvent {
  const now = new Date().toISOString();
  const seq = nextSeq();
  return {
    id: ulid(),
    version: 1,
    origin: 'web',
    clientTime: now,
    serverTime: now,
    seq,
    // One counter drives both numbers here: `workspace_seq` is Plan 1's
    // per-workspace stream cursor (coordination §18), and a globally monotonic
    // value is unique inside every workspace — so a test can resume at
    // `env.workspaceSeq - 1` and land exactly before that event.
    workspaceSeq: seq,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing projection tests**

```ts
// apps/server/test/projections/proj-memberships.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { membershipId } from '@gisik-nokma/domain';
import { projMemberships } from '../../src/projections/proj-memberships';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';

let pool: Pool;
const WS = 'wks_01';

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

function grant(userId: string, role: 'owner' | 'admin' | 'member' | 'guest') {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'membership', id: membershipId(WS, userId) },
    type: 'membership.granted',
    payload: { userId, role },
    actorId: 'usr_admin',
  });
}

function addToProject(userId: string, projectId: string, projectAdmin = false) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId, projectAdmin },
    actorId: 'usr_admin',
  });
}

async function rows() {
  const res = await pool.query(
    'SELECT user_id, scope_kind, project_id, role, project_admin FROM proj_memberships ORDER BY user_id, scope_kind, project_id',
  );
  return res.rows;
}

describe('proj_memberships apply', () => {
  it('materializes a workspace grant', async () => {
    await projMemberships.apply(grant('usr_1', 'member', 'workspace'), pool);
    expect(await rows()).toEqual([
      { user_id: 'usr_1', scope_kind: 'workspace', project_id: '', role: 'member', project_admin: false },
    ]);
  });

  it('a re-grant updates the role in place — one row per membership identity', async () => {
    await projMemberships.apply(grant('usr_1', 'member', 'workspace'), pool);
    await projMemberships.apply(grant('usr_1', 'admin', 'workspace'), pool);
    expect(await rows()).toEqual([
      { user_id: 'usr_1', scope_kind: 'workspace', project_id: '', role: 'admin', project_admin: false },
    ]);
  });

  // One way off each scope, matching the one way on (owner decision
  // 2026-08-27). Taking someone off a project is project.member_removed and
  // nothing else; membership.revoked takes them out of the workspace. When
  // both events could mean "off this project", removing by one path left the
  // other row standing and an admin believed access was gone when it was not.
  it('project removal deletes the project row and leaves workspace membership', async () => {
    await projMemberships.apply(grant('usr_1', 'member'), pool);
    await projMemberships.apply(addToProject('usr_1', 'prj_1'), pool);
    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'project', id: 'prj_1' },
        type: 'project.member_removed',
        payload: { userId: 'usr_1' },
        actorId: 'usr_admin',
      }),
      pool,
    );
    expect(await rows()).toEqual([
      { user_id: 'usr_1', scope_kind: 'workspace', project_id: '', role: 'member', project_admin: false },
    ]);
  });

  it('workspace revocation deletes every row for that user, project rows included', async () => {
    await projMemberships.apply(grant('usr_1', 'member'), pool);
    await projMemberships.apply(addToProject('usr_1', 'prj_1'), pool);
    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'membership', id: membershipId(WS, 'usr_1') },
        type: 'membership.revoked',
        payload: { userId: 'usr_1' },
        actorId: 'usr_admin',
      }),
      pool,
    );
    // Leaving a project row behind for someone who is no longer in the
    // workspace is the same silent-access failure in a different place.
    expect(await rows()).toEqual([]);
  });

  it('project roster events add and remove project-scope member rows', async () => {
    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'project', id: 'prj_1' },
        type: 'project.member_added',
        payload: { userId: 'usr_2', projectAdmin: true },
        actorId: 'usr_admin',
      }),
      pool,
    );
    expect(await rows()).toEqual([
      { user_id: 'usr_2', scope_kind: 'project', project_id: 'prj_1', role: 'member', project_admin: true },
    ]);

    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'project', id: 'prj_1' },
        type: 'project.member_removed',
        payload: { userId: 'usr_2' },
        actorId: 'usr_admin',
      }),
      pool,
    );
    expect(await rows()).toEqual([]);
  });

  it('rebuilds deterministically: reset + replay reproduces the same rows', async () => {
    const events = [
      grant('usr_1', 'member', 'workspace'),
      grant('usr_2', 'admin', 'workspace'),
      grant('usr_3', 'guest', { projectId: 'prj_1' }),
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'project', id: 'prj_1' },
        type: 'project.member_added',
        payload: { userId: 'usr_1', projectAdmin: false },
        actorId: 'usr_2',
      }),
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'membership', id: membershipId(WS, 'usr_2') },
        type: 'membership.revoked',
        payload: { userId: 'usr_2' },
        actorId: 'usr_1',
      }),
    ];
    for (const env of events) await projMemberships.apply(env, pool);
    const first = await rows();
    await projMemberships.reset(pool);
    expect(await rows()).toEqual([]);
    for (const env of events) await projMemberships.apply(env, pool);
    expect(await rows()).toEqual(first);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/projections/proj-memberships.test.ts`
Expected: FAIL — cannot resolve `../../src/projections/proj-memberships`.

- [ ] **Step 4: Create the migration**

Run (from `apps/server/`): `pnpm exec node-pg-migrate create proj-memberships`, then:

```js
// apps/server/migrations/<ts>_proj-memberships.cjs
/**
 * Projection: membership history → current membership rows.
 * project_id '' is the workspace-scope sentinel (Postgres primary keys
 * cannot contain NULLs; '' never collides with a real ULID).
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE proj_memberships (
      workspace_id  text NOT NULL,
      user_id       text NOT NULL,
      scope_kind    text NOT NULL CHECK (scope_kind IN ('workspace', 'project')),
      project_id    text NOT NULL DEFAULT '',
      role          text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'guest')),
      project_admin boolean NOT NULL DEFAULT false,
      granted_by    text NOT NULL,
      granted_at    timestamptz NOT NULL,
      seq           bigint NOT NULL,
      PRIMARY KEY (workspace_id, user_id, scope_kind, project_id)
    );
    CREATE INDEX proj_memberships_by_user ON proj_memberships (user_id, workspace_id);
    CREATE INDEX proj_memberships_by_project ON proj_memberships (workspace_id, project_id)
      WHERE scope_kind = 'project';
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE proj_memberships;');
};
```

- [ ] **Step 5: Implement the projection**

```ts
// apps/server/src/projections/proj-memberships.ts
import type {
  EventEnvelope,
  MembershipGrantedPayload,
  MembershipRevokedPayload,
  ProjectMemberAddedPayload,
  ProjectMemberRemovedPayload,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable';

const UPSERT = `
  INSERT INTO proj_memberships
    (workspace_id, user_id, scope_kind, project_id, role, project_admin, granted_by, granted_at, seq)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (workspace_id, user_id, scope_kind, project_id)
  DO UPDATE SET role = EXCLUDED.role, project_admin = EXCLUDED.project_admin,
                granted_by = EXCLUDED.granted_by, granted_at = EXCLUDED.granted_at, seq = EXCLUDED.seq`;

export const projMemberships = {
  name: 'proj_memberships',

  async apply(env: EventEnvelope, db: Queryable): Promise<void> {
    switch (env.type) {
      // Membership is workspace-scoped (owner decision 2026-08-27), so this
      // writes the workspace row and only that. Project rows come from
      // project.member_added below, and from nowhere else.
      case 'membership.granted': {
        const p = env.payload as MembershipGrantedPayload;
        await db.query(UPSERT, [
          env.workspaceId, p.userId, 'workspace', '', p.role, false,
          env.actorId, env.serverTime, env.seq,
        ]);
        return;
      }
      case 'membership.revoked': {
        const p = env.payload as MembershipRevokedPayload;
        // Every row, project rows included. Leaving someone on a project after
        // they have been put out of the workspace is the same silent-access
        // failure the scope collapse exists to remove — they would still resolve
        // a project association while belonging to nothing.
        await db.query(
          'DELETE FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2',
          [env.workspaceId, p.userId],
        );
        return;
      }
      case 'project.member_added': {
        const p = env.payload as ProjectMemberAddedPayload;
        await db.query(UPSERT, [
          env.workspaceId, p.userId, 'project', env.entity.id, 'member', p.projectAdmin,
          env.actorId, env.serverTime, env.seq,
        ]);
        return;
      }
      case 'project.member_removed': {
        const p = env.payload as ProjectMemberRemovedPayload;
        await db.query(
          `DELETE FROM proj_memberships
           WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'project' AND project_id = $3`,
          [env.workspaceId, p.userId, env.entity.id],
        );
        return;
      }
      default:
        return; // not a membership event — projections ignore what they do not read
    }
  },

  async reset(db: Queryable): Promise<void> {
    await db.query('TRUNCATE proj_memberships');
  },
};
```

- [ ] **Step 6: Migrate the test DB and run the projection tests**

Run (from `apps/server/`):
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gisik_nokma_test pnpm exec node-pg-migrate up
pnpm vitest run test/projections/proj-memberships.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 7: Write the failing effective-role tests**

```ts
// apps/server/test/permissions/effective-role.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { membershipId } from '@gisik-nokma/domain';
import { projMemberships } from '../../src/projections/proj-memberships';
import { hasProjectAdminRights, resolveEffectiveRole } from '../../src/permissions/effective-role';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';

let pool: Pool;
const WS = 'wks_01';

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

async function seed(type: string, entityId: string, payload: unknown, entityKind: 'membership' | 'project' = 'membership') {
  await projMemberships.apply(
    testEnvelope({
      workspaceId: WS,
      entity: { kind: entityKind, id: entityId },
      type,
      payload,
      actorId: 'usr_admin',
    }),
    pool,
  );
}

describe('resolveEffectiveRole', () => {
  it('a non-member resolves to null with no projects', async () => {
    const eff = await resolveEffectiveRole(pool, 'usr_none', WS);
    expect(eff.workspaceRole).toBeNull();
    expect(eff.projects.size).toBe(0);
  });

  it('workspace role plus project rows resolve together', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_1'), { userId: 'usr_1', role: 'member' });
    await seed('project.member_added', 'prj_1', { userId: 'usr_1', projectAdmin: true }, 'project');
    const eff = await resolveEffectiveRole(pool, 'usr_1', WS);
    expect(eff.workspaceRole).toBe('member');
    expect(eff.projects.get('prj_1')).toEqual({ projectAdmin: true });
  });

  it('a guest grant makes the user a guest of the workspace, on no project', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_acct'), { userId: 'usr_acct', role: 'guest' });
    const eff = await resolveEffectiveRole(pool, 'usr_acct', WS);
    expect(eff.workspaceRole).toBe('guest');
    // A guest reaches work through visibility.set explicit lists, which is what
    // spec §6 says a guest is — not through a project association.
    expect(eff.projects.size).toBe(0);
  });
});

describe('hasProjectAdminRights', () => {
  it('workspace owners and admins hold management rights everywhere', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_own'), { userId: 'usr_own', role: 'owner' });
    const eff = await resolveEffectiveRole(pool, 'usr_own', WS);
    expect(hasProjectAdminRights(eff, 'prj_anything')).toBe(true);
  });

  it('a project admin holds rights on that project only', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_1'), { userId: 'usr_1', role: 'member' });
    await seed('project.member_added', 'prj_1', { userId: 'usr_1', projectAdmin: true }, 'project');
    const eff = await resolveEffectiveRole(pool, 'usr_1', WS);
    expect(hasProjectAdminRights(eff, 'prj_1')).toBe(true);
    expect(hasProjectAdminRights(eff, 'prj_2')).toBe(false);
  });

  it('a plain project member holds no management rights', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_1'), { userId: 'usr_1', role: 'member' });
    await seed('project.member_added', 'prj_1', { userId: 'usr_1', projectAdmin: false }, 'project');
    const eff = await resolveEffectiveRole(pool, 'usr_1', WS);
    expect(hasProjectAdminRights(eff, 'prj_1')).toBe(false);
  });
});
```

- [ ] **Step 8: Run to verify failure, then implement**

Run (from `apps/server/`): `pnpm vitest run test/permissions/effective-role.test.ts` — Expected: FAIL (module missing). Then:

```ts
// apps/server/src/permissions/effective-role.ts
import type { WorkspaceRole } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable';

export interface EffectiveRole {
  /** null = not a member of this workspace at all. */
  workspaceRole: WorkspaceRole | null;
  /** Every project the user is on, with the project-admin flag. */
  projects: Map<string, { projectAdmin: boolean }>;
}

export async function resolveEffectiveRole(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<EffectiveRole> {
  const { rows } = await db.query(
    `SELECT scope_kind, project_id, role, project_admin
     FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );
  let workspaceRole: WorkspaceRole | null = null;
  const projects = new Map<string, { projectAdmin: boolean }>();
  for (const row of rows as Array<{ scope_kind: string; project_id: string; role: WorkspaceRole; project_admin: boolean }>) {
    if (row.scope_kind === 'workspace') workspaceRole = row.role;
    else projects.set(row.project_id, { projectAdmin: row.project_admin });
  }
  // A guest invited to one project is a guest of the workspace: their
  // project-scope grant is their only membership, and it names them guest.
  if (workspaceRole === null && rows.some((r: { scope_kind: string; role: string }) => r.scope_kind === 'project' && r.role === 'guest')) {
    workspaceRole = 'guest';
  }
  return { workspaceRole, projects };
}

/**
 * Management rights over a project: workspace owners/admins (the spec has
 * admins managing projects and people) or the project-admin flag. This is
 * NOT a visibility bypass — canSee never consults it.
 */
export function hasProjectAdminRights(eff: EffectiveRole, projectId: string): boolean {
  return (
    eff.workspaceRole === 'owner' ||
    eff.workspaceRole === 'admin' ||
    eff.projects.get(projectId)?.projectAdmin === true
  );
}
```

Run again — Expected: PASS (6 tests).

- [ ] **Step 9: Register the projection**

In Plan 1's projection registration point (`apps/server/src/projections/index.ts` or equivalent), add:

```ts
import { projMemberships } from './proj-memberships';

registerProjection(projMemberships);
```

Then run the projection verifier to prove the registry accepts it:
Run (from `apps/server/`): `pnpm vitest run` (full suite) and the verify CLI if Plan 1 exposed it as a script, e.g. `pnpm run verify-projections`.
Expected: PASS; verifier reports proj_memberships in its projection list.

- [ ] **Step 10: Commit**

```bash
git add apps/server/migrations apps/server/src/projections apps/server/src/permissions/effective-role.ts apps/server/test
git commit -m "proj_memberships turns membership history into effective roles: one row per membership identity, workspace role plus per-project admin flags, and a guest of one project is a guest of the workspace."
```

---

