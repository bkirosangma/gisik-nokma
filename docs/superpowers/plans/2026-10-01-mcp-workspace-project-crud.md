# MCP workspace/project CRUD, people lookup and richer ticket listing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the MCP (both doors) create/read/update/archive/delete tools for workspaces and projects, a `list_members` people lookup, a `"me"` shortcut, multi-value filters and a workspace-wide `list_tickets` — adding project rename/description to the product first so the assistant never holds a power the screen lacks.

**Architecture:** One new domain event (`project.updated`) with its permission, projection and a web Edit control; two server-read changes (plural filter keys + `"me"` resolved server-side in one helper; a workspace-scoped twin of the project list route); then MCP tools in a new shared tool module that both the stdio and hosted doors register through `allTools`, writing through `POST /v1/events` (or `POST /v1/workspaces` for founding) with the product's own refusals passed through verbatim.

**Tech Stack:** TypeScript, zod, Fastify, Postgres projections, React (Next.js app router), Vitest, `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-01-mcp-workspace-project-crud-design.md` (owner-approved 2026-10-01). Where this plan's FD-n corrections differ from the spec, this plan wins.

## Global Constraints

- Branch work off `origin/release/2026-10-01`; every PR `--base release/2026-10-01`; never commit to `main`.
- Writes from MCP tools carry `origin: 'mcp'` and `actorId` = the session user (`packages/mcp-server/src/tools/write-tools.ts:40-61`).
- Deletes are SOFT only (`workspace.deleted` / `project.deleted`); NO tool emits `purge.marked` (spec M2).
- `delete_*` and `archive_*` refuse unless `confirm_name` equals the item's CURRENT name exactly (case and whitespace); the refusal text is `confirm_name must be "<current name>"` (spec §3).
- A refusal from the product is passed through VERBATIM: `refused by <rule>: <reason>` / `<code>: <message>` (`write-tools.ts:16-37`).
- Single-value filter keys keep working unchanged; the product's web client is not changed by the filter work (spec M6).
- `list_tickets` takes EXACTLY ONE of `projectId` / `workspaceId` (spec M7).
- Guests get the scoped people read (`/actor-names` for a guest), never the roster (spec M4; shipped ruling N3).
- Prefix is IMMUTABLE after creation (FD3) — no tool or UI edits it.
- No new migration (FD4): `proj_projects.description` exists (`apps/server/migrations/1789600000000_proj-projects-description.sql:31`).
- Node 22 for every install and run; never pipe a test run into `head`.
- Case-id blocks (numeric sort of every id in `test-cases/`, 2026-10-01: highest `13.1595`, `7.667`, `14.299`): **13.1600–13.1619** (project.updated + Edit UI, `test-cases/13-neomorphism-and-workspace-screens.md`), **7.700–7.719** (filters + workspace list, `test-cases/07-api-realtime-search.md`), **14.300–14.359** (MCP tools, `test-cases/14-mcp-server.md`). Unused ids in a block stay free; never renumber.

## Review Focus

1. **A project renamed while the assistant holds its old name** — `archive_project`/`delete_project` with the OLD name must refuse with the NEW name in the message (14.321 pins it; a stale directory read would let a delete through on an old name).
2. **`"me"` used by a guest in the workspace scope** — must resolve to the guest and still pass `visibleTicketsWhere`, never widen (7.705 pins it).
3. **`workspaceId` scope with an archived project** — its tickets are excluded (an archived project is out of every list of live work, `check-permission.ts:370-380`); 7.710 pins it.
4. **`create_project` by a workspace admin (not owner)** — must post `project.created` AND `project.member_added` in ONE batch or the founder cannot see/use it (`apps/web/app/w/[workspaceId]/page.tsx:47-73`); 14.317 pins the pair and the batch.
5. **`project.updated` with only `description: null`** — clears the description, leaves the name (13.1602 pins it).

---

## Corrections found on reading (the plan wins over the spec)

- **FD1 — only FOUNDING a workspace has a REST door** (`POST /v1/workspaces`, `apps/server/src/routes/workspaces.ts:81-176`, answers 201 `{workspaceId}` / 400 / 422). Every other workspace/project act — rename, archive, restore, delete, undelete, project create — is an event through `POST /v1/events` (`routes/events.ts:84`), exactly as the web does (`apps/web/app/w/[workspaceId]/page.tsx:34-44`, `:820-829`). The MCP `Session` exposes only `get` + `postEvents` (`packages/mcp-server/src/session.ts`), so it gains a `post(path, body)` for founding (Task 5), in all THREE session implementations: `session.ts`, `lazy-session.ts`, and the hosted door's `hostedSession` (`apps/server/src/mcp/in-process-fetch.ts:41-51`).
- **FD2 — permissions are already the screen's:** `project.created/archived/restored/deleted/undeleted` are workspace ADMIN/owner acts (`ADMIN_ONLY_TYPES`, `check-permission.ts:350-389`); `workspace.renamed` is admin/owner (`:831`, `WORKSPACE_RENAME_REASON`); `workspace.archived/restored/deleted/undeleted` are OWNER-only (`WORKSPACE_OWNER_TYPES`, `:399-404`, `WORKSPACE_OWNER_ONLY_REASON`). `project.updated` joins `ADMIN_ONLY_TYPES` (same bar as `project.archived`, spec M1) and `projectsNamedBy`'s project-entity arm (`:915-929`) so it inherits the existence precondition.
- **FD3 — prefix is immutable by design** (`packages/domain/src/events/membership.ts:115-121`: "IMMUTABLE after creation … no `project.renamed`"). `project.updated` carries `name` and/or `description` only; prefix stays as founded. The docblock is amended to say a rename now exists but the prefix still does not move.
- **FD4 — no migration:** `proj_projects` already has `name`, `description` (nullable, `1789600000000`), `prefix`, `archived`, `deleted_at`.
- **FD5 — founding a project is TWO events in ONE batch** (`project.created` + `project.member_added { userId: founder, projectAdmin: true }`), per `foundingSeeds` (`apps/web/app/w/[workspaceId]/page.tsx:47-110`). `create_project` therefore needs a batch submitter, not `submitOne`; the submit helpers move to a shared `tools/submit.ts`.
- **FD6 — no project history surface exists.** `project.updated` is attributable in the ledger (actor, origin, time), like `project.archived`; the spec's "recorded in history" means the ledger, not a new screen. Not built.
- **FD7 — names are read from projections, so no replica/sync work:** the web reads project names from `GET /v1/me/workspaces` (built on `proj_projects`, `routes/workspaces.ts:245-270`) and workspace names from the ledger (`workspaces/workspace-name.ts:104`); the offline replica stores no project names (`packages/app-core/src/replica/replica-data-source.ts:78`, `:422`).
- **FD8 — `get_workspace` / `get_project` / `include: 'archived'` need no new route:** `GET /v1/me/workspaces` already serves each workspace's `archived`, `prefix`, `role`, and each project's `name`, `description`, `prefix`, `archived`, ticket counts. `include: 'deleted'` reads `GET /v1/me/deleted-items` (current-authority list, `apps/server/src/read/deleted-items.ts:12-30`) filtered to `kind: 'workspace' | 'project'`.
- **FD9 — `list_workspaces` today returns archived workspaces too** (flagged). The spec's `include` makes the DEFAULT "live only"; `include: 'archived'` adds archived, `include: 'deleted'` adds deleted. A behaviour change to an existing tool — its description says so (14.330).
- **FD10 — `list_members` needs no new route:** `GET /v1/workspaces/:id/members` (roster with role and non-synthetic email; guests hidden from non-admins; a GUEST caller gets 404, `routes/builder-reads.ts:772-803`) and `GET /v1/workspaces/:id/actor-names` (members-only; a guest gets the people on their own tickets, `:805-821`). The tool reads `/members` and, on 404, falls back to `/actor-names` (names only, no role/email) — which is exactly the shipped visibility.
- **FD11 — multi-value filters are NEW PLURAL KEYS, not widened singular ones:** `assigneeIds`, `collaboratorIds`, `typeIds`, `stateIds`, `stateCategories`, `priorities` (arrays, 1–20 values), each mutually exclusive with its singular key. Widening `assigneeId` to `string | string[]` would change the `FilterSpec` type every product call site reads; plural optional keys leave the web client and its types untouched (spec M6's constraint). Compiled to `= ANY($n::text[])` in `compileFilterSpec` (`apps/server/src/read/compile-filter.ts:94-107`).
- **FD12 — `"me"` is resolved ONCE, server-side, in a helper both read routes and the new workspace route call** (`resolveMeInSpec(spec, viewerId)`), before `compileFilterSpec`; the search route (`routes/search.ts:432`) gets it too, since the MCP `filterArg` is the same schema.
- **FD13 — the workspace scope reuses `readList`** (`routes/list.ts:110-185`) with `projectId: string | null`; the project-scope SQL is unchanged. The workspace scope adds one conjunct excluding ARCHIVED projects (deleted projects are already excluded by `LIVE_TICKET_WHERE`, `read/visible-where.ts:231-232`).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/domain/src/events/membership.ts` | `projectUpdatedPayload` (+ prefix docblock amended) | 1 |
| `packages/domain/src/vocabulary.ts` | register `project.updated` | 1 |
| `apps/server/src/permissions/check-permission.ts` | `project.updated` in `ADMIN_ONLY_TYPES` + `projectsNamedBy` | 1 |
| `apps/server/src/projections/proj-projects.ts` | apply `project.updated` | 1 |
| `apps/web/app/w/[workspaceId]/page.tsx` | project card "Edit" (name, description) + `updateSeeds` | 2 |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` | project header "Edit" | 2 |
| `packages/domain/src/filter-spec.ts` | plural keys + exclusivity refine | 3 |
| `apps/server/src/read/compile-filter.ts` | `ANY(...)` clauses; `resolveMeInSpec` | 3 |
| `apps/server/src/routes/list.ts`, `routes/search.ts` | call `resolveMeInSpec`; workspace route | 3, 4 |
| `packages/mcp-server/src/session.ts`, `lazy-session.ts`, `apps/server/src/mcp/in-process-fetch.ts` | `post(path, body)` | 5 |
| `packages/mcp-server/src/tools/submit.ts` (new) | `submitOne`, `submitBatch`, `envelopeFor` (moved from write-tools) | 5 |
| `packages/mcp-server/src/tools/directory.ts` (new) | read helpers over `/v1/me/workspaces`, `/v1/me/deleted-items`, `confirmName` | 6 |
| `packages/mcp-server/src/tools/workspace-tools.ts` (new) | workspace tools | 6 |
| `packages/mcp-server/src/tools/project-tools.ts` (new) | project tools | 7 |
| `packages/mcp-server/src/tools/read-tools.ts` | `list_members`; `list_tickets` scopes; list `include` | 8 |
| `packages/mcp-server/src/tools/register.ts` | `allTools` includes the new modules | 6–8 |
| `docs/manual.md` + `packages/app-core/src/help/content.generated.ts` | §16 "What your assistant can do"; workspace-home Edit | 9 |
| `Features.md`, `test-cases/13-neomorphism-and-workspace-screens.md`, `test-cases/07-api-realtime-search.md`, `test-cases/14-mcp-server.md` | catalogue | every task |

---

### Task 1: `project.updated` — domain, permission, projection

**Files:**
- Modify: `packages/domain/src/events/membership.ts` (after `projectRestoredPayload`, ~:239)
- Modify: `packages/domain/src/vocabulary.ts` (after the `project.restored` registration, ~:431)
- Modify: `apps/server/src/permissions/check-permission.ts:350-389` (`ADMIN_ONLY_TYPES`), `:915-929` (`projectsNamedBy`)
- Modify: `apps/server/src/projections/proj-projects.ts:13-30`
- Test: `packages/domain/test/project-updated.test.ts` (new), `apps/server/test/projections/proj-projects.test.ts`, `apps/server/test/permissions/project-updated-permission.test.ts` (new)

**Interfaces:**
- Produces: `projectUpdatedPayload` = `z.object({ name: displayName.optional(), description: descriptionText.nullable().optional() }).strict().refine(p => p.name !== undefined || p.description !== undefined, 'name or description')`; event type `'project.updated'`, version 1, entityKind `'project'`, filed against the project entity.

Cases (`## 13.20 Project rename and description (MCP CRUD plan, Task 1–2; block 13.1600–13.1619)`):

```markdown
- ❌ **13.1600 — `project.updated` parses with a name, a description, or both, and refuses an empty payload, an unknown key, a blank name and a 501-char description;** control: `{ name: 'Store ops' }` parses. Mutation: drop the at-least-one refine.
- ❌ **13.1601 — the projection renames the project and replaces its description;** control: a `project.updated` for another project leaves this row untouched. Mutation: skip the `name` update.
- ❌ **13.1602 — `description: null` clears the description and leaves the name; an absent `description` leaves it as it was;** control: `description: 'x'` sets it. Mutation: treat absent as null.
- ❌ **13.1603 — a workspace MEMBER is refused `project.updated` with the admin-only reason; an admin and the owner commit;** control: the same member's `ticket.created` in that project commits. Mutation: remove `project.updated` from `ADMIN_ONLY_TYPES`.
- ❌ **13.1604 — `project.updated` naming a project nobody founded is refused `project-unknown`;** control: a founded project commits. Mutation: drop it from `projectsNamedBy`.
- ❌ **13.1605 — the prefix never changes: a `project.updated` payload carrying `prefix` is refused as an unknown key, and the row's prefix is unchanged after a rename;** control: rename commits. Mutation: allow `prefix` in the schema.
- ❌ **13.1606 — a rebuild of `proj_projects` from the ledger equals the live table after created → updated → updated;** control: `verifyProjections` reports no drift. Mutation: apply `project.updated` only live, not in rebuild (skip the handler).
```

- [ ] **Step 1: Write the failing tests.** `packages/domain/test/project-updated.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { domainRegistry, projectUpdatedPayload } from '../src/index.js';

describe('13.1600 project.updated payload', () => {
  it('13.1600 accepts name / description / both, refuses empty, unknown, blank, overlong', () => {
    expect(projectUpdatedPayload.safeParse({ name: 'Store ops' }).success).toBe(true); // control
    expect(projectUpdatedPayload.safeParse({ description: 'Daily shop work' }).success).toBe(true);
    expect(projectUpdatedPayload.safeParse({ name: 'A', description: null }).success).toBe(true);
    expect(projectUpdatedPayload.safeParse({}).success).toBe(false);
    expect(projectUpdatedPayload.safeParse({ name: 'A', prefix: 'XY' }).success).toBe(false); // 13.1605
    expect(projectUpdatedPayload.safeParse({ name: '   ' }).success).toBe(false);
    expect(projectUpdatedPayload.safeParse({ description: 'x'.repeat(501) }).success).toBe(false);
    expect(domainRegistry.get('project.updated', 1)?.entityKind).toBe('project');
  });
});
```

Add to `apps/server/test/projections/proj-projects.test.ts` (uses the file's own `projectCreated` and `testEnvelope`):

```ts
function projectUpdated(projectId: string, payload: Record<string, unknown>) {
  return testEnvelope({ workspaceId: WS, entity: { kind: 'project', id: projectId }, type: 'project.updated', payload, actorId: newUlid() });
}

describe('13.1601–13.1602, 13.1605–13.1606 project.updated in proj_projects', () => {
  it('13.1601 renames and redescribes; another project untouched', async () => {
    const a = newUlid(); const b = newUlid();
    for (const e of [projectCreated(a, WS, 'Old', 'old text'), projectCreated(b, WS, 'Other'), projectUpdated(a, { name: 'New', description: 'new text' })]) {
      await insertAndApply(db.pool, e); // the file's existing insert-then-apply helper; add it if absent: insertEvent + projProjects.apply in one tx
    }
    const { rows } = await db.pool.query('SELECT project_id, name, description FROM proj_projects ORDER BY name');
    expect(rows.find((r) => r.project_id === a)).toMatchObject({ name: 'New', description: 'new text' });
    expect(rows.find((r) => r.project_id === b)).toMatchObject({ name: 'Other' }); // control
  });
  it('13.1602 null clears, absent keeps', async () => {
    const a = newUlid();
    await insertAndApply(db.pool, projectCreated(a, WS, 'P', 'keep me'));
    await insertAndApply(db.pool, projectUpdated(a, { name: 'P2' }));
    expect((await db.pool.query('SELECT description FROM proj_projects WHERE project_id=$1', [a])).rows[0].description).toBe('keep me');
    await insertAndApply(db.pool, projectUpdated(a, { description: null }));
    expect((await db.pool.query('SELECT name, description FROM proj_projects WHERE project_id=$1', [a])).rows[0]).toEqual({ name: 'P2', description: null });
  });
  it('13.1605 prefix unchanged by a rename', async () => {
    const a = newUlid();
    await insertAndApply(db.pool, testEnvelope({ workspaceId: WS, entity: { kind: 'project', id: a }, type: 'project.created', payload: { name: 'Shop', prefix: 'SO' }, actorId: newUlid() }));
    await insertAndApply(db.pool, projectUpdated(a, { name: 'Shop floor' }));
    expect((await db.pool.query('SELECT prefix FROM proj_projects WHERE project_id=$1', [a])).rows[0].prefix).toBe('SO');
  });
  it('13.1606 rebuild equals live', async () => {
    const a = newUlid();
    for (const e of [projectCreated(a), projectUpdated(a, { name: 'Two' }), projectUpdated(a, { description: 'Three' })]) await insertAndApply(db.pool, e);
    const registry = buildProjectionRegistry();
    await rebuildProjection(db.pool, registry, 'proj_projects');
    expect(await verifyProjections(db.pool, registry, ['proj_projects'])).toEqual([]); // match the helper's real signature when implementing
  });
});
```

Permission cases in `apps/server/test/permissions/project-updated-permission.test.ts` — copy the harness of the closest existing permission test for `project.archived` (find it with `grep -rln "project.archived" apps/server/test/permissions`), and assert: member → `refused` with the admin-only reason (13.1603), admin + owner → `committed`, unfounded project id → `refused` rule `project-unknown` (13.1604), control: member `ticket.created` in the project commits.

- [ ] **Step 2: Run to see them fail.** `cd packages/domain && pnpm exec vitest run test/project-updated.test.ts > /tmp/mcpcrud-t1.log 2>&1; tail -20 /tmp/mcpcrud-t1.log` → FAIL (`projectUpdatedPayload` not exported). Build domain, then `cd apps/server && pnpm exec vitest run test/projections/proj-projects.test.ts test/permissions/project-updated-permission.test.ts > /tmp/mcpcrud-t1s.log 2>&1; tail -30 /tmp/mcpcrud-t1s.log` → FAIL.

- [ ] **Step 3: Implement.**
  1. `membership.ts`, after `projectRestoredPayload`:

```ts
/**
 * Rename / redescribe a project (MCP CRUD plan Task 1, owner ruling M1, 2026-10-01).
 * Filed against the PROJECT entity. `description: null` CLEARS the description —
 * the column has been nullable since door A precisely so a later edit could clear
 * it (see `projectCreatedPayload.description`); an absent key leaves it alone.
 * The PREFIX is not here and never will be: it is immutable after creation
 * (owner spec 2026-09-20), so a rename moves the name and never the ticket keys.
 */
export const projectUpdatedPayload = z
  .object({ name: displayName.optional(), description: descriptionText.nullable().optional() })
  .strict()
  .refine((p) => p.name !== undefined || p.description !== undefined, 'a project update names a new name, a description, or both');
export type ProjectUpdatedPayload = z.infer<typeof projectUpdatedPayload>;
```

     and amend the prefix docblock sentence "there is no `project.renamed` to carry one" → "`project.updated` (2026-10-01) renames a project but deliberately carries no prefix".
  2. `vocabulary.ts`: import `projectUpdatedPayload`; after the `project.restored` registration:

```ts
domainRegistry.register({ type: 'project.updated', version: 1, entityKind: 'project', payloadSchema: projectUpdatedPayload });
```

  3. `check-permission.ts`: add `'project.updated',` to `ADMIN_ONLY_TYPES` beside `'project.archived'` with a one-line comment "MCP CRUD plan Task 1 (M1): renaming a project is the same workspace act as archiving it"; add `case 'project.updated':` beside `case 'project.archived':` in `projectsNamedBy`.
  4. `proj-projects.ts`, before the `project.created` branch:

```ts
if (event.type === 'project.updated') {
  const payload = projectUpdatedPayload.parse(event.payload);
  // COALESCE keeps an absent key's column as it was; `description` uses a
  // separate flag because `null` is a real value (clear) and must not COALESCE away.
  await tx.query(
    `UPDATE proj_projects
        SET name = COALESCE($3, name),
            description = CASE WHEN $4::boolean THEN $5 ELSE description END
      WHERE project_id = $1 AND workspace_id = $2`,
    [event.entity.id, event.workspaceId, payload.name ?? null, payload.description !== undefined, payload.description ?? null],
  );
  return;
}
```

- [ ] **Step 4: Run to see them pass**, then the whole `packages/domain` and `apps/server` suites (> log; tail), build.
- [ ] **Step 5: Catalogue + commit.** Flip 13.1600–13.1606 ✅ with their tests named; Features.md §6 bullet: "⚙️ **`project.updated` — rename and redescribe a project** (MCP CRUD plan Task 1; `packages/domain/src/events/membership.ts`, `proj-projects.ts`) — name and/or description, `null` clears the description, the prefix never moves; workspace admin/owner only, same bar as archive. Cases 13.1600–13.1606." Commit `MCP CRUD 1: project.updated — domain, permission, projection (13.1600-13.1606)`.

---

### Task 2: The product's Edit control for a project

**Files:**
- Modify: `apps/web/app/w/[workspaceId]/page.tsx` (project card actions ~:490-510; add `updateSeeds` beside `archiveSeeds` ~:34)
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2351` (`gn-project__title` header)
- Test: `apps/web/test/workspace-home-project-edit.test.tsx` (new), `apps/web/test/project-header-edit.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1's `project.updated`.
- Produces: `export function updateSeeds(workspaceId: string, projectId: string, before: { name: string; description: string | null }, after: { name: string; description: string }): EnvelopeSeed[]` — one `project.updated` carrying ONLY the changed keys (`description: null` when the field was emptied); `[]` when nothing changed.

Cases (same section):

```markdown
- ❌ **13.1607 — `updateSeeds` sends only what changed: a new name alone → `{ name }`; an emptied description → `{ description: null }`; nothing changed → no event;** control: both changed → both keys. Mutation: always send both keys.
- ❌ **13.1608 — the workspace home's project card shows "Edit" to an owner/admin (`mayAdminister`) and not to a member, beside Archive;** control: Archive keeps its existing gate. Mutation: show Edit to everyone.
- ❌ **13.1609 — Edit opens an inline form (Name, Description) prefilled with the current values; Save submits `updateSeeds`, Cancel and Escape submit nothing and restore the card;** control: a refused save keeps the form open with the server's reason. Mutation: submit on Cancel.
- ❌ **13.1610 — a blank name is not sent (the form says why) — `displayName` would refuse it anyway;** control: a one-character name is sent. Mutation: drop the client blank check.
- ❌ **13.1611 — the project page header offers the same Edit to an owner/admin and shows the new name after save;** control: a member sees the title without Edit. Mutation: header Edit for members.
- 🧪 **13.1612 — browser: rename a project from the card and from the header in hig/minimal/neo; the board header, the workspace nav and the card all show the new name after save; 44 px targets; Escape closes;** Evidence: per-style values.
```

- [ ] **Step 1: Failing tests.** `apps/web/test/workspace-home-project-edit.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { updateSeeds } from '../app/w/[workspaceId]/page.js';

describe('13.1607 updateSeeds', () => {
  const ws = 'W'; const p = 'P';
  it('13.1607 only changed keys; empty description clears; no change → none', () => {
    expect(updateSeeds(ws, p, { name: 'A', description: 'd' }, { name: 'B', description: 'd' })[0]?.payload).toEqual({ name: 'B' });
    expect(updateSeeds(ws, p, { name: 'A', description: 'd' }, { name: 'A', description: '' })[0]?.payload).toEqual({ description: null });
    expect(updateSeeds(ws, p, { name: 'A', description: null }, { name: 'A', description: '' })).toEqual([]);
    expect(updateSeeds(ws, p, { name: 'A', description: null }, { name: 'B', description: 'x' })[0]).toMatchObject({ // control
      type: 'project.updated', entity: { kind: 'project', id: p }, payload: { name: 'B', description: 'x' },
    });
  });
});
```

Render cases 13.1608–13.1611: mount the workspace home and project page with the existing test harness these pages already use (find with `grep -ln "gn-project-card" apps/web/test`), assert the "Edit" button by accessible name `Edit <project name>` for an owner and its absence for a member; open, change fields, press Save → the captured ingest receives one `project.updated`; press Cancel/Escape → none; a refused result keeps the form and renders the reason in the existing refusal slot.

- [ ] **Step 2: Run to fail** (`cd apps/web && pnpm exec vitest run test/workspace-home-project-edit.test.tsx test/project-header-edit.test.tsx > /tmp/mcpcrud-t2.log 2>&1; tail -30 /tmp/mcpcrud-t2.log`).
- [ ] **Step 3: Implement.** `updateSeeds` exported beside `archiveSeeds`:

```ts
export function updateSeeds(
  workspaceId: string,
  projectId: string,
  before: { name: string; description: string | null },
  after: { name: string; description: string },
): EnvelopeSeed[] {
  const name = after.name.trim();
  const description = after.description.trim();
  const payload: { name?: string; description?: string | null } = {};
  if (name !== before.name) payload.name = name;
  const nextDescription = description === '' ? null : description;
  if (nextDescription !== before.description) payload.description = nextDescription;
  if (Object.keys(payload).length === 0) return [];
  return [{ workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.updated', payload }];
}
```

  The card gains an "Edit" quiet `Button` (aria-label `Edit ${project.name}`) under the same `mayAdminister` gate as Archive, toggling an inline form using the page's existing `onSubmit(seeds, onDone)` helper (the workspace rename form at ~:810-829 is the pattern: trim, refuse blank locally, submit, close on commit). The project header gets the same form beside `gn-project__title`, gated the same way (reuse `viewerOf`/`mayAdminister` from `src/workspace-viewer.js`). Styling: the form inputs use the shared recessed field (Plan B B2) and Save is the one primary in the form.
- [ ] **Step 4: Pass**, then `apps/web` suite + `pnpm check:help` (if the manual names the card's controls) + build.
- [ ] **Step 5: Catalogue + commit.** Flip 13.1607–13.1611 ✅ (13.1612 stays 🧪 for the controller's browser pass); Features.md: amend the workspace-home bullet (~line 223) with "an owner/admin can **Edit** a project's name and description from its card and from the project page header (MCP CRUD plan Task 2; cases 13.1607–13.1612)". Commit `MCP CRUD 2: Edit a project's name and description (13.1607-13.1612)`.

---

### Task 3: Plural filter keys and `"me"`

**Files:**
- Modify: `packages/domain/src/filter-spec.ts:120-175`
- Modify: `apps/server/src/read/compile-filter.ts:94-107`
- Modify: `apps/server/src/routes/list.ts:423-430`, `apps/server/src/routes/search.ts:432-440`
- Test: `packages/domain/test/filter-spec-plural.test.ts` (new), `apps/server/test/read/compile-filter-plural.test.ts` (new), `apps/server/test/routes/list.test.ts`

**Interfaces:**
- Produces: `FilterSpec` gains optional `assigneeIds`, `collaboratorIds`, `typeIds`, `stateIds` (`string[]`, 1–20, each noNul 1–200), `stateCategories` (`StateCategory[]`), `priorities` (`Priority[]`); `export function resolveMeInSpec(spec: FilterSpec, viewerId: string): FilterSpec` in `compile-filter.ts` — replaces `'me'` in `assigneeId`/`collaboratorId`/`assigneeIds`/`collaboratorIds` with `viewerId`.

Cases (`## 7.40 Filters: several values and "me" (MCP CRUD plan Task 3–4; block 7.700–7.719)`):

```markdown
- ❌ **7.700 — the filter schema accepts each plural key with 1–20 values and refuses an empty list, 21 values, and a singular+plural pair of the same field;** control: every existing single-key spec still parses unchanged. Mutation: drop the exclusivity refine.
- ❌ **7.701 — `assigneeIds: [A, B]` answers tickets assigned to A or B and no others; `stateIds` and `stateCategories` likewise;** control: `assigneeId: A` alone answers A's only. Mutation: compile `ANY` as `ALL`.
- ❌ **7.702 — `priorities: ['p1','p2']` answers both levels; `typeIds` and `collaboratorIds` answer the union;** control: one priority answers one level. Mutation: compile only the first list value.
- ❌ **7.703 — every list value is BOUND (one array parameter), never interpolated;** control: a value containing `'` round-trips as data. Mutation: join values into the SQL text.
- ❌ **7.704 — `assigneeId: "me"` (and `"me"` inside `assigneeIds`/`collaboratorIds`) answers the caller's own tickets on `/v1/projects/:id/tickets` and on `/v1/search`;** control: a real id still works. Mutation: skip `resolveMeInSpec` in the list route.
- ❌ **7.705 — a guest's `"me"` resolves to the guest and the visibility predicate still applies — no ticket outside their audience appears;** control: the owner's `"me"` answers the owner's tickets. Mutation: resolve "me" after the visibility clause is dropped (drop `visibleTicketsWhere` from the guest path).
- ❌ **7.706 — the web client's filter spec is unchanged: `toServerFilterSpec` emits no plural key for any UI filter state;** control: its existing cases stay green. Mutation: none needed (guard).
```

- [ ] **Step 1: Failing tests.** `packages/domain/test/filter-spec-plural.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterSpecSchema } from '../src/index.js';

const A = '01J0A5ER0000000000000000AA';
describe('7.700 plural filter keys', () => {
  it('7.700 lists 1–20, refuse empty/21/singular+plural; singles unchanged', () => {
    expect(filterSpecSchema.safeParse({ assigneeId: A, stateCategory: 'active' }).success).toBe(true); // control
    expect(filterSpecSchema.safeParse({ assigneeIds: [A, 'me'] }).success).toBe(true);
    expect(filterSpecSchema.safeParse({ stateCategories: ['open', 'active'], priorities: ['p1'] }).success).toBe(true);
    expect(filterSpecSchema.safeParse({ assigneeIds: [] }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ typeIds: Array.from({ length: 21 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ assigneeId: A, assigneeIds: [A] }).success).toBe(false);
  });
});
```

`apps/server/test/read/compile-filter-plural.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compileFilterSpec, resolveMeInSpec } from '../../src/read/compile-filter.js';
import { SqlParams } from '../../src/read/sql-params.js';

describe('7.701–7.703 plural compile; resolveMeInSpec', () => {
  it('7.701/7.703 one bound array per plural key, ANY not ALL', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec({ assigneeIds: ['a', "o'brien"], stateIds: ['s1'] }, params);
    expect(clauses).toContain('t.assignee_id = ANY($1::text[])');
    expect(clauses).toContain('t.state_id = ANY($2::text[])');
    expect(params.values).toEqual([['a', "o'brien"], ['s1']]); // match SqlParams' real accessor
  });
  it('7.704 me → viewer in singular and plural slots only', () => {
    expect(resolveMeInSpec({ assigneeId: 'me', collaboratorIds: ['x', 'me'] }, 'V')).toEqual({ assigneeId: 'V', collaboratorIds: ['x', 'V'] });
    expect(resolveMeInSpec({ typeId: 'me' }, 'V')).toEqual({ typeId: 'me' }); // control: not a person slot
  });
});
```

Route cases 7.701/7.702/7.704/7.705 in `apps/server/test/routes/list.test.ts`, using that file's seeded `ReadWorld` (`buildReadTestApp`): assign seeded tickets to two members, call `GET /v1/projects/:id/tickets?filter=${encodeURIComponent(JSON.stringify({ assigneeIds: [m1, m2] }))}` and assert the ticket-id set; `{ assigneeId: 'me' }` signed in as m1 → m1's tickets; signed in as the seeded guest → only the guest's visible ticket(s). Mirror 7.704 for `/v1/search?q=…&filter=`.

- [ ] **Step 2: Run to fail** (domain + server logs, tail).
- [ ] **Step 3: Implement.**
  1. `filter-spec.ts` — inside the object:

```ts
const idList = z.array(noNul(z.string().min(1).max(200))).min(1).max(20);
// …
assigneeIds: idList.optional(),
collaboratorIds: idList.optional(),
typeIds: idList.optional(),
stateIds: idList.optional(),
stateCategories: z.array(stateCategorySchema).min(1).max(3).optional(),
priorities: z.array(prioritySchema).min(1).max(20).optional(),
```

     then after `.strict()`:

```ts
.refine(
  (s) => !(
    (s.assigneeId && s.assigneeIds) || (s.collaboratorId && s.collaboratorIds) || (s.typeId && s.typeIds) ||
    (s.stateId && s.stateIds) || (s.stateCategory && s.stateCategories) || (s.priority && s.priorities)
  ),
  'a field takes a single value OR a list, not both',
)
```

     (If `filterSpecSchema` is used with `.extend`/`.shape` anywhere — check with `git grep -n "filterSpecSchema\.\(shape\|extend\|pick\|omit\)"` — keep the refine outside a `filterSpecObject` and export both.)
  2. `compile-filter.ts` after the singular clauses:

```ts
if (spec.assigneeIds !== undefined) clauses.push(`t.assignee_id = ANY(${params.add(spec.assigneeIds)}::text[])`);
if (spec.collaboratorIds !== undefined) clauses.push(`t.collaborator_ids ?| ${params.add(spec.collaboratorIds)}::text[]`);
if (spec.typeIds !== undefined) clauses.push(`t.type_id = ANY(${params.add(spec.typeIds)}::text[])`);
if (spec.stateIds !== undefined) clauses.push(`t.state_id = ANY(${params.add(spec.stateIds)}::text[])`);
if (spec.stateCategories !== undefined) clauses.push(`t.state_category = ANY(${params.add(spec.stateCategories)}::text[])`);
if (spec.priorities !== undefined) clauses.push(`(t.fields -> 'priority' ->> 'value') = ANY(${params.add(spec.priorities)}::text[])`);

/** `"me"` in a person slot means the caller (MCP CRUD plan, spec M5). Resolved here, once, before compile. */
export function resolveMeInSpec(spec: FilterSpec, viewerId: string): FilterSpec {
  const me = (v: string) => (v === 'me' ? viewerId : v);
  return {
    ...spec,
    ...(spec.assigneeId !== undefined ? { assigneeId: me(spec.assigneeId) } : {}),
    ...(spec.collaboratorId !== undefined ? { collaboratorId: me(spec.collaboratorId) } : {}),
    ...(spec.assigneeIds !== undefined ? { assigneeIds: spec.assigneeIds.map(me) } : {}),
    ...(spec.collaboratorIds !== undefined ? { collaboratorIds: spec.collaboratorIds.map(me) } : {}),
  };
}
```

     (`collaborator_ids` is jsonb — confirm `?|` against its real column type and the singular clause's `@>`; use `t.collaborator_ids ?| $n::text[]` for a jsonb array of strings.)
  3. `list.ts` and `search.ts`: after `spec = validated.data;` → `spec = resolveMeInSpec(validated.data, viewerId);` (search uses `request.currentUserId`).
- [ ] **Step 4: Pass**; whole domain + server + app-core suites (7.706 is the app-core `toServerFilterSpec` cases staying green — add the guard assertion there: `expect(Object.keys(toServerFilterSpec(state)).some(k => k.endsWith('s') && k !== 'fields')).toBe(false)` over its existing state fixtures); build.
- [ ] **Step 5: Catalogue + commit.** Flip 7.700–7.706; Features.md §7 bullet "⚙️ **Filters take several values and \"me\"** (MCP CRUD plan Task 3; `filter-spec.ts`, `compile-filter.ts`) — plural keys `assigneeIds`/`collaboratorIds`/`typeIds`/`stateIds`/`stateCategories`/`priorities` (1–20, exclusive with the single key, bound as one array), `\"me\"` resolved to the caller on the list and search routes; the web client is unchanged. Cases 7.700–7.706." Commit `MCP CRUD 3: plural filter keys and "me" (7.700-7.706)`.

---

### Task 4: `GET /v1/workspaces/:workspaceId/tickets`

**Files:**
- Modify: `apps/server/src/routes/list.ts` (`readList` signature ~:110; new route in `registerListRoutes` ~:392)
- Test: `apps/server/test/routes/list.test.ts`

**Interfaces:**
- Consumes: Task 3's `resolveMeInSpec`.
- Produces: `readList(db, eff, viewerId, workspaceId, projectId: string | null, query)`; route `GET /v1/workspaces/:workspaceId/tickets` with the SAME query params and `ListResponse` shape as the project route.

Cases (same section):

```markdown
- ❌ **7.707 — the workspace route answers visible tickets from EVERY project of the workspace, keyset-paged with `nextCursor`;** control: the project route still answers one project only (the sibling-project case stays green). Mutation: keep the `project_id` conjunct in the workspace scope.
- ❌ **7.708 — a non-member gets 404 (`READ_NOT_FOUND_BODY`), never an empty list;** control: a member gets 200. Mutation: skip `requireMember`.
- ❌ **7.709 — `visibleTicketsWhere` still applies: a guest sees only their audience across projects;** control: the owner sees all. Mutation: drop the visibility conjunct in the workspace scope.
- ❌ **7.710 — tickets of an ARCHIVED project are excluded from the workspace scope (deleted projects already are, via `LIVE_TICKET_WHERE`);** control: the same project's tickets reappear after `project.restored`. Mutation: remove the archived-project conjunct.
- ❌ **7.711 — filters, `groupBy`, `parentId=root`, `"me"` and `limit` behave exactly as on the project route;** control: one combined query equals the union of per-project answers for the same filter. Mutation: ignore `filter` in the workspace route.
```

- [ ] **Step 1: Failing tests** in `list.test.ts` using the seeded world (two projects): `GET /v1/workspaces/${world.workspaceId}/tickets?limit=2` → `cards` from both projects, `nextCursor` set, second page completes the set; a stranger → 404; guest → only visible ids; archive project B (append `project.archived` via `applyCommitted`) → B's tickets gone; `filter={"assigneeId":"me"}` as member → only theirs.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement.** In `readList`, replace the `t.project_id` element with:

```ts
...(projectId !== null
  ? [`t.project_id = ${params.add(projectId)}`]
  : ['NOT EXISTS (SELECT 1 FROM proj_projects ap WHERE ap.project_id = t.project_id AND ap.archived)']),
```

  and in `registerListRoutes` factor the body after membership into `answerList(request, reply, eff, viewerId, workspaceId, projectId)` and add:

```ts
app.get<{ Params: { workspaceId: string }; Querystring: { groupBy?: string; filter?: string; parentId?: string; cursor?: string; limit?: string } }>(
  '/v1/workspaces/:workspaceId/tickets',
  { preHandler: requireSession },
  async (request, reply) => {
    const { workspaceId } = request.params;
    const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
    if (eff === null) return reply.status(404).send(READ_NOT_FOUND_BODY);
    return answerList(request, reply, eff, request.currentUserId, workspaceId, null);
  },
);
```

  Docblock the scope clause list (the existing `readList` docblock's "four conjuncts") with the archived-project conjunct and why it is workspace-scope only (a project's own list still shows its own archived state, `13.1164`).
- [ ] **Step 4: Pass**; server suite; build.
- [ ] **Step 5: Catalogue + commit.** Flip 7.707–7.711; Features.md §7 bullet for the route. Commit `MCP CRUD 4: workspace-scoped ticket list (7.707-7.711)`.

---

### Task 5: `Session.post` in all three sessions; shared submit helpers

**Files:**
- Modify: `packages/mcp-server/src/session.ts`, `packages/mcp-server/src/lazy-session.ts`, `apps/server/src/mcp/in-process-fetch.ts:41-70`
- Create: `packages/mcp-server/src/tools/submit.ts`; Modify: `packages/mcp-server/src/tools/write-tools.ts` (import from it; behaviour unchanged)
- Test: `packages/mcp-server/test/session.test.ts`, `packages/mcp-server/test/submit.test.ts` (new), `apps/server/test/mcp/in-process-fetch.test.ts` (existing hosted-session file — find with `grep -rln hostedSession apps/server/test`)

**Interfaces:**
- Produces: `Session.post(path: string, body: unknown): Promise<unknown>` (re-auth on 401 like `get`); `submitOne(session, event)` (moved, unchanged), `submitBatch(session, events): Promise<unknown[]>` (throws the FIRST non-committed result's own words, naming its index), `envelopeFor(session, workspaceId, entity, type, payload): SubmittedEvent` (origin `'mcp'`, actor = session user).

Cases (`## 14.12 MCP CRUD — shared plumbing (MCP CRUD plan; block 14.300–14.359)`):

```markdown
- ❌ **14.300 — `Session.post` sends a JSON POST with the cached token and re-authenticates once on 401, like `get`;** control: a 403 is thrown, not retried. Mutation: no re-auth on post.
- ❌ **14.301 — the hosted door's session `post` goes through the in-process transport with the caller's bearer (same as `get`/`postEvents`);** control: `get` unchanged. Mutation: post without the bearer.
- ❌ **14.302 — `submitBatch` returns every committed result, and on a refusal throws `event <i> refused by <rule>: <reason>` verbatim;** control: an all-committed batch returns n results. Mutation: report only the last result.
- ❌ **14.303 — `write-tools` behaviour is unchanged after the move (the existing 14.70–14.77 cases stay green);** control: guard. Mutation: none.
```

- [ ] **Step 1: Failing tests.** `packages/mcp-server/test/submit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { submitBatch } from '../src/tools/submit.js';
import type { Session } from '../src/session.js';

const ok = (i: number) => ({ status: 'committed', eventId: `e${i}`, seq: i, serverTime: '2026-10-01T10:00:00.000Z' });
function session(results: unknown[]): Session {
  return { userId: () => 'U', get: async () => ({}), post: async () => ({}), postEvents: async () => ({ results }) };
}
describe('14.302 submitBatch', () => {
  it('14.302 all committed → all results; a refusal → its own words with its index', async () => {
    await expect(submitBatch(session([ok(1), ok(2)]), [{} as never, {} as never])).resolves.toHaveLength(2); // control
    await expect(
      submitBatch(session([ok(1), { status: 'refused', eventId: 'e2', rule: 'role', reason: 'Only an admin can do that.' }]), [{} as never, {} as never]),
    ).rejects.toThrow('event 1 refused by role: Only an admin can do that.');
  });
});
```

  `session.test.ts`: extend the file's fake client so `post` records calls; assert `session.post('/v1/workspaces', { name: 'X' })` sends the token and that a first 401 triggers one re-login then succeeds (14.300); a 403 throws without re-login. Hosted: assert the in-process `post` carries `Authorization: Bearer <access token>` (14.301).
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement.** `session.ts`: add `post(path: string, body: unknown): Promise<unknown>;` to the type and `post: (path, body) => withReauth((token) => deps.client.post(path, body, token)),`; `lazy-session.ts`: `post: async (path, body) => (await resolved()).post(path, body)` mirroring its `get`; `in-process-fetch.ts` `hostedSession`: `post: (path, body) => client.post(path, body, accessToken),`. Move `submitOne` and the `envelope` builder into `tools/submit.ts` (generalise `envelope` to take `entity`), add:

```ts
export async function submitBatch(session: Session, events: SubmittedEvent[]): Promise<unknown[]> {
  const body = (await session.postEvents(events)) as { results: Array<Record<string, unknown> & { status: string }> };
  body.results.forEach((result, index) => {
    if (result.status === 'refused') throw new Error(`event ${index} refused by ${String(result.rule)}: ${String(result.reason)}`);
    if (result.status === 'invalid') throw new Error(`event ${index} ${String(result.code)}: ${String(result.message)}`);
  });
  if (body.results.length !== events.length) throw new Error('gisik-nokma answered a different number of results than events sent');
  return body.results;
}
```

  `write-tools.ts` imports `submitOne`/`envelopeFor` from `./submit.js` (its ticket envelope = `envelopeFor(session, ws, { kind: 'ticket', id }, type, payload)`).
- [ ] **Step 4: Pass**; `packages/mcp-server` + `apps/server` suites; build (mcp-server before server).
- [ ] **Step 5: Catalogue + commit.** Flip 14.300–14.303. Commit `MCP CRUD 5: Session.post in every door; shared submit helpers (14.300-14.303)`.

---

### Task 6: Workspace tools

**Files:**
- Create: `packages/mcp-server/src/tools/directory.ts`, `packages/mcp-server/src/tools/workspace-tools.ts`
- Modify: `packages/mcp-server/src/tools/register.ts:13` (`allTools`)
- Test: `packages/mcp-server/test/workspace-tools.test.ts` (new)

**Interfaces:**
- Consumes: Task 5's `post`, `submitOne`, `envelopeFor`.
- Produces (`directory.ts`): `readDirectory(session): Promise<DirectoryWorkspace[]>` (from `GET /v1/me/workspaces`), `readDeleted(session): Promise<DeletedItem[]>` (from `GET /v1/me/deleted-items`), `confirmName(expected: string, given: string | undefined): void` (throws `confirm_name must be "<expected>"`). Tools: `get_workspace`, `create_workspace`, `rename_workspace`, `archive_workspace`, `restore_workspace`, `delete_workspace`, `undelete_workspace`; `list_workspaces` moves here with `include`.

Cases (same MCP section):

```markdown
- ❌ **14.304 — `create_workspace` POSTs `/v1/workspaces` `{name, prefix?}` and returns `{workspaceId}`; a 400/422 is passed through;** control: no prefix → body without the key. Mutation: send `prefix: undefined`.
- ❌ **14.305 — `get_workspace` answers name, prefix, role, archived, project count from the directory, and for a deleted workspace says it is deleted and names `undelete_workspace`;** control: an unknown id → "not found or not visible". Mutation: read a stale cache.
- ❌ **14.306 — `rename_workspace` emits `workspace.renamed {name}` against the workspace entity with origin `mcp`; a member's refusal comes back verbatim;** control: the envelope passes `parseEvent`. Mutation: origin `web`.
- ❌ **14.307 — `archive_workspace` and `delete_workspace` refuse without `confirm_name` or with a non-matching one, naming the expected name, and send NOTHING;** control: the exact name sends one event. Mutation: compare case-insensitively.
- ❌ **14.308 — `confirm_name` is checked against the CURRENT name (read at call time), so after a rename the old name is refused;** control: the new name passes. Mutation: compare against a name passed earlier in the session.
- ❌ **14.309 — `delete_workspace` emits `workspace.deleted` and NEVER `purge.marked`; its result says it is restorable from Deleted items for 15 days;** control: `undelete_workspace` emits `workspace.undeleted`. Mutation: append `purge.marked`.
- ❌ **14.310 — `restore_workspace` / `undelete_workspace` need no `confirm_name`;** control: they still refuse an unknown id with the server's reason. Mutation: require confirm_name.
- ❌ **14.311 — an owner-only refusal (a member archiving) returns `WORKSPACE_OWNER_ONLY_REASON` verbatim;** control: owner commits. Mutation: reword the refusal.
- ❌ **14.312 — `list_workspaces` defaults to LIVE workspaces; `include: ['archived']` adds archived (flagged); `include: ['deleted']` adds deleted ones from Deleted items (flagged `deleted: true`);** control: with both includes, all three kinds appear once. Mutation: default to archived-included (today's behaviour).
```

- [ ] **Step 1: Failing tests.** `packages/mcp-server/test/workspace-tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { workspaceTools } from '../src/tools/workspace-tools.js';
import type { Session } from '../src/session.js';

const USER = '01J0A5ER0000000000000000AA';
const WS = '01J0WS000000000000000000AA';
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-01T10:00:00.000Z' }] };

function fake(dir: { name: string; archived?: boolean }[] = [{ name: 'Convenience Corner' }], deleted: unknown[] = []) {
  const sent: unknown[][] = []; const posts: Array<[string, unknown]> = [];
  const workspaces = dir.map((w, i) => ({ workspaceId: i === 0 ? WS : `01J0WS00000000000000000${i}AA`, name: w.name, prefix: 'CC', role: 'owner', archived: w.archived ?? false, projects: [] }));
  const session: Session = {
    userId: () => USER,
    get: async (path) => (path === '/v1/me/workspaces' ? { workspaces } : path === '/v1/me/deleted-items' ? { items: deleted } : {}),
    post: async (path, body) => { posts.push([path, body]); return { workspaceId: WS }; },
    postEvents: async (events) => { sent.push(events); return COMMITTED; },
  };
  return { session, sent, posts, workspaces };
}
const tool = (name: string, s: Session) => {
  const t = workspaceTools(s).find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};

describe('14.304–14.312 workspace tools', () => {
  it('14.304 create_workspace posts the founding door; no prefix → no key', async () => {
    const f = fake();
    await expect(tool('create_workspace', f.session).handler({ name: 'Shop' })).resolves.toEqual({ workspaceId: WS });
    expect(f.posts[0]).toEqual(['/v1/workspaces', { name: 'Shop' }]);
  });
  it('14.306 rename emits a parseable workspace.renamed with origin mcp', async () => {
    const f = fake();
    await tool('rename_workspace', f.session).handler({ workspaceId: WS, name: 'Corner Shop' });
    const e = f.sent[0]?.[0] as Record<string, unknown>;
    expect(e).toMatchObject({ type: 'workspace.renamed', origin: 'mcp', actorId: USER, entity: { kind: 'workspace', id: WS }, payload: { name: 'Corner Shop' } });
    expect(parseEvent({ ...e, serverTime: '2026-10-01T10:00:00.000Z', seq: 1 }, domainRegistry).ok).toBe(true);
  });
  it('14.307 archive/delete refuse without or with a wrong confirm_name and send nothing', async () => {
    for (const name of ['archive_workspace', 'delete_workspace']) {
      const f = fake();
      await expect(tool(name, f.session).handler({ workspaceId: WS })).rejects.toThrow('confirm_name must be "Convenience Corner"');
      await expect(tool(name, f.session).handler({ workspaceId: WS, confirm_name: 'convenience corner' })).rejects.toThrow('confirm_name must be "Convenience Corner"');
      expect(f.sent).toEqual([]);
      await tool(name, f.session).handler({ workspaceId: WS, confirm_name: 'Convenience Corner' }); // control
      expect(f.sent).toHaveLength(1);
    }
  });
  it('14.309 delete is soft: workspace.deleted only, never purge.marked', async () => {
    const f = fake();
    const result = await tool('delete_workspace', f.session).handler({ workspaceId: WS, confirm_name: 'Convenience Corner' });
    expect(f.sent.flat().map((e) => (e as { type: string }).type)).toEqual(['workspace.deleted']);
    expect(JSON.stringify(result)).toMatch(/Deleted items/);
  });
  it('14.312 list_workspaces defaults to live; include adds archived/deleted', async () => {
    const f = fake([{ name: 'Live' }, { name: 'Old', archived: true }], [{ kind: 'workspace', id: 'D', workspaceId: 'D', label: 'Gone', deletedAt: '2026-09-30T00:00:00Z' }]);
    const names = async (args: object) => ((await tool('list_workspaces', f.session).handler(args)) as { workspaces: { name: string }[] }).workspaces.map((w) => w.name);
    expect(await names({})).toEqual(['Live']);
    expect(await names({ include: ['archived'] })).toEqual(['Live', 'Old']);
    expect(await names({ include: ['archived', 'deleted'] })).toEqual(['Live', 'Old', 'Gone']); // control
  });
});
```

  Add 14.305, 14.308 (rename the directory entry between two calls; the old name refused), 14.310, 14.311 (a `postEvents` returning `{status:'refused', rule, reason: WORKSPACE_OWNER_ONLY_REASON}` → thrown verbatim) in the same shape.
- [ ] **Step 2: Run to fail** (`cd packages/mcp-server && pnpm exec vitest run test/workspace-tools.test.ts > /tmp/mcpcrud-t6.log 2>&1; tail -30 /tmp/mcpcrud-t6.log`).
- [ ] **Step 3: Implement.** `directory.ts`:

```ts
import type { Session } from '../session.js';
export type DirectoryWorkspace = { workspaceId: string; name: string; prefix: string; role: string; archived: boolean; projects: DirectoryProject[] };
export type DirectoryProject = { projectId: string; name: string; description: string | null; prefix: string; archived: boolean; ticketCount?: number };
export async function readDirectory(session: Session): Promise<DirectoryWorkspace[]> {
  return ((await session.get('/v1/me/workspaces')) as { workspaces: DirectoryWorkspace[] }).workspaces;
}
export async function readDeleted(session: Session): Promise<Array<{ kind: string; id: string; workspaceId: string; label: string; deletedAt: string }>> {
  return ((await session.get('/v1/me/deleted-items')) as { items: never[] }).items;
}
/** Exact, case- and whitespace-sensitive — owner ruling M2 (2026-10-01): a misread instruction must not hit the wrong item. */
export function confirmName(expected: string, given: string | undefined): void {
  if (given !== expected) throw new Error(`confirm_name must be "${expected}"`);
}
```

  `workspace-tools.ts` — `export function workspaceTools(session: Session): ToolDefinition[]` with each tool's zod `inputSchema` and handler; descriptions written for an assistant serving a non-technical person, e.g. `delete_workspace`: *"Move a workspace to Deleted items. It can be restored for 15 days with undelete_workspace — nothing is erased. Only the workspace owner can do this. `confirm_name` must be the workspace's exact current name; read it with get_workspace first."* Handlers: read the directory, find the workspace (404-style error "workspace not found or not visible to you" otherwise), `confirmName` where required, then `submitOne(session, envelopeFor(session, workspaceId, { kind: 'workspace', id: workspaceId }, type, payload))` with payload `{}` for archive/restore/delete/undelete (each is an empty strict object — `lifecycle-events.ts:20-22` and `membership.ts:236-239`) and `{ name }` for rename. `list_workspaces` (moved from read-tools; remove it there) applies `include`. `register.ts`: `allTools = [...readTools(s), ...writeTools(s), ...workspaceTools(s)]`.
- [ ] **Step 4: Pass**; mcp-server suite (the existing `register.test.ts` tool-count/name cases updated — they enumerate tool names); build.
- [ ] **Step 5: Catalogue + commit.** Flip 14.304–14.312; Features.md §14 bullet "✅ **The assistant manages workspaces** (MCP CRUD plan Task 6; `packages/mcp-server/src/tools/workspace-tools.ts`) — get, create, rename, archive/restore, delete (soft, to Deleted items)/undelete, list with `include`; archive and delete need the exact current name. Cases 14.304–14.312." Commit `MCP CRUD 6: workspace tools (14.304-14.312)`.

---

### Task 7: Project tools

**Files:**
- Create: `packages/mcp-server/src/tools/project-tools.ts`; Modify: `register.ts`, `read-tools.ts` (move `list_projects` here)
- Test: `packages/mcp-server/test/project-tools.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's `project.updated`, Task 5's `submitBatch`, Task 6's `directory.ts`.
- Produces: `get_project`, `create_project`, `update_project`, `archive_project`, `restore_project`, `delete_project`, `undelete_project`, `list_projects` (with `include`).

Cases:

```markdown
- ❌ **14.316 — `get_project` answers name, description, prefix, archived and ticket count from the directory; deleted → says so and names `undelete_project`;** control: unknown → not found. Mutation: drop description.
- ❌ **14.317 — `create_project` sends ONE batch: `project.created {name, description?, prefix?}` then `project.member_added {userId: caller, projectAdmin: true}`, both against the new project id, origin `mcp`;** control: both envelopes pass `parseEvent`. Mutation: two separate `postEvents` calls.
- ❌ **14.318 — `update_project` emits `project.updated` with only the given keys; `description: ""` → `null` (clears); neither key → refused locally;** control: name-only. Mutation: send both keys always.
- ❌ **14.319 — `archive_project`/`delete_project` refuse without or with a wrong `confirm_name` (exact current project name) and send nothing;** control: exact name sends one event. Mutation: trim before comparing.
- ❌ **14.320 — `delete_project` emits `project.deleted` only, never `purge.marked`; restorable for 15 days;** control: `undelete_project` → `project.undeleted`. Mutation: append `purge.marked`.
- ❌ **14.321 — after a rename, the OLD name is refused by delete/archive with the NEW name in the message;** control: the new name passes. Mutation: compare against a cached name.
- ❌ **14.322 — a member's admin-only refusal (`project.created`, `project.updated`, archive) comes back verbatim;** control: admin commits. Mutation: reword.
- ❌ **14.323 — `list_projects` defaults to live projects; `include` adds archived / deleted (from Deleted items, kind `project`, that workspace only);** control: both includes → each once. Mutation: include other workspaces' deleted projects.
```

- [ ] **Step 1: Failing tests** `packages/mcp-server/test/project-tools.test.ts` in Task 6's shape (fake directory with one workspace holding `projects: [{ projectId: P, name: 'Shop operations', description: null, prefix: 'SO', archived: false }]`), e.g.:

```ts
it('14.317 create_project founds with the pair in ONE batch', async () => {
  const f = fake();
  await tool('create_project', f.session).handler({ workspaceId: WS, name: 'Repairs', description: 'Fix list', prefix: 'RP' });
  expect(f.sent).toHaveLength(1); // one postEvents call
  const [created, added] = f.sent[0] as Array<Record<string, unknown>>;
  expect(created).toMatchObject({ type: 'project.created', payload: { name: 'Repairs', description: 'Fix list', prefix: 'RP' }, origin: 'mcp' });
  expect(added).toMatchObject({ type: 'project.member_added', entity: (created as { entity: unknown }).entity, payload: { userId: USER, projectAdmin: true } });
  for (const e of [created, added]) expect(parseEvent({ ...e, serverTime: '2026-10-01T10:00:00.000Z', seq: 1 }, domainRegistry).ok).toBe(true);
});
it('14.318 update_project sends only given keys; "" clears', async () => {
  const f = fake();
  await tool('update_project', f.session).handler({ projectId: P, name: 'Shop floor' });
  await tool('update_project', f.session).handler({ projectId: P, description: '' });
  expect(f.sent.map((b) => (b[0] as { payload: unknown }).payload)).toEqual([{ name: 'Shop floor' }, { description: null }]);
  await expect(tool('update_project', f.session).handler({ projectId: P })).rejects.toThrow(/name or description/);
});
```

  (`projectMemberAddedPayload` = `{ userId, projectAdmin }`, `membership.ts:191-196`.)
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** `project-tools.ts` — project lookup walks `readDirectory` for the `projectId` (and its workspace), `create_project` mints `newUlid()` for the project and calls `submitBatch(session, [created, memberAdded])`; descriptions mirror Task 6's tone; `list_projects` moved here with `include`. `register.ts` adds `...projectTools(s)`.
- [ ] **Step 4: Pass**; suites; build.
- [ ] **Step 5: Catalogue + commit.** Flip 14.316–14.323; Features.md §14 bullet. Commit `MCP CRUD 7: project tools (14.316-14.323)`.

---

### Task 8: `list_members`, two `list_tickets` scopes, plural filters through the MCP

**Files:**
- Modify: `packages/mcp-server/src/tools/read-tools.ts:74-108` (`list_tickets`), add `list_members`
- Test: `packages/mcp-server/test/read-tools.test.ts`

**Interfaces:**
- Consumes: Task 3 (schema plural keys + `"me"`), Task 4 (workspace route).
- Produces: `list_members({ workspaceId })` → `{ workspaceId, members: Array<{ userId, name, email?, role? }> }`; `list_tickets({ projectId? , workspaceId?, groupBy?, filter?, parentId?, cursor?, limit? })`.

Cases:

```markdown
- ❌ **14.328 — `list_members` reads `/members` (name, email where served, role) and, when that answers 404 (a guest), falls back to `/actor-names` (names only) — never the roster for a guest;** control: a member gets roles. Mutation: always read `/members`.
- ❌ **14.329 — `list_tickets` with `projectId` calls `/v1/projects/:id/tickets` and with `workspaceId` calls `/v1/workspaces/:id/tickets`, same query string;** control: identical params produce identical query strings. Mutation: ignore `workspaceId`.
- ❌ **14.330 — `list_tickets` refuses neither or both of `projectId`/`workspaceId` with a plain sentence, sending nothing; its description says which to use and that `"me"` works;** control: exactly one passes. Mutation: allow both.
- ❌ **14.331 — `filter` passes plural keys and `"me"` through unchanged (the server resolves `"me"`);** control: a singular spec is unchanged. Mutation: strip unknown keys client-side.
- ❌ **14.332 — the same three tools give the same answers through the hosted door and the stdio door (one code path, cf. 14.250–14.254);** control: the hosted parity harness stays green. Mutation: register a hosted-only variant.
```

- [ ] **Step 1: Failing tests** in `read-tools.test.ts` (its existing fake `Session`): `list_members` with a `get` that throws `new HttpError(404, …)` for `/members` and answers `{ names: [{ userId: 'G', displayName: 'Asha' }] }` for `/actor-names` → `members: [{ userId: 'G', name: 'Asha' }]`; with `/members` answering `{ members: [{ userId: 'M', displayName: 'Ravi', email: 'r@x', role: 'member' }] }` → that, no actor-names call. `list_tickets({ workspaceId: WS, filter: { assigneeId: 'me', closed: false } })` → requested path `/v1/workspaces/${WS}/tickets?filter=${encodeURIComponent('{"assigneeId":"me","closed":false}')}`; both/neither → rejects, no `get`.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement.** `list_tickets` inputSchema gains `workspaceId: z.string().min(1).optional()`, `projectId` becomes optional, a refine "pass exactly one of projectId (one project) or workspaceId (every project you can see)"; path chosen accordingly; `filterArg` already is `filterSpecSchema` (Task 3 widened it). `list_members` handler: try `session.get('/v1/workspaces/${id}/members')`; `catch (e) { if (e instanceof HttpError && e.status === 404) return actor-names mapped }`; map `displayName → name`. Description: *"The people in a workspace, so you can find someone's userId (for assignee filters or assigning). A guest sees only the people on tickets shared with them. Use `\"me\"` in filters for yourself."*
- [ ] **Step 4: Pass**; mcp-server + server (hosted parity) suites; build.
- [ ] **Step 5: Catalogue + commit.** Flip 14.328–14.332; Features.md §14 bullets amended (list_tickets scopes, list_members). Commit `MCP CRUD 8: list_members, list_tickets by workspace or project, plural filters (14.328-14.332)`.

---

### Task 9: Member help, the round trip through `/mcp`, and the browser pass

**Files:**
- Modify: `docs/manual.md` (§16 "Connecting Claude or ChatGPT" → add "What your assistant can do"; the workspace-home section → "Edit a project"), regenerate `packages/app-core/src/help/content.generated.ts` with the repo's generator
- Test: `apps/server/test/mcp/mcp-crud-round-trip.test.ts` (new), `packages/app-core/test/help-*.test.ts` as `check:help` requires

Cases:

```markdown
- ❌ **14.337 — manual §16 lists what the assistant can do (workspaces, projects, people, tickets by workspace or project) and states that deletes go to Deleted items for 15 days and need the exact name;** control: `pnpm check:help` green. Mutation: remove the "15 days" sentence (the section test reddens).
- ❌ **14.338 — the round trip through the hosted `/mcp` on a test app: create_workspace → create_project → update_project → archive_project (exact name) → restore_project → delete_project (exact name) → undelete_project → list_tickets {workspaceId, assigneeId:"me"} → delete_workspace (exact name) → undelete_workspace, every step answered and the ledger holding origin `mcp` on each event;** control: a wrong `confirm_name` mid-way changes nothing. Mutation: route one tool through a non-shared handler.
- 🧪 **14.339 — dev stack: connect via the hosted door (`MCP_PUBLIC_URL=http://localhost:3000`), run 14.338's steps through `tools/call`, then remove the test workspace (undeleted → deleted, left for the 15-day window) and record the ids;** Evidence: request/response summaries, no tokens.
- 🧪 **14.340 — 13.1612's browser pass (Edit from the card and header, three styles).**
```

- [ ] **Step 1: Failing test** `mcp-crud-round-trip.test.ts` — copy the bootstrap of the existing hosted round-trip test (14.290–14.293, find with `grep -rln "14.290" apps/server/test`), mint a hosted token for a signed-in test user, and drive `tools/call` for each step in 14.338 against `POST /mcp`, asserting each result and finally `SELECT type, origin FROM events WHERE actor_id = $1 AND type IN (…)` all `origin = 'mcp'`.
- [ ] **Step 2: Run to fail; Step 3: write the manual text** (plain language, the M2 safety sentences verbatim in meaning), regenerate the help content, **Step 4: pass** + `pnpm check:help` + whole battery; **Step 5: catalogue + commit** (flip 14.337–14.338; 14.339–14.340 stay 🧪 for the controller). Commit `MCP CRUD 9: manual §16, the /mcp round trip (14.337-14.340)`.

---

## Self-review

- **Spec coverage:** M1 → Tasks 1–2 (FD3 prefix immutable, FD6 no history screen); M2 → Tasks 6–7 (14.307–14.309, 14.319–14.321); M3 → Tasks 6–7 (+FD1, FD5, FD8, FD9); M4 → Task 8 (FD10); M5 → Task 3 (FD12); M6 → Task 3 (FD11); M7 → Tasks 4, 8 (FD13); §3 behaviour → Tasks 6–8; §4 security → refusal cases in every task; §5 testing → Task 9 round trip + per-task cases; §6 out of scope respected (no purge, no member management, no UI adoption of plural filters).
- **Placeholders:** where a test harness is reused (permission harness, page render harness, hosted round-trip bootstrap) the step names the file to copy and the exact assertions; no TBD.
- **Type consistency:** `resolveMeInSpec(spec, viewerId)`, `readList(…, projectId: string | null, …)`, `Session.post(path, body)`, `submitBatch(session, events)`, `envelopeFor(session, workspaceId, entity, type, payload)`, `confirmName(expected, given)`, `readDirectory`/`readDeleted` — used identically across Tasks 3–8.
- **Review Focus:** each line has its pinning case (14.321, 7.705, 7.710, 14.317, 13.1602).
