# Extract B — Plan 4 lines 1224–2764 — Tasks 4, 5, 6

Source: `docs/superpowers/plans/2026-08-20-04-auth-visibility.md` lines 1224–2764.

---

## Task 4: proj_memberships — membership history becomes effective roles

### Files
- Create: `apps/server/migrations/<ts>_proj-memberships.cjs`
- Create: `apps/server/src/projections/proj-memberships.ts`
- Create: `apps/server/src/permissions/effective-role.ts`
- Create: `apps/server/test/helpers/envelope.ts`
- Modify: `apps/server/src/projections/index.ts` ("Plan 1's projection registration point — add `registerProjection(projMemberships)`")
- Test: `apps/server/test/projections/proj-memberships.test.ts`
- Test: `apps/server/test/permissions/effective-role.test.ts`

### Interfaces

**Consumes:**
- `EventEnvelope`, `MembershipGrantedPayload`, `MembershipRevokedPayload`, `ProjectMemberAddedPayload`, `ProjectMemberRemovedPayload` — from `@gisik-nokma/domain` (Task 3)
- Plan 1's `registerProjection({name, apply, reset})`
- `Queryable` — from `../db/queryable` (Task 1)
- `ulid` from `ulidx`
- `LedgerEvent` type from `../../src/ledger/event-store` (test helper)

**Produces:**
- Table `proj_memberships` — columns: `workspace_id, user_id, scope_kind, project_id, role, project_admin, granted_by, granted_at, seq`. PK `(workspace_id, user_id, scope_kind, project_id)`. Indexes: `proj_memberships_by_user (user_id, workspace_id)`, `proj_memberships_by_project (workspace_id, project_id) WHERE scope_kind = 'project'`. `project_id` default `''` = workspace-scope sentinel.
- `projMemberships = { name: 'proj_memberships', apply(env: EventEnvelope, db: Queryable): Promise<void>, reset(db: Queryable): Promise<void> }`
- `interface EffectiveRole { workspaceRole: WorkspaceRole | null; projects: Map<string, { projectAdmin: boolean }> }`
- `resolveEffectiveRole(db: Queryable, userId: string, workspaceId: string): Promise<EffectiveRole>`
- `hasProjectAdminRights(eff: EffectiveRole, projectId: string): boolean`
- Test helper: `nextSeq(): number`, `resetSeq(): void`, `testEnvelope(overrides: Partial<LedgerEvent> & Pick<EventEnvelope, 'workspaceId' | 'entity' | 'type' | 'payload' | 'actorId'>): LedgerEvent`

### Role-resolution rules (exact, encoded in `resolveEffectiveRole`)
A user's workspace role is their workspace-scope row's role, or — if they hold only project-scope rows and any of them carries role `'guest'` — `'guest'` (a guest invited to one project is a guest of the workspace); otherwise `null` (not a member). Their project set is every project-scope row; `projectAdmin` is that row's flag. `hasProjectAdminRights` is true for workspace `owner`/`admin` (spec: admins manage projects and people) or a project row with `projectAdmin: true`. This is management rights only — Task 7's `canSee` grants owners/admins NO read bypass (Open questions).

### Apply-event mapping (from implementation)
- `membership.granted` → upsert workspace-scope row (`scope_kind='workspace'`, `project_id=''`)
- `membership.revoked` → DELETE every row (workspace and project) for that `(workspace_id, user_id)`
- `project.member_added` → upsert project-scope row (`scope_kind='project'`, `role` fixed `'member'`, `project_admin` from payload)
- `project.member_removed` → DELETE the specific project-scope row
- default → no-op

### Test counts
- `proj-memberships.test.ts`: 6 tests (workspace grant materializes; re-grant updates in place; project removal deletes project row only; workspace revocation deletes every row; project roster add/remove; rebuild deterministically via reset+replay)
- `effective-role.test.ts`: 6 tests (non-member → null/empty; workspace role + project rows together; guest grant → workspace guest with 0 projects; owner/admin have rights everywhere; project admin has rights on that project only; plain member has no rights)

### planTextClaimsToVerify
- `apps/server/src/projections/index.ts` exists and is "Plan 1's projection registration point" exposing `registerProjection`
- `apps/server/src/db/queryable.ts` exports `Queryable`
- `apps/server/src/ledger/event-store.ts` exports `LedgerEvent`
- `@gisik-nokma/domain` exports `EventEnvelope`, `MembershipGrantedPayload`, `MembershipRevokedPayload`, `ProjectMemberAddedPayload`, `ProjectMemberRemovedPayload`, `membershipId(workspaceId, userId)`, `WorkspaceRole`
- `EventEnvelope`/`LedgerEvent` shape includes fields: `id, version, origin, clientTime, serverTime, seq, workspaceSeq, workspaceId, entity, type, payload, actorId`
- `clientTime`/`serverTime` are ISO 8601 `Z` strings landing in `timestamptz` columns (owner decision 2026-08-20)
- `workspaceSeq` is "Plan 1's per-workspace stream cursor (coordination §18)"
- Helper `migrateTestDb`, `testPool`, `truncateAll` exist in `apps/server/test/helpers/db`
- `pnpm exec node-pg-migrate` CLI usage and `<ts>_proj-memberships.cjs` naming convention
- Owner decision 2026-08-27 establishing "one way off each scope, matching the one way on" (project.member_removed vs membership.revoked)
- Existence of a "verify-projections" CLI script (`pnpm run verify-projections`) as an optional Plan-1-provided verifier

---

## Task 5: Pre-engine permission gate — role refusals at the ingest door, and the founding sequence behind it

### Files
- Create: `apps/server/src/permissions/check-permission.ts`
- Create: `packages/domain/src/workflows/simple-kanban.ts` (Step 6)
- Create: `apps/server/src/workspaces/bootstrap-workspace.ts` (Step 6)
- Modify: `apps/server/src/ingest/pipeline.ts` ("Plan 1's ingest pipeline — insert the gate between `parseEvent` success and `evaluateEvent`; call the bootstrap after a `workspace.created` is appended")
- Test: `apps/server/test/permissions/check-role-permission.test.ts`
- Test: `packages/domain/test/workflows/simple-kanban.test.ts` (Step 6)

### Interfaces

**Consumes:**
- `Refusal` shape from `@gisik-nokma/domain` — **contract-fixed**: `{refused: true; rule: string; reason: string}`
- `EffectiveRole`, `resolveEffectiveRole`, `hasProjectAdminRights` (Task 4)
- Plan 1's ingest pipeline and `evaluateEvent(env, ctx)`
- `WorkflowDef` and `validateWorkflowDef` (Plan 2)
- `builtinTicketTypeDefs(defaultWorkflowId)` (Plan 3)
- `membershipId` from `@gisik-nokma/domain`
- Plan 1's internal append path (referenced as `appendAndProject` / `append` — "adapt the name")
- Plan 1's ingest export `ingestEvent` (referenced in integration test — "adapt to Plan 1's actual export")
- Plan 1's `request.currentUserId` populated via Task 2's `makeRequireSession`

**Produces:**
- `PermissionContext { sessionUserId: string; eff: EffectiveRole }`
- `checkRolePermission(env: EventEnvelope, ctx: PermissionContext): Refusal | null` (pure)
- `checkPermission(db: Queryable, env: EventEnvelope, sessionUserId: string): Promise<Refusal | null>` — the single gate the ingest pipeline calls (Task 9 extends it with visibility checks)
- Rule names: `'permission.role'`, `'permission.visibility'` (latter belongs to Task 9, referenced here only)
- Step 6: `SIMPLE_KANBAN_TEMPLATE: Omit<WorkflowDef, 'id' | 'version'>` in `@gisik-nokma/domain`
- Step 6: `simpleKanbanWorkflowDef(workflowId: string): WorkflowDef` in `@gisik-nokma/domain`
- Step 6: `bootstrapWorkspace(founding: EventEnvelope, append: (env: EventEnvelope) => Promise<void>): Promise<EventEnvelope[]>` in `apps/server`

### Planted-defect discipline (explicit rule stated in plan text)
Plan 2's fixture format (`{name, workflowDef, priorEvents, candidateEvent, expected}` in `packages/rule-engine/fixtures/`) is for *rule-engine* rules — refusals a workflow declares. Permission refusals are PRE-engine and never involve a workflowDef, so they do NOT go into that fixture directory. Their planted defects are ordinary Vitest tests in `apps/server` that construct the defective scenario (the wrong actor, the insufficient role) and assert the exact Refusal object. Same discipline, different harness — do not hunt for a fixtures folder.

### Refusal table — checkRolePermission (verbatim, character-for-character)

| # | Scenario | rule | reason |
|---|---|---|---|
| 1 | Claim submitted as another person (`env.actorId !== ctx.sessionUserId`) | `permission.role` | `You cannot submit a claim as another person.` |
| 2 | Client-submitted event wearing the server's origin (`env.origin === 'server'`) | `permission.role` | `Only the server itself may record server-origin events.` |
| 3 | Any claim from a non-member of the workspace (`role === null`) | `permission.role` | `You are not a member of this workspace.` |
| 4 | `workflow.defined` / `ticket-type.defined` / `project.created` from a plain member | `permission.role` | `` Only a workspace owner or admin can do this. Your role is ${role}. `` — literal for `role='member'`: `Only a workspace owner or admin can do this. Your role is member.` |
| 5 | Workspace-scope `membership.granted`/`membership.revoked` from below admin | `permission.role` | `Only a workspace owner or admin can manage workspace membership.` |
| 6 | `project.member_added`/`project.member_removed` where actor lacks project-admin rights on that project (plain project member, or project admin acting on a different project) | `permission.role` | `Only a project admin can manage who is on this project.` |

Non-refusal (returns `null`) cases explicitly tested:
- `workspace.created` — allowed for any signed-in user regardless of membership (no membership to hold yet)
- `workflow.defined` from an admin — allowed
- `project.member_added` on a project where actor holds `projectAdmin: true` for that specific project — allowed
- Ordinary `ticket.transitioned` from a plain member (no project role listed in the test) — allowed; "the visibility gate (Task 9) owns the rest"

### ADMIN_ONLY_TYPES set (from implementation)
`workflow.defined`, `ticket-type.defined`, `project.created`, `ticket.workflow_rebound` — the last one is called out specifically: "Migration re-homes work other people are doing... Ordinary ticket edits are a member's business; this is not (coordination doc, 'a ticket's workflow is pinned at creation, and moved only deliberately'). Plan 3 owns the event and its structural refusals; the question of who may emit it is this plan's."

### checkRolePermission control flow (order matters, from implementation)
1. actorId spoofing check → refuse
2. server-origin check → refuse
3. `workspace.created` → allow immediately (before membership check)
4. `role === null` → refuse (not a member)
5. `ADMIN_ONLY_TYPES.has(type)` and role not owner/admin → refuse
6. `membership.granted`/`membership.revoked` and role not owner/admin → refuse
7. `project.member_added`/`project.member_removed` and `!hasProjectAdminRights(eff, entity.id)` → refuse
8. else → `null`

### Test counts
- `check-role-permission.test.ts` Step 1–4: **12 tests** (per Step 4: "Expected: PASS (12 tests)") — includes an `it.each` over 3 event types counted as 3 tests within that 12.
- `simple-kanban.test.ts`: 2 tests
- Step 6 adds an integration describe block ("ingest pipeline wiring") to `check-role-permission.test.ts` with 5 additional tests: founder ends up owner; founding order is workflow→4 types→grant; workspace can hold a ticket immediately; re-founding with same event id does not double-bootstrap; a member ingesting `workflow.defined` is refused before the engine runs.

### Founding-sequence rules (exact, load-bearing per plan text)
1. **Order: workflow → types → grant.** A `ticket-type.defined` naming an undefined workflow is refused (coordination doc), so type defs must follow `workflow.defined`. Founder's grant is last. Bootstrap appends are server-origin, go through Plan 1's internal append path, NOT through `checkPermission` (that gate is the HTTP door only).
2. **Bootstrap fires on accept, never on duplicate.** Must hook to the branch where the append actually happened, not on `duplicate-event-id`, or Plan 11's idempotent seed CLIs would double-append on every re-run.
3. **Hook lives in the shared ingest path, not the route.** Both `POST /v1/workspaces` (Task 13) and Plan 11's seed CLIs must share exactly one founding sequence by going through the ingest service.

### bootstrapWorkspace sequence (exact order)
`workflow.defined` (simple-kanban clone) → `ticket-type.defined` × 4 (epic, story, task, sub-task, each naming the new workflowId) → `membership.granted` (founder, role `owner`).

### SIMPLE_KANBAN_TEMPLATE (exact shape, verbatim from plan)
```ts
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
```
`simpleKanbanWorkflowDef(workflowId)` returns `{...structuredClone(SIMPLE_KANBAN_TEMPLATE), id: workflowId, version: 1}`.

### planTextClaimsToVerify
- `apps/server/src/ingest/pipeline.ts` exists; has a point after `parseEvent` success, before `evaluateEvent(env, ctx)`, where the gate is inserted
- Plan 1's `evaluateEvent(env, ctx)` export exists
- Plan 1's ingest export is named `ingestEvent` (marked "adapt to Plan 1's actual export" — unverified naming)
- Plan 1's duplicate-event result shape is `{ status: 'invalid', code: 'duplicate-event-id' }` (marked "adapt to Plan 1's result shape")
- Plan 1's internal append function referenced as `appendAndProject` (marked "adapt the name")
- `@gisik-nokma/domain` exports `builtinTicketTypeDefs(workflowId)` returning defs with `id` in `['epic','story','task','sub-task']` and each carrying `workflowId`
- `packages/domain/src/workflows/types.js` (or Plan 2's actual path) exports `WorkflowDef`
- `packages/domain/src/workflows/validate.js` (or Plan 2's actual path) exports `validateWorkflowDef`
- Task 2's `makeRequireSession` populates `request.currentUserId`
- `proj_tickets` table has a `state_id` column, and ticket creation with `typeId: 'task'` on the default workflow lands `state_id = 'todo'`
- Events table `events` has columns `workspace_id, type, payload` and orders by `workspace_seq`
- Coordination doc §18 defines `workspace_seq` as the per-workspace stream cursor
- Owner decision 2026-08-26: "A new workspace can hold a ticket the moment it exists" — bootstrap founding decision
- Plan 8 design decision 6 referenced re: ticket-type entity id being a fresh ULID per submission while payload id is the stable type key
- Plan 11's two seed CLIs are idempotent via deterministic `workspace.created` event id + `duplicate-event-id` handling

---

## Task 6: proj_visibility — every ticket's resolved audience

### Files
- Create: `apps/server/migrations/<ts>_proj-visibility.cjs`
- Create: `apps/server/src/projections/proj-visibility.ts`
- Modify: `apps/server/src/projections/index.ts` (register `projVisibility`)
- Test: `apps/server/test/projections/proj-visibility.test.ts`

### Interfaces

**Consumes:**
- `VisibilitySetPayload` (Task 3, from `@gisik-nokma/domain`)
- Plan 3's `ticket.created` (payload carries `projectId` and optional `parentId` — "proj_tickets tracks parentId, so the event must carry it; adapt field names to Plan 3's actual payload")
- Plan 3's `ticket.reparented` (payload `{parentId: string | null}`)
- Plan 1's `registerProjection`

**Produces:**
- Table `proj_visibility` — columns: `ticket_id (PK), workspace_id, project_id, parent_id, own_mode, own_user_ids, resolved_mode, resolved_user_ids, resolved_from, seq`. `own_mode` CHECK IN `('workspace','project','explicit','inherit')`. `resolved_mode` CHECK IN `('workspace','project','explicit')`. Indexes: `proj_visibility_children (parent_id)`, `proj_visibility_by_workspace (workspace_id)`, `proj_visibility_by_project (workspace_id, project_id)`.
- `projVisibility = { name: 'proj_visibility', apply(env, db), reset(db) }`
- `reResolveSubtree(db: Queryable, ticketId: string): Promise<void>` (exported for tests)
- Columns explicitly noted as read by later tasks: `ticket_id, workspace_id, project_id, parent_id, own_mode, own_user_ids, resolved_mode, resolved_user_ids, resolved_from`

### The resolution algorithm (exact, as specified in plan prose)
```
resolve(t):
  if own_mode(t) ≠ 'inherit':
      resolved(t) = (own_mode(t), own_user_ids(t)), resolved_from(t) = t
  else if t has a parent:
      resolved(t) = resolved(parent), resolved_from(t) = resolved_from(parent)
  else:  # a root with no authored mode
      resolved(t) = ('project', []), resolved_from(t) = ''      # workspace default for roots
```

**Re-resolution** happens on exactly three events, always as `resolve(t)` followed by recursion into children whose `own_mode = 'inherit'`, pruning at any child with an authored mode:
- `ticket.created` — insert row (`own_mode 'inherit'`), then `resolve(t)`. No recursion (no children yet).
- `ticket.reparented` — update `parent_id`, then re-resolve t's inherit-subtree.
- `visibility.set` — update `own_mode`/`own_user_ids`, then re-resolve t's inherit-subtree.

Events arrive in ledger order: a parent's row always exists (and is resolved) before any child references it; a missing parent is treated defensively as a root.

### Test counts
"Expected: PASS (8 tests)" per Step 5. Enumerated: (1) root with no authored mode → project default; (2) child inherits through chain; (3) ancestor visibility change re-resolves every descendant; (4) re-resolution prunes at authored descendant; (5) reparenting re-resolves moved subtree against new chain; (6) reparenting to root falls back to project default; (7) setting back to 'inherit' re-attaches to chain; (8) rebuild deterministically via reset+replay. That is 8 `it(...)` blocks.

### planTextClaimsToVerify
- `@gisik-nokma/domain` exports `VisibilitySetPayload`
- Plan 3's `ticket.created` payload includes `projectId` and optional `parentId` field named exactly `parentId`
- Plan 3's `ticket.reparented` payload is exactly `{parentId: string | null}`
- `apps/server/src/projections/index.ts` supports `registerProjection(projVisibility)` alongside `projMemberships` (Task 4) without conflict
- `apps/server/test/helpers/db` exports `migrateTestDb`, `testPool`, `truncateAll` (shared with Task 4)
- `pnpm exec node-pg-migrate create proj-visibility` CLI convention consistent with Task 4's migration tooling
- A `verify-projections` mechanism is aware of `proj_visibility` after registration (implied by Step 6: "verify-projections aware of proj_visibility")

---

## Cross-task contradictions / flags observed within this range

1. **Task 4 vs Task 5 role-check semantics**: Task 4's `hasProjectAdminRights` and effective-role tests show a project row's `role` column is always fixed to `'member'` by the `projMemberships.apply` implementation for `project.member_added` (the UPSERT always writes `'member'` as `role` for scope_kind='project', regardless of `projectAdmin` flag). This is consistent internally but worth flagging: `role` on a project-scope row is not itself meaningful — only `project_admin` is — yet the migration's CHECK constraint allows `role IN ('owner','admin','member','guest')` on project rows too. Not a contradiction per se, but the schema permits states (`role='owner'` on a project-scope row) that no code path ever produces; not exercised by any test in this range.

2. **Task 5 Step 6 test asserts an ordering key that spans multiple entity kinds** ("Ordered by the WORKSPACE cursor, not per-entity `seq`... this sequence spans four entity kinds, so per-entity seq cannot order it") — this depends on `events.workspace_seq` existing as a column, which is asserted as a Plan 1 claim but not defined anywhere within this extract's range; flagged as a planTextClaimsToVerify item already, not a contradiction, but the adaptation map should confirm the column name exactly (`workspace_seq` vs `workspaceSeq` used in `testEnvelope`).

3. **No direct file-creation collision** was found between Task 4, Task 5, and Task 6 — each creates distinct files. Task 5 and Task 6 both modify/touch `apps/server/src/projections/index.ts`-adjacent registration only indirectly (Task 5 does not touch it; only Task 4 and Task 6 do, for different projections), so no collision there either.

4. **Task 5's `checkRolePermission` refuses `workspace.created` path is order-sensitive**: the implementation checks `workspace.created` return `null` BEFORE the "not a member" check (step 3 before step 4 in the control-flow list above), which is consistent with the test "allows any signed-in user to found a workspace." No contradiction, but worth flagging as load-bearing ordering for the adaptation map's fidelity check, since a naive reordering (checking membership first) would break workspace founding.
