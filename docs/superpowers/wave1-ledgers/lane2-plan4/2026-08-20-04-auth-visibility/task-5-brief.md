### Task 5: Pre-engine permission gate — role refusals at the ingest door, and the founding sequence behind it

**Files:**
- Create: `apps/server/src/permissions/check-permission.ts`
- Create: `packages/domain/src/workflows/simple-kanban.ts` (Step 6 — the canonical default workflow, one home)
- Create: `apps/server/src/workspaces/bootstrap-workspace.ts` (Step 6)
- Modify: `apps/server/src/ingest/pipeline.ts` (Plan 1's ingest pipeline — insert the gate between `parseEvent` success and `evaluateEvent`; call the bootstrap after a `workspace.created` is appended)
- Test: `apps/server/test/permissions/check-role-permission.test.ts`
- Test: `packages/domain/test/workflows/simple-kanban.test.ts` (Step 6)

**Interfaces:**
- Consumes: `Refusal` shape from `@gisik-nokma/domain` (contract-fixed: `{refused: true; rule: string; reason: string}`); `EffectiveRole`, `resolveEffectiveRole`, `hasProjectAdminRights` (Task 4); Plan 1's ingest pipeline and `evaluateEvent(env, ctx)`; `WorkflowDef` and `validateWorkflowDef` (Plan 2), `builtinTicketTypeDefs(defaultWorkflowId)` (Plan 3).
- Produces: `PermissionContext { sessionUserId: string; eff: EffectiveRole }`; `checkRolePermission(env: EventEnvelope, ctx: PermissionContext): Refusal | null` (pure); `checkPermission(db: Queryable, env: EventEnvelope, sessionUserId: string): Promise<Refusal | null>` — the single gate the ingest pipeline calls (Task 9 extends it with visibility checks). Rule names used: `'permission.role'`, `'permission.visibility'` (Task 9). Step 6 additionally produces `SIMPLE_KANBAN_TEMPLATE: Omit<WorkflowDef, 'id' | 'version'>` and `simpleKanbanWorkflowDef(workflowId: string): WorkflowDef` in `@gisik-nokma/domain`, and `bootstrapWorkspace(founding: EventEnvelope, append: (env: EventEnvelope) => Promise<void>): Promise<EventEnvelope[]>` in `apps/server`.

**Planted-defect discipline for this task and Task 9:** Plan 2's fixture format (`{name, workflowDef, priorEvents, candidateEvent, expected}` in `packages/rule-engine/fixtures/`) is for *rule-engine* rules — refusals a workflow declares. Permission refusals are PRE-engine and never involve a workflowDef, so they do NOT go into that fixture directory. Their planted defects are ordinary Vitest tests in `apps/server` that construct the defective scenario (the wrong actor, the insufficient role) and assert the exact Refusal object. Same discipline, different harness — do not hunt for a fixtures folder.

- [ ] **Step 1: Write the failing planted-defect tests**

```ts
// apps/server/test/permissions/check-role-permission.test.ts
import { describe, expect, it } from 'vitest';
import { ulid } from 'ulidx';
import { membershipId, type EventEnvelope } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../../src/permissions/effective-role';
import { checkRolePermission } from '../../src/permissions/check-permission';
import { testEnvelope } from '../helpers/envelope';

const WS = 'wks_01';

function eff(
  workspaceRole: EffectiveRole['workspaceRole'],
  projects: Array<[string, boolean]> = [],
): EffectiveRole {
  return { workspaceRole, projects: new Map(projects.map(([id, projectAdmin]) => [id, { projectAdmin }])) };
}

function env(overrides: Partial<EventEnvelope> & Pick<EventEnvelope, 'type' | 'entity' | 'payload'>): EventEnvelope {
  return testEnvelope({ workspaceId: WS, actorId: 'usr_actor', ...overrides });
}

describe('checkRolePermission — planted defects', () => {
  it('refuses a claim submitted as another person', () => {
    const e = env({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: 'tkt_1' },
      payload: {},
      actorId: 'usr_someone_else',
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('admin') })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'You cannot submit a claim as another person.',
    });
  });

  it("refuses a client-submitted event wearing the server's origin", () => {
    const e = env({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: 'tkt_1' },
      payload: {},
      origin: 'server',
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('admin') })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only the server itself may record server-origin events.',
    });
  });

  it('refuses any claim from a non-member of the workspace', () => {
    const e = env({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: 'tkt_1' }, payload: {} });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff(null) })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'You are not a member of this workspace.',
    });
  });

  it('allows any signed-in user to found a workspace — there is no membership to hold yet', () => {
    const e = env({ type: 'workspace.created', entity: { kind: 'workspace', id: WS }, payload: { name: 'New' } });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff(null) })).toBeNull();
  });

  it.each(['workflow.defined', 'ticket-type.defined', 'project.created'] as const)(
    'refuses %s from a plain member, names the rule and the role',
    (type) => {
      const entity =
        type === 'workflow.defined'
          ? { kind: 'workflow' as const, id: ulid() }
          : type === 'ticket-type.defined'
            ? { kind: 'ticket-type' as const, id: ulid() }
            : { kind: 'project' as const, id: ulid() };
      const e = env({ type, entity, payload: {} });
      expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member') })).toEqual({
        refused: true,
        rule: 'permission.role',
        reason: 'Only a workspace owner or admin can do this. Your role is member.',
      });
    },
  );

  it('allows an admin to define workflows', () => {
    const e = env({ type: 'workflow.defined', entity: { kind: 'workflow', id: ulid() }, payload: {} });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('admin') })).toBeNull();
  });

  it('refuses workspace-scope membership grants from below admin', () => {
    const e = env({
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, 'usr_new') },
      payload: { userId: 'usr_new', role: 'member' },
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member') })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can manage workspace membership.',
    });
  });

  // A project admin runs their project's roster, not the workspace's door.
  // Before the 2026-08-27 collapse a project-scoped `membership.granted` let
  // them do both through one event; now the two questions have two events.
  it('lets a project admin manage their own project roster and no other', () => {
    const add = (projectId: string) =>
      env({
        type: 'project.member_added',
        entity: { kind: 'project', id: projectId },
        payload: { userId: 'usr_acct', projectAdmin: false },
      });
    const ctx = { sessionUserId: 'usr_actor', eff: eff('member', [['prj_1', true]]) };
    expect(checkRolePermission(add('prj_1'), ctx)).toBeNull();
    expect(checkRolePermission(add('prj_2'), ctx)).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a project admin can manage who is on this project.',
    });
  });

  it('refuses a project admin who tries to grant workspace membership', () => {
    const e = env({
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, 'usr_acct') },
      payload: { userId: 'usr_acct', role: 'guest' },
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member', [['prj_1', true]]) })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can manage workspace membership.',
    });
  });

  it('refuses project roster changes from a plain project member', () => {
    const e = env({
      type: 'project.member_added',
      entity: { kind: 'project', id: 'prj_1' },
      payload: { userId: 'usr_new', projectAdmin: false },
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member', [['prj_1', false]]) })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a project admin can manage who is on this project.',
    });
  });

  it('lets ordinary ticket work through — the visibility gate (Task 9) owns the rest', () => {
    const e = env({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: 'tkt_1' }, payload: {} });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member', [['prj_1', false]]) })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/permissions/check-role-permission.test.ts`
Expected: FAIL — cannot resolve `../../src/permissions/check-permission`.

- [ ] **Step 3: Implement the role gate**

```ts
// apps/server/src/permissions/check-permission.ts
import type { EventEnvelope, Refusal } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable';
import { hasProjectAdminRights, resolveEffectiveRole, type EffectiveRole } from './effective-role';

export interface PermissionContext {
  sessionUserId: string;
  eff: EffectiveRole;
}

function refuse(rule: string, reason: string): Refusal {
  return { refused: true, rule, reason };
}

/** Event types only workspace owners/admins may ingest. */
const ADMIN_ONLY_TYPES: ReadonlySet<string> = new Set([
  'workflow.defined',
  'ticket-type.defined',
  'project.created',
  // Migration re-homes work other people are doing: it moves a ticket onto a
  // different workflow, so the states it can reach, the rules guarding them
  // and the board column it appears in all change under whoever is holding it.
  // Ordinary ticket edits are a member's business; this is not (coordination
  // doc, "a ticket's workflow is pinned at creation, and moved only
  // deliberately"). Plan 3 owns the event and its structural refusals; the
  // question of who may emit it is this plan's.
  'ticket.workflow_rebound',
]);

/**
 * Pure pre-engine role checks. Runs before evaluateEvent so a
 * permission refusal never reaches the rule engine — permissions are
 * the system's rules, not a workflow's.
 */
export function checkRolePermission(env: EventEnvelope, ctx: PermissionContext): Refusal | null {
  if (env.actorId !== ctx.sessionUserId) {
    return refuse('permission.role', 'You cannot submit a claim as another person.');
  }
  if (env.origin === 'server') {
    return refuse('permission.role', 'Only the server itself may record server-origin events.');
  }
  if (env.type === 'workspace.created') {
    return null; // founding a workspace needs a session, not a membership
  }
  const role = ctx.eff.workspaceRole;
  if (role === null) {
    return refuse('permission.role', 'You are not a member of this workspace.');
  }
  if (ADMIN_ONLY_TYPES.has(env.type) && role !== 'owner' && role !== 'admin') {
    return refuse('permission.role', `Only a workspace owner or admin can do this. Your role is ${role}.`);
  }
  // Membership is workspace-scoped only now, so this is one question rather
  // than a branch on scope: managing who is in the workspace is an owner/admin
  // matter. Who is on a PROJECT is the next check, gated by project admin.
  if (env.type === 'membership.granted' || env.type === 'membership.revoked') {
    if (role !== 'owner' && role !== 'admin') {
      return refuse('permission.role', 'Only a workspace owner or admin can manage workspace membership.');
    }
  }
  if (env.type === 'project.member_added' || env.type === 'project.member_removed') {
    if (!hasProjectAdminRights(ctx.eff, env.entity.id)) {
      return refuse('permission.role', 'Only a project admin can manage who is on this project.');
    }
  }
  return null;
}

/**
 * The single permission gate the ingest pipeline calls. Task 9 extends
 * this with the visibility-dependent checks.
 */
export async function checkPermission(
  db: Queryable,
  env: EventEnvelope,
  sessionUserId: string,
): Promise<Refusal | null> {
  const eff = await resolveEffectiveRole(db, sessionUserId, env.workspaceId);
  const ctx: PermissionContext = { sessionUserId, eff };
  return checkRolePermission(env, ctx);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/permissions/check-role-permission.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Wire the gate into the ingest pipeline**

In Plan 1's `apps/server/src/ingest/pipeline.ts`, at the point where the envelope has passed `parseEvent` and is about to be evaluated, insert the gate. The surrounding lines below are illustrative of Plan 1's pipeline; the inserted block is exact:

```ts
import { checkPermission } from '../permissions/check-permission';

// ... envelope parsed, seq not yet assigned, about to call evaluateEvent ...

const permissionRefusal = await checkPermission(db, env, sessionUserId);
if (permissionRefusal) {
  return permissionRefusal; // surfaces exactly like an engine refusal — same shape, same path
}

const engineResult = evaluateEvent(env, ctx);
```

`sessionUserId` comes from `request.currentUserId` (Task 2's `makeRequireSession`), which the ingest route must now use as a preHandler if Plan 1 left it open. A permission refusal returns through the same response path Plan 1 uses for engine refusals — one refusal surface, one shape.

- [ ] **Step 6: The founding sequence — a new workspace can hold a ticket the moment it exists**

Founding a workspace must leave its founder owning it, or nobody can ever act again. It must also leave the workspace **able to accept its first ticket**, and until the owner decision of 2026-08-26 it did not: nothing in the series emitted a workflow or the built-in ticket types at creation, so the first `ticket.created` in a product-founded workspace was refused `ticket.unknown-type` and the workspace was permanently unusable. **Owner decision (coordination doc, "A new workspace can hold a ticket the moment it exists"): found every workspace with the simple-Kanban template, bound to all four built-in types, changeable immediately afterwards.** The founder is not asked to choose a template — a workspace that cannot accept its first ticket is not a workspace — and nothing about this is permanent: the very next thing an admin may do is publish another workflow and re-point the types (Plan 8's builder), which is ordinary authoring, not an undo.

Three things are load-bearing and an executor must not rearrange them:

1. **The order is workflow → types → grant.** A `ticket-type.defined` naming a workflow that has not been defined yet is refused (coordination doc, same section), so the four type definitions can only follow the `workflow.defined` that gives them something to name. The founder's grant stays last, exactly where it already was. This is safe because the bootstrap appends are server-origin and go through Plan 1's internal append path, **not** through `checkPermission` — the gate is the HTTP door (Step 5), and the server's own record does not knock on it. Nothing in the sequence depends on the founder already being a member.
2. **The bootstrap fires on accept, never on duplicate.** Both of Plan 11's seed CLIs are idempotent by re-submitting the same deterministic `workspace.created` id and counting `duplicate-event-id` as "already present". If the bootstrap fired again on that duplicate, every re-run would append a second workflow and four more type definitions, and Plan 11's "re-run is a no-op" test would be a lie. Hook it to the branch where the append actually happened.
3. **The hook lives in the shared ingest path, not in the route.** `POST /v1/workspaces` (Task 13) and Plan 11's seed CLIs both found workspaces, and they have exactly one founding sequence between them because both go through the ingest service. An executor who puts this in the route layer silently breaks the seeds.

First, the canonical definition gets **one home**. Create `packages/domain/src/workflows/simple-kanban.ts`:

```ts
import type { WorkflowDef } from '../workflows/types.js'; // adapt to Plan 2's WorkflowDef module path

/**
 * The one simple-Kanban definition in the product. Every workspace is founded
 * on a clone of it (Plan 4's bootstrap), and it is the first card in Plan 8's
 * template gallery — the SAME object, not a copy that looks like it. Two
 * copies of one workflow is the drift this series keeps finding, and a
 * bootstrap default that quietly diverged from the gallery card an admin
 * later picks would be invisible until someone compared them by hand.
 *
 * Carries no `id` and no `version`: an id is minted per workspace, and every
 * clone starts at version 1 (spec §4 — templates are cloned, never referenced).
 */
export const SIMPLE_KANBAN_TEMPLATE: Omit<WorkflowDef, 'id' | 'version'> = {
  name: 'Simple kanban',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'todo', rules: [] },
    { from: 'doing', to: 'done', rules: [] },
    { from: 'done', to: 'doing', rules: [] },
  ],
};

/** A publishable clone at version 1. Deep-cloned, so an edited copy can never bleed back. */
export function simpleKanbanWorkflowDef(workflowId: string): WorkflowDef {
  return { ...structuredClone(SIMPLE_KANBAN_TEMPLATE), id: workflowId, version: 1 };
}
```

Export both from the domain barrel. Create `packages/domain/test/workflows/simple-kanban.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateWorkflowDef } from '../../src/workflows/validate.js'; // adapt to Plan 2's path
import { SIMPLE_KANBAN_TEMPLATE, simpleKanbanWorkflowDef } from '../../src/workflows/simple-kanban.js';

describe('the canonical simple-Kanban definition', () => {
  it('clones into a def that validates clean at version 1', () => {
    const def = simpleKanbanWorkflowDef('01JBOOTSTRAPWORKFLOW000001');
    expect(validateWorkflowDef(def)).toEqual([]);
    expect(def.version).toBe(1);
    expect(def.id).toBe('01JBOOTSTRAPWORKFLOW000001');
    expect(def.initialStateId).toBe('todo');
    expect(def.states.some((state) => state.category === 'terminal')).toBe(true);
  });

  it('is deep-cloned — editing a clone never reaches the template', () => {
    const first = simpleKanbanWorkflowDef('01JBOOTSTRAPWORKFLOW000001');
    first.states[0]!.name = 'Mutated';
    expect(SIMPLE_KANBAN_TEMPLATE.states[0]!.name).toBe('To do');
    expect(simpleKanbanWorkflowDef('01JBOOTSTRAPWORKFLOW000002').states[0]!.name).toBe('To do');
  });
});
```

Then the bootstrap itself. Create `apps/server/src/workspaces/bootstrap-workspace.ts`:

```ts
import { ulid } from 'ulidx';
import {
  builtinTicketTypeDefs,
  membershipId,
  simpleKanbanWorkflowDef,
  type EventEnvelope,
} from '@gisik-nokma/domain';

/**
 * Everything a workspace needs to be usable, appended immediately after its
 * `workspace.created` is accepted (owner decision 2026-08-26).
 *
 * ORDER IS LOAD-BEARING: the default workflow first, then the four built-in
 * ticket types that name it, then the founder's owner grant. A
 * `ticket-type.defined` naming an undefined workflow is refused, so the
 * sequence cannot be reordered for tidiness.
 *
 * These are the SERVER's own records: they are appended through Plan 1's
 * internal append path and never pass through `checkPermission`, which is the
 * HTTP door. That is why the grant can come last without the earlier events
 * needing the founder to already be a member.
 */
export async function bootstrapWorkspace(
  founding: EventEnvelope,
  append: (env: EventEnvelope) => Promise<void>,
): Promise<EventEnvelope[]> {
  const workflowDef = simpleKanbanWorkflowDef(ulid());
  const at = founding.serverTime;
  const serverEvent = (
    entity: EventEnvelope['entity'],
    type: string,
    payload: unknown,
  ): EventEnvelope => ({
    id: ulid(),
    workspaceId: founding.workspaceId,
    entity,
    type,
    version: 1,
    payload,
    actorId: founding.actorId,
    origin: 'server',
    clientTime: at,
    serverTime: at,
    seq: 0, // assigned by the same seq-assignment step Plan 1 applies to every appended event
  });

  const sequence: EventEnvelope[] = [
    serverEvent({ kind: 'workflow', id: workflowDef.id }, 'workflow.defined', workflowDef),
    // Fresh entity ULID per ticket-type submission; the payload id is the
    // stable type key and the projection folds by it (Plan 8 design decision 6).
    ...builtinTicketTypeDefs(workflowDef.id).map((def) =>
      serverEvent({ kind: 'ticket-type', id: ulid() }, 'ticket-type.defined', def),
    ),
    serverEvent(
      { kind: 'membership', id: membershipId(founding.workspaceId, founding.actorId) },
      'membership.granted',
      { userId: founding.actorId, role: 'owner' },
    ),
  ];

  for (const event of sequence) {
    await append(event); // Plan 1's internal append path — adapt the name
  }
  return sequence;
}
```

Wire it into the ingest pipeline, on the accepted-and-appended branch only:

```ts
import { bootstrapWorkspace } from '../workspaces/bootstrap-workspace';

// after workspace.created is accepted and appended — NOT on duplicate-event-id,
// which is how both seed CLIs re-run without founding a second time:
if (env.type === 'workspace.created') {
  await bootstrapWorkspace(env, appendAndProject); // Plan 1's internal append path — adapt the name
}
```

Add to `apps/server/test/permissions/check-role-permission.test.ts` an integration test through the pipeline's exported ingest function (adapt the import to Plan 1's actual export):

```ts
import { afterAll, beforeAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { ingestEvent } from '../../src/ingest/pipeline'; // adapt to Plan 1's export
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';

describe('ingest pipeline wiring', () => {
  let pool: Pool;
  beforeAll(() => {
    migrateTestDb();
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('workspace.created leaves its founder as owner in proj_memberships', async () => {
    const e = testEnvelope({
      workspaceId: 'wks_new',
      entity: { kind: 'workspace', id: 'wks_new' },
      type: 'workspace.created',
      payload: { name: 'Founded' },
      actorId: 'usr_founder',
    });
    const result = await ingestEvent(e, { db: pool, sessionUserId: 'usr_founder' });
    expect(result).not.toMatchObject({ refused: true });
    const { rows } = await pool.query(
      "SELECT role FROM proj_memberships WHERE workspace_id = 'wks_new' AND user_id = 'usr_founder' AND scope_kind = 'workspace'",
    );
    expect(rows).toEqual([{ role: 'owner' }]);
  });

  it('founding appends the default workflow, then the four built-in types, then the grant — in that order', async () => {
    const e = testEnvelope({
      workspaceId: 'wks_new',
      entity: { kind: 'workspace', id: 'wks_new' },
      type: 'workspace.created',
      payload: { name: 'Founded' },
      actorId: 'usr_founder',
    });
    await ingestEvent(e, { db: pool, sessionUserId: 'usr_founder' });

    // Ordered by the WORKSPACE cursor, not per-entity `seq` (coordination §18):
    // this sequence spans four entity kinds, so per-entity seq cannot order it.
    const { rows } = await pool.query<{ type: string; payload: Record<string, unknown> }>(
      `SELECT type, payload FROM events WHERE workspace_id = 'wks_new' ORDER BY workspace_seq`,
    );
    expect(rows.map((row) => row.type)).toEqual([
      'workspace.created',
      'workflow.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'membership.granted',
    ]);
    // Every type names the workflow defined one event earlier — the reason the
    // order cannot be rearranged.
    const workflowId = rows[1]!.payload.id as string;
    expect(rows.slice(2, 6).map((row) => row.payload.id)).toEqual(['epic', 'story', 'task', 'sub-task']);
    for (const row of rows.slice(2, 6)) {
      expect(row.payload.workflowId).toBe(workflowId);
    }
    // The default IS the canonical template, not a copy that resembles it.
    const { id: _id, version, ...shape } = rows[1]!.payload as Record<string, unknown> & { id: string; version: number };
    expect(version).toBe(1);
    expect(shape).toEqual(SIMPLE_KANBAN_TEMPLATE);
  });

  it('a workspace can hold a ticket the moment it exists', async () => {
    const founded = await ingestEvent(
      testEnvelope({
        workspaceId: 'wks_new',
        entity: { kind: 'workspace', id: 'wks_new' },
        type: 'workspace.created',
        payload: { name: 'Founded' },
        actorId: 'usr_founder',
      }),
      { db: pool, sessionUserId: 'usr_founder' },
    );
    expect(founded).not.toMatchObject({ refused: true });

    // A project, and the founder onto its roster — Task 9's ingest rule is that
    // a non-guest must be ON the target project, with no admin shortcut. This
    // is the whole legal path from nothing to a first ticket.
    for (const env of [
      testEnvelope({
        workspaceId: 'wks_new',
        entity: { kind: 'project', id: 'prj_first' },
        type: 'project.created',
        payload: { name: 'First project' },
        actorId: 'usr_founder',
      }),
      testEnvelope({
        workspaceId: 'wks_new',
        entity: { kind: 'project', id: 'prj_first' },
        type: 'project.member_added',
        payload: { userId: 'usr_founder', projectAdmin: true },
        actorId: 'usr_founder',
      }),
    ]) {
      expect(await ingestEvent(env, { db: pool, sessionUserId: 'usr_founder' })).not.toMatchObject({ refused: true });
    }

    // The point of the whole decision: this is accepted, where before the
    // bootstrap it was refused `ticket.unknown-type` and the workspace was
    // permanently unusable.
    const created = await ingestEvent(
      testEnvelope({
        workspaceId: 'wks_new',
        entity: { kind: 'ticket', id: 'tkt_first' },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: 'prj_first', parentId: null, title: 'The first thing' },
        actorId: 'usr_founder',
      }),
      { db: pool, sessionUserId: 'usr_founder' },
    );
    expect(created).not.toMatchObject({ refused: true });
    const { rows } = await pool.query("SELECT state_id FROM proj_tickets WHERE ticket_id = 'tkt_first'");
    expect(rows).toEqual([{ state_id: 'todo' }]); // the default workflow's initial state
  });

  it('re-founding with the same event id does not bootstrap a second time', async () => {
    const founding = testEnvelope({
      workspaceId: 'wks_new',
      entity: { kind: 'workspace', id: 'wks_new' },
      type: 'workspace.created',
      payload: { name: 'Founded' },
      actorId: 'usr_founder',
    });
    await ingestEvent(founding, { db: pool, sessionUserId: 'usr_founder' });
    const after = await pool.query("SELECT count(*)::int AS n FROM events WHERE workspace_id = 'wks_new'");

    // Both of Plan 11's seed CLIs re-run by re-submitting the same deterministic
    // event id and counting `duplicate-event-id` as "already present". If the
    // bootstrap fired again here, every re-run would append a second workflow
    // and four more type definitions.
    const again = await ingestEvent(founding, { db: pool, sessionUserId: 'usr_founder' });
    expect(again).toMatchObject({ status: 'invalid', code: 'duplicate-event-id' }); // adapt to Plan 1's result shape
    const now = await pool.query("SELECT count(*)::int AS n FROM events WHERE workspace_id = 'wks_new'");
    expect(now.rows[0].n).toBe(after.rows[0].n);
  });

  it('a member ingesting workflow.defined is refused before the engine runs', async () => {
    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'membership', id: membershipId(WS, 'usr_m') },
        type: 'membership.granted',
        payload: { userId: 'usr_m', role: 'member' },
        actorId: 'usr_admin',
      }),
      pool,
    );
    const e = testEnvelope({
      workspaceId: WS,
      entity: { kind: 'workflow', id: ulid() },
      type: 'workflow.defined',
      payload: {},
      actorId: 'usr_m',
    });
    const result = await ingestEvent(e, { db: pool, sessionUserId: 'usr_m' });
    expect(result).toMatchObject({ refused: true, rule: 'permission.role' });
  });
});
```

(Add the imports the snippet needs — `projMemberships` from Task 4, `SIMPLE_KANBAN_TEMPLATE` from `@gisik-nokma/domain` — to the file's import block. The `ingestEvent` call signature and its duplicate-result shape adapt to Plan 1's actual export; the assertions do not.)

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/workflows/simple-kanban.test.ts` — PASS (2 tests). Then (from `apps/server/`) `pnpm vitest run test/permissions/check-role-permission.test.ts` — PASS.

- [ ] **Step 7: Run the full server suite**

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS — including Plan 1's ingest tests, proving the gate refuses nothing it should not.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/workflows/simple-kanban.ts packages/domain/test/workflows \
  apps/server/src/permissions/check-permission.ts apps/server/src/workspaces apps/server/src/ingest apps/server/test/permissions
git commit -m "Under-privileged claims are refused before the rule engine sees them: identity spoofing, borrowed server origin, and role shortfalls all get the rule named and the reason in plain language — and a founded workspace now arrives usable, with the simple-Kanban default and its four built-in types appended before the founder's own grant."
```

---

