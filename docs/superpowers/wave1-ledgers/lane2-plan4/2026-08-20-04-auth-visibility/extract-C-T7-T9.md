# Extract C — Plan 4 (auth-visibility), lines 2765–3954: Tasks 7, 8, 9

## Task 7: canSee — the one visibility decision

### Files
- Create: `apps/server/src/visibility/can-see.ts`
- Create: `apps/server/src/visibility/visible-tickets.ts`
- Create: `apps/server/test/helpers/seed.ts`
- Test: `apps/server/test/visibility/can-see.test.ts`
- Test: `apps/server/test/visibility/visible-tickets.test.ts`

### Interfaces — Consumes
- `proj_visibility` (Task 6)
- `resolveEffectiveRole` / `EffectiveRole` (Task 4)
- `proj_tickets` (Plan 3)

### Interfaces — Produces
```ts
interface ResolvedVisibility {
  workspaceId: string;
  projectId: string;
  resolvedMode: 'workspace' | 'project' | 'explicit';
  resolvedUserIds: string[];
}
function canSeeResolved(eff: EffectiveRole, userId: string, v: ResolvedVisibility): boolean
async function getResolvedVisibility(db: Queryable, ticketId: string): Promise<ResolvedVisibility | null>
async function canSee(db: Queryable, userId: string, ticketId: string): Promise<boolean>
async function listVisibleTickets(db: Queryable, userId: string, workspaceId: string): Promise<Array<Record<string, unknown>>>
```
Seed helpers (in `test/helpers/seed.ts`): `applyAll`, `seedMember`, `seedGuest`, `seedTicket`, `setVisibilityEnv`.

```ts
async function applyAll(db: Queryable, envs: EventEnvelope[]): Promise<void>
async function seedMember(db: Queryable, workspaceId: string, userId: string, role: 'owner'|'admin'|'member', projects?: Array<{ projectId: string; projectAdmin?: boolean }>): Promise<void>
async function seedGuest(db: Queryable, workspaceId: string, userId: string): Promise<void>
interface SeedTicketArgs { workspaceId: string; projectId: string; ticketId: string; parentId?: string; title?: string; createdBy?: string; }
async function seedTicket(db: Queryable, args: SeedTicketArgs): Promise<void>
function setVisibilityEnv(workspaceId: string, ticketId: string, mode: 'workspace'|'project'|'explicit'|'inherit', userIds?: string[], actorId?: string): EventEnvelope
```

### Decision table (exact, `canSeeResolved` implements precisely this)

| viewer's workspace role | resolved_mode 'workspace' | 'project' | 'explicit' |
|---|---|---|---|
| null (non-member) | no | no | no |
| guest | **no** | **no** | only if listed |
| member / admin / owner | yes | only if on the project | only if listed |

Notes from plan text:
- Guests see ONLY tickets explicitly shared with them (spec §6) — a guest belongs to the workspace and to no project (2026-08-27 membership collapse).
- The **owner** reads everything in the workspace (owner decision 2026-08-27) — disclosed, not hidden.
- **Admins** get no bypass: an admin not on a project does not see its project-mode tickets; an unlisted admin does not see explicit-mode tickets.
- The `explicit` list is exactly the authored list — creator and assignee are not implicitly appended.

### Test/step counts
- Step 2 (`can-see.test.ts`): described as producing 7 tests total (Step 5 says "Expected: PASS (7 tests)"). Test blocks: 5 `it` in `canSeeResolved` describe block + 3 `it` in `canSee — against the real projections` describe block = 8 `it` blocks visible in the text, but the plan explicitly states "Expected: PASS (7 tests)" at Step 5. **Flag: this is a discrepancy — see Contradictions section.**
- Step 6 (`visible-tickets.test.ts`): 2 `it` blocks; Step 7 says "Expected: PASS (1 test, 4 viewers asserted)" — refers to the first test only; a second test ("the owner lists every ticket...") exists after that. **Flag: possible ambiguity — see Contradictions.**
- Step 8: full suite run, no count given.

### planTextClaimsToVerify
- `@gisik-nokma/domain` exports `membershipId` and `EventEnvelope` type.
- `apps/server/src/db/queryable` exports a `Queryable` type.
- `apps/server/src/projections/proj-memberships` exports `projMemberships` with an `apply(env, db)` method.
- `apps/server/src/projections/proj-visibility` exports `projVisibility` with an `apply(env, db)` method.
- `apps/server/test/helpers/envelope` exports `testEnvelope`.
- Event type `membership.granted` exists and accepts payload `{ userId, role }`.
- Event type `project.member_added` exists and accepts payload `{ userId, projectAdmin }`.
- Event type `ticket.created` exists and accepts payload `{ projectId, parentId? }`.
- Event type `visibility.set` exists and accepts payload `{ ticketId, mode, userIds? }`.
- `proj_tickets` table exists with columns: `ticket_id, workspace_id, project_id, parent_id, title, created_by` (plan says "the minimal columns this plan's reads touch" and instructs to extend if Plan 3's table has more NOT NULL columns).
- `apps/server/src/permissions/effective-role` exports `EffectiveRole` type with shape `{ workspaceRole: 'owner'|'admin'|'member'|'guest'|null; projects: Map<string, { projectAdmin: boolean }> }` and `resolveEffectiveRole(db, userId, workspaceId)`.
- `apps/server/test/helpers/db` exports `migrateTestDb`, `testPool`, `truncateAll`.
- `proj_visibility` table has columns: `workspace_id, project_id, ticket_id, resolved_mode, resolved_user_ids` (queried as `SELECT workspace_id, project_id, resolved_mode, resolved_user_ids FROM proj_visibility WHERE ticket_id = $1`).
- Plan 3's `proj_tickets` primary key column is named `ticket_id` (used in JOIN `v.ticket_id = t.ticket_id`).

---

## Task 8: Read enforcement — 404s, the restricted-parent placeholder, provenance untouched

### Files
- Create: `apps/server/src/routes/tickets.ts`
- Modify: `apps/server/src/app.ts` (register the ticket routes, passing the pool and auth from the builder)
- Create: `apps/server/test/helpers/ledger.ts`
- Test: `apps/server/test/routes/tickets-read.test.ts`

### Interfaces — Consumes
- `makeRequireSession` + `Auth` (Task 2)
- `canSee` / `listVisibleTickets` (Task 7)
- `proj_tickets` (Plan 3)
- the `events` ledger table (Plan 1 — see Cross-plan path assumptions)
- `signInWithPhone` from Task 2's `test/helpers/session.ts`
- `LedgerEvent` type from `apps/server/src/ledger/event-store`

### Interfaces — Produces
```ts
function registerTicketRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void
// serves:
// GET /v1/workspaces/:workspaceId/tickets
// GET /v1/workspaces/:workspaceId/tickets/:ticketId
// GET /v1/workspaces/:workspaceId/tickets/:ticketId/events

type ParentRef =
  | { kind: 'ticket'; id: string; title: string }
  | { kind: 'restricted'; id: string };

// single-read response shape:
// { ticket: <proj_tickets row>, parent: null | ParentRef }  (Task 10 adds `rollup`)

async function appendTestEvent(db: Queryable, env: LedgerEvent): Promise<void>
```

### Honesty decisions encoded (spec §6, exact, verbatim)
- "A direct read of an invisible ticket is `404 {error: 'not_found'}` — invisible and nonexistent are indistinguishable, so a member probing another project's ids learns nothing. The ONE deliberate existence leak is the restricted-parent placeholder, reachable only through a child the viewer can already see."
- "A visible child under an invisible parent returns `parent: { kind: 'restricted', id }` — existence, no title, never posing as parentless. (`kind: 'ticket'` carries `title`; `kind: 'restricted'` structurally cannot.)"
- "The history endpoint returns full ledger envelopes — `actor_id`, `client_time`, `server_time` and all — for anyone who can see the ticket. Provenance is never redacted from someone entitled to the state; there is no 'anonymized' serialization path to drift into."

### Refusal / response bodies (verbatim, exact)
- Not-found body: `{ error: 'not_found' }` — HTTP 404, used identically for: invisible ticket by direct read, nonexistent ticket, projection-lag guard (ticket passed `canSee` but row missing from `proj_tickets`), and history read of an invisible ticket.
- Restricted parent shape (exact, tested with `toEqual`): `{ kind: 'restricted', id: 'tkt_parent' }` — test explicitly asserts `expect(parent).not.toHaveProperty('title')`.
- Visible parent shape (exact): `{ kind: 'ticket', id: 'tkt_parent', title: 'Open plan' }`.

### appendTestEvent helper — notes (verbatim commentary)
- Comment states: "`workspace_seq` is NOT NULL in Plan 1's schema — the stream cursor is part of a stored event, so the helper writes the one `testEnvelope` assigned. Adapt column names if Plan 1's events table differs — see Cross-plan path assumptions."
- "BOTH time columns are `timestamptz` (owner decision 2026-08-20, 'time is Asia/Kolkata'), so this helper feeds pg INSTANTS — `Date` values — rather than the envelope's ISO strings... Whatever offset the envelope's ISO string carried, the stored value is the moment it named; readback is normalized to `…Z`."
- INSERT statement columns (exact, from code block):
```sql
INSERT INTO events
   (id, workspace_id, entity_kind, entity_id, type, version, payload,
    actor_id, origin, client_time, server_time, seq, workspace_seq)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
```

### client_time note (verbatim, "settled, no longer conditional")
"Plan 1's `events` table stores **both** clocks as `timestamptz` (owner decision 2026-08-20, "time is Asia/Kolkata"; the earlier verbatim-text `client_time` is gone). pg therefore returns `Date` objects, and Fastify's JSON serializer emits them as ISO 8601 `Z` at millisecond precision — which is exactly what the fixture above claimed, so the assertion compares string to string with no coercion. The one thing a test here must NOT do is assert a verbatim `+05:30` readback: an event submitted with that offset is stored as the instant it named and reads back as the equivalent `…Z`. The invariant is that the *values* survive untouched — the actor and both instants, unredacted — never the offset label the submitting device happened to attach."

### Test/step counts
- Step 5: "Expected: PASS (6 tests)." Test file contains 6 `it` blocks: (1) member reading another project's ticket → 404 identical to nonexistent, (2) list endpoint returns viewer's slice, (3) planted defect — restricted parent, (4) visible parent with kind ticket + title, (5) planted defect — provenance never redacted, (6) history of invisible ticket is 404. Matches (6 tests confirmed).
- Step 6: register routes in `app.ts`; full suite run, no count given.

### planTextClaimsToVerify
- `apps/server/src/auth/auth` exports `createAuth` and `Auth` type.
- `apps/server/src/auth/magic-link-sender` exports `LogMagicLinkSender`.
- `apps/server/src/auth/otp-sender` exports `LogOtpSender`.
- `apps/server/src/auth/routes` exports `registerAuthRoutes`.
- `apps/server/src/auth/require-session` exports `makeRequireSession`.
- `apps/server/test/helpers/session` exports `signInWithPhone(app, otpSender, phone): Promise<string>`.
- Route `GET /api/auth/get-session` exists, returns `{ user: { id } }` on Bearer auth.
- `createAuth` accepts config `{ pool, otpSender, magicLinkSender, baseUrl, secret }`.
- Fastify `request.currentUserId` is populated by `requireSession` preHandler (used directly in route handlers without decoration shown).
- `proj_tickets` table columns: `ticket_id, parent_id, title` at minimum (queried via `SELECT * FROM proj_tickets WHERE ticket_id = $1` and `SELECT ticket_id, title FROM proj_tickets WHERE ticket_id = $1`).
- `events` table columns: `id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq` (queried directly in the history route) plus `workspace_seq` (NOT NULL, used only in insert helper).
- `events` table can be filtered by `entity_kind = 'ticket' AND entity_id = $1 ORDER BY seq`.
- `apps/server/src/app.ts` has an existing app-builder pattern where Task 2 registers auth routes with access to `pool` and `auth` — Task 8 adds `registerTicketRoutes(app, { pool, auth })` "alongside Task 2's auth registration".

---

## Task 9: Visibility-dependent ingest permissions

### Files
- Modify: `apps/server/src/permissions/check-permission.ts` (add `checkVisibilityPermission`; extend `checkPermission` to call it; also adds `checkProjectExists`, `projectNamedBy` per Step 3b)
- Test: `apps/server/test/permissions/check-visibility-permission.test.ts`
- (Step 3b, same task) Create: `apps/server/migrations/<ts>_proj-projects.cjs`, `apps/server/src/projections/proj-projects.ts`
- (Step 3b) Modify: `apps/server/src/projections/index.ts` (register `projProjects` **before** `projTickets` — coordination §8), `apps/server/src/permissions/check-permission.ts`
- (Step 3b) Test: `apps/server/test/projections/proj-projects.test.ts`, `apps/server/test/permissions/check-project-exists.test.ts`

### Interfaces — Consumes
- `canSee`, `getResolvedVisibility` (Task 7)
- `hasProjectAdminRights` (Task 4)
- `proj_tickets.created_by` (Plan 3 — "the head state carries creator provenance; adapt the column name if Plan 3 spelled it differently")
- `VisibilitySetPayload` (Task 3) — imported from `@gisik-nokma/domain`

### Interfaces — Produces
```ts
async function checkVisibilityPermission(db: Queryable, env: EventEnvelope, ctx: PermissionContext): Promise<Refusal | null>
// checkPermission (same signature as Task 5) now runs role checks then visibility checks —
// still the single gate the ingest pipeline calls, unchanged at the call site.
async function checkPermission(db: Queryable, env: EventEnvelope, sessionUserId: string): Promise<Refusal | null>

// Step 3b additions:
const projProjects: { name: string; tables: readonly ['proj_projects']; apply(env, db): Promise<void>; reset(db): Promise<void> }
async function projectExists(db: Queryable, workspaceId: string, projectId: string): Promise<boolean>
function projectNamedBy(env: EventEnvelope): string | null
async function checkProjectExists(db: Queryable, env: EventEnvelope): Promise<Refusal | null>
async function getTicketCreator(db: Queryable, ticketId: string): Promise<string | null>
```

### The checks (exact, as enumerated in plan text)
1. Only ticket-entity events are examined; everything else passed the role gate already.
2. `ticket.created`: guests are refused (`permission.role` — "Guests cannot create tickets."); non-guests must be on the target project (`permission.role`). No admin shortcut — an admin joins the project first (attributed), then creates (Open questions).
3. `visibility.set` whose `payload.ticketId` differs from `entity.id`: refused (`permission.visibility`) before anything else is looked up — a claim must name the ticket it rides on.
4. Every other ticket event (transition, assign, comment, field set, reparent, visibility.set itself): the actor must `canSee` the ticket, else `permission.visibility` — "This ticket is not visible to you." This is also exactly the guest constraint: a guest's `canSee` is true only for tickets explicitly shared with them, so *guests may only act on tickets explicitly visible to them* falls out of the same check.
5. `visibility.set` additionally requires project-admin rights on the ticket's project OR ticket creatorship (`permission.role`).

### Refusal strings — verbatim exact-rejection tables

| # | Trigger | rule | reason (verbatim) |
|---|---|---|---|
| 1 | Guest attempts `ticket.created` | `permission.role` | `Guests cannot create tickets.` |
| 2 | Non-guest not member of target project attempts `ticket.created` | `permission.role` | `You are not a member of this project, so you cannot create tickets in it.` |
| 3 | `visibility.set` payload.ticketId ≠ entity.id | `permission.visibility` | `This claim does not name the ticket it is attached to.` |
| 4 | Actor cannot `canSee` the ticket (any non-created ticket event) | `permission.visibility` | `This ticket is not visible to you.` |
| 5 | `visibility.set` by actor who is neither project-admin nor creator | `permission.role` | `Only a project admin or the ticket's creator can change who sees this ticket.` |
| 6 (Step 3b) | Event names a project id that does not exist in `proj_projects` for that workspace | `project.unknown` | `` There is no project ${projectId} in this workspace. `` (template literal — exact text interpolates the project id, e.g. "There is no project prj_xyz in this workspace.") |

Full `Refusal` object shape asserted in tests, e.g.:
```ts
{ refused: true, rule: 'permission.visibility', reason: 'This ticket is not visible to you.' }
```

### Step 3b — proj_projects (owner decision 2026-08-26, coordination doc)

**Problem statement (verbatim):** "Nothing in the series validated that `ticket.created.projectId` names a real project: there was no `proj_projects` anywhere, and `project.created` was a registered event type that nothing projected into a queryable table."

**"What covered it by accident, and why that is not coverage" (verbatim):** "The membership check in Step 3 refuses an actor who is not a member of the project — so a fabricated `projectId` was usually refused, because nobody is a member of a project that does not exist. But membership is built from `membership.granted` / `project.member_added`, and those accept any non-empty string as a project scope without checking it either. Grant yourself membership on a typo'd id and the ticket is accepted: it lands in `proj_tickets` and `proj_visibility` with a dangling `project_id`, shows on no board and in no project list, and nobody is ever told. And on the paths where the coincidence *did* hold, the user was told the wrong thing — that they were not a member, when the truth is that the project does not exist."

**Ordering rationale (verbatim):** "Hence the ordering above: the existence check runs **before** the membership check, so the honest reason wins whenever both would fire."

Migration (`apps/server/migrations/<ts>_proj-projects.cjs`) creates table `proj_projects` with columns:
- `project_id` (text, primary key)
- `workspace_id` (text, not null)
- `name` (text, not null)
- `created_by` (text, not null)
- `created_at` (timestamptz, not null)
- index on `workspace_id`

`projProjects.apply` only handles `project.created`; inserts with `ON CONFLICT (project_id) DO NOTHING`. `projectExists` is scoped by workspace: "a project id from another workspace is not 'found'."

`projectNamedBy(env)` mapping (exact from code):
- `ticket.created` → `payload.projectId`
- `project.member_added` / `project.member_removed` → `env.entity.id`
- `membership.granted`/`revoked` name no project — comment: "membership is workspace-scoped (owner decision 2026-08-27). Project association is project.member_added / _removed, immediately below."
- default (including `project.created`) → `null` — comment: "project.created names the project it is bringing into existence."

`checkProjectExists` refusal: rule `project.unknown`, reason template `` `There is no project ${projectId} in this workspace.` ``.

**"One thing this does not do" (verbatim):** "`proj_projects` has no `project.renamed` handler because no such event is registered; when one is added it lands here."

Test descriptions (both halves explicitly called "planted"):
- `proj-projects.test.ts`: a `project.created` lands a row scoped to its workspace and carrying its creator; a re-delivered duplicate does not double-insert; `reset` empties it; `projectExists` answers `false` for a real project id asked under the wrong workspace.
- `check-project-exists.test.ts`: planted defect — grant yourself membership on a `projectId` that was never founded, then create a ticket in it; before the step the ticket is accepted, after it the refusal is `project.unknown` and NOT `permission.role` (test asserts rule name explicitly); second case: non-member creating a ticket in a nonexistent project is told the project does not exist, not that they are not a member (asserts ordering).

### Test/step counts
- `check-visibility-permission.test.ts`: Step 4 says "Expected: PASS (10 tests)." Counted `it` blocks in the code shown: (1) planted defect guest not shared → refused, (2) guest explicitly shared → passes, (3) planted defect member on another project's ticket by direct id → refused, (4) guests cannot create tickets, (5) creating requires project membership even for admins, (6) project member creates freely, (7) visibility.set payload/entity mismatch refused, (8) planted defect plain member (not admin/creator) cannot set visibility, (9) ticket creator may set visibility, (10) project admin may set visibility. = 10 tests, matches.
- `proj-projects.test.ts` and `check-project-exists.test.ts`: counts not stated numerically in plan text, only described narratively (see above).

### planTextClaimsToVerify
- `apps/server/src/permissions/check-permission.ts` already exists (Task 5) with `checkRolePermission`, `PermissionContext`, `Refusal`, `refuse(...)`, and exports `checkPermission(db, env, sessionUserId)`.
- `@gisik-nokma/domain` exports `VisibilitySetPayload`.
- `apps/server/src/permissions/effective-role` — `EffectiveRole.projects` is a `Map` supporting `.has(projectId)`.
- `hasProjectAdminRights(eff, projectId)` exists (Task 4) with signature accepting `EffectiveRole` and a project id.
- `proj_tickets` has column `created_by` (queried: `SELECT created_by FROM proj_tickets WHERE ticket_id = $1`).
- `apps/server/src/projections/index.ts` exists and has a registration order where projections are listed/iterated (claim: `projProjects` must be registered before `projTickets` — coordination §8).
- Event type `project.created` is a "registered event type" (asserted as pre-existing fact) but "nothing projected into a queryable table" before this task — i.e., no `proj_projects` existed on main prior to Plan 4.
- `membership.granted` / `project.member_added` / `project.member_removed` event types accept arbitrary non-empty string project ids without existence validation prior to this task.
- Ingest pipeline (Task 5) calls `checkPermission` as "the single gate" and is unchanged at the call site by this task.
- `env.workspaceSeq` (camelCase) is the envelope field name for the ledger's `workspace_seq` DB column.

---

## Contradictions / issues noted within this range

1. **Task 7, `can-see.test.ts` test count mismatch.** Step 5 states "Expected: PASS (7 tests)" but the code block shown contains 5 `it` blocks under `describe('canSeeResolved — the decision table, exactly', ...)` plus 3 `it` blocks under `describe('canSee — against the real projections', ...)`, totaling 8 `it` blocks. Either the plan miscounts (should be 8) or one block is expected to be removed/merged — the plan text gives no indication which. Flagged for the adaptation map / implementer to resolve by literal count, not by the stated "7".

2. **Task 7, `visible-tickets.test.ts` step count phrasing.** Step 7 says "Run again — Expected: PASS (1 test, 4 viewers asserted)" immediately after showing the implementation, but the test file (Step 6) contains 2 `it` blocks: "each viewer gets exactly their slice..." (4 viewers asserted, matches "1 test, 4 viewers") and "the owner lists every ticket, from the bypass alone" (a second, separate test). Step 7's count of "1 test" appears to refer only to the first `it` and does not mention the second. Not necessarily a contradiction (Step 7 may just be re-running after implementing the SQL, before the owner-guard test was separately validated), but the phrase "1 test" undercounts the file's actual 2 `it` blocks — implementer should expect 2 passing tests in this file, not 1.

3. **Task 9 Step 3b is embedded mid-task but has its own Files/Test lists, its own migration, projection, and two new test files** — structurally it reads like a sub-task bolted onto Task 9 rather than a plain step. It does not create a file conflict with Tasks 7 or 8 in this range, but note it for the adaptation map since it introduces a NEW schema/projection dependency (`proj_projects`) not mentioned in Task 9's initial "Files" header block (that header only lists modifying `check-permission.ts`) — the header undercounts what the task actually does; Step 3b's own "Files" list is the complete, correct one.

4. No file-path collisions found between Task 7, Task 8, and Task 9 (each creates/modifies distinct paths); `apps/server/src/permissions/check-permission.ts` is modified twice within Task 9 itself (Step 3 and Step 3b) — consistent, not contradictory, but worth noting both edits land in the same task/commit sequence with two separate "Files" mentions.
