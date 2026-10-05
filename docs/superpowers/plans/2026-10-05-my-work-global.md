# My work, global and filtered: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In gisik-nokma, lanes execute one task per session, from a PTR cut from this plan.

**Goal:** a global `/my-work` page whose "Needs your attention" section shows by default only tickets I created or that are assigned to me. A multiselect "Show" filter (Created by me / Assigned to me / Workspaces I own or run / Projects I run) and a "Group" toggle (by workspace and project, or flat) change the view, and both choices are remembered per user.

**Architecture:**
- The server gains three things:
  - a projected `proj_tickets.created_by` column;
  - an opt-in `show` filter on the EXISTING per-workspace attention route (its default stays unchanged, because `getWorkspaceSettings` reads the same body);
  - an `adminProjectIds` field on `/v1/me/workspaces` rows, plus a small user-level My work preferences document.
- The web page goes global by FANNING OUT over the user's workspaces on the client. It reuses the per-workspace attention and my-work reads, their mappers, contests and live queries, and merges the results. A pure grouping helper builds the workspace → project tree.
- MCP mirrors this with an optional `workspaceId` (absent = fan out) and `show`.

**Tech Stack:**
- server: Fastify, Postgres, node-pg-migrate, vitest (test DB 54329);
- app-core: React (packages/app-core) and vitest/jsdom;
- web: Next.js 15 (apps/web);
- MCP: packages/mcp-server (zod).

**Spec:** `docs/superpowers/specs/2026-10-05-my-work-global-design.md` (owner-approved 2026-10-05).

## Global Constraints

- **Release** `release/my-work-global`, cut from `main` at `66c46fdd`. Every task branches from it and PRs `--base release/my-work-global`.
- **Migration prefixes pinned:**
  - `1791400000000_proj-tickets-created-by.sql` (T1);
  - `1791400100000_user-my-work-preferences.sql` (T2).

  Both are ABOVE main's newest (`1791300000000`) and BELOW the lowest migration pending on KG/WG (`1791500000000`). No other prefix is allowed.
- **`show` values,** spelled exactly: `created`, `assigned`, `ws-admin`, `project-admin`.
  - The UI and MCP default is `created,assigned`.
  - The per-workspace attention ROUTE default (no `show` param) stays today's all-visible answer.
- **"Show" chip labels, verbatim:**
  - "Created by me";
  - "Assigned to me";
  - "Workspaces I own or run" (offered when the viewer's role is `owner` or `admin` in at least one workspace);
  - "Projects I run" (offered when `adminProjectIds` is non-empty in at least one workspace).
- **"Group" labels, verbatim:** "By workspace and project" (default) and "Flat".
- **The filter applies to "Needs your attention" only.** The assigned list stays "assigned to me". The grouping applies to BOTH sections.
- **Archived workspaces are excluded** from the global page. A planner decision: the spec is silent, and archived means read-only. Deleted workspaces are already absent from `/v1/me/workspaces`.
- **Visibility always bounds every arm.** `visibleTicketsWhere`, `t.closed_at IS NULL` and `LIVE_TICKET_WHERE` stay in the attention WHERE.
- **Catalogue:**
  - a NEW section file `test-cases/30-my-work-global.md` (section 30 is free on main, KG and WG as of 2026-10-05), with case ids **30.001–30.099**, allocated per task below;
  - Features.md: edit the "My Work and the attention strip" bullet (`Features.md:81` on main) and add bullets, in the same commit as the code.
- **Owner rung +1 on every task.** Node 22 for every install and run.

## Review Focus

1. **A ticket I both created and am assigned to** appears ONCE (SQL `OR`, not a union of two lists). T1 test 30.004.
2. **A `ws-admin` viewer in workspace A who is a plain member in workspace B:** B's tickets are NOT widened. The arm is per workspace, from that workspace's role. T1 test 30.006.
3. **A user with no tickets at all:** the page shows the empty-state copy with the chips still live, not a blank page or a spinner. T4 test 30.044.
4. **A ticket moved to another project** groups under its CURRENT project (`card.projectId`), never under a stale name. T3 test 30.024.
5. **The longest workspace and project names at 360 px:** headers wrap and the cards do not overflow. T4 browser step 30.047.

---

### Task 1 (server): `created_by` column, and the `show` filter on the attention route

**Rung:** H, plus the owner's +1 = **H+**. **Branch:** `task/mwg-t1-server-show`. **Cases:** 30.001–30.012.

**Files:**
- Create: `apps/server/migrations/1791400000000_proj-tickets-created-by.sql`
- Modify: `apps/server/src/projections/tickets.ts` (`upsertTicket` `:285` column list; `ticketsProjection.apply` `:529-576`)
- Modify: `apps/server/src/routes/attention.ts` (`readAttention` `:170`; WHERE `:179-201`; route `:413-433`)
- Modify: `apps/server/src/routes/workspaces.ts` (`/v1/me/workspaces` row build, around `:206-237`)
- Test: `apps/server/test/projections/proj-tickets-created-by.test.ts` (pattern: `test/projections/proj-projects-founding-name.test.ts`)
- Test: `apps/server/test/routes/attention-show.test.ts`
- Test: `apps/server/test/routes/me-workspaces-admin-projects.test.ts`

**Interfaces:**
- Produces:
  - `GET /v1/workspaces/:ws/attention?show=created,assigned,ws-admin,project-admin`, with a comma-separated set and the same `AttentionResponse` shape;
  - `readAttention(db, eff, viewerId, workspaceId, now, show?: ReadonlySet<AttentionShow>)`;
  - `export type AttentionShow = 'created' | 'assigned' | 'ws-admin' | 'project-admin'` and `export const ATTENTION_SHOW_VALUES` in `packages/domain/src/read-models.ts`;
  - each `/v1/me/workspaces` row gains `adminProjectIds: string[]`.

- [ ] **Step 1: the migration, its backfill and the projection, failing test first.** In `proj-tickets-created-by.test.ts`, follow the founding-name test's `halves()`, then up, then rebuild shape:

```ts
it('30.001 backfills created_by from each ticket.created actor and equals a rebuild', async () => {
  // seed: two tickets created by u1 and u2 BEFORE the migration (run the down half first, then the up half)
  await runUp(db);
  const rows = await db.query('SELECT ticket_id, created_by FROM proj_tickets ORDER BY ticket_id');
  expect(rows.rows).toEqual([{ ticket_id: t1, created_by: 'u1' }, { ticket_id: t2, created_by: 'u2' }]);
  await rebuildProjection(db, ticketsProjection);              // the rebuild path must produce the same column
  expect((await db.query('SELECT ticket_id, created_by FROM proj_tickets ORDER BY ticket_id')).rows).toEqual(rows.rows);
  expect(await verifyProjections(db)).toEqual(expect.objectContaining({ ok: true })); // same helper as the founding-name test
});
it('30.002 a ticket created after the migration gets its creator; a later event by someone else does not change it', …);
```

Migration (copy the founding-name backfill shape):

```sql
-- Up Migration
ALTER TABLE proj_tickets ADD COLUMN created_by text NULL;
UPDATE proj_tickets t
   SET created_by = c.actor_id
  FROM (SELECT DISTINCT ON (entity_id) entity_id, actor_id
          FROM events
         WHERE entity_kind = 'ticket' AND type = 'ticket.created'
         ORDER BY entity_id, seq) c
 WHERE c.entity_id = t.ticket_id;
CREATE INDEX proj_tickets_ws_created_by ON proj_tickets (workspace_id, created_by);
COMMENT ON COLUMN proj_tickets.created_by IS 'The actor of the ticket.created event (my-work-global T1). Written once on insert; never updated.';
-- Down Migration
DROP INDEX IF EXISTS proj_tickets_ws_created_by;
ALTER TABLE proj_tickets DROP COLUMN IF EXISTS created_by;
```

In `tickets.ts`, `upsertTicket` gains a `createdBy: string | null` argument, inserted as `created_by` and **left out of `ON CONFLICT … DO UPDATE SET`** (written once, like `workspace_id`). `apply` passes `env.actorId` when `env.type === 'ticket.created'` and `null` otherwise. Because the column is absent from the update list, a later event keeps the stored value. Do NOT add a creator to `TicketState`: it would change the shared reducer and its fold.

- [ ] **Step 2: run it RED, implement it, run it GREEN.** `pnpm --filter @gisik-nokma/server exec vitest run test/projections/proj-tickets-created-by.test.ts`. `pnpm check:migrations` must stay green.

- [ ] **Step 3: the `show` filter, failing tests first** (`attention-show.test.ts`). The rig is one workspace W1 where the viewer V is an `admin`, and W2 where V is a `member`. P1 in W1 has V as project admin (an explicit roster row with `project_admin`); P2 in W1 does not. Tickets, all blocked so they qualify for a bucket:
  - tc: created by V, unassigned;
  - ta: assigned to V, created by U;
  - tb: created by V AND assigned to V;
  - tp: in P1, neither;
  - tw: in P2, neither;
  - plus a W2 ticket that is neither.

| Case | Request | Expected |
|---|---|---|
| 30.003 | no `show` | today's all-visible answer (tc, ta, tb, tp, tw), the control for the default |
| 30.004 | `show=created,assigned` | exactly {tc, ta, tb}, with tb ONCE |
| 30.005 | `show=created` / `show=assigned` | {tc, tb} / {ta, tb} |
| 30.006 | `show=ws-admin` on W1 | all W1 qualifying tickets. On W2 (V is a member) → **400 `{error:'invalid_query'}`**, because the viewer does not hold that role there. The UI never offers it, and refusing beats silently widening. |
| 30.007 | `show=project-admin` on W1 | {tp} only (not tw) |
| 30.008 | `show=` (empty), `show=bogus`, a repeated `show` param | 400 `invalid_query` |
| 30.009 | `show=created` for a W2 ticket V created that is hidden from V by an explicit `visibility.set` to [U] (rule A puts a member on every live project, and `visibleTicketsWhere` has no creator arm; AMEND 16:3x) | absent, because visibility bounds every arm. **Control, same `it()`:** another V-created W2 ticket without the restriction IS returned |
| 30.010 | `getWorkspaceSettings` reuse (the online client reads settings from this body) | the no-`show` request still carries `settings`, the regression control |

Implementation in `readAttention`:

```ts
if (show !== undefined) {
  const arms: string[] = [];
  if (show.has('created')) arms.push(`t.created_by = ${params.add(viewerId)}`);
  if (show.has('assigned')) arms.push(`t.assignee_id = ${params.add(viewerId)}`);
  if (show.has('ws-admin')) arms.push('TRUE'); // the route already refused unless eff.workspaceRole is owner|admin in THIS workspace
  if (show.has('project-admin')) {
    const ids = [...eff.projects].filter(([, p]) => p.projectAdmin).map(([id]) => id);
    arms.push(ids.length === 0 ? 'FALSE' : `t.project_id = ANY(${params.add(ids)}::text[])`);
  }
  where.push(`(${arms.join(' OR ')})`);
}
```

Route parsing: `show` must be a single string. Split it on `,`; every value must be in `ATTENTION_SHOW_VALUES`, with at least one value. Duplicates collapse. Refuse `ws-admin` unless `eff.workspaceRole` is `owner` or `admin`. Refuse `project-admin` unless some project is `projectAdmin`. All refusals are `400 { error: 'invalid_query' }`.

- [ ] **Step 4: `adminProjectIds` on `/v1/me/workspaces`.**
  - **30.011:** the row for W1 carries `adminProjectIds: [P1]`; the row for W2 carries `[]`.
  - **30.012:** an owner with no explicit project rows → `[]` (implicit `projectAdmin:false`, per `effective-role.ts:180-187`).

  Build the field from the `eff` that `workspaces.ts:206` already resolves: `[...eff.projects].filter(([, p]) => p.projectAdmin).map(([id]) => id).sort()`. The SERVER response type carries it as required (`adminProjectIds: string[]`). App-core's `WorkspaceRef` (`view-types.ts:172-221`) gets the line `  adminProjectIds?: string[];` directly under `role`. It is OPTIONAL (AMEND 16:3x, owner priority): a required field breaks about 65 typecheck sites in web, and that churn would also conflict when KG/WG later merge main. T1 owns `mappers.ts` and makes the mapper ALWAYS set it (`raw.adminProjectIds ?? []`). **30.012b** pins the mapper: a row with `[P1]` → `[P1]`, and a row without the field → `[]`. Every consumer reads `(w.adminProjectIds ?? [])`; TypeScript forces it, because the field is optional. T1 edits no web literal.

- [ ] **Step 4b: `show` on `GET /v1/contests` (AMEND 16:3x).** The strip appends every visible open contest (`mapAttention`), so without this an owner on the default filter still sees every contest in every workspace. That contradicts the owner's request.
  - Move the `show` parsing and its 400 refusals (Step 3) into one shared module, e.g. `apps/server/src/read/attention-show.ts`, exporting `parseShow(query, eff)` and `ticketMatchesShow(row, show, viewerId, eff)`. The attention route and the contests route (`sync/contests-route.ts:213`) both use it.
  - The contests route filters its rows by the joined `proj_tickets` row (`created_by`, `assignee_id`, `project_id`) when `show` is given. With no `show`, the answer is unchanged.
  - **30.059:** `show=created,assigned` returns only the contests on tickets V created or is assigned to. **Control, same `it()`:** with no `show`, all contests are returned.
  - **30.060:** `show=ws-admin` on the W2 rig (V is a member there) → 400 `invalid_query`.
  - **30.061:** `show=project-admin` → only the contests on P1's tickets.
  - **Kills:** the contests route ignores `show` → 30.059; the per-row test drops the assigned arm → 30.059.
  - **T3 consumes this:** `getAttention(ws, show)` passes `show` to BOTH URLs.

- [ ] **Step 5: Kills** (a driver in `roles/mut-out/mwg-t1/`; each mutant RED by the named case, controls GREEN before and after):
  - drop the `created` arm → 30.004/30.005;
  - `assignee_id` → `created_by` in the assigned arm → 30.005;
  - `OR` → `AND` in the arms join → 30.004;
  - remove the ws-admin role refusal → 30.006 (W2 leg);
  - `projectAdmin` filter dropped (all projects) → 30.007;
  - `created_by` added to `ON CONFLICT DO UPDATE` with the current event's actor → 30.002;
  - the backfill's `ORDER BY entity_id, seq` → `seq DESC` → EQUIVALENT by construction (one `ticket.created` per ticket; the ledger's per-entity seq makes a second impossible). Record it as equivalent, with that reason, in the driver output;
  - the default arm applied when `show` is undefined → 30.003/30.010.

- [ ] **Step 6: Features.md + test-cases.**
  - Create `test-cases/30-my-work-global.md`, with a header, §30.1 "Server" and 30.001–30.012 ✅ as each test lands.
  - Features.md:81: add "attention route accepts an opt-in `show` filter (created / assigned / ws-admin / project-admin; default unchanged); `proj_tickets.created_by`; `/v1/me/workspaces` rows carry `adminProjectIds`" with file paths.

- [ ] **Step 7: battery and commit.**
  - build, then typecheck (every tsconfig), then `vitest related` on the changed server files, plus `my-work*.test.ts`, `attention*.test.ts`, `workspaces*.test.ts` and `preferences.test.ts`;
  - `pnpm check:migrations`, `check:citations` and the case-id check;
  - `ctl bundle-fresh` if it exists on the base, otherwise build:webview, because the domain package changed (`ATTENTION_SHOW_VALUES`).

  Commit with message: `feat(server): created_by + attention show filter + adminProjectIds (my-work-global T1)`.

---

### Task 2 (server + domain): user-level My work preferences

**Rung:** M, plus the owner's +1 = **H**. **Branch:** `task/mwg-t2-prefs`. **Cases:** 30.013–30.018. Runs in parallel with T1. Merge-safety: it touches `app.ts` route registration only by ADDING one line beside `registerNotificationPreferencesRoutes`.

**Files:**
- Create: `apps/server/migrations/1791400100000_user-my-work-preferences.sql`
- Create: `packages/domain/src/my-work-preferences.ts` (and export it from the domain index)
- Create: `apps/server/src/my-work-preferences/store.ts`
- Create: `apps/server/src/routes/my-work-preferences.ts`
- Modify: `apps/server/src/app.ts` (register beside notification-preferences)
- Test: `apps/server/test/routes/my-work-preferences.test.ts`

**Interfaces:**
- Produces:
  - `GET /v1/me/my-work-preferences` → `MyWorkPreferences`;
  - `PUT /v1/me/my-work-preferences` (body `MyWorkPreferences`) → the stored doc;
  - `400 {error:'invalid_my_work_preferences'}` on a bad body.

  ```ts
  export const myWorkPreferencesSchema = z.object({
    show: z.array(z.enum(['created', 'assigned', 'ws-admin', 'project-admin'])).min(1).max(4),
    grouping: z.enum(['workspace-project', 'flat']),
  }).strict();
  export type MyWorkPreferences = z.infer<typeof myWorkPreferencesSchema>;
  export const DEFAULT_MY_WORK_PREFERENCES: MyWorkPreferences = { show: ['created', 'assigned'], grouping: 'workspace-project' };
  ```

- [ ] **Step 1: the migration.**

```sql
-- Up Migration
CREATE TABLE user_my_work_preferences (
  user_id    text PRIMARY KEY,
  doc        jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Down Migration
DROP TABLE IF EXISTS user_my_work_preferences;
```

- [ ] **Step 2: failing tests.**

| Case | Behaviour |
|---|---|
| 30.013 | GET with no row → `DEFAULT_MY_WORK_PREFERENCES` |
| 30.014 | PUT a valid doc → returns it; GET returns it, both for the same user |
| 30.015 | user B never sees user A's doc (a per-user key) |
| 30.016 | PUT `{show:[]}`, `{show:['bogus']}`, an extra key, or `grouping:'tree'` → 400 `invalid_my_work_preferences`, nothing stored (GET still returns the default or the previous doc) |
| 30.017 | anonymous → 401 |
| 30.018 | duplicate `show` values are de-duplicated on store (`['created','created']` → `['created']`) |

- [ ] **Step 3: implement.** Copy `routes/notification-preferences.ts` and `notification-preferences/store.ts` exactly, with an upsert `INSERT … ON CONFLICT (user_id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`. De-duplicate in the route (`[...new Set(parsed.data.show)]`) before storing.

- [ ] **Step 4: Kills.**
  - `.min(1)` dropped → 30.016;
  - `.strict()` dropped → 30.016 (the extra-key leg);
  - the store keyed on a constant instead of `user_id` → 30.015;
  - the default not returned for no row (`null`) → 30.013;
  - the de-dupe removed → 30.018.

- [ ] **Step 5: catalogue, battery and commit.** test-cases §30.2 "Preferences" (30.013–30.018). Features.md: a new bullet "My work preferences (user-level): `/v1/me/my-work-preferences`" with paths. Then build:webview or `ctl bundle-fresh` (the domain changed), and commit.

---

### Task 3 (app-core): data source, global hooks, grouping, and the Show and Group controls

**Rung:** H, plus the owner's +1 = **H+**. **Branch:** `task/mwg-t3-app-core`. **Cases:** 30.019–30.035. It starts IN PARALLEL with T1 and T2 against the pinned contracts above. Its tests use fake/mocked data sources, never the live server. It must rebase onto (tipmerge) the release tip after T1 and T2 land, before its REVIEW.

**Files:**
- Modify: `packages/app-core/src/data-source.ts` (`getAttention` `:419`, preferences block `:450-452`)
- Modify: `packages/app-core/src/online/online-data-source.ts` (`getAttention` `:570-577`; add the two preference calls)
- Modify: `packages/app-core/src/online/mappers.ts` (`mapAttention` `:2582`, `mapAttentionItem` `:2691`: carry `workspaceId`)
- Modify: `packages/app-core/src/view-types.ts` (`AttentionItem` `:880-887` gains `workspaceId: string`; `WorkspaceRef` gains the line `  adminProjectIds?: string[];` directly under its `role` line (OPTIONAL, AMEND 16:3x: required would break about 65 literals in web alone), BYTE-IDENTICAL to T1's line so the tipmerge is clean (prove it with `git merge-tree` before the REVIEW); the mapper half belongs to T1 alone, and T3's tests build `WorkspaceRef` values directly)
- Modify: `packages/app-core/src/replica/replica-data-source.ts` (the new preference methods → ReplicaGapError, same as `getAttention`)
- Create: `packages/app-core/src/views/my-work-global.ts` (pure: `groupByWorkspaceProject`, `showOptionsFor`)
- Create: `packages/app-core/src/views/use-global-my-work.ts` (hook)
- Create: `packages/app-core/src/views/my-work-controls.tsx` (`ShowFilter`, `GroupToggle`)
- Modify: `packages/app-core/src/views/attention-strip.tsx` and `views/my-work.tsx` (accept pre-grouped sections)
- Modify: `packages/app-core/src/index.ts` (exports)
- Test: `packages/app-core/test/views/my-work-global.test.ts`, `use-global-my-work.test.tsx`, `my-work-controls.test.tsx`

**Interfaces:**
- Consumes: T1's route and query (`show`) plus `adminProjectIds`; T2's `MyWorkPreferences`, `DEFAULT_MY_WORK_PREFERENCES` and routes.
- Produces:

```ts
// data-source.ts
getAttention(workspaceId: string, show?: readonly AttentionShow[]): Promise<AttentionItem[]>; // show absent = today's request, byte-identical URL
getMyWorkPreferences(): Promise<MyWorkPreferences>;
putMyWorkPreferences(prefs: MyWorkPreferences): Promise<MyWorkPreferences>;

// views/my-work-global.ts (pure)
export interface WorkspaceGroup<T> { workspaceId: string; workspaceName: string; projects: { projectId: string; projectName: string; items: T[] }[] }
export function groupByWorkspaceProject<T extends { workspaceId: string; projectId: string }>(
  items: readonly T[], workspaces: readonly WorkspaceRef[]): WorkspaceGroup<T>[];
// order: workspace name (localeCompare, 'en', sensitivity base), then project name; items keep their INPUT order (bucket order)
export function showOptionsFor(workspaces: readonly WorkspaceRef[]): AttentionShow[];
// always ['created','assigned']; + 'ws-admin' if any role owner|admin; + 'project-admin' if any (adminProjectIds ?? []).length > 0

// views/use-global-my-work.ts
export function useGlobalMyWork(source: DataSource, workspaces: readonly WorkspaceRef[], show: readonly AttentionShow[]): {
  attention: { data: AttentionItem[] | null; error: unknown; byWorkspace: Record<string, unknown> };
  myWork: { data: MyWorkView | null; error: unknown }; // AMEND 16:3x: the per-workspace MyWorkView merged per section; contested stays flat (ContestedClaim has no workspace/project)
};
// one live query per NON-ARCHIVED workspace; per workspace, `show` is INTERSECTED with what that workspace allows
// (ws-admin only where role is owner|admin; project-admin only where adminProjectIds non-empty; if the intersection is empty, skip the workspace).
// A failing workspace does not blank the others: its error is in byWorkspace, and the rest render.
```

- [ ] **Step 1: pure helpers, failing tests first** (`my-work-global.test.ts`).
  - **30.019:** grouping order, with workspaces "beta" and "Alpha" → Alpha first (case-insensitive); projects inside are sorted by name.
  - **30.020:** items keep their input order inside a project (feed overdue, then blocked; the output order is the same).
  - **30.021:** an item whose workspace is not in `workspaces` is dropped and logged (`console.warn` spy), not grouped under 'undefined'.
  - **30.022:** `showOptionsFor`:
    - a member everywhere → ['created','assigned'];
    - an admin in one → + 'ws-admin';
    - `adminProjectIds:['p']` in one → + 'project-admin'.
  - **30.023:** the project name comes from `WorkspaceRef.projects`; an unknown project → the name "Unknown project", never the id.
  - **30.024:** Review Focus 4. An item whose `projectId` changed between two calls groups under the new project.

- [ ] **Step 2: the data source.**
  - **30.025:** `getAttention('w1')` requests exactly today's URL (assert the fetch mock's URL string, the regression control).
  - **30.026:** `getAttention('w1', ['created','assigned'])` → `?show=created,assigned`.
  - **30.027:** the mapped items carry `workspaceId`.
  - **30.028:** `getMyWorkPreferences` / `putMyWorkPreferences` hit `/v1/me/my-work-preferences` (GET / PUT with a JSON body).
  - **30.029:** the replica's new methods reject with `ReplicaGapError`.

- [ ] **Step 3: the hook** (`use-global-my-work.test.tsx`, a fake source).
  - **30.030:** two workspaces → both are queried with the intersected `show`. The member workspace never receives `ws-admin` (spy args).
  - **30.031:** an archived workspace is not queried.
  - **30.032:** one workspace rejects → the other's items still render, and `byWorkspace[failing]` holds the error.
  - **30.033:** a `show` change re-queries (the new args), and the old results are not shown under the new filter (no stale flash: assert that the first render after the change is `null` or the new data, never the old).

- [ ] **Step 4: controls** (`my-work-controls.test.tsx`).
  - **30.034:** `ShowFilter` renders the offered options with the verbatim labels. `aria-pressed` reflects the selection, and pressing the LAST selected chip does nothing (it stays selected, `onChange` is not called).
  - **30.035:** `GroupToggle` renders "By workspace and project" / "Flat" as a two-option radio group (`role="radiogroup"`, arrow keys move the selection).

  Use the existing neo chip and segmented styles in `ui.css`. Any new CSS block goes ABOVE the "LOADING PLACEHOLDERS" block (the 25.019 trap).

- [ ] **Step 5: grouped rendering (AMEND 16:3x).**
  - `AttentionStrip` accepts `groups?: WorkspaceGroup<AttentionItem>[]` and renders `<h2>` workspace and `<h3>` project headings. `ATTENTION_CAP` still holds: the strongest 5 rows across all groups, drawn under their own headings.
  - `MyWork` accepts `groups?: { assigned, inTransit, shared: WorkspaceGroup<WorkItem>[] }` and renders `<h3>` workspace and `<h4>` project headings inside its existing `<h2>` sections. Contested stays flat. Without it, they render as today. The tests for both arms live under case 30.020 (grouped: headings in the pinned order; ungrouped: today's markup, unchanged).

- [ ] **Step 6: Kills.**
  - `groupByWorkspaceProject` sort removed → 30.019;
  - the item order re-sorted inside a project → 30.020;
  - `showOptionsFor`'s owner|admin check widened to member → 30.022;
  - the hook not intersecting `show` per workspace → 30.030;
  - archived not filtered → 30.031;
  - `Promise.all` in place of a per-workspace settle → 30.032;
  - the last-chip guard removed → 30.034;
  - `getAttention` always appending `?show=` → 30.025.

- [ ] **Step 7: catalogue, battery and commit.** test-cases §30.3 "Client" (30.019–30.035). Features.md: edit `:81` (the client half). Then the app-core suite for the changed files plus the web suite (the ui.css trap: a `ui.css` diff ⇒ app-core + web suites), the web typecheck (2 configs), then commit.

---

### Task 4 (web): the global `/my-work` page, redirect, links and browser pass

**Rung:** H, plus the owner's +1 = **H+**. **Branch:** `task/mwg-t4-web`. **Cases:** 30.036–30.050. NEEDS T3 landed (it builds on app-core's exports).

**Files:**
- Create: `apps/web/app/my-work/page.tsx` (the global page), and `apps/web/app/my-work/loading.tsx` using the existing skeleton (`screen-skeletons.tsx` My work rows)
- Modify: `apps/web/app/w/[workspaceId]/my-work/page.tsx` → a client redirect to `/my-work`, keeping `?ticket=` as `?ticket=<id>&ws=<workspaceId>`
- Modify the links:
  - `apps/web/src/app-nav.tsx:364-365`;
  - `apps/web/src/bottom-bar.tsx:80` (`scope: 'global'`) and `:147`;
  - `apps/web/app/inbox/page.tsx:208`;
  - `apps/web/app/invite/[token]/page.tsx:111`;
  - `apps/web/app/workspaces/page.tsx:639`;
  - `apps/web/app/w/[workspaceId]/page.tsx:812`;
  - `packages/app-core/src/preferences/bottom-bar.ts:29,41,55` (if it encodes the scope).
- Test: `apps/web/test/my-work-global.test.tsx`, `apps/web/test/my-work-redirect.test.tsx`

**Interfaces:**
- Consumes: T3's `useGlobalMyWork`, `groupByWorkspaceProject`, `showOptionsFor`, `ShowFilter`, `GroupToggle` and the data-source preference methods; the existing `useMyWorkspaces()`.
- Produces: the route `/my-work` with `?ticket=<ticketId>&ws=<workspaceId>`.

- [ ] **Step 1: failing tests.**

| Case | Behaviour |
|---|---|
| 30.036 | `/my-work` renders "My work" with BOTH sections across two workspaces (fake source), grouped by default: workspace headings, then project headings |
| 30.037 | "Flat" → no headings; each card shows a small "Workspace · Project" label |
| 30.038 | toggling a chip calls `putMyWorkPreferences` with the new doc; a reload (remount) restores it from `getMyWorkPreferences` |
| 30.039 | preferences GET fails → the defaults are used, the page still renders, and no write fires |
| 30.040 | `/w/W1/my-work` → redirects to `/my-work`; `/w/W1/my-work?ticket=T` → `/my-work?ticket=T&ws=W1` |
| 30.041 | `/my-work?ticket=T&ws=W1` opens the ticket sheet for T in W1; closing it returns to `/my-work` (no `ticket`/`ws` params) |
| 30.042 | `?ticket=T` with no or unknown `ws` → no sheet, the page renders, nothing throws |
| 30.043 | every nav entry point (app-nav, bottom-bar, inbox empty state, invite accept, workspaces page, workspace home) links to `/my-work` (assert the hrefs/pushes; a grep-based test over the six files is acceptable as a census) |
| 30.044 | Review Focus 3. No tickets anywhere → "Nothing needs your attention for <summary>" with the chips live. `<summary>` is the selected chip labels joined with " and ", lower-case after the first word, e.g. "Nothing needs your attention for created by me and assigned to me" |
| 30.045 | a member-only user sees two chips; an admin sees three; a project admin sees the "Projects I run" chip |
| 30.046 | the ticket-sheet opener passes the item's OWN `workspaceId` (two workspaces, open one in each) |

- [ ] **Step 2: implement.** Model the page on the current `w/[workspaceId]/my-work/page.tsx` (sheet mount `:376-471`, `?ticket=` handling `:175/:298/:312`). Replace `useParams().workspaceId` with `?ws=` for the sheet only. `AppNav` without a workspace renders its global form; check how `/inbox` mounts it and do the same. `useActorLabels` takes the list of workspace ids.

- [ ] **Step 3: browser pass** (a lane port; never a lane Docker stack, per rule #23; use the primary dev stack read-only or the static fixture sweep from memory browser-measurement).
  - **30.047:** at 360 / 768 / 1280 with the longest seeded workspace and project names, the headers wrap and there is no horizontal scroll (`scrollWidth <= clientWidth`, measured).
  - **30.048:** the chips meet the tap-target minimum at 360 (the existing tap-target census includes `/my-work`; add the route to its list if it is keyed by path).
  - **30.049:** dark mode tokens (no hard-coded colours; the existing contrast census passes).
  - **30.050:** keyboard: Tab reaches the chips, then the group toggle, then the first card, in that order.

- [ ] **Step 4: Kills.**
  - the redirect drops `ticket` → 30.040;
  - the sheet uses the first workspace instead of `ws` → 30.046;
  - preferences not persisted → 30.038;
  - a defaults fallback missing (throws on GET failure) → 30.039;
  - one nav link left on `/w/…/my-work` → 30.043;
  - an empty-state summary built from ALL chips rather than the selected ones → 30.044.

- [ ] **Step 5: catalogue, battery and commit.** test-cases §30.4 "Web" (30.036–30.050). Features.md: a new ✅ bullet "Global My work page `/my-work`" with paths; edit the nav bullets that name the old route. Then the web suites, both web typecheck configs, the e2e-stack locator grep for `my-work` (lazy/role change ⇒ grep e2e-stack locators), and commit.

---

### Task 5 (MCP): global `my_work` / `get_attention` with `show`

**Rung:** M, plus the owner's +1 = **H**. **Branch:** `task/mwg-t5-mcp`. **Cases:** 30.051–30.058. NEEDS T1 landed (the `show` param on the route).

**Files:**
- Modify: `packages/mcp-server/src/tools/discovery-tools.ts:46-63`
- Test: `packages/mcp-server/test/tools/discovery-tools.test.ts` (and the hosted suite's tool-schema snapshot, if one exists; grep `get_attention` in `apps/server/test`)

**Interfaces:**
- `get_attention` input: `{ workspaceId?: string; show?: AttentionShow[] }`.
  - `show` defaults to `['created','assigned']`.
  - With no `workspaceId`: list `/v1/me/workspaces`, skip archived workspaces, and call each workspace's attention route with the per-workspace intersected `show` (the same rule as T3's hook; reuse `showOptionsFor`'s logic or call the same function from app-core if mcp-server already depends on it, otherwise inline it with a comment that cites T3's file). Return `{ workspaces: [{ workspaceId, name, items }] }`.
  - With a `workspaceId`: one call, and the answer has today's shape.
- `my_work` input: `{ workspaceId?: string }`. Absent → the same fan-out over `/v1/me/work?workspaceId=`.
- Descriptions, verbatim:
  - `get_attention`: "What needs your attention: overdue, due soon, stale and blocked work. By default only tickets you created or that are assigned to you, across all your workspaces; pass show to include 'ws-admin' or 'project-admin' tickets, and workspaceId to limit it to one workspace."
  - `my_work`: "What is on your plate: the tickets assigned to you or that you collaborate on, across all your workspaces, grouped the way the My Work screen groups them; pass workspaceId to limit it to one workspace."

- [ ] **Step 1: failing tests.**

| Case | Behaviour |
|---|---|
| 30.051 | `get_attention` with no args → one `/v1/me/workspaces` call, then N attention calls each carrying `show=created,assigned` |
| 30.052 | `get_attention({workspaceId:'w1'})` → exactly one call: `/v1/workspaces/w1/attention?show=created,assigned` |
| 30.053 | `show:['ws-admin']` with a member-only workspace in the list → that workspace is skipped, not 400ed |
| 30.054 | `show:[]` → a zod refusal (min 1) |
| 30.055 | `my_work` with no args → a fan-out over `/v1/me/work?workspaceId=` for each non-archived workspace |
| 30.056 | `my_work({workspaceId})` → today's single call (regression) |
| 30.057 | the descriptions match verbatim |
| 30.058 | one workspace's call 404s → its entry is omitted and the rest return (no whole-tool failure) |

- [ ] **Step 2: implement, then Kills.**
  - default `show` dropped → 30.051/30.052;
  - per-workspace intersection removed → 30.053;
  - archived not skipped → 30.055;
  - `Promise.all` without per-call catch → 30.058;
  - inputSchema `workspaceId` still required → 30.051 (the hosted suite owns the schema drop: memory MCP inputSchema).

- [ ] **Step 3: catalogue, battery and commit.** test-cases §30.5 "MCP". Features.md: the MCP tool list bullet for these two tools. Then build mcp-server before the server suite (the trap), and commit.

---

## Order and parallelism

- **T1, T2 and T3** start together. T3 works against the pinned contracts with fakes, and tipmerges once T1 and T2 land.
- **T5** starts when T1 lands.
- **T4** starts when T3 lands.
- **Fan-out cost (spec Risks):** before T4's REVIEW, measure the page on the largest seed: the number of requests and the time to the first full render. If any single workspace returns more than 200 attention items, or the first render takes more than 2 s, flag it on the REVIEW line; the planner then decides on a per-workspace cap with a "show more" link.
- **Spec deviations (planner, for the owner):**
  1. Global behaviour by client fan-out over the existing per-workspace routes, instead of the new global endpoints of D3. `/v1/me/work` keeps its required `workspaceId` (7.112 is unchanged).
  2. User-level preferences in a new store (T2), because the existing preferences are per workspace (D4 named them).
  3. The empty-state copy says "for", not "in": "Nothing needs your attention for created by me and assigned to me".
- **Release:** the release → main PR goes on the owner's word only, with a local gate plus green CI on the release PR. Run `check:env`, `check:tasks` and every `check:*` before opening it. The migrations run on deploy and must be checked against the lowest pending KG/WG prefix again at release time, in case either release moved.
