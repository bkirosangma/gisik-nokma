### Task 9: Visibility-dependent ingest permissions

**Files:**
- Modify: `apps/server/src/permissions/check-permission.ts` (add `checkVisibilityPermission`; extend `checkPermission` to call it)
- Test: `apps/server/test/permissions/check-visibility-permission.test.ts`

**Interfaces:**
- Consumes: `canSee`, `getResolvedVisibility` (Task 7); `hasProjectAdminRights` (Task 4); `proj_tickets.created_by` (Plan 3 — the head state carries creator provenance; adapt the column name if Plan 3 spelled it differently); `VisibilitySetPayload` (Task 3).
- Produces: `checkVisibilityPermission(db: Queryable, env: EventEnvelope, ctx: PermissionContext): Promise<Refusal | null>`; `checkPermission` (same signature as Task 5) now runs role checks then visibility checks — still the single gate the ingest pipeline calls, unchanged at the call site.

**The checks (exact):**
1. Only ticket-entity events are examined; everything else passed the role gate already.
2. `ticket.created`: guests are refused (`permission.role` — "Guests cannot create tickets."); non-guests must be on the target project (`permission.role`). No admin shortcut — an admin joins the project first (attributed), then creates (Open questions).
3. `visibility.set` whose `payload.ticketId` differs from `entity.id`: refused (`permission.visibility`) before anything else is looked up — a claim must name the ticket it rides on.
4. Every other ticket event (transition, assign, comment, field set, reparent, visibility.set itself): the actor must `canSee` the ticket, else `permission.visibility` — "This ticket is not visible to you." This is also exactly the guest constraint: a guest's `canSee` is true only for tickets explicitly shared with them, so *guests may only act on tickets explicitly visible to them* falls out of the same check.
5. `visibility.set` additionally requires project-admin rights on the ticket's project OR ticket creatorship (`permission.role`).

- [ ] **Step 1: Write the failing planted-defect tests**

```ts
// apps/server/test/permissions/check-visibility-permission.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { checkPermission } from '../../src/permissions/check-permission';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';
import { applyAll, seedGuest, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed';

const WS = 'wks_01';
const PRJ = 'prj_01';

let pool: Pool;
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

function ticketEvent(type: string, ticketId: string, actorId: string, payload: unknown = {}) {
  return testEnvelope({ workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type, payload, actorId });
}

describe('checkVisibilityPermission — planted defects', () => {
  it('planted defect: a guest acting on a ticket not explicitly shared with them is refused', async () => {
    await seedGuest(pool, WS, 'usr_guest');
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' }); // project-mode default
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.transitioned', 'tkt_1', 'usr_guest', { to: 'done' }),
      'usr_guest',
    );
    expect(result).toEqual({
      refused: true,
      rule: 'permission.visibility',
      reason: 'This ticket is not visible to you.',
    });
  });

  it('a guest acting on a ticket explicitly shared with them passes the gate', async () => {
    await seedGuest(pool, WS, 'usr_guest');
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_1', 'explicit', ['usr_guest'])]);
    const result = await checkPermission(
      pool,
      ticketEvent('comment.added', 'tkt_1', 'usr_guest', { body: 'checked' }),
      'usr_guest',
    );
    expect(result).toBeNull();
  });

  it('planted defect: a member acting on another project’s ticket by direct id is refused', async () => {
    await seedMember(pool, WS, 'usr_m', 'member', [{ projectId: 'prj_mine' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_other', ticketId: 'tkt_other' });
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.assigned', 'tkt_other', 'usr_m', { assigneeId: 'usr_m' }),
      'usr_m',
    );
    expect(result).toEqual({
      refused: true,
      rule: 'permission.visibility',
      reason: 'This ticket is not visible to you.',
    });
  });

  it('guests cannot create tickets', async () => {
    await seedGuest(pool, WS, 'usr_guest');
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.created', 'tkt_new', 'usr_guest', { projectId: PRJ }),
      'usr_guest',
    );
    expect(result).toEqual({ refused: true, rule: 'permission.role', reason: 'Guests cannot create tickets.' });
  });

  it('creating a ticket requires being on the project — even for admins', async () => {
    await seedMember(pool, WS, 'usr_adm', 'admin');
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.created', 'tkt_new', 'usr_adm', { projectId: PRJ }),
      'usr_adm',
    );
    expect(result).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'You are not a member of this project, so you cannot create tickets in it.',
    });
  });

  it('a project member creates tickets freely', async () => {
    await seedMember(pool, WS, 'usr_m', 'member', [{ projectId: PRJ }]);
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.created', 'tkt_new', 'usr_m', { projectId: PRJ }),
      'usr_m',
    );
    expect(result).toBeNull();
  });

  it('visibility.set whose payload names a different ticket than its entity is refused', async () => {
    await seedMember(pool, WS, 'usr_m', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' });
    const env = testEnvelope({
      workspaceId: WS,
      entity: { kind: 'ticket', id: 'tkt_1' },
      type: 'visibility.set',
      payload: { ticketId: 'tkt_2', mode: 'workspace' },
      actorId: 'usr_m',
    });
    const result = await checkPermission(pool, env, 'usr_m');
    expect(result).toEqual({
      refused: true,
      rule: 'permission.visibility',
      reason: 'This claim does not name the ticket it is attached to.',
    });
  });

  it('planted defect: a plain member who is neither project admin nor creator cannot set visibility', async () => {
    await seedMember(pool, WS, 'usr_m', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1', createdBy: 'usr_creator' });
    const result = await checkPermission(pool, setVisibilityEnv(WS, 'tkt_1', 'workspace', undefined, 'usr_m'), 'usr_m');
    expect(result).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: "Only a project admin or the ticket's creator can change who sees this ticket.",
    });
  });

  it('the ticket creator may set visibility', async () => {
    await seedMember(pool, WS, 'usr_creator', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1', createdBy: 'usr_creator' });
    const result = await checkPermission(
      pool,
      setVisibilityEnv(WS, 'tkt_1', 'explicit', ['usr_creator'], 'usr_creator'),
      'usr_creator',
    );
    expect(result).toBeNull();
  });

  it('a project admin may set visibility on tickets they can see', async () => {
    await seedMember(pool, WS, 'usr_pa', 'member', [{ projectId: PRJ, projectAdmin: true }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1', createdBy: 'usr_other' });
    const result = await checkPermission(pool, setVisibilityEnv(WS, 'tkt_1', 'project', undefined, 'usr_pa'), 'usr_pa');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/permissions/check-visibility-permission.test.ts`
Expected: FAIL — the guest transition and member direct-id cases return `null` (no visibility gate exists yet); the mismatch and creator cases fail likewise.

- [ ] **Step 3: Implement the visibility gate**

Add to `apps/server/src/permissions/check-permission.ts`:

```ts
import type { VisibilitySetPayload } from '@gisik-nokma/domain';
import { canSee, getResolvedVisibility } from '../visibility/can-see';

async function getTicketCreator(db: Queryable, ticketId: string): Promise<string | null> {
  // Plan 3's head state carries creator provenance; adapt the column
  // name if its proj_tickets spelled it differently.
  const { rows } = await db.query('SELECT created_by FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
  return (rows[0]?.created_by as string | undefined) ?? null;
}

/**
 * Visibility-dependent checks — async because they read projections.
 * Runs after checkRolePermission, still before the rule engine.
 */
export async function checkVisibilityPermission(
  db: Queryable,
  env: EventEnvelope,
  ctx: PermissionContext,
): Promise<Refusal | null> {
  if (env.entity.kind !== 'ticket') return null;

  if (env.type === 'ticket.created') {
    const p = env.payload as { projectId: string };
    if (ctx.eff.workspaceRole === 'guest') {
      return refuse('permission.role', 'Guests cannot create tickets.');
    }
    if (!ctx.eff.projects.has(p.projectId)) {
      // No admin shortcut: joining the project is an attributed event; use it first.
      return refuse('permission.role', 'You are not a member of this project, so you cannot create tickets in it.');
    }
    return null;
  }

  if (env.type === 'visibility.set' && (env.payload as VisibilitySetPayload).ticketId !== env.entity.id) {
    return refuse('permission.visibility', 'This claim does not name the ticket it is attached to.');
  }

  if (!(await canSee(db, ctx.sessionUserId, env.entity.id))) {
    // For guests this is exactly "guests may only act on tickets
    // explicitly visible to them" — their canSee is explicit-only.
    return refuse('permission.visibility', 'This ticket is not visible to you.');
  }

  if (env.type === 'visibility.set') {
    const v = await getResolvedVisibility(db, env.entity.id);
    const creatorId = await getTicketCreator(db, env.entity.id);
    const allowed =
      (v !== null && hasProjectAdminRights(ctx.eff, v.projectId)) || ctx.sessionUserId === creatorId;
    if (!allowed) {
      return refuse('permission.role', "Only a project admin or the ticket's creator can change who sees this ticket.");
    }
  }

  return null;
}
```

And extend `checkPermission` (replacing its final `return`):

```ts
export async function checkPermission(
  db: Queryable,
  env: EventEnvelope,
  sessionUserId: string,
): Promise<Refusal | null> {
  const eff = await resolveEffectiveRole(db, sessionUserId, env.workspaceId);
  const ctx: PermissionContext = { sessionUserId, eff };
  const roleRefusal = checkRolePermission(env, ctx);
  if (roleRefusal) return roleRefusal;
  // Before any membership question: does the project this event names exist at
  // all? Ordering is the point — see Step 3b.
  const projectRefusal = await checkProjectExists(db, env);
  if (projectRefusal) return projectRefusal;
  return checkVisibilityPermission(db, env, ctx);
}
```

- [ ] **Step 3b: `proj_projects`, so a ticket cannot be created into a project nobody founded**

Owner decision 2026-08-26 (coordination doc). Nothing in the series validated that `ticket.created.projectId` names a real project: there was no `proj_projects` anywhere, and `project.created` was a registered event type that nothing projected into a queryable table.

**What covered it by accident, and why that is not coverage.** The membership check in Step 3 refuses an actor who is not a member of the project — so a fabricated `projectId` was usually refused, because nobody is a member of a project that does not exist. But membership is built from `membership.granted` / `project.member_added`, and those accept any non-empty string as a project scope without checking it either. Grant yourself membership on a typo'd id and the ticket is accepted: it lands in `proj_tickets` and `proj_visibility` with a dangling `project_id`, shows on no board and in no project list, and nobody is ever told. And on the paths where the coincidence *did* hold, the user was told the wrong thing — that they were not a member, when the truth is that the project does not exist.

Hence the ordering above: the existence check runs **before** the membership check, so the honest reason wins whenever both would fire.

**Files:**
- Create: `apps/server/migrations/<ts>_proj-projects.cjs`, `apps/server/src/projections/proj-projects.ts`
- Modify: `apps/server/src/projections/index.ts` (register `projProjects` **before** `projTickets` — coordination §8), `apps/server/src/permissions/check-permission.ts`
- Test: `apps/server/test/projections/proj-projects.test.ts`, `apps/server/test/permissions/check-project-exists.test.ts`

The table carries only what the check needs plus the provenance every projection keeps:

```js
// apps/server/migrations/<ts>_proj-projects.cjs
exports.up = (pgm) => {
  pgm.createTable('proj_projects', {
    project_id: { type: 'text', primaryKey: true },
    workspace_id: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    created_by: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true },
  });
  pgm.createIndex('proj_projects', 'workspace_id');
};
exports.down = (pgm) => pgm.dropTable('proj_projects');
```

```ts
// apps/server/src/projections/proj-projects.ts
export const projProjects = {
  name: 'proj_projects',
  tables: ['proj_projects'] as const,

  async apply(env: LedgerEvent, db: Queryable): Promise<void> {
    if (env.type !== 'project.created') return;
    const p = parseProjectCreated(env.payload);
    await db.query(
      `INSERT INTO proj_projects (project_id, workspace_id, name, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id) DO NOTHING`,
      [env.entity.id, env.workspaceId, p.name, env.actorId, env.serverTime],
    );
  },

  async reset(db: Queryable): Promise<void> {
    await db.query('DELETE FROM proj_projects');
  },
};

/** Scoped by workspace: a project id from another workspace is not "found". */
export async function projectExists(
  db: Queryable,
  workspaceId: string,
  projectId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM proj_projects WHERE project_id = $1 AND workspace_id = $2',
    [projectId, workspaceId],
  );
  return rows.length > 0;
}
```

The check covers every event that *names* a project, not only ticket creation — the membership path is the one the hole was actually reachable through:

```ts
// apps/server/src/permissions/check-permission.ts
/** The project this event names, or null if it names none. */
function projectNamedBy(env: EventEnvelope): string | null {
  switch (env.type) {
    case 'ticket.created':
      return (env.payload as { projectId: string }).projectId;
    // membership.granted / revoked name no project: membership is
    // workspace-scoped (owner decision 2026-08-27). Project association is
    // project.member_added / _removed, immediately below.
    case 'project.member_added':
    case 'project.member_removed':
      return env.entity.id;
    default:
      // project.created names the project it is bringing into existence.
      return null;
  }
}

export async function checkProjectExists(db: Queryable, env: EventEnvelope): Promise<Refusal | null> {
  const projectId = projectNamedBy(env);
  if (projectId === null) return null;
  if (await projectExists(db, env.workspaceId, projectId)) return null;
  return refuse('project.unknown', `There is no project ${projectId} in this workspace.`);
}
```

**Tests, both halves planted.** In `proj-projects.test.ts`: a `project.created` lands a row scoped to its workspace and carrying its creator; a re-delivered duplicate does not double-insert; `reset` empties it; and `projectExists` answers `false` for a real project id asked under the wrong workspace. In `check-project-exists.test.ts`, the planted defect is the reachable one — grant yourself membership on a `projectId` that was never founded, then create a ticket in it. Before this step the ticket is accepted; after it, the refusal is `project.unknown` and **not** `permission.role`, and the test asserts the rule name, because a refusal that fires for the wrong reason is what this step exists to remove. A second case asserts the ordering directly: a non-member creating a ticket in a project that does not exist is told the project does not exist, not that they are not a member.

**One thing this does not do.** `proj_projects` has no `project.renamed` handler because no such event is registered; when one is added it lands here.

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/permissions/check-visibility-permission.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Run the full suite — the ingest wiring from Task 5 now enforces visibility with zero call-site changes**

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS, including Task 5's pipeline tests (their envelopes' actors could all see their tickets, or weren't ticket events).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/permissions/check-permission.ts apps/server/test/permissions/check-visibility-permission.test.ts
git commit -m "Guests and outsiders cannot act on tickets they cannot see: the visibility gate joins the role gate at the ingest door, visibility edits demand project-admin rights or creatorship, and a claim must name the ticket it rides on."
```

---

